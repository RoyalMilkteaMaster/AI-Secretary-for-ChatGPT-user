// 教材驗收流程：本機專用驗收工具完整跑過，加上驗收守門的單元檢查。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIXTURE, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

writeConfig(FIXTURE);
assert.equal(runTool('prepare.mjs', ['--disable-daily']).status, 0);
const run = runTool('local-acceptance.mjs');
assert.equal(run.status, 0, run.out);
assert.match(run.out, /本機驗收 13\/13 通過/);
const report = JSON.parse(readFileSync(kitPath('work', 'private', 'local-acceptance', 'report.json'), 'utf8'));
assert.equal(report.real_email_sent, false); assert.deepEqual(report.unexpected_network, []);
assert.ok(report.results.every(r => r.ok));
const mailHtml = readFileSync(kitPath('work', 'private', 'local-acceptance', 'validation-mail.html'), 'utf8');
assert.match(mailHtml, /總覽驗收/); assert.doesNotMatch(mailHtml, /\/state\?token=/, 'saved copy has no signed links');

const {adminClient, tool, sendValidation, demoStep, nextFridayDue, approvalCode, readyCheck, taipeiDay, cancelDemos, parseDemoIds, TUTORIAL_DEMOS} = await kitImport('tools', 'lib', 'admin-client.mjs');
// Backup demo item: the same ID/title as the chat demo, kind=task, coming Friday 18:00 Taipei.
const demo = demoStep(Date.parse('2026-10-08T10:00:00+08:00'));
assert.equal(demo.kind, 'task'); assert.equal(demo.id, 'DEMO_COURSE_APPLY_V5'); assert.equal(demo.title, '【教材示範】寄出課程報名資料');
assert.deepEqual(TUTORIAL_DEMOS.map(d => d.id), ['DEMO_COURSE_APPLY_V5', 'DEMO_COURSE_RECEIPT_V5']);
assert.equal(demo.due_at, '2026-10-09T18:00:00+08:00');
assert.equal(nextFridayDue(Date.parse('2026-10-09T17:00:00+08:00')), '2026-10-09T18:00:00+08:00');
assert.equal(nextFridayDue(Date.parse('2026-10-09T19:00:00+08:00')), '2026-10-16T18:00:00+08:00');
assert.equal(nextFridayDue(Date.parse('2026-10-10T09:00:00+08:00')), '2026-10-16T18:00:00+08:00');
assert.equal(taipeiDay(Date.parse('2026-10-07T16:30:00Z')), '2026-10-08');

