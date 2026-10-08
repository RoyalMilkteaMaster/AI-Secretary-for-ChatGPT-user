// 無密鑰洩漏：秘密只走 stdin、不出現在參數或輸出；服務回應與狀態不含秘密；
// 產生的檔案不含秘密；教材本身掃描為零。
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {FIXTURE, REAL_KIT, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

await kitImport('tools', 'lib', 'offline-hooks.mjs');
writeConfig(FIXTURE);
assert.equal(runTool('prepare.mjs', ['--disable-daily']).status, 0);
const SENTINELS = {SIGNING_SECRET: 'SENTINEL-signing-7f3a', GMAIL_CLIENT_SECRET: 'SENTINEL-client-secret-91c2', GMAIL_SMTP_REFRESH_TOKEN: 'SENTINEL-smtp-refresh-55d0',
  CALENDAR_REFRESH_TOKEN: 'SENTINEL-cal-refresh-0b8e', GMAIL_CLIENT_ID: 'SENTINEL-client-id-a1'};
const leaks = text => Object.values(SENTINELS).filter(v => String(text).includes(v));

// 1. Secret pipe: values only on stdin, never in argv; console output carries names only.
const {putSecret} = await kitImport('tools', 'lib', 'wrangler.mjs');
const {planSecretInstall, GRANTS} = await kitImport('tools', 'lib', 'oauth-check.mjs');
const {validateConfig} = await kitImport('tools', 'lib', 'config.mjs');
const config = validateConfig(FIXTURE, 'ready').config;
const client = {client_id: SENTINELS.GMAIL_CLIENT_ID, client_secret: SENTINELS.GMAIL_CLIENT_SECRET, project_id: FIXTURE.google_project_id};
const plan = planSecretInstall(config, {client,
  smtp: {client_id: client.client_id, refresh_token: SENTINELS.GMAIL_SMTP_REFRESH_TOKEN, account: FIXTURE.sender, scope: GRANTS.smtp.scope},
  calendar: {client_id: client.client_id, refresh_token: SENTINELS.CALENDAR_REFRESH_TOKEN, account: FIXTURE.recipient, scope: GRANTS.calendar.scope}});
const recorded = [];
for (const [name, value] of plan) putSecret(name, value, 'work/app/wrangler.jsonc', (args, options) => { recorded.push({args, input: options.input}); return 0; });
for (const {args, input} of recorded) {
  assert.deepEqual(leaks(args.join(' ')), [], 'secret in argv');
  assert.equal(args[0], 'secret'); assert.equal(args[1], 'put');
  assert.ok(input && plan.some(([name, value]) => name === args[2] && value === input));
}
assert.throws(() => putSecret('GMAIL_SMTP_REFRESH_TOKEN', '', 'x', () => 0), /沒有值/);
for (const file of ['install-secrets.mjs', 'signing-secret.mjs', 'admin.mjs', 'authorize.mjs', 'import-google-client.mjs']) {
  const source = readFileSync(kitPath('tools', file), 'utf8');
  for (const line of source.split('\n').filter(l => /console\.(log|warn|error)/.test(l))) {
    // Only code matters: drop quoted text, keep template ${...} expressions.
    const code = line.replace(/'[^']*'|"[^"]*"/g, "''").replace(/`([^`]*)`/g, (_, inner) => [...inner.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]).join(' '));
    assert.doesNotMatch(code, /\b(value|refresh_token|client_secret|tokens|code|credential|readText|secret)\b/, `${file} may print a secret: ${line.trim()}`);
  }
}

// 2. Service responses: status, preview, MCP errors and admin failures contain no secret.
const {localD1} = await kitImport('tools', 'lib', 'local-d1.mjs');
const {default: worker} = await kitImport('work', 'app', 'worker.mjs');
const {adminClient, createDemo} = await kitImport('tools', 'lib', 'admin-client.mjs');
const {DB} = localD1(['schema.sql', 'mail-deliveries.sql', 'production.sql'].map(f => readFileSync(kitPath('schema', f), 'utf8')));
const env = {...SENTINELS, DB, AMP_SENDER: FIXTURE.sender, DAILY_ENABLED: 'false', GMAIL_SENDER: FIXTURE.sender, GMAIL_RECIPIENT: FIXTURE.recipient};
const local = (url, init) => worker.fetch(new Request(url, init), env);
const admin = adminClient({origin: FIXTURE.origin, secret: SENTINELS.SIGNING_SECRET, fetchImpl: local});
await createDemo(admin);
const responses = [
  JSON.stringify(await admin({action: 'tool', name: 'get_service_status'})),
  JSON.stringify(await admin({action: 'preview'})),
  await (await local(FIXTURE.origin + '/health')).text(),
  await (await local(FIXTURE.origin + '/internal/secretary', {method: 'POST', body: '{}'})).text(),
  await (await local(FIXTURE.origin + '/mcp', {method: 'POST', body: '{}'})).text(),
  await (await local(FIXTURE.origin + '/state?token=bad', {headers: {'AMP-Email-Sender': FIXTURE.sender}})).text(),
];
for (const text of responses) assert.deepEqual(leaks(text), [], text.slice(0, 200));
const preview = await admin({action: 'preview'});
assert.doesNotMatch(preview.content.html, /\/state\?token=/, 'plain HTML part (the only part saved locally) has no signed links');

// 3. Generated files never contain secrets or OAuth material.
for (const dir of [kitPath('work', 'app'), kitPath('work')]) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (!entry.isFile()) continue;
    const text = readFileSync(join(dir, entry.name), 'utf8');
    assert.doesNotMatch(text, /refresh_token"\s*:|client_secret"\s*:|GOCSPX-|SIGNING_SECRET"\s*:/, entry.name);
  }
}

// 4. The kit itself: no keys, tokens, real account IDs, conversation URLs or non-fictional e-mail.
const {scanKit} = await kitImport('tools', 'scan-kit.mjs');
const {findings, manifest} = scanKit(REAL_KIT);
assert.deepEqual(findings, [], JSON.stringify(findings.slice(0, 5)));
assert.ok(manifest.length > 20);
assert.ok(!manifest.some(f => /^(node_modules|work|\.secrets|\.wrangler)\//.test(f.file) || f.file === '設定.json'), 'excluded folders are not part of the kit');
console.log(`PASS t05: 秘密只經 stdin 管道交給 wrangler secret put（參數不含值）、工具輸出只列名稱；狀態、預覽、health、錯誤回應皆不含任何秘密；本機只保存不含簽章連結的一般版預覽；產生的檔案不含 OAuth／秘密欄位；教材 ${manifest.length} 個檔案掃描 0 筆疑似敏感資料。`);
