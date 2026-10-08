// 匯入自己 Google Cloud 專案的「網頁應用程式」OAuth 用戶端 JSON，以 Windows
// DPAPI 加密保存。核對專案 ID 與本機回呼網址；不列印任何憑證內容。
//   node tools/import-google-client.mjs <下載的 JSON 路徑> [--replace]
import {readFileSync} from 'node:fs';
import {DEFAULT_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadValidated} from './lib/config.mjs';
import {validateGoogleClient} from './lib/oauth-check.mjs';
import {createStore} from './lib/secret-store.mjs';

try {
  const args = parseArgs(process.argv.slice(2), {flags: ['--replace'], options: ['--config'], positionals: 1});
  const [file] = args.positionals;
  if (!file) throw new Error('請提供下載的 OAuth 用戶端 JSON 路徑');
  const config = loadValidated(args.options['--config'] || DEFAULT_CONFIG, 'google');
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { throw new Error('無法讀取該 JSON 檔'); }
  const client = validateGoogleClient(data, config);
  const store = createStore(), replace = args.flags.has('--replace');
  if (store.has('google-client') && replace) console.warn('! 取代既有用戶端：之前的寄信與日曆授權屬於舊用戶端，需要各自加 --replace 重新授權。');
  store.write('google-client', client, {replace});
  console.log('✓ OAuth 用戶端已核對（專案、網頁類型、回呼網址）並以 Windows 加密保存。未列印任何憑證。');
  console.log('  建議：確認匯入成功後，把下載的 JSON 從「下載」資料夾刪除或移到安全位置，不要貼進聊天。');
} catch (error) { fail(error.message); }
