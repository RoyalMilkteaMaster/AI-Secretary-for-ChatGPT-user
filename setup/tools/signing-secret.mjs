// 產生並安裝 SIGNING_SECRET（保護信內勾選、MCP 綁定碼與管理請求）。
// 本機以 Windows DPAPI 加密保存；只經由 stdin 管道交給 wrangler secret put。
//   node tools/signing-secret.mjs                 沒有就產生；然後安裝到自己的 Worker
//   node tools/signing-secret.mjs --generate-only 只在本機產生（不連網）
//   node tools/signing-secret.mjs --rotate        換新密鑰（舊郵件勾選與舊綁定碼會失效）
import {randomBytes} from 'node:crypto';
import {DEFAULT_CONFIG, WRANGLER_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared} from './lib/prepared.mjs';
import {createStore} from './lib/secret-store.mjs';
import {putSecret} from './lib/wrangler.mjs';

try {
  const args = parseArgs(process.argv.slice(2), {flags: ['--generate-only', '--rotate'], options: ['--config']});
  loadPrepared(args.options['--config'] || DEFAULT_CONFIG, 'prepare');
  const store = createStore(), rotate = args.flags.has('--rotate');
  if (!store.has('signing-secret') || rotate) {
    if (rotate && store.has('signing-secret')) console.warn('! 換新 SIGNING_SECRET：之前寄出的郵件勾選與未使用的綁定碼都會失效。');
    store.writeText('signing-secret', randomBytes(32).toString('base64url'), {replace: rotate});
    console.log('✓ 已在本機產生 SIGNING_SECRET，並以 Windows 加密保存（未顯示內容）');
  } else console.log('✓ 沿用本機已加密保存的 SIGNING_SECRET（未覆蓋）');
  if (!args.flags.has('--generate-only')) {
    if (putSecret('SIGNING_SECRET', store.readText('signing-secret'), WRANGLER_CONFIG) !== 0) fail('SIGNING_SECRET 安裝失敗（未顯示內容）');
    console.log('✓ SIGNING_SECRET 已透過秘密管道安裝到自己的 Worker');
  }
} catch (error) { fail(error.message); }
