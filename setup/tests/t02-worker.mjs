// 正式程式（prepare 產生的 work/app）離線回歸：沿用原 check.mjs／check-production.mjs
// 的斷言，另加未設定與首次部署階段的 fail-closed 行為。資料全為虛構，網路已封鎖。
import assert from 'node:assert/strict';
import {readFileSync, cpSync, rmSync} from 'node:fs';
import {FIXTURE, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

const {offlineFetch} = await kitImport('tools', 'lib', 'offline-hooks.mjs');
const {localD1} = await kitImport('tools', 'lib', 'local-d1.mjs');
writeConfig({...FIXTURE, origin: ''});
assert.equal(runTool('prepare.mjs').status, 0);
rmSync(kitPath('variants', 'first'), {recursive: true, force: true});
cpSync(kitPath('work', 'app'), kitPath('variants', 'first'), {recursive: true});
writeConfig(FIXTURE);
assert.equal(runTool('prepare.mjs', ['--disable-daily']).status, 0);

const schemas = ['schema.sql', 'mail-deliveries.sql', 'production.sql'].map(f => readFileSync(kitPath('schema', f), 'utf8'));
const outbox = globalThis.__offlineOutbox;
const SECRET = 'test-not-a-real-credential';

// A. Unconfigured template and first-deploy copy fail closed.
for (const [label, dir] of [['template', 'app-template'], ['first-deploy', 'variants/first']]) {
  const {default: w} = await kitImport(...dir.split('/'), 'worker.mjs');
  const {DB} = localD1(schemas);
  const env = {DB, SIGNING_SECRET: SECRET, AMP_SENDER: FIXTURE.sender, DAILY_ENABLED: 'true', GMAIL_SENDER: FIXTURE.sender, GMAIL_RECIPIENT: FIXTURE.recipient};
  const get = path => w.fetch(new Request('https://local.test' + path, {headers: {'AMP-Email-Sender': FIXTURE.sender}}), env);
  assert.equal((await get('/')).status, 200, label);
  assert.equal((await get('/privacy')).status, 200, label);
  assert.equal((await (await get('/health')).json()).configured, false, label);
  for (const path of ['/state?token=x', '/mcp', '/oauth/authorize', '/.well-known/oauth-authorization-server', '/internal/secretary'])
    assert.equal((await get(path)).status, 503, `${label} ${path}`);
  await w.scheduled({scheduledTime: Date.now()}, env);
  const {sendCloudMail} = await kitImport(...dir.split('/'), 'cloud-smtp.mjs');
  await assert.rejects(() => sendCloudMail(env, {subject: 'x', text: 'x'}), /Unexpected mail configuration/, label);
  assert.equal(outbox.length, 0, `${label} must never send`);
}

// B. Configured copy: original check.mjs assertions.
const {default: worker} = await kitImport('work', 'app', 'worker.mjs');
const {signClaims} = await kitImport('work', 'app', 'secretary-sign.mjs');
const {createStep, updateStep, getStep, digestSteps, localDay} = await kitImport('work', 'app', 'secretary-data.mjs');
const {renderDigest, sendDigest, calendarForDay} = await kitImport('work', 'app', 'secretary-digest.mjs');
const {hash, ORIGIN, RESOURCE} = await kitImport('work', 'app', 'secretary-auth.mjs');
assert.equal(ORIGIN, FIXTURE.origin);
{
  const {sqlite, DB} = localD1(schemas.slice(0, 1));
  sqlite.exec("INSERT INTO steps(id,title) VALUES ('TEST_A','虛構測試 A'),('TEST_B','虛構測試 B')");
  const env = {AMP_SENDER: FIXTURE.sender, SIGNING_SECRET: 'local-test-only', DB};
  const sign = (id = 'TEST_A', rev = 1, exp = Math.floor(Date.now() / 1000) + 3600) => signClaims({v: 1, id, rev, exp}, env.SIGNING_SECRET);
  const token = await sign();
  const auth = {'AMP-Email-Sender': FIXTURE.sender};
  const call = (url, options = {}) => worker.fetch(new Request(FIXTURE.origin + url, {headers: auth, ...options}), env);
  assert.equal((await (await call('/health')).json()).configured, true);
  const get = await call('/state?token=' + token);
  assert.equal(get.status, 200); assert.equal((await get.json()).items[0].done, false);
  assert.equal(sqlite.prepare('SELECT completed_at FROM steps WHERE id=?').get('TEST_A').completed_at, null);
  assert.equal((await call('/state?token=' + token, {headers: {}})).status, 403);
  assert.equal((await call('/state?token=' + token + '&__amp_source_origin=' + FIXTURE.sender, {headers: {}})).status, 403);
  assert.equal((await call('/state?token=' + token, {headers: {'AMP-Email-Sender': 'wrong@mail.test'}})).status, 403);
  assert.equal((await call('/state?token=' + token, {headers: {'AMP-Email-Sender': FIXTURE.recipient}})).status, 403, 'recipient is not the sender');
  assert.equal((await call('/state?token=' + await sign('TEST_A', 1, 1))).status, 401);
  assert.equal((await call('/state?token=' + token.slice(0, -3) + 'BAD')).status, 401);
  assert.equal((await call('/state?token=' + await signClaims({v: 1, id: 'TEST_A', rev: 1, exp: Math.floor(Date.now() / 1000) + 3600}, 'other-secret'))).status, 401);
  const legacy = await call('/state?token=' + token + '&__amp_source_origin=' + FIXTURE.sender, {headers: {Origin: 'https://mail.google.com'}});
  assert.equal(legacy.headers.get('Access-Control-Allow-Origin'), 'https://mail.google.com');
  assert.equal(legacy.headers.get('Cache-Control'), 'no-store');
  const post = body => call('/state', {method: 'POST', headers: {...auth, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(body)});
  assert.equal((await post({token})).status, 400);
  assert.equal((await post({token, done: '1'})).status, 200);
  const saved = sqlite.prepare('SELECT completed_at FROM steps WHERE id=?').get('TEST_A').completed_at;
  assert.ok(saved);
  assert.equal((await (await call('/state?token=' + token)).json()).items[0].done, true);
  await post({token, done: '1'});
  assert.equal(sqlite.prepare('SELECT completed_at FROM steps WHERE id=?').get('TEST_A').completed_at, saved);
  assert.equal(sqlite.prepare('SELECT status FROM steps WHERE id=?').get('TEST_B').status, 'pending');
  sqlite.exec("UPDATE steps SET revision=2,status='pending',completed_at=NULL WHERE id='TEST_A'");
  assert.equal((await post({token, done: '1'})).status, 409);
  const multipart = new FormData(); multipart.set('token', await sign('TEST_A', 2)); multipart.set('done', '1');
  assert.equal((await call('/state', {method: 'POST', headers: auth, body: multipart})).status, 200);
  const failure = await worker.fetch(new Request(FIXTURE.origin + '/state?token=' + token, {headers: auth}), {...env, DB: {prepare() { throw new Error('private information'); }}});
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes('private information'));
  const mismatched = await worker.fetch(new Request(FIXTURE.origin + '/state?token=' + token, {headers: {'AMP-Email-Sender': 'intruder@mail.test'}}), {...env, AMP_SENDER: 'intruder@mail.test'});
  assert.equal(mismatched.status, 503, 'deployed AMP_SENDER differing from owner settings fails closed');
  sqlite.close();
}

// C. Configured copy: original check-production.mjs assertions.
const {sqlite, DB} = localD1(schemas);
const env = {SIGNING_SECRET: SECRET, AMP_SENDER: FIXTURE.sender, DAILY_ENABLED: 'false', DB, GMAIL_SENDER: FIXTURE.sender, GMAIL_RECIPIENT: FIXTURE.recipient,
  GMAIL_CLIENT_ID: 'fake-id', GMAIL_CLIENT_SECRET: 'fake-secret', GMAIL_SMTP_REFRESH_TOKEN: 'fake-refresh'};
const time = Date.parse('2026-10-07T09:00:00+08:00');
const input = (id, extra = {}) => ({id, title: '虛構 ' + id, activity: '驗收', status: 'unknown', priority: 'normal', due_at: null, not_before: null, source_chat: '', detail: '', kind: 'task', ...extra});
await createStep(env.DB, input('A', {priority: 'urgent'})); await createStep(env.DB, input('B', {due_at: '2026-10-14T13:00:00+08:00'}));
await createStep(env.DB, input('C')); await createStep(env.DB, input('TEST', {kind: 'test'})); await createStep(env.DB, input('LATER', {not_before: '2026-11-01T09:00:00+08:00'}));
await createStep(env.DB, input('PAUSED', {paused: true}));
assert.equal(localDay(Date.parse('2026-10-06T17:00:00Z')), '2026-10-07');
assert.deepEqual(new Set((await digestSteps(env.DB, time)).map(x => x.id)), new Set(['A', 'B', 'C']), 'kind=test, not_before and paused are excluded');
const before = await getStep(env.DB, 'A');
const token = await signClaims({v: 1, id: 'A', rev: 1, exp: Math.floor(Date.now() / 1000) + 3600}, env.SIGNING_SECRET);
const request = (path, options = {}) => worker.fetch(new Request(ORIGIN + path, options), env);
assert.equal((await request('/state', {method: 'POST', headers: {'AMP-Email-Sender': env.AMP_SENDER, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({token, done: '1'})})).status, 200);
await assert.rejects(() => updateStep(env.DB, {id: 'A', expected_revision: before.revision, expected_status: before.status, patch: {title: 'stale'}}), /CONFLICT/);
assert.equal((await getStep(env.DB, 'B')).status, 'unknown');
assert.ok(!(await digestSteps(env.DB, time)).some(x => x.id === 'A'));
await assert.rejects(() => updateStep(env.DB, {id: 'A', expected_revision: 1, expected_status: 'completed', patch: {status: 'pending'}}), /EXPLICIT_REOPEN/);
await updateStep(env.DB, {id: 'B', expected_revision: 1, expected_status: 'unknown', patch: {not_before: '2026-10-08T09:00:00+08:00'}});
assert.ok(!(await digestSteps(env.DB, time)).some(x => x.id === 'B'));
const bToken = await signClaims({v: 1, id: 'B', rev: 2, exp: Math.floor(Date.now() / 1000) + 3600}, env.SIGNING_SECRET);
await updateStep(env.DB, {id: 'B', expected_revision: 2, expected_status: 'unknown', patch: {status: 'completed'}});
const bEmail = await request('/state?token=' + bToken, {headers: {'AMP-Email-Sender': env.AMP_SENDER}});
assert.equal(bEmail.status, 200); assert.equal((await bEmail.json()).items[0].done, true);
const calendar = {events: [{title: '虛構行程', start: '2026-10-07T11:00:00+08:00', end: '2026-10-07T12:00:00+08:00', all_day: false}], checked_at: new Date().toISOString(), warning: ''};
const content = await renderDigest([input('X', {revision: 1, title: '<script>escape</script>', detail: 'x & y', priority: 'urgent'})], calendar, env.SIGNING_SECRET, {time});
assert.ok(!content.amp.includes('<script>escape'));
assert.ok(content.html.includes('&lt;script&gt;escape&lt;/script&gt;'));
assert.ok(content.amp.includes('x &amp; y'));
assert.ok(content.amp.includes(FIXTURE.origin + '/state?token='), 'mail links point at the configured origin');
for (const group of ['急件', '近期截止', '一般待辦', '今日行程']) assert.ok(content.amp.includes(group));
let sent = 0;
const deps = {calendar: async () => calendar, send: async () => { sent++; }};
const first = await sendDigest(env, {time}, deps), second = await sendDigest(env, {time}, deps);
assert.equal(first.status, 'accepted'); assert.equal(second.duplicate, true); assert.equal(sent, 1);
const v1 = await sendDigest(env, {time, validation: true}, deps), v2 = await sendDigest(env, {time, validation: true}, deps);
assert.equal(v1.status, 'accepted'); assert.equal(v2.duplicate, true); assert.equal(sent, 2, 'validation mail is also once per day');
await assert.rejects(() => sendDigest(env, {time: time + 86400000}, {...deps, send: async () => { sent++; throw Error('uncertain'); }}));
assert.equal((await sendDigest(env, {time: time + 86400000}, deps)).status, 'uncertain_or_failed'); assert.equal(sent, 3);

// MCP + OAuth (owner approval binding, PKCE, single use, refresh rotation, revocation).
const rpc = (method, params = {}, access) => request('/mcp', {method: 'POST', headers: {'Content-Type': 'application/json', ...(access ? {Authorization: 'Bearer ' + access} : {})}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
assert.equal((await rpc('tools/list')).status, 401); assert.equal((await rpc('initialize')).status, 401); assert.equal((await rpc('tools/call', {name: 'list_steps'})).status, 401);
assert.equal((await request('/internal/secretary', {method: 'POST', body: '{}'})).status, 401);
globalThis.fetch = offlineFetch({'https://chatgpt.com/oauth/client.json': (url, options) => { assert.equal(options.redirect, 'manual'); return Response.json({client_id: 'https://chatgpt.com/oauth/client.json', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect']}); }});
const verifier = 'v'.repeat(43), params = new URLSearchParams({client_id: 'https://chatgpt.com/oauth/client.json', redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', resource: RESOURCE, response_type: 'code', code_challenge: await hash(verifier), code_challenge_method: 'S256', state: 'test-state', scope: 'offline_access secretary.read secretary.write'});
const page = await request('/oauth/authorize?' + params); assert.equal(page.status, 200);
assert.equal(page.headers.get('Referrer-Policy'), 'same-origin');
assert.match(page.headers.get('Content-Security-Policy'), /form-action[^;]*https:\/\/chatgpt\.com\/connector_platform_oauth_redirect/);
const html = await page.text(), binding = html.match(/id="request-binding">([^<]+)</)[1];
const {approvalCode} = await kitImport('tools', 'lib', 'admin-client.mjs');
params.set('approval', await approvalCode(binding, 'wrong-secret'));
const authorize = () => request('/oauth/authorize', {method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, body: params});
assert.equal((await authorize()).status, 403, 'code signed with another secret is rejected');
params.set('approval', await approvalCode(binding, SECRET, Math.floor(Date.now() / 1000) - 400));
assert.equal((await authorize()).status, 403, 'expired (older than 5 minutes) code is rejected');
params.set('approval', await approvalCode(binding, SECRET));
const approved = await authorize(); assert.equal(approved.status, 303); assert.equal((await authorize()).status, 403, 'single use');
const callback = new URL(approved.headers.get('Location')); assert.equal(callback.searchParams.get('iss'), ORIGIN);
const exchange = extra => request('/oauth/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: params.get('client_id'), resource: RESOURCE, ...extra})});
const grant = {grant_type: 'authorization_code', code: callback.searchParams.get('code'), code_verifier: verifier, redirect_uri: params.get('redirect_uri')};
assert.equal((await exchange({...grant, code_verifier: 'w'.repeat(43)})).status, 400);
const credentials = await (await exchange(grant)).json(); assert.ok(credentials.access_token); assert.equal((await exchange(grant)).status, 400);
assert.equal((await (await rpc('tools/list', {}, credentials.access_token)).json()).result.tools.length, 9);
const init = await (await rpc('initialize', {}, credentials.access_token)).json();
assert.ok(init.result.instructions.includes(FIXTURE.calendar), 'MCP instructions name the configured calendar');
const across = await (await rpc('tools/call', {name: 'get_step', arguments: {id: 'A'}}, credentials.access_token)).json();
assert.equal(across.result.structuredContent.step.status, 'completed');
const status = (await (await rpc('tools/call', {name: 'get_service_status', arguments: {}}, credentials.access_token)).json()).result.structuredContent;
assert.equal(status.sender, FIXTURE.sender); assert.equal(status.recipient, FIXTURE.recipient); assert.equal(status.calendar, FIXTURE.calendar);
assert.equal(status.mail_accounts_match_settings, true); assert.equal(status.schedule_enabled, false);
assert.equal((await exchange({grant_type: 'refresh_token', refresh_token: credentials.refresh_token, resource: ORIGIN + '/wrong'})).status, 400);
const renewed = await (await exchange({grant_type: 'refresh_token', refresh_token: credentials.refresh_token})).json(); assert.ok(renewed.access_token);
assert.equal((await exchange({grant_type: 'refresh_token', refresh_token: credentials.refresh_token})).status, 400);
await request('/oauth/revoke', {method: 'POST', body: new URLSearchParams({client_id: params.get('client_id'), token: renewed.refresh_token})});
assert.equal((await rpc('tools/call', {name: 'list_steps'}, renewed.access_token)).status, 401);

// Admin endpoint: body hash binding.
const {adminClient} = await kitImport('tools', 'lib', 'admin-client.mjs');
const local = (url, init) => worker.fetch(new Request(url, init), env);
const admin = adminClient({origin: ORIGIN, secret: SECRET, fetchImpl: local});
assert.equal((await admin({action: 'tool', name: 'get_step', arguments: {id: 'C'}})).step.id, 'C');
const tampered = adminClient({origin: ORIGIN, secret: SECRET, fetchImpl: (url, init) => local(url, {...init, body: init.body.replace('"C"', '"A"')})});
await assert.rejects(() => tampered({action: 'tool', name: 'get_step', arguments: {id: 'C'}}), /authorization_required/);
await assert.rejects(() => adminClient({origin: ORIGIN, secret: 'wrong', fetchImpl: local})({action: 'preview'}), /authorization_required/);

// Calendar: only the configured calendar, with pagination.
let calendarCalls = 0;
globalThis.fetch = offlineFetch({
  'https://oauth2.googleapis.com/token': () => Response.json({access_token: 'fake-test'}),
  'https://www.googleapis.com/calendar/v3/calendars/': url => {
    const u = new URL(url);
    assert.equal(decodeURIComponent(u.pathname), `/calendar/v3/calendars/${FIXTURE.calendar}/events`);
    assert.equal(u.searchParams.get('timeMin'), '2026-10-07T00:00:00+08:00');
    calendarCalls++;
    return Response.json(calendarCalls === 1 ? {items: [], nextPageToken: 'next'} : {items: [{id: 'e', summary: 'Event', start: {date: '2026-10-07'}, end: {date: '2026-10-08'}}]});
  },
});
assert.equal((await calendarForDay({...env, CALENDAR_REFRESH_TOKEN: 'fake'}, '2026-10-07')).events.length, 1); assert.equal(calendarCalls, 2);

// Cron: off → nothing; on → one mail to the configured recipient, deduplicated.
calendarCalls = 0;
const cronTime = time + 10 * 86400000; // a day without earlier receipts
await worker.scheduled({scheduledTime: cronTime}, env);
assert.equal(outbox.length, 0, 'DAILY_ENABLED=false sends nothing');
await worker.scheduled({scheduledTime: cronTime}, {...env, DAILY_ENABLED: 'true', AMP_SENDER: 'intruder@mail.test'});
assert.equal(outbox.length, 0, 'mismatched deployment sends nothing');
await worker.scheduled({scheduledTime: cronTime}, {...env, DAILY_ENABLED: 'true'});
await worker.scheduled({scheduledTime: cronTime}, {...env, DAILY_ENABLED: 'true'});
assert.equal(outbox.length, 1, 'enabled cron sends exactly one per day');
assert.equal(outbox[0].to, FIXTURE.recipient); assert.equal(outbox[0].from.address, FIXTURE.sender);
assert.match(outbox[0].subject, /每日總覽/);

// Public pages carry no owner addresses and show the policy date.
const privacy = await (await request('/privacy')).text(), home = await (await request('/')).text();
for (const pageText of [privacy, home]) for (const value of [FIXTURE.sender, FIXTURE.recipient, FIXTURE.account_id]) assert.ok(!pageText.includes(value));
assert.match(privacy, /更新日期：\d{4}-\d{2}-\d{2}/);
sqlite.close();
console.log('PASS t02: 未設定範本與首次部署階段 fail-closed（郵件/OAuth/MCP/進度 503、cron 不寄、寄信守門拒絕）；原 check.mjs 與 check-production.mjs 斷言全數在產生的程式上通過（簽章/期限/來源、唯讀 GET、重送保留時間、版本隔離、四類分組、kind=test/not_before/暫停排除、每日與驗收信每日一次、不確定結果不重寄、MCP OAuth 綁定碼五分鐘單次、PKCE、refresh 輪替、撤銷、管理請求內容雜湊、只讀設定日曆含分頁）；cron 只在開啟時寄一封到設定的收件者。');
