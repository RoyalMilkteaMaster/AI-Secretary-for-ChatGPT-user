// 掃描教材（不含 node_modules、work、.secrets、測試暫存）是否夾帶密鑰、權杖、
// 真實帳號 ID、對話網址或非虛構的電子郵件，並列出每個檔案的 SHA-256。
//   node tools/scan-kit.mjs [--json 輸出路徑]
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {KIT, parseArgs, fail} from './lib/paths.mjs';

const SKIP_DIRS = new Set(['node_modules', 'work', '.secrets', '.tmp', '.wrangler', 'generated', '.git']);
// Fictional fixtures used by tests and examples; nothing here belongs to a real account.
const ALLOWED = {
  email: /@(mail\.test|example\.com|example\.org|anthropic\.com)$/,
  hex32: new Set(['0123456789abcdef0123456789abcdef']),
  uuid: new Set(['00000000-0000-4000-8000-000000000000']),
  workersDev: /^(ai-secretary-progress|other-worker)\.(demo-sub|other-sub)\.workers\.dev$/,
};
const PATTERNS = [
  ['Google 用戶端密鑰', /GOCSPX-[A-Za-z0-9_-]{8,}/g],
  ['Google refresh token', /\b1\/\/0[0-9A-Za-z_-]{20,}/g],
  ['Google access token', /ya29\.[0-9A-Za-z_-]{20,}/g],
  ['Google 用戶端 ID', /\b\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/g],
  ['私鑰', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['JWT／簽章權杖', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}/g],
  ['Cloudflare API token 標頭', /Bearer\s+[A-Za-z0-9_-]{40}\b/g],
  ['ChatGPT 對話／專案網址', /chatgpt\.com\/(?:g\/g-p-[A-Za-z0-9-]+|c\/[0-9a-f]{8}-)[^\s"'<)]*/g],
  ['電子郵件', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, v => ALLOWED.email.test(v.toLowerCase())],
  ['32 位帳戶 ID', /\b[0-9a-f]{32}\b/g, v => ALLOWED.hex32.has(v)],
  ['UUID（資料庫／版本 ID）', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, v => ALLOWED.uuid.has(v)],
  ['workers.dev 網址', /[A-Za-z0-9<>${}._-]+\.workers\.dev/g, v => /[<>${}]/.test(v) || v === '.workers.dev' || ALLOWED.workersDev.test(v)],
];

function* walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name)); }
    else yield join(dir, entry.name);
  }
}

export function scanKit(root = KIT) {
  const findings = [], manifest = [];
  for (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel === '設定.json') { findings.push({file: rel, type: '個人設定檔', sample: '設定.json 不應隨教材發布'}); continue; }
    const buffer = readFileSync(file);
    manifest.push({file: rel, bytes: statSync(file).size, sha256: createHash('sha256').update(buffer).digest('hex')});
    const text = buffer.toString('utf8');
    for (const [type, pattern, allowed] of PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (allowed && allowed(match[0])) continue;
        findings.push({file: rel, type, sample: match[0].slice(0, 6) + '…'});
      }
    }
  }
  return {findings, manifest};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let args;
  try { args = parseArgs(process.argv.slice(2), {options: ['--json']}); } catch (error) { fail(error.message); }
  const {findings, manifest} = scanKit();
  if (args.options['--json']) writeFileSync(args.options['--json'], JSON.stringify({scanned_at: new Date().toISOString(), files: manifest.length, findings, manifest}, null, 2));
  for (const f of findings) console.log(`✗ ${f.file}：${f.type}（${f.sample}）`);
  console.log(`${findings.length ? '✗' : '✓'} 掃描 ${manifest.length} 個檔案，發現 ${findings.length} 筆疑似敏感資料。`);
  process.exit(findings.length ? 1 : 0);
}
