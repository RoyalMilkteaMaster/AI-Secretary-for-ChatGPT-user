// 本機管理指令（呼叫自己服務的 /internal/secretary，請求以 SIGNING_SECRET 簽章五分鐘）。
//   node tools/admin.mjs approve <請求識別>     產生 MCP 一次性連結碼（5 分鐘、只限這次請求），放進剪貼簿
//   node tools/admin.mjs status                  寄送紀錄與設定狀態（不含秘密）
//   node tools/admin.mjs preview                 預覽下一封總覽（不寄信）
//   node tools/admin.mjs create-demo             備用：建立 DEMO_COURSE_APPLY_V5（主線改在 ChatGPT 建立）
//   node tools/admin.mjs send-validation [--confirm-one-email]  先顯示內容與收件者；加旗標才寄今天唯一一封驗收信
//   node tools/admin.mjs cancel-demo [--ids DEMO_A,DEMO_B]  只取消影片的兩筆示範（或明確指定的 DEMO_ ID）並讀回
//   node tools/admin.mjs ready-check [--human-checks-passed]   啟用每日寄信前的總檢查
// 沒有提供 send_daily：每日信只由排程寄出。
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DEFAULT_CONFIG, PRIVATE, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared} from './lib/prepared.mjs';
import {fingerprint} from './lib/config.mjs';
import {createStore} from './lib/secret-store.mjs';
import {windowsPowerShell} from './lib/powershell.mjs';
import {adminClient, tool, approvalCode, createDemo, sendValidation, parseDemoIds, cancelDemos, readyCheck, taipeiDay, TUTORIAL_DEMOS} from './lib/admin-client.mjs';

const COMMANDS = ['approve', 'status', 'preview', 'create-demo', 'send-validation', 'cancel-demo', 'ready-check'];
const savePrivate = (name, text) => { mkdirSync(PRIVATE, {recursive: true}); const file = join(PRIVATE, name); writeFileSync(file, text); return file; };

try {
  const args = parseArgs(process.argv.slice(2), {flags: ['--confirm-one-email', '--human-checks-passed', '--file'], options: ['--config', '--ids'], positionals: 2});
  const [command, value] = args.positionals;
  if (!COMMANDS.includes(command)) throw new Error('請指定指令：' + COMMANDS.join('、'));
  if ('--ids' in args.options && command !== 'cancel-demo') throw new Error('--ids 只能用在 cancel-demo');
  const demoIds = command === 'cancel-demo' ? parseDemoIds(args.options['--ids'] ?? TUTORIAL_DEMOS.map(d => d.id)) : [];
  const configPath = args.options['--config'] || DEFAULT_CONFIG;
  const store = createStore();
  if (command === 'approve') {
    loadPrepared(configPath, 'ready');
    const code = await approvalCode(value || '', store.readText('signing-secret'));
    if (args.flags.has('--file')) {
      const file = savePrivate('oauth-approval.private', code);
      console.log(`✓ 一次性連結碼已寫入 ${file}（5 分鐘內有效，用完即失效；不要貼進聊天、不要拍進錄影，用完刪除）`);
    } else {
      const result = windowsPowerShell('Set-Clipboard -Value ([Console]::In.ReadToEnd())', {input: code});
      if (result.status !== 0) throw new Error('無法放進剪貼簿；可改用 --file');
      console.log('✓ 一次性連結碼已放進本機剪貼簿：請本人在授權頁的「一次性連結碼」欄位貼上並按「授權這次連線」。不要貼進聊天、不要拍進錄影。5 分鐘內有效、只能用一次、只對這次請求有效。');
    }
    process.exit(0);
  }
  const {config} = loadPrepared(configPath, 'ready');
  const request = adminClient({origin: config.origin, secret: store.readText('signing-secret')});
  if (command === 'status') {
    const s = await tool(request, 'get_service_status');
    console.log(JSON.stringify(s, null, 2));
  } else if (command === 'preview') {
    const p = await request({action: 'preview'});
    console.log(`主旨：${p.subject}\n${p.items.length ? p.items.map(i => `  ${i.category}｜${i.title}（${i.id}，${i.status}）`).join('\n') : '  （沒有會進信的事項）'}`);
    console.log(`今日行程：${p.calendar.events.length} 筆${p.calendar.warning ? '　⚠ ' + p.calendar.warning : ''}`);
    // Only the plain HTML part is saved; the AMP part contains signed links.
    console.log(`一般版本預覽已存：${savePrivate(`preview-${taipeiDay()}.html`, `<!doctype html><meta charset="utf-8">${p.content.html}`)}（不要分享；這只是預覽，沒有寄信）`);
  } else if (command === 'create-demo') {
    const step = await createDemo(request);
    console.log(`✓ 示範事項已保存並讀回：${step.id}｜${step.title}｜截止 ${step.due_at}｜${step.status}｜kind=${step.kind}`);
  } else if (command === 'send-validation') {
    const r = await sendValidation(request, {confirm: args.flags.has('--confirm-one-email'), config});
    if (r.plan) console.log(`將寄出「總覽驗收」（${r.plan.day}）：\n  寄件：${r.plan.sender}\n  收件：${r.plan.recipient}（請本人確認是自己的主帳號）\n  ${r.plan.items.join('\n  ')}\n  今日行程：${r.plan.calendar_events} 筆${r.plan.includes_demo ? '' : '\n  ⚠ 不含示範事項：信中是你的真實事項'}${r.plan.calendar_warning ? '\n  ⚠ ' + r.plan.calendar_warning : ''}`);
    if (!r.sent && !r.result) { console.log('未寄出：' + r.reason); process.exit(r.plan && !args.flags.has('--confirm-one-email') ? 0 : 2); }
    console.log(r.sent ? `✓ Gmail SMTP 已接受這封驗收信（${r.result.accepted_at}）。這不代表已讀；請到收件匣確認。今天不能再寄第二封驗收信。` : `未確認寄出：${JSON.stringify(r.result)}`);
    if (!r.sent) process.exit(2);
  } else if (command === 'cancel-demo') {
    const results = await cancelDemos(request, demoIds);
    for (const r of results) console.log(r.before === 'not_found' ? `－ ${r.id}：找不到（未建立或 ID 不同），沒有變更`
      : `✓ ${r.id}｜${r.title}｜${r.before === 'cancelled' ? '原本就是 cancelled，沒有變更' : `${r.before} → cancelled`}｜讀回 ${r.after}`);
    console.log('取消不是刪除：紀錄保留，但不會再進每日信。只處理上面列出的 ID，其他事項沒有變動。');
  } else if (command === 'ready-check') {
    const r = await readyCheck(request, {config, humanConfirmed: args.flags.has('--human-checks-passed')});
    for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
    savePrivate('acceptance.json', JSON.stringify({...r, checked_at: new Date().toISOString(), config_fingerprint: fingerprint(config)}, null, 2));
    if (!r.ok) fail('尚未通過，不能開啟每日寄信。');
    console.log('✓ 驗收紀錄已保存。下一步：node tools/prepare.mjs --enable-daily，然後 node tools/deploy.mjs');
  }
} catch (error) { fail(error.message + (error.status === 401 ? '（簽章不符：請確認 SIGNING_SECRET 已安裝到這個 Worker）' : '')); }
