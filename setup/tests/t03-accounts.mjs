// 錯誤帳號拒絕：寄信守門、Google 授權實際帳號／範圍、用戶端 JSON、秘密安裝前核對。
import assert from 'node:assert/strict';
import {writeFileSync, mkdirSync} from 'node:fs';
import {FIXTURE, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

const {offlineFetch} = await kitImport('tools', 'lib', 'offline-hooks.mjs');
writeConfig(FIXTURE);
assert.equal(runTool('prepare.mjs', ['--disable-daily']).status, 0);
const {validateConfig} = await kitImport('tools', 'lib', 'config.mjs');
const config = validateConfig(FIXTURE, 'ready').config;
const outbox = globalThis.__offlineOutbox;

// 1. Mail guard: Worker secrets must equal the validated owner settings.
const {sendCloudMail} = await kitImport('work', 'app', 'cloud-smtp.mjs');
const base = {GMAIL_SENDER: FIXTURE.sender, GMAIL_RECIPIENT: FIXTURE.recipient, GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_SMTP_REFRESH_TOKEN: 'refresh'};
const content = {subject: '虛構', text: '虛構', html: '<p>虛構</p>'};
for (const wrong of [{GMAIL_SENDER: 'attacker@mail.test'}, {GMAIL_RECIPIENT: 'attacker@mail.test'}, {GMAIL_SENDER: FIXTURE.recipient, GMAIL_RECIPIENT: FIXTURE.sender}, {GMAIL_SENDER: undefined}])
  await assert.rejects(() => sendCloudMail({...base, ...wrong}, content), /Unexpected mail configuration/, JSON.stringify(wrong));
assert.equal(globalThis.__offlineFetchLog.length, 0, 'no token request before the guard passes');
globalThis.fetch = offlineFetch({'https://oauth2.googleapis.com/token': () => Response.json({access_token: 'offline'})});
await sendCloudMail(base, content);
assert.equal(outbox.length, 1); assert.equal(outbox[0].to, FIXTURE.recipient); assert.deepEqual(outbox[0].envelope, {from: FIXTURE.sender, to: [FIXTURE.recipient]});

// 2. Google grant: actual account, scope and audience.
const {checkGrantAccount, checkGrantScopes, validateGoogleClient, planSecretInstall, GRANTS} = await kitImport('tools', 'lib', 'oauth-check.mjs');
checkGrantAccount('smtp', config, {email: FIXTURE.sender.toUpperCase(), verified: true});
checkGrantAccount('calendar', config, {email: FIXTURE.recipient, verified: true});
for (const [mode, who] of [['smtp', {email: 'attacker@mail.test', verified: true}], ['smtp', {email: FIXTURE.recipient, verified: true}],
  ['calendar', {email: FIXTURE.sender, verified: true}], ['calendar', {email: FIXTURE.recipient, verified: false}], ['calendar', {email: undefined, verified: true}]])
  assert.throws(() => checkGrantAccount(mode, config, who), /授權的帳號不是設定中的/, `${mode} ${JSON.stringify(who)}`);
const client = {client_id: '1-demo.apps.googleusercontent.com', client_secret: 'fictional', project_id: FIXTURE.google_project_id, redirect_uris: ['http://localhost:8766/oauth/callback']};
checkGrantScopes('smtp', {aud: client.client_id, scopes: [GRANTS.smtp.scope]}, client.client_id);
checkGrantScopes('calendar', {aud: client.client_id, scopes: [GRANTS.calendar.scope, 'openid', 'https://www.googleapis.com/auth/userinfo.email']}, client.client_id);
for (const info of [{aud: 'other-client', scopes: [GRANTS.smtp.scope]}, {aud: client.client_id, scopes: []},
  {aud: client.client_id, scopes: [GRANTS.smtp.scope, 'https://www.googleapis.com/auth/drive']}, {aud: client.client_id, scopes: [GRANTS.calendar.scope]}])
  assert.throws(() => checkGrantScopes('smtp', info, client.client_id), /Unexpected granted scopes/);

// 3. OAuth client JSON: own project, web type, exact localhost callback.
assert.deepEqual(Object.keys(validateGoogleClient({web: {...client, auth_uri: 'x', token_uri: 'y'}}, config)).sort(), ['client_id', 'client_secret', 'project_id', 'redirect_uris']);
assert.throws(() => validateGoogleClient({installed: client}, config), /網頁應用程式/);
assert.throws(() => validateGoogleClient({web: {...client, project_id: 'someone-elses-project'}}, config), /專案 ID/);
assert.throws(() => validateGoogleClient({web: {...client, redirect_uris: ['http://localhost:8080/']}}, config), /localhost:8766/);
assert.throws(() => validateGoogleClient({web: {...client, client_secret: ''}}, config), /密鑰/);
mkdirSync(kitPath('fixtures'), {recursive: true});
writeFileSync(kitPath('fixtures', 'other-project.json'), JSON.stringify({web: {...client, project_id: 'someone-elses-project'}}));
const imported = runTool('import-google-client.mjs', [kitPath('fixtures', 'other-project.json')]);
assert.notEqual(imported.status, 0); assert.match(imported.out, /專案 ID/);

// 4. Secret install plan: stored grants must belong to the configured accounts.
const smtp = {client_id: client.client_id, refresh_token: 'fictional-smtp', account: FIXTURE.sender, scope: GRANTS.smtp.scope};
const calendar = {client_id: client.client_id, refresh_token: 'fictional-cal', account: FIXTURE.recipient, scope: GRANTS.calendar.scope};
const plan = planSecretInstall(config, {client, smtp, calendar});
assert.deepEqual(plan.map(([name]) => name), ['GMAIL_SENDER', 'GMAIL_RECIPIENT', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_SMTP_REFRESH_TOKEN', 'CALENDAR_REFRESH_TOKEN']);
assert.deepEqual(Object.fromEntries(plan).GMAIL_SENDER, FIXTURE.sender);
for (const [label, material, pattern] of [
  ['smtp granted by main account', {client, smtp: {...smtp, account: FIXTURE.recipient}, calendar}, /其他帳號/],
  ['calendar granted by sender', {client, smtp, calendar: {...calendar, account: FIXTURE.sender}}, /其他帳號/],
  ['foreign account', {client, smtp: {...smtp, account: 'attacker@mail.test'}, calendar}, /其他帳號/],
  ['grant from another client', {client, smtp: {...smtp, client_id: '2-other.apps.googleusercontent.com'}, calendar}, /另一個 OAuth 用戶端/],
  ['client of another project', {client: {...client, project_id: 'someone-elses-project'}, smtp, calendar}, /不屬於設定中的 Google 專案/],
  ['wrong scope', {client, smtp: {...smtp, scope: 'https://www.googleapis.com/auth/gmail.send'}, calendar}, /範圍不符/],
  ['missing smtp grant', {client, calendar}, /尚未完成/],
]) assert.throws(() => planSecretInstall(config, material), pattern, label);
assert.deepEqual(planSecretInstall(config, {}, ['accounts']).map(([n]) => n), ['GMAIL_SENDER', 'GMAIL_RECIPIENT']);
assert.throws(() => planSecretInstall(config, {}, ['everything']), /不認得的群組/);

// 5. authorize.mjs never starts a consent server without the client/settings.
const auth = runTool('authorize.mjs', ['--smtp']);
assert.notEqual(auth.status, 0); assert.doesNotMatch(auth.out, /localhost:8766\/start/);
console.log('PASS t03: 寄信守門拒絕任何與設定不同的寄件／收件（含對調）且在要求 token 前就停止；授權只接受設定中的實際帳號（寄件＝sender、日曆＝recipient，大小寫無關、需已驗證）、正確 client 與範圍；只接受自己專案的網頁型用戶端與 localhost:8766 回呼；安裝秘密前拒絕他人帳號、他專案、他用戶端與錯誤範圍；未具備條件時不啟動授權伺服器。');
