// 離線測試總入口：node tests/run-all.mjs [--keep]
// 在 tests/.tmp 建立教材的拋棄式副本，逐一執行 tests/tNN-*.mjs。全程不連網、
// 不寄信、不使用真實設定或憑證；結果寫入 reports/offline-test-results.<平台>.json。
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const KIT = fileURLToPath(new URL('../', import.meta.url));
const run = join(KIT, 'tests', '.tmp', `run-${process.pid}-${Date.now()}`), copy = join(run, 'kit');
mkdirSync(copy, {recursive: true});
for (const item of ['app-template', 'schema', 'tools', '專案指示.txt', '設定.example.json', 'package.json']) cpSync(join(KIT, item), join(copy, item), {recursive: true});
const tests = readdirSync(join(KIT, 'tests')).filter(f => /^t\d\d-.+\.mjs$/.test(f)).sort();
const results = [];
for (const test of tests) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(KIT, 'tests', test)], {env: {...process.env, KIT_COPY: copy, REAL_KIT: KIT}, encoding: 'utf8', timeout: 180000});
  const out = (r.stdout || '').trim(), err = (r.stderr || '').trim();
  const status = r.status === 0 && /^SKIP/m.test(out) ? 'skip' : r.status === 0 && /^PASS/m.test(out) ? 'pass' : 'fail';
  const summary = (out.split('\n').filter(l => /^(PASS|SKIP)/.test(l)).pop() || err.split('\n').slice(0, 12).join('\n') || out.slice(-1500));
  results.push({test, status, ms: Date.now() - started, summary});
  console.log(`${status === 'pass' ? '✓' : status === 'skip' ? '–' : '✗'} ${test}  ${status.toUpperCase()}\n  ${summary.replaceAll('\n', '\n  ')}`);
}
const failed = results.filter(r => r.status === 'fail').length;
mkdirSync(join(KIT, 'reports'), {recursive: true});
writeFileSync(join(KIT, 'reports', `offline-test-results.${process.platform}.json`), JSON.stringify({
  ran_at: new Date().toISOString(), node: process.version, platform: process.platform, network: 'blocked (offline stubs)', real_email_sent: false,
  passed: results.filter(r => r.status === 'pass').length, skipped: results.filter(r => r.status === 'skip').length, failed, results,
}, null, 2) + '\n');
if (!process.argv.includes('--keep')) rmSync(run, {recursive: true, force: true});
console.log(`\n${failed ? '✗' : '✓'} ${results.length} 個測試檔：${results.length - failed} 通過或略過、${failed} 失敗。`);
process.exit(failed ? 1 : 0);