// Guards with a scripted service: nothing is sent unless every condition holds.
const fakeService = (status, previewItems = [{id: 'DEMO_COURSE_APPLY_V5', title: 't', status: 'pending', category: '一般待辦'}]) => {
  const calls = [];
  const request = async body => {
    calls.push(body.action === 'tool' ? body.name : body.action);
    if (body.action === 'tool' && body.name === 'get_service_status') return status;
    if (body.action === 'tool' && body.name === 'list_steps') return {steps: []};
    if (body.action === 'preview') return {items: previewItems, calendar: {events: [], warning: ''}};
    if (body.action === 'send_validation') return {status: 'accepted', accepted_at: 'now'};
    throw new Error('unexpected ' + JSON.stringify(body));
  };
  return {request, calls};
};
const healthy = {schedule_enabled: false, deliveries: [], mail_credentials_installed: true, mail_accounts_match_settings: true, calendar_connected: true, sender: FIXTURE.sender, recipient: FIXTURE.recipient, calendar: FIXTURE.calendar};
const today = taipeiDay();
for (const [label, status, items, pattern] of [
  ['schedule already on', {...healthy, schedule_enabled: true}, undefined, /排程已經開啟/],
  ['already sent today', {...healthy, deliveries: [{id: 'validation:' + today, status: 'accepted'}]}, undefined, /每天只能寄一次.*preview/],
  ['uncertain today', {...healthy, deliveries: [{id: 'validation:' + today, status: 'uncertain_or_failed'}]}, undefined, /不要盲目重寄/],
  ['secrets missing', {...healthy, mail_credentials_installed: false}, undefined, /install-secrets/],
  ['accounts mismatch', {...healthy, mail_accounts_match_settings: false}, undefined, /與設定不符/],
  ['deployed recipient differs from 設定.json', {...healthy, recipient: 'attacker@mail.test'}, undefined, /與 設定\.json 不同/],
  ['empty (only kind=test)', healthy, [], /kind=test 不會進信.*空信/],
]) {
  const service = fakeService(status, items);
  const result = await sendValidation(service.request, {confirm: true, config: FIXTURE});
  assert.equal(result.sent, false, label); assert.match(result.reason, pattern, label);
  assert.ok(!service.calls.includes('send_validation'), `${label}: must not send`);
}
const unconfirmed = fakeService(healthy);
const shown = await sendValidation(unconfirmed.request, {confirm: false, config: FIXTURE});
assert.equal(shown.sent, false); assert.equal(shown.plan.recipient, FIXTURE.recipient); assert.equal(shown.plan.sender, FIXTURE.sender);
assert.ok(!unconfirmed.calls.includes('send_validation'));
await assert.rejects(() => sendValidation(fakeService(healthy).request, {confirm: true}), /寄件與收件/);
const yesterday = fakeService({...healthy, deliveries: [{id: 'validation:2000-01-01', status: 'accepted'}]});
assert.equal((await sendValidation(yesterday.request, {confirm: true, config: FIXTURE})).sent, true, 'a new day allows one new validation');

// Ready check requires the human confirmation and no active demo items.
const ready = fakeService({...healthy, deliveries: [{id: 'validation:' + today, status: 'accepted'}]});
assert.equal((await readyCheck(ready.request, {config: FIXTURE, humanConfirmed: true})).ok, true);
assert.equal((await readyCheck(ready.request, {config: FIXTURE, humanConfirmed: false})).ok, false);
const noMail = fakeService(healthy);
assert.equal((await readyCheck(noMail.request, {config: FIXTURE, humanConfirmed: true})).ok, false, 'needs an accepted validation mail');
const otherAccount = fakeService({...healthy, recipient: 'attacker@mail.test', deliveries: [{id: 'validation:' + today, status: 'accepted'}]});
assert.equal((await readyCheck(otherAccount.request, {config: FIXTURE, humanConfirmed: true})).ok, false, 'service for another account');

