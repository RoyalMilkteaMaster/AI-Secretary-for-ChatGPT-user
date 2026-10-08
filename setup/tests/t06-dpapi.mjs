// Windows DPAPI 加密儲存（只在 Windows 執行；其他平台略過）。使用測試副本內的
// 暫存資料夾與虛構值，不碰真正的 .secrets。
import assert from 'node:assert/strict';
import {readFileSync, existsSync, rmSync} from 'node:fs';
import {kitPath, kitImport} from './helpers.mjs';

if (process.platform !== 'win32') {
  console.log('SKIP t06: DPAPI 只能在 Windows 驗證（請用 Windows 的 node 執行 node tests\\run-all.mjs）');
  process.exit(0);
}
const {createStore} = await kitImport('tools', 'lib', 'secret-store.mjs');
const dir = kitPath('.secrets-dpapi-test');
rmSync(dir, {recursive: true, force: true});
const store = createStore(dir);
const value = 'FICTIONAL-not-a-credential-中文-ÄÖ-' + Date.now();
assert.equal(store.has('unit-test'), false);
assert.throws(() => store.readText('unit-test'), /尚未建立/);
store.writeText('unit-test', value);
const file = kitPath('.secrets-dpapi-test', 'unit-test.dpapi');
assert.ok(existsSync(file));
const {windowsPowerShell} = await kitImport('tools', 'lib', 'powershell.mjs');
const acl = windowsPowerShell("$a=Get-Acl -LiteralPath $env:D; [Console]::Out.Write(\"$($a.AreAccessRulesProtected)|\" + (($a.Access | ForEach-Object { $_.IdentityReference.Value }) -join ';'))", {env: {D: dir}});
assert.equal(acl.status, 0, acl.stderr);
const [protectedAcl, identities] = acl.stdout.split('|');
assert.equal(protectedAcl, 'True', 'inherited permissions removed');
assert.ok(!/Everyone|\\Users$|Authenticated Users/i.test(identities), 'no broad groups: ' + identities);
const raw = readFileSync(file, 'utf8');
assert.ok(!raw.includes(value) && !raw.includes(Buffer.from(value).toString('base64')), 'file must not contain plaintext');
assert.match(raw.trim(), /^[0-9a-f]+$/i, 'ConvertFrom-SecureString output');
assert.equal(store.readText('unit-test'), value, 'round trip incl. non-ASCII');
assert.throws(() => store.writeText('unit-test', 'other'), /已存在/, 'no silent overwrite');
assert.equal(store.readText('unit-test'), value);
store.writeText('unit-test', 'replaced-value', {replace: true});
assert.equal(store.readText('unit-test'), 'replaced-value');
store.write('unit-json', {refresh_token: 'fictional', account: 'demo-sender@mail.test'});
assert.deepEqual(store.read('unit-json'), {refresh_token: 'fictional', account: 'demo-sender@mail.test'});
assert.throws(() => store.has('../escape'), /Invalid secret name/);
assert.throws(() => store.writeText('unit-empty', ''), /empty/);
rmSync(dir, {recursive: true, force: true});
console.log('PASS t06: Windows DPAPI 寫入／讀回（含中文）、檔案無明文與 base64、既有項目不被覆蓋（需 replace）、名稱防路徑跳脫、拒存空值。');
