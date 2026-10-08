// Account and scope guards for Google authorization. These keep the original
// fixed-account protection, but the expected accounts come from the validated
// 設定.json instead of the original author's hard-coded addresses.
export const REDIRECT = 'http://localhost:8766/oauth/callback';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GRANTS = {
  smtp: {secret: 'gmail-smtp', scope: 'https://mail.google.com/', request: ['https://mail.google.com/'],
    allowed: ['https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.send'], role: 'sender', label: '專用寄件 Gmail'},
  calendar: {secret: 'calendar-reader', scope: CALENDAR_SCOPE, request: [CALENDAR_SCOPE, 'openid', 'email'],
    allowed: [CALENDAR_SCOPE, 'openid', 'email', 'https://www.googleapis.com/auth/userinfo.email'], role: 'recipient', label: '收件主帳號（個人日曆）'},
};

export const expectedAccount = (mode, config) => config[GRANTS[mode].role];

export function validateGoogleClient(data, config) {
  if (data?.installed) throw new Error('這是「桌面應用程式」用戶端；請建立類型為「網頁應用程式」的 OAuth 用戶端');
  const client = data?.web;
  if (!client) throw new Error('不是 Google OAuth 用戶端 JSON（找不到 web 區段）');
  if (client.project_id !== config.google_project_id) throw new Error('JSON 的專案 ID 與 設定.json 的 google_project_id 不同；請確認下載的是自己專案的用戶端');
  if (typeof client.client_id !== 'string' || !client.client_id.endsWith('.apps.googleusercontent.com')) throw new Error('用戶端 ID 格式不符');
  if (typeof client.client_secret !== 'string' || !client.client_secret) throw new Error('JSON 缺少用戶端密鑰');
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(REDIRECT)) throw new Error(`授權重新導向網址必須完整包含 ${REDIRECT}`);
  return {client_id: client.client_id, client_secret: client.client_secret, project_id: client.project_id, redirect_uris: client.redirect_uris};
}

// tokenInfo: {aud, scopes} from Google; rejects foreign clients and extra scopes.
export function checkGrantScopes(mode, tokenInfo, clientId) {
  const grant = GRANTS[mode];
  if (tokenInfo?.aud !== clientId || !Array.isArray(tokenInfo.scopes) || !tokenInfo.scopes.includes(grant.scope) ||
      tokenInfo.scopes.some(scope => !grant.allowed.includes(scope))) throw new Error('Unexpected granted scopes or audience');
}

// login_hint alone is not a guarantee: compare the account Google actually reports.
export function checkGrantAccount(mode, config, {email, verified}) {
  const expected = expectedAccount(mode, config);
  if (!expected || typeof email !== 'string' || email.toLowerCase() !== expected || verified !== true)
    throw new Error(`授權的帳號不是設定中的${GRANTS[mode].label}；未保存任何憑證`);
}

export const SECRET_GROUPS = {
  accounts: ['GMAIL_SENDER', 'GMAIL_RECIPIENT'],
  client: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'],
  smtp: ['GMAIL_SMTP_REFRESH_TOKEN'],
  calendar: ['CALENDAR_REFRESH_TOKEN'],
};

// Returns [[NAME, value], ...] after checking every stored item belongs to the
// configured accounts, project and OAuth client. Throws on any mismatch.
export function planSecretInstall(config, material, groups = Object.keys(SECRET_GROUPS)) {
  for (const group of groups) if (!SECRET_GROUPS[group]) throw new Error(`不認得的群組：${group}`);
  const needs = new Set(groups);
  const {client, smtp, calendar} = material;
  if (needs.has('client') || needs.has('smtp') || needs.has('calendar')) {
    if (!client?.client_id || !client.client_secret) throw new Error('尚未匯入 Google OAuth 用戶端（import-google-client.mjs）');
    if (client.project_id !== config.google_project_id) throw new Error('已匯入的用戶端不屬於設定中的 Google 專案');
  }
  const checkGrant = (mode, item) => {
    if (!item?.refresh_token) throw new Error(`尚未完成${GRANTS[mode].label}授權（authorize.mjs --${mode}）`);
    if (item.account !== expectedAccount(mode, config)) throw new Error(`已保存的${GRANTS[mode].label}授權屬於其他帳號；請用正確帳號重新授權（--replace）`);
    if (item.scope !== GRANTS[mode].scope) throw new Error(`${GRANTS[mode].label}授權範圍不符；請以 --calendar --replace 重新授權`);
    if (item.client_id !== client.client_id) throw new Error(`${GRANTS[mode].label}授權來自另一個 OAuth 用戶端；請重新授權（--replace）`);
  };
  if (needs.has('smtp')) checkGrant('smtp', smtp);
  if (needs.has('calendar')) checkGrant('calendar', calendar);
  const values = {
    GMAIL_SENDER: config.sender, GMAIL_RECIPIENT: config.recipient,
    GMAIL_CLIENT_ID: client?.client_id, GMAIL_CLIENT_SECRET: client?.client_secret,
    GMAIL_SMTP_REFRESH_TOKEN: smtp?.refresh_token, CALENDAR_REFRESH_TOKEN: calendar?.refresh_token,
  };
  return groups.flatMap(group => SECRET_GROUPS[group]).map(name => [name, values[name]]);
}
