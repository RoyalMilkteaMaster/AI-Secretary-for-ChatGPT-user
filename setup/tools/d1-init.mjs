// 在「自己的」D1 建立空白表格：依序匯入 schema.sql、mail-deliveries.sql、
// production.sql。只允許 CREATE TABLE IF NOT EXISTS，不含任何資料列（無 seed）。
//   node tools/d1-init.mjs --check   只檢查檔案與設定（不連網）
//   node tools/d1-init.mjs           對遠端 D1 執行（重跑安全：已存在的表格不變）
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DEFAULT_CONFIG, WRANGLER_CONFIG, SCHEMA, SCHEMA_FILES, parseArgs, fail} from './lib/paths.mjs';
import {loadPrepared} from './lib/prepared.mjs';
import {schemaOnly} from './lib/schema-check.mjs';
import {runWrangler} from './lib/wrangler.mjs';

let args, prepared;
try {
  args = parseArgs(process.argv.slice(2), {flags: ['--check'], options: ['--config']});
  prepared = loadPrepared(args.options['--config'] || DEFAULT_CONFIG, 'prepare');
} catch (error) { fail(error.message); }
for (const file of SCHEMA_FILES) if (!schemaOnly(readFileSync(join(SCHEMA, file), 'utf8'))) fail(`${file} 含有建立表格以外的語句，已停止`);
console.log(`將在 D1「${prepared.config.d1_database_name}」（${prepared.config.d1_database_id}）建立空白表格：${SCHEMA_FILES.join(' → ')}`);
if (args.flags.has('--check')) { console.log('✓ 檢查通過（只含 CREATE TABLE IF NOT EXISTS；未連網）'); process.exit(0); }
for (const file of SCHEMA_FILES) {
  let status;
  try { status = runWrangler(['d1', 'execute', prepared.config.d1_database_name, '--remote', '--config', WRANGLER_CONFIG, '--file', join(SCHEMA, file)]); }
  catch (error) { fail(error.message); }
  if (status !== 0) fail(`${file} 匯入失敗；後面的檔案未執行`);
  console.log(`✓ ${file}`);
}
console.log('✓ 空白表格已建立。沒有匯入任何待辦或示範資料。');
