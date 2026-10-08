// 部署 work/app 到「設定.json 指定的」Cloudflare 帳戶。設定未填完、未 prepare、
// 或工作副本被改過時拒絕部署。
//   node tools/deploy.mjs --check   只檢查並列出將部署的內容（不連網、不部署）
//   node tools/deploy.mjs           實際部署（需已 npm install 並 wrangler login）
import {DEFAULT_CONFIG, WRANGLER_CONFIG, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared, DAILY_CRON} from './lib/prepared.mjs';
import {runWrangler} from './lib/wrangler.mjs';

let args, prepared;
try {
  args = parseArgs(process.argv.slice(2), {flags: ['--check'], options: ['--config']});
  prepared = loadPrepared(args.options['--config'] || DEFAULT_CONFIG, 'prepare');
} catch (error) { fail(error.message); }
const {config, daily} = prepared;
console.log(`將部署：Worker「${config.worker_name}」→ Cloudflare 帳戶 ${config.account_id}
  D1 綁定 DB → ${config.d1_database_name}（${config.d1_database_id}）
  AMP 寄件者：${config.sender}
  每日寄信：${daily ? `開啟（DAILY_ENABLED=true，crons=["${DAILY_CRON}"]）` : '關閉（DAILY_ENABLED=false，crons=[]）'}`);
if (!config.origin) console.log('  首次部署：origin 尚未填寫，服務只開放首頁、/privacy、/health；部署後把網址填入 origin，再 prepare + deploy 一次。');
if (args.flags.has('--check')) { console.log('✓ 檢查通過（未部署、未連網）'); process.exit(0); }
let status;
try { status = runWrangler(['deploy', '--config', WRANGLER_CONFIG]); } catch (error) { fail(error.message); }
if (status !== 0) fail('Wrangler 部署失敗；請把上面 Wrangler 的錯誤訊息交給助手判斷（不要貼任何密鑰）');
console.log('✓ Wrangler 回報部署完成。請用瀏覽器開啟服務首頁與 /privacy 確認。');
