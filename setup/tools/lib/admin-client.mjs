// Local maintenance client (adapted from the original secretary-admin.mjs).
// Each request body is signed for at most five minutes with SIGNING_SECRET.
// The guards below are client-side only; the deployed production logic is unchanged.
import {Buffer} from 'node:buffer';
import {signClaims} from '../../app-template/secretary-sign.mjs';

export const DEMO_PREFIX = 'DEMO_';
export const DEMO_TITLE_PREFIX = '【教材示範】';
// The two fixed installation-acceptance demo items. cancel-demo touches only these by
// default; other DEMO_ items need their IDs given explicitly.
export const TUTORIAL_DEMOS = Object.freeze([
  Object.freeze({id: 'DEMO_COURSE_APPLY_V5', title: '【教材示範】寄出課程報名資料'}),
  Object.freeze({id: 'DEMO_COURSE_RECEIPT_V5', title: '【教材示範】確認主辦單位收到資料'}),
]);
export const DEMO_EMAIL_ID = TUTORIAL_DEMOS[0].id;
export const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
export const taipeiDay = (time = Date.now()) => new Date(Number(time) + 8 * 3600000).toISOString().slice(0, 10);

export function adminClient({origin, secret, fetchImpl = fetch}) {
  if (!origin || !secret) throw new Error('缺少服務網址或 SIGNING_SECRET');
  return async function request(body) {
    const raw = JSON.stringify(body);
    const token = await signClaims({v: 1, id: 'SECRETARY_ADMIN', rev: 1, body_hash: await hash(raw), exp: Math.floor(Date.now() / 1000) + 300}, secret);
    const response = await fetchImpl(origin + '/internal/secretary', {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: raw});
    let data;
    try { data = await response.json(); } catch { data = {error: 'NON_JSON_RESPONSE'}; }
    if (!response.ok) { const error = new Error(data.error || `HTTP_${response.status}`); error.status = response.status; throw error; }
    return data;
  };
}

export const tool = (request, name, args = {}) => request({action: 'tool', name, arguments: args});

// One-time MCP approval code bound to the request shown on the owner's page.
// Five minutes; the Worker additionally rejects reuse and anything over ten.
export async function approvalCode(binding, secret, now = Math.floor(Date.now() / 1000)) {
  if (!/^[-_a-zA-Z0-9]{43}$/.test(binding)) throw new Error('請求識別格式不符：請從授權頁完整複製「請求識別」那一串（43 個字元）');
  return signClaims({v: 1, id: 'OAUTH_APPROVE', rev: 1, binding, exp: now + 300}, secret);
}

// Upcoming Friday 18:00 Taipei (next week's if Friday 18:00 has passed).
export function nextFridayDue(now = Date.now()) {
  const local = new Date(Number(now) + 8 * 3600000);
  let add = (5 - local.getUTCDay() + 7) % 7;
  if (add === 0 && local.getUTCHours() >= 18) add = 7;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add));
  return day.toISOString().slice(0, 10) + 'T18:00:00+08:00';
}

// kind MUST be 'task': digestSteps() only mails kind=task, so a 'test' item
// would make the validation mail empty.
// Same ID and title the owner creates in ChatGPT, so a retry never duplicates it.
export const demoStep = (now = Date.now()) => ({
  id: DEMO_EMAIL_ID, title: TUTORIAL_DEMOS[0].title, activity: '教材示範｜課程報名',
  status: 'pending', priority: 'normal', due_at: nextFridayDue(now), not_before: null, source_chat: '',
  detail: '只供第一次設定驗收的虛構事項，不是真實待辦；整段示範完成後改為 cancelled。', kind: 'task', paused: false,
});

export async function createDemo(request, now = Date.now()) {
  return (await tool(request, 'create_step', demoStep(now))).step;
}

