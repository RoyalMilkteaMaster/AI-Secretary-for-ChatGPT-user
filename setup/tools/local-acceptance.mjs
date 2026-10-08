// 本機專用驗收（不連網、不寄信、不碰 Cloudflare 或 Google）：
// 用 prepare 產生的「同一份正式程式」work/app，接上記憶體 SQLite（三份空白結構）、
// 離線寄信替身與虛構日曆，跑一次驗收流程。適合新帳號在部署前先確認自己的設定，
// 或當天的驗收信已用掉、想重看流程時使用。正式程式邏輯完全不變。
//   node tools/local-acceptance.mjs
import {offlineFetch} from './lib/offline-hooks.mjs';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {APP, PRIVATE, SCHEMA, SCHEMA_FILES, WRANGLER_CONFIG, DEFAULT_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared, parseJsonc} from './lib/prepared.mjs';
import {localD1} from './lib/local-d1.mjs';
import {adminClient, tool, sendValidation, cancelDemos, readyCheck, taipeiDay, TUTORIAL_DEMOS} from './lib/admin-client.mjs';

let config;
try {
  const args = parseArgs(process.argv.slice(2), {options: ['--config']});
  ({config} = loadPrepared(args.options['--config'] || DEFAULT_CONFIG, 'prepare'));
  if (!config.origin) throw new Error('本機驗收需要 origin（信內連結會用到）。可先填預計的 https://<worker_name>.<子網域>.workers.dev 再 prepare。');
} catch (error) { fail(error.message); }

const wrangler = parseJsonc(readFileSync(WRANGLER_CONFIG, 'utf8'));
const {DB, sqlite} = localD1(SCHEMA_FILES.map(f => readFileSync(join(SCHEMA, f), 'utf8')));
const today = taipeiDay();
const env = {DB, SIGNING_SECRET: randomBytes(32).toString('base64url'), AMP_SENDER: wrangler.vars.AMP_SENDER, DAILY_ENABLED: 'false',
  GMAIL_SENDER: config.sender, GMAIL_RECIPIENT: config.recipient, GMAIL_CLIENT_ID: 'offline-fake-client', GMAIL_CLIENT_SECRET: 'offline-fake-client-secret',
  GMAIL_SMTP_REFRESH_TOKEN: 'offline-fake-refresh', CALENDAR_REFRESH_TOKEN: 'offline-fake-calendar'};
const calendarUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(config.calendar) + '/events';
globalThis.fetch = offlineFetch({
  'https://oauth2.googleapis.com/token': () => Response.json({access_token: 'offline-fake-access'}),
  [calendarUrl]: () => Response.json({items: [{id: 'offline-event', summary: '【離線示範】行程', start: {dateTime: today + 'T14:00:00+08:00'}, end: {dateTime: today + 'T15:00:00+08:00'}}]}),
});
const {default: worker} = await import(pathToFileURL(join(APP, 'worker.mjs')).href);
const local = (url, init) => worker.fetch(new Request(url, init), env);
const request = adminClient({origin: config.origin, secret: env.SIGNING_SECRET, fetchImpl: local});
const outbox = globalThis.__offlineOutbox;
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({name, ok: true}); console.log('✓ ' + name); }
  catch (error) { results.push({name, ok: false, error: error.message}); console.log('✗ ' + name + '：' + error.message); }
}
const tokenFor = (amp, id) => [...amp.matchAll(/\/state\?token=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/g)].map(m => m[1])
  .find(t => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString()).id === id);
let token;
// Same items, titles and dates as the video; here the "chat" calls the same tools directly.
const [APPLY, RECEIPT] = TUTORIAL_DEMOS;
const demo = (item, due_at) => ({...item, activity: '教材示範｜課程報名', status: 'pending', priority: 'normal', due_at, not_before: null, source_chat: '',
  detail: '影片示範用的虛構事項，不是真實待辦。', kind: 'task', paused: false});
const getStep = async id => (await tool(request, 'get_step', {id})).step;

