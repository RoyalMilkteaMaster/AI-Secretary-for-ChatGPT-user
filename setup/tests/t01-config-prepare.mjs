// 設定驗證、未填不可部署、第一次排程關閉、明確 enable、prepare 重跑不覆蓋授權。
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync, mkdirSync, statSync, rmSync, cpSync} from 'node:fs';
import {FIXTURE, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

const {parseJsonc, parseOwner} = await kitImport('tools', 'lib', 'prepared.mjs');
const {fingerprint, validateConfig} = await kitImport('tools', 'lib', 'config.mjs');
const work = kitPath('work'), wranglerFile = kitPath('work', 'app', 'wrangler.jsonc');
const wrangler = () => parseJsonc(readFileSync(wranglerFile, 'utf8'));
const ok = (r, label) => assert.equal(r.status, 0, `${label}\n${r.out}`);
const no = (r, pattern, label) => { assert.notEqual(r.status, 0, `${label} should fail\n${r.out}`); assert.match(r.out, pattern, label); };

// 1. No settings file at all.
rmSync(kitPath('設定.json'), {force: true});
no(runTool('prepare.mjs'), /設定\.example\.json/, 'missing config');

// 2. Example copied unchanged: refused with a list, nothing generated.
writeFileSync(kitPath('設定.json'), readFileSync(kitPath('設定.example.json')));
let r = runTool('prepare.mjs');
no(r, /sender：尚未填寫/, 'example config');
assert.match(r.out, /account_id：尚未填寫/); assert.match(r.out, /d1_database_id：尚未填寫/);
assert.ok(!existsSync(work), 'nothing may be written for an unfilled config');

// 3. Every outward-facing tool refuses an unfilled / unprepared config before Wrangler.
for (const [script, args] of [['deploy.mjs', []], ['deploy.mjs', ['--check']], ['d1-init.mjs', []], ['signing-secret.mjs', []],
  ['install-secrets.mjs', []], ['admin.mjs', ['status']], ['admin.mjs', ['send-validation', '--confirm-one-email']], ['local-acceptance.mjs', []],
  ['authorize.mjs', ['--smtp']], ['authorize.mjs', ['--calendar']]]) {
  r = runTool(script, args);
  no(r, /尚未填寫|尚未完成/, `${script} ${args.join(' ')}`);
  assert.doesNotMatch(r.out, /Wrangler 回報部署完成|localhost:8766\/start|已安裝/, script);
}
no(runTool('authorize.mjs'), /--smtp（寄件帳號）或 --calendar/, 'authorize without mode');
no(runTool('authorize.mjs', ['--smtp', '--calendar']), /一次一種/, 'authorize both modes');
no(runTool('deploy.mjs', ['--surprise']), /不認得的參數/, 'unknown flag');

// 4. Invalid or copied-placeholder values are rejected; nothing generated.
const bad = (patch, pattern) => {
  writeConfig({...FIXTURE, ...patch});
  no(runTool('prepare.mjs'), pattern, JSON.stringify(patch));
  assert.ok(!existsSync(work));
};
bad({sender: '<你的寄件Gmail>'}, /範例或說明文字/);
bad({sender: 'secretary@example.com'}, /範例或說明文字/);
bad({recipient: FIXTURE.sender}, /不可相同/);
bad({account_id: 'ABC'}, /32 位/);
bad({d1_database_id: 'not-a-uuid'}, /UUID/);
bad({origin: FIXTURE.origin + '/'}, /斜線結尾/);
bad({origin: 'http://ai-secretary-progress.demo-sub.workers.dev'}, /只填 https/);
bad({origin: 'https://other-worker.demo-sub.workers.dev'}, /與 worker_name 一致/);
bad({timezone: 'Asia/Tokyo'}, /Asia\/Taipei/);
bad({google_project_id: 'My Project'}, /專案 ID/);
bad({sendr: 'typo@mail.test'}, /不認得的欄位/);

// 5. First deployment: no origin / Google project yet. Daily mail must be off.
writeConfig({...FIXTURE, origin: '', google_project_id: ''});
ok(runTool('prepare.mjs'), 'first prepare');
assert.equal(wrangler().vars.DAILY_ENABLED, 'false');
assert.deepEqual(wrangler().triggers.crons, []);
assert.equal(wrangler().account_id, FIXTURE.account_id);
assert.equal(wrangler().d1_databases[0].database_id, FIXTURE.d1_database_id);
assert.equal(wrangler().vars.AMP_SENDER, FIXTURE.sender);
const firstOwner = parseOwner(readFileSync(kitPath('work', 'app', 'owner-config.mjs'), 'utf8'));
assert.equal(firstOwner.configured, true); assert.equal(firstOwner.origin, '');
cpSync(kitPath('work', 'app'), kitPath('variants', 'first-deploy'), {recursive: true});
r = runTool('deploy.mjs', ['--check']); ok(r, 'deploy check first'); assert.match(r.out, /首次部署/); assert.match(r.out, /crons=\[\]/);
ok(runTool('d1-init.mjs', ['--check']), 'd1-init check');
no(runTool('prepare.mjs', ['--enable-daily']), /origin：尚未填寫/, 'enable without origin');
no(runTool('admin.mjs', ['status']), /origin：尚未填寫/, 'admin without origin');

// 6. Full settings; stale work copy and manual edits are detected.
writeConfig(FIXTURE);
no(runTool('deploy.mjs', ['--check']), /重新執行/, 'stale prepare');
ok(runTool('prepare.mjs'), 'full prepare');
assert.equal(wrangler().vars.DAILY_ENABLED, 'false');
const instructions = readFileSync(kitPath('work', '專案指示.已填.txt'), 'utf8');
assert.ok(instructions.includes(FIXTURE.calendar)); assert.doesNotMatch(instructions, /\{\{/);
for (const [file, from, to] of [['worker.mjs', 'export default {', 'export default { // edited'], ['wrangler.jsonc', '"DAILY_ENABLED": "false"', '"DAILY_ENABLED": "true"'],
  ['wrangler.jsonc', '"crons": []', '"crons": ["* * * * *"]'], ['owner-config.mjs', FIXTURE.recipient, 'intruder@mail.test']]) {
  const path = kitPath('work', 'app', file), original = readFileSync(path, 'utf8');
  assert.ok(original.includes(from), `${file} contains ${from}`);
  writeFileSync(path, original.replace(from, to));
  no(runTool('deploy.mjs', ['--check']), /prepare/, `hand-edited ${file}`);
  writeFileSync(path, original);
}
ok(runTool('deploy.mjs', ['--check']), 'deploy check after restore');

// 7. Re-running prepare never touches stored authorizations or private records.
mkdirSync(kitPath('.secrets'), {recursive: true}); mkdirSync(kitPath('work', 'private'), {recursive: true});
const protectedFiles = [kitPath('.secrets', 'gmail-smtp.dpapi'), kitPath('.secrets', 'signing-secret.dpapi'), kitPath('work', 'private', 'keep.txt')];
for (const file of protectedFiles) writeFileSync(file, 'FICTIONAL-ENCRYPTED-PLACEHOLDER ' + file.length);
const snapshot = () => protectedFiles.map(f => [readFileSync(f, 'utf8'), statSync(f).mtimeMs]);
const before = snapshot();
ok(runTool('prepare.mjs'), 'rerun prepare'); ok(runTool('prepare.mjs', ['--disable-daily']), 'rerun disable');
ok(runTool('prepare.mjs', ['--instructions-only']), 'instructions only');
assert.deepEqual(snapshot(), before, 'prepare must not modify .secrets or work/private');

// 8. Daily mail only after an explicit, matching, recent, human-confirmed acceptance.
const acceptanceFile = kitPath('work', 'private', 'acceptance.json');
const fp = fingerprint(validateConfig(FIXTURE, 'ready').config);
const accept = extra => writeFileSync(acceptanceFile, JSON.stringify({ok: true, human_confirmed: true, schedule_enabled_at_check: false, checked_at: new Date().toISOString(), config_fingerprint: fp, ...extra}));
no(runTool('prepare.mjs', ['--enable-daily']), /找不到驗收紀錄/, 'enable without acceptance');
accept({config_fingerprint: 'f'.repeat(64)}); no(runTool('prepare.mjs', ['--enable-daily']), /有變更/, 'other config');
accept({human_confirmed: false}); no(runTool('prepare.mjs', ['--enable-daily']), /未通過/, 'no human confirmation');
accept({checked_at: new Date(Date.now() - 8 * 86400000).toISOString()}); no(runTool('prepare.mjs', ['--enable-daily']), /超過 7 天/, 'stale acceptance');
accept({schedule_enabled_at_check: true}); no(runTool('prepare.mjs', ['--enable-daily']), /排程關閉時/, 'acceptance while enabled');
no(runTool('prepare.mjs', ['--enable-daily', '--disable-daily']), /不能同時/, 'both switches');
assert.equal(wrangler().vars.DAILY_ENABLED, 'false', 'failed enable attempts leave it off');
accept({}); ok(runTool('prepare.mjs', ['--enable-daily']), 'enable');
assert.equal(wrangler().vars.DAILY_ENABLED, 'true'); assert.deepEqual(wrangler().triggers.crons, ['0 1 * * *']);
r = runTool('deploy.mjs', ['--check']); ok(r, 'deploy check enabled'); assert.match(r.out, /0 1 \* \* \*/);
ok(runTool('prepare.mjs'), 'rerun keeps enabled'); assert.equal(wrangler().vars.DAILY_ENABLED, 'true');
writeConfig({...FIXTURE, origin: 'https://ai-secretary-progress.other-sub.workers.dev'});
r = runTool('prepare.mjs'); ok(r, 'changed account fields'); assert.match(r.out, /自動改回「關閉」/);
assert.equal(wrangler().vars.DAILY_ENABLED, 'false'); assert.deepEqual(wrangler().triggers.crons, []);
writeConfig(FIXTURE); ok(runTool('prepare.mjs'), 'back to fixture'); assert.equal(wrangler().vars.DAILY_ENABLED, 'false', 'no silent re-enable');
accept({}); ok(runTool('prepare.mjs', ['--enable-daily']), 're-enable'); ok(runTool('prepare.mjs', ['--disable-daily']), 'disable');
assert.equal(wrangler().vars.DAILY_ENABLED, 'false'); assert.deepEqual(wrangler().triggers.crons, []);

// 9. prepare.mjs and its imports cannot deploy, spawn programs or use the network.
for (const file of ['prepare.mjs', 'lib/paths.mjs', 'lib/config.mjs', 'lib/prepared.mjs']) {
  const source = readFileSync(kitPath('tools', file), 'utf8');
  assert.doesNotMatch(source, /child_process|spawn|fetch\(|node:net|node:http|node:tls|wrangler\.mjs|secret-store/, file);
}

// 10. prepare refuses to delete a work/app folder it did not generate.
rmSync(kitPath('work', 'app', '.generated-by-prepare'));
no(runTool('prepare.mjs'), /不是由 prepare 產生/, 'foreign work/app');
writeFileSync(kitPath('work', 'app', '.generated-by-prepare'), 'restored by test\n');
ok(runTool('prepare.mjs'), 'after restoring marker');

console.log('PASS t01: 未填/範例/錯誤設定拒絕且不產生檔案；所有部署與連網工具在設定未完成前拒絕；第一次 DAILY_ENABLED=false、crons=[]；工作副本被改即拒絕部署；prepare 重跑不碰 .secrets 與 work/private；只有明確 --enable-daily＋相符且經本人確認的驗收紀錄才設定 0 1 * * *；帳號欄位變更自動改回關閉；prepare 不含部署／連網／執行程式。');