export async function sendValidation(request, {confirm = false, config, now = Date.now()} = {}) {
  if (!config?.sender || !config?.recipient) throw new Error('缺少 設定.json 的寄件與收件地址');
  const status = await tool(request, 'get_service_status');
  const day = taipeiDay(now);
  if (status.schedule_enabled) return {sent: false, reason: '每日排程已經開啟。驗收信只在排程關閉時手動寄；之後請用 preview 核對。'};
  const prior = (status.deliveries || []).find(d => d.id === 'validation:' + day);
  if (prior) return {sent: false, reason: prior.status === 'uncertain_or_failed'
    ? '今天的驗收信結果不確定或失敗。服務不會自動重寄，也不要盲目重寄：先查收件匣與垃圾郵件，再用 status 看原因。'
    : `今天（${day}）已寄過驗收信（${prior.status}）。驗收信每天只能寄一次；請改用 preview 核對，不要反覆重寄。`};
  if (!status.mail_credentials_installed || !status.mail_accounts_match_settings)
    return {sent: false, reason: '寄信憑證尚未安裝，或 Worker 上的寄收件地址與設定不符：請先執行 install-secrets.mjs。'};
  if (status.sender !== config.sender || status.recipient !== config.recipient)
    return {sent: false, reason: `服務上的寄件／收件（${status.sender} → ${status.recipient}）與 設定.json 不同：請重跑 prepare 與 deploy，未寄出。`};
  const preview = await request({action: 'preview'});
  if (!preview.items?.length) return {sent: false, reason: `目前沒有會進信的事項：只有 kind=task、未暫停、已到 not_before 的事項才會出現；kind=test 不會進信。現在寄出會是一封空信，所以沒有寄。請先在 ChatGPT 建立並讀回 ${DEMO_EMAIL_ID}（第 4 步）。`};
  const plan = {day, sender: status.sender, recipient: status.recipient,
    items: preview.items.map(i => `${i.category}｜${i.title}（${i.id}，${i.status}）`), includes_demo: preview.items.some(i => i.id.startsWith(DEMO_PREFIX)),
    calendar_events: preview.calendar?.events?.length || 0, calendar_warning: preview.calendar?.warning || ''};
  if (!confirm) return {sent: false, plan, reason: '尚未寄出：本人核對上面的事項與收件者後，加上 --confirm-one-email 才會寄出今天唯一的一封驗收信。'};
  const result = await request({action: 'send_validation'});
  return {sent: result.status === 'accepted' && !result.duplicate, plan, result};
}

// "ID1,ID2" from the command line (or an array): only well-formed DEMO_ IDs.
export function parseDemoIds(value) {
  const ids = (Array.isArray(value) ? value : String(value ?? '').split(',')).map(s => String(s).trim()).filter(Boolean);
  if (!ids.length) throw new Error('請至少指定一個示範事項 ID（以逗號分隔）');
  for (const id of ids) if (!/^DEMO_[A-Za-z0-9_-]{1,75}$/.test(id)) throw new Error(`只能取消 DEMO_ 開頭的示範事項，不接受：${id}`);
  if (new Set(ids).size !== ids.length) throw new Error('示範事項 ID 重複');
  return ids;
}

// Cancels only the given IDs (default: the two tutorial items), never every
// DEMO_ item. All targets are read and checked before anything changes; a
// title without 【教材示範】 stops the whole run. completed becomes cancelled,
// never pending. cancelled is not a deletion. Each change is read back.
export async function cancelDemos(request, ids = TUTORIAL_DEMOS.map(d => d.id)) {
  const targets = [];
  for (const id of parseDemoIds(ids)) {
    const {step} = await tool(request, 'get_step', {id});
    if (step && !step.title.startsWith(DEMO_TITLE_PREFIX))
      throw new Error(`${id} 的標題不是「${DEMO_TITLE_PREFIX}」開頭，可能是真實事項；全部未變更。`);
    targets.push({id, step});
  }
  const results = [];
  for (const {id, step} of targets) {
    if (!step) { results.push({id, title: '', before: 'not_found', after: 'not_found'}); continue; }
    if (step.status !== 'cancelled')
      await tool(request, 'update_step', {id, expected_revision: step.revision, expected_status: step.status, patch: {status: 'cancelled'}});
    const after = (await tool(request, 'get_step', {id})).step;
    if (after?.status !== 'cancelled') throw new Error(`${id} 讀回不是 cancelled（${after?.status}）；請重新讀取，不要強制覆蓋。`);
    results.push({id, title: after.title, before: step.status, after: after.status});
  }
  return results;
}

export async function readyCheck(request, {config, humanConfirmed = false}) {
  const status = await tool(request, 'get_service_status');
  const {steps} = await tool(request, 'list_steps');
  const activeDemos = steps.filter(s => s.id.startsWith(DEMO_PREFIX)).map(s => s.id);
  const checks = [
    ['每日排程目前仍關閉（啟用前驗收）', status.schedule_enabled === false],
    ['服務的寄件、收件、日曆與設定一致', status.sender === config.sender && status.recipient === config.recipient && status.calendar === config.calendar && status.mail_accounts_match_settings === true],
    ['寄信憑證已安裝', status.mail_credentials_installed === true],
    ['日曆授權已安裝（仍須實測）', status.calendar_connected === true],
    ['至少一封驗收信已被 Gmail SMTP 接受', (status.deliveries || []).some(d => d.id.startsWith('validation:') && d.status === 'accepted')],
    [`沒有進行中的示範事項${activeDemos.length ? `（仍有效：${activeDemos.join(', ')}）` : ''}`, activeDemos.length === 0],
    ['本人確認：Gmail 實際收到的驗收信勾選後顯示已保存、重開仍在、聊天讀回 completed、預覽排除已完成；日曆本人確認後新增、改期同一 ID 並讀回', humanConfirmed === true],
  ].map(([name, ok]) => ({name, ok}));
  return {ok: checks.every(c => c.ok), human_confirmed: humanConfirmed === true, schedule_enabled_at_check: status.schedule_enabled, checks};
}