// cancel-demo against the generated service: only the named DEMO_ items change.
await kitImport('tools', 'lib', 'offline-hooks.mjs');
const {localD1} = await kitImport('tools', 'lib', 'local-d1.mjs');
const {default: worker} = await kitImport('work', 'app', 'worker.mjs');
const {DB} = localD1(['schema.sql', 'mail-deliveries.sql', 'production.sql'].map(f => readFileSync(kitPath('schema', f), 'utf8')));
const env = {DB, SIGNING_SECRET: 'local-test-only', AMP_SENDER: FIXTURE.sender, DAILY_ENABLED: 'false', GMAIL_SENDER: FIXTURE.sender, GMAIL_RECIPIENT: FIXTURE.recipient};
const admin = adminClient({origin: FIXTURE.origin, secret: env.SIGNING_SECRET, fetchImpl: (url, init) => worker.fetch(new Request(url, init), env)});
const add = (id, title) => tool(admin, 'create_step', {id, title, activity: '虛構', status: 'pending', priority: 'normal', due_at: null, not_before: null, source_chat: '', detail: '', kind: 'task', paused: false});
const [APPLY, RECEIPT] = TUTORIAL_DEMOS;
for (const [id, title] of [[APPLY.id, APPLY.title], [RECEIPT.id, RECEIPT.title], ['DEMO_OTHER_KEEP', '【教材示範】其他示範'], ['DEMO_LOOKALIKE', '真實事項但 ID 像示範'], ['REAL_TASK', '真實事項']]) await add(id, title);
const applyStep = (await tool(admin, 'get_step', {id: APPLY.id})).step;
await tool(admin, 'update_step', {id: APPLY.id, expected_revision: applyStep.revision, expected_status: 'pending', patch: {status: 'completed'}});
const statuses = async () => Object.fromEntries((await tool(admin, 'list_steps', {include_closed: true})).steps.map(s => [s.id, s.status]));
const others = {DEMO_OTHER_KEEP: 'pending', DEMO_LOOKALIKE: 'pending', REAL_TASK: 'pending'};
await assert.rejects(() => cancelDemos(admin, ['REAL_TASK']), /DEMO_ 開頭/);
await assert.rejects(() => cancelDemos(admin, [RECEIPT.id, 'DEMO_LOOKALIKE']), /可能是真實事項/);
await assert.rejects(() => cancelDemos(admin, []), /至少/);
assert.deepEqual(await statuses(), {[APPLY.id]: 'completed', [RECEIPT.id]: 'pending', ...others}, 'a rejected run changes nothing');
assert.deepEqual((await cancelDemos(admin)).map(r => [r.id, r.before, r.after]), [[APPLY.id, 'completed', 'cancelled'], [RECEIPT.id, 'pending', 'cancelled']]);
assert.deepEqual(await statuses(), {[APPLY.id]: 'cancelled', [RECEIPT.id]: 'cancelled', ...others}, 'default touches only the two tutorial items');
assert.deepEqual((await cancelDemos(admin)).map(r => r.before), ['cancelled', 'cancelled'], 'rerun is a no-op');
assert.deepEqual((await cancelDemos(admin, ['DEMO_NOT_CREATED'])).map(r => r.after), ['not_found']);
assert.equal((await tool(admin, 'get_step', {id: 'DEMO_NOT_CREATED'})).step, null);
assert.deepEqual(parseDemoIds('DEMO_A, DEMO_B'), ['DEMO_A', 'DEMO_B']);
assert.throws(() => parseDemoIds('DEMO_A,DEMO_A'), /重複/);
for (const args of [['cancel-demo', '--ids', 'DEMO_A,REAL_TASK'], ['status', '--ids', 'DEMO_A']]) {
  const r = runTool('admin.mjs', args);
  assert.notEqual(r.status, 0); assert.match(r.out, /DEMO_ 開頭|只能用在 cancel-demo/, args.join(' '));
}

// MCP approval code: strict binding format, five-minute expiry.
await assert.rejects(() => approvalCode('short', 'secret'), /43 個字元/);
const code = await approvalCode('b'.repeat(43), 'secret', 1000);
const claims = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString());
assert.deepEqual(claims, {v: 1, id: 'OAUTH_APPROVE', rev: 1, binding: 'b'.repeat(43), exp: 1300});
console.log('PASS t04: 本機專用驗收 13/13（空庫與只有 kind=test 時拒寄空信、DEMO_COURSE_APPLY_V5 建立後同筆改期且只有一筆、預覽列出事項與收件者、未確認不寄、確認後寄一封且寄收件正確、同日第二次被拒且正式服務只回 duplicate、勾選保存與重開、錯誤來源拒絕、讀回 completed、下一封預覽排除、ready-check、新增 DEMO_COURSE_RECEIPT_V5、只取消這兩筆、排程關閉不寄）；驗收守門在排程已開、當日已寄或結果不確定、憑證缺漏、帳號或部署收件者與設定不符時都不寄；cancel-demo 預設只取消兩筆影片示範、不碰其他 DEMO_ 與真實事項、非 DEMO_ 或標題無【教材示範】時整批不變、已完成改 cancelled 不回 pending、重跑無變更；ready-check 需本人確認與已接受的驗收信；綁定碼五分鐘。');
