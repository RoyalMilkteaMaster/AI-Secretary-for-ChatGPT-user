// Google 授權（改自原 gmail/authorize.mjs）。一次只做一種：
//   node tools/authorize.mjs --smtp       專用寄件 Gmail，SMTP 需要完整 Gmail 權限 https://mail.google.com/
//   node tools/authorize.mjs --calendar   收件主帳號，Calendar 事件讀寫
//   加 --replace 才會取代既有授權（例如授權過期需要重新授權）
// state、PKCE、localhost 回呼、20 分鐘期限；完成後核對 Google 回報的「實際帳號」
// 必須等於 設定.json 的帳號，否則不保存。
import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {DEFAULT_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadValidated} from './lib/config.mjs';
import {GRANTS, REDIRECT, expectedAccount, checkGrantScopes, checkGrantAccount} from './lib/oauth-check.mjs';
import {createStore} from './lib/secret-store.mjs';

let args, config, mode, store, credential;
try {
  args = parseArgs(process.argv.slice(2), {flags: ['--smtp', '--calendar', '--replace'], options: ['--config']});
  const modes = ['--smtp', '--calendar'].filter(flag => args.flags.has(flag));
  if (modes.length !== 1) throw new Error('請指定一種授權：--smtp（寄件帳號）或 --calendar（日曆主帳號），一次一種');
  mode = modes[0].slice(2);
  config = loadValidated(args.options['--config'] || DEFAULT_CONFIG, 'google');
  store = createStore();
  if (store.has(GRANTS[mode].secret) && !args.flags.has('--replace'))
    throw new Error(`已經有${GRANTS[mode].label}的授權，未做任何變更。若要重新授權（例如過期），請加 --replace`);
  credential = store.read('google-client');
  if (credential.project_id !== config.google_project_id) throw new Error('已匯入的 OAuth 用戶端不屬於設定中的 Google 專案；請重新匯入');
} catch (error) { fail(error.message); }

const grant = GRANTS[mode], account = expectedAccount(mode, config);
const {OAuth2Client} = await import('google-auth-library');
const client = new OAuth2Client(credential.client_id, credential.client_secret, REDIRECT);
const state = randomBytes(32).toString('base64url');
const pkce = await client.generateCodeVerifierAsync();
const url = client.generateAuthUrl({
  access_type: 'offline', prompt: 'consent', scope: grant.request,
  login_hint: account, state, include_granted_scopes: false,
  code_challenge_method: 'S256', code_challenge: pkce.codeChallenge,
});
let processing = false;
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.method !== 'GET' || request.headers.host !== 'localhost:8766') {
    response.writeHead(400).end('Invalid request'); return;
  }
  const incoming = new URL(request.url, REDIRECT);
  if (incoming.pathname === '/start') {
    response.writeHead(302, {Location: url}).end(); return;
  }
  if (incoming.pathname !== '/oauth/callback') {
    response.writeHead(404).end('Not found'); return;
  }
  const received = Buffer.from(incoming.searchParams.get('state') ?? '');
  const expected = Buffer.from(state);
  if (received.length !== expected.length || !timingSafeEqual(received, expected) || processing) {
    response.writeHead(400).end('Invalid or already used authorization state'); return;
  }
  processing = true;
  const code = incoming.searchParams.get('code');
  if (incoming.searchParams.has('error') || !code) {
    response.writeHead(400).end('授權未完成，沒有保存新的憑證。');
    console.log('Authorization cancelled or missing code. No token saved.');
    finish(); return;
  }
  try {
    const {tokens} = await client.getToken({code, codeVerifier: pkce.codeVerifier, redirect_uri: REDIRECT});
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Missing credentials');
    checkGrantScopes(mode, await client.getTokenInfo(tokens.access_token), credential.client_id);
    client.setCredentials(tokens);
    if (mode === 'calendar') {
      const profile = await client.request({url: 'https://openidconnect.googleapis.com/v1/userinfo', retry: false});
      checkGrantAccount(mode, config, {email: profile.data.email, verified: profile.data.email_verified === true});
    } else {
      const profile = await client.request({url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress', retry: false});
      checkGrantAccount(mode, config, {email: profile.data.emailAddress, verified: true});
    }
    store.write(grant.secret, {client_id: credential.client_id, refresh_token: tokens.refresh_token, account,
      scope: grant.scope, authorized_at: new Date().toISOString()}, {replace: args.flags.has('--replace')});
    response.end(mode === 'calendar'
      ? '<h1>AI 秘書日曆授權已完成</h1><p>日曆事件授權已經 Windows 加密保存。程式固定管理設定中的一本日曆；新增或改期須先提出安排，再經你確認。尚待安裝到你的 Worker 並實測。</p>'
      : '<h1>AI 秘書 SMTP 授權已完成</h1><p>Google 要求的完整 Gmail 授權已經 Windows 加密保存。程式只用於 SMTP 寄送；尚未寄出任何信。</p>');
    console.log(`AUTHORIZED: ${mode === 'calendar' ? 'personal calendar events read/write' : 'SMTP/full mail scope'} for the configured account; refresh credential encrypted; no email sent.`);
  } catch (error) {
    const wrongAccount = /授權的帳號不是/.test(error.message);
    response.writeHead(wrongAccount ? 403 : 500).end(wrongAccount ? `<h1>帳號不符</h1><p>這次登入的不是設定中的${grant.label}，沒有保存任何憑證。請在 Google 授權畫面切換到正確帳號後重試。</p>` : '授權保存失敗，沒有完成設定。請回到助手檢查。');
    console.error(wrongAccount ? `✗ 帳號不符：不是設定中的${grant.label}；未保存憑證。` : 'Authorization exchange or validation failed; sensitive error details suppressed.');
    process.exitCode = 1;
  }
  finish();
});
function finish() {
  clearTimeout(timeout);
  server.close();
}
server.on('error', () => { console.error('Local authorization listener failed (port 8766 busy?)'); process.exitCode = 1; clearTimeout(timeout); });
const timeout = setTimeout(() => {
  console.log('Authorization window expired; no new credentials were saved.'); server.close();
}, 20 * 60 * 1000);
server.listen(8766, '127.0.0.1', () => {
  console.log(`請用瀏覽器開啟 http://localhost:8766/start ，並登入${grant.label}。最多等待 20 分鐘。`);
});
