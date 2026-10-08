// 把本機加密保存的 Google 憑證與寄收件地址，經 stdin 秘密管道安裝到自己的 Worker：
//   GMAIL_SENDER、GMAIL_RECIPIENT、GMAIL_CLIENT_ID、GMAIL_CLIENT_SECRET、
//   GMAIL_SMTP_REFRESH_TOKEN、CALENDAR_REFRESH_TOKEN
// 安裝前核對：授權帳號＝設定的寄件／主帳號、範圍正確、同一個 OAuth 用戶端與專案。
//   node tools/install-secrets.mjs                      全部安裝
//   node tools/install-secrets.mjs --only smtp,calendar 只更新部分（重新授權後）
import {DEFAULT_CONFIG, WRANGLER_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared} from './lib/prepared.mjs';
import {planSecretInstall, SECRET_GROUPS} from './lib/oauth-check.mjs';
import {createStore} from './lib/secret-store.mjs';
import {putSecret} from './lib/wrangler.mjs';

try {
  const args = parseArgs(process.argv.slice(2), {options: ['--config', '--only']});
  const {config} = loadPrepared(args.options['--config'] || DEFAULT_CONFIG, 'google');
  const groups = args.options['--only'] ? args.options['--only'].split(',').map(s => s.trim()).filter(Boolean) : Object.keys(SECRET_GROUPS);
  const store = createStore();
  const load = name => store.has(name) ? store.read(name) : undefined;
  const needsClient = groups.some(g => g !== 'accounts');
  const plan = planSecretInstall(config, {
    client: needsClient ? load('google-client') : undefined,
    smtp: groups.includes('smtp') ? load('gmail-smtp') : undefined,
    calendar: groups.includes('calendar') ? load('calendar-reader') : undefined,
  }, groups);
  console.log(`核對通過：寄件 ${config.sender}、收件／日曆帳號 ${config.recipient}、Google 專案 ${config.google_project_id}`);
  for (const [name, value] of plan) {
    if (putSecret(name, value, WRANGLER_CONFIG) !== 0) fail(`${name} 安裝失敗（未顯示內容）；其餘項目未繼續`);
    console.log(`✓ 已安裝 ${name}`);
  }
  console.log('完成。只顯示名稱，沒有列出任何秘密值。');
} catch (error) { fail(error.message); }