await check('空白資料庫：驗收信拒絕寄出空信', async () => {
  const r = await sendValidation(request, {confirm: true, config});
  assert.equal(r.sent, false); assert.match(r.reason, /空信/); assert.equal(outbox.length, 0);
});
await check('只有 kind=test 事項時仍拒絕（test 不進信）；以明確 ID 取消這筆範例', async () => {
  await tool(request, 'create_step', {id: 'DEMO_KIND_TEST_EXAMPLE', title: '【教材示範】kind=test 範例（不會進信）', activity: '教材示範', status: 'pending', priority: 'normal', due_at: null, not_before: null, source_chat: '', detail: '', kind: 'test', paused: false});
  const r = await sendValidation(request, {confirm: true, config});
  assert.equal(r.sent, false); assert.match(r.reason, /kind=test/); assert.equal(outbox.length, 0);
  assert.deepEqual((await cancelDemos(request, ['DEMO_KIND_TEST_EXAMPLE'])).map(x => x.after), ['cancelled']);
});
await check(`建立 ${APPLY.id}（2026-10-16），同一筆改為 2026-10-19，查回只有一筆`, async () => {
  const created = (await tool(request, 'create_step', demo(APPLY, '2026-10-16T18:00:00+08:00'))).step;
  assert.equal(created.kind, 'task'); assert.equal(created.title, APPLY.title);
  await tool(request, 'update_step', {id: APPLY.id, expected_revision: created.revision, expected_status: created.status, patch: {due_at: '2026-10-19T18:00:00+08:00'}});
  const {steps} = await tool(request, 'list_steps', {include_closed: true});
  const same = steps.filter(s => s.title === APPLY.title);
  assert.equal(same.length, 1); assert.equal(same[0].id, APPLY.id); assert.equal(same[0].due_at, '2026-10-19T18:00:00+08:00');
});
await check('預覽與未加確認旗標：列出事項與收件者，不寄', async () => {
  assert.ok((await request({action: 'preview'})).items.some(i => i.id === APPLY.id));
  const r = await sendValidation(request, {confirm: false, config});
  assert.equal(r.sent, false); assert.ok(r.plan.includes_demo); assert.equal(r.plan.recipient, config.recipient); assert.equal(outbox.length, 0);
});
await check('確認後寄出一封；寄件／收件與設定一致', async () => {
  const r = await sendValidation(request, {confirm: true, config});
  assert.equal(r.sent, true); assert.equal(outbox.length, 1);
  const mail = outbox[0];
  assert.equal(mail.to, config.recipient); assert.equal(mail.from.address, config.sender); assert.equal(mail.auth_user, config.sender);
  assert.deepEqual(mail.envelope, {from: config.sender, to: [config.recipient]});
  assert.match(mail.subject, /總覽驗收/); assert.ok(mail.amp.includes('【教材示範】') === false, '標題應經由 amp-list 讀取，不直接寫入 AMP');
  assert.ok(mail.html.includes(APPLY.title)); assert.ok(mail.html.includes('【離線示範】行程'));
  assert.ok(!mail.html.includes('kind=test 範例'));
  token = tokenFor(mail.amp, APPLY.id); assert.ok(token);
});
await check('同一天第二次：工具拒絕，正式服務也只回 duplicate、不重寄', async () => {
  const r = await sendValidation(request, {confirm: true, config});
  assert.equal(r.sent, false); assert.match(r.reason, /每天只能寄一次/);
  const raw = await request({action: 'send_validation'});
  assert.equal(raw.duplicate, true); assert.equal(outbox.length, 1);
});
await check('信內勾選：保存完成，重開仍為已完成', async () => {
  const headers = {'AMP-Email-Sender': config.sender};
  const post = await local(config.origin + '/state', {method: 'POST', headers: {...headers, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({token, done: '1'})});
  assert.equal(post.status, 200); assert.equal((await post.json()).items[0].done, true);
  const reopen = await (await local(config.origin + '/state?token=' + token, {headers})).json();
  assert.equal(reopen.items[0].done, true); assert.ok(reopen.items[0].completed_at);
});
await check('錯誤寄件來源的勾選請求被拒絕', async () => {
  const r = await local(config.origin + '/state?token=' + token, {headers: {'AMP-Email-Sender': 'someone-else@mail.test'}});
  assert.equal(r.status, 403);
});
await check('讀回同一筆＝completed；下一封預覽已排除', async () => {
  assert.equal((await getStep(APPLY.id)).status, 'completed');
  const p = await request({action: 'preview'});
  assert.ok(!p.items.some(i => i.id === APPLY.id));
  mkdirSync(join(PRIVATE, 'local-acceptance'), {recursive: true});
  writeFileSync(join(PRIVATE, 'local-acceptance', 'next-preview.html'), `<!doctype html><meta charset="utf-8">${p.content.html}`);
});
await check('啟用前總檢查：未經本人確認不算通過', async () => {
  assert.equal((await readyCheck(request, {config, humanConfirmed: false})).ok, false);
  assert.equal((await readyCheck(request, {config, humanConfirmed: true})).ok, true);
});
await check(`新增下一步 ${RECEIPT.id}（2026-10-20），進入下一封預覽`, async () => {
  await tool(request, 'create_step', demo(RECEIPT, '2026-10-20T18:00:00+08:00'));
  const ids = (await request({action: 'preview'})).items.map(i => i.id);
  assert.ok(ids.includes(RECEIPT.id)); assert.ok(!ids.includes(APPLY.id));
});
await check('cancel-demo 只取消這兩筆並讀回；已完成不會改回 pending', async () => {
  const results = await cancelDemos(request);
  assert.deepEqual(results.map(r => [r.id, r.before, r.after]), [[APPLY.id, 'completed', 'cancelled'], [RECEIPT.id, 'pending', 'cancelled']]);
  assert.equal((await getStep(APPLY.id)).status, 'cancelled'); assert.equal((await getStep(RECEIPT.id)).status, 'cancelled');
  assert.equal((await request({action: 'preview'})).items.length, 0);
});
await check('排程關閉（DAILY_ENABLED=false）時 cron 不寄信', async () => {
  await worker.scheduled({scheduledTime: Date.now()}, env);
  assert.equal(outbox.length, 1);
});
sqlite.close();
const external = globalThis.__offlineFetchLog.filter(u => !u.startsWith('https://oauth2.googleapis.com/token') && !u.startsWith(calendarUrl));
mkdirSync(join(PRIVATE, 'local-acceptance'), {recursive: true});
writeFileSync(join(PRIVATE, 'local-acceptance', 'validation-mail.html'), `<!doctype html><meta charset="utf-8">${outbox[0]?.html || ''}`);
writeFileSync(join(PRIVATE, 'local-acceptance', 'report.json'), JSON.stringify({checked_at: new Date().toISOString(), offline: true, real_email_sent: false, results, unexpected_network: external}, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${failed ? '✗' : '✓'} 本機驗收 ${results.length - failed}/${results.length} 通過。全程離線：沒有寄信、沒有連到 Cloudflare 或 Google（外部請求攔截 ${external.length} 次）。`);
console.log('  離線信件一般版本：work/private/local-acceptance/validation-mail.html（這是離線假收件，不是 Gmail 實際收件，不能取代第 5、6 步的實機驗收，也不能拿來通過 ready-check）');
process.exit(failed ? 1 : 0);
