// Windows DPAPI storage for the current Windows user (adapted from the original
// gmail/secrets.mjs). Plaintext only crosses an anonymous child-process pipe as
// base64; files contain ConvertFrom-SecureString output, never plaintext.
// Existing secrets are never overwritten unless {replace:true} is passed.
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {SECRETS} from './paths.mjs';
import {windowsPowerShell} from './powershell.mjs';

const NAMES = /^[a-z0-9-]{1,40}$/;

export function createStore(directory = SECRETS) {
  function pwsh(name, command, input) {
    if (process.platform !== 'win32') throw new Error('Windows 加密儲存（DPAPI）只能在 Windows 執行');
    if (!NAMES.test(name)) throw new Error('Invalid secret name');
    const result = windowsPowerShell(command, {input, env: {SECRETARY_SECRET_FILE: join(directory, `${name}.dpapi`), SECRETARY_SECRET_DIR: directory}});
    if (result.status !== 0) throw new Error('Windows 加密儲存失敗（未顯示任何秘密內容）');
    return result.stdout.trim();
  }
  function ensureDirectory() {
    if (existsSync(directory)) return;
    mkdirSync(directory, {recursive: true});
    // Restrict the folder to the current user and SYSTEM. DPAPI already binds the
    // files to this Windows user; the ACL is defence in depth.
    try {
      pwsh('acl', "$ErrorActionPreference='Stop'; $u=[Security.Principal.WindowsIdentity]::GetCurrent().Name; icacls $env:SECRETARY_SECRET_DIR /inheritance:r /grant:r \"${u}:(OI)(CI)F\" '*S-1-5-18:(OI)(CI)F' | Out-Null");
    } catch { console.warn('! 無法限制 .secrets 資料夾權限；檔案仍受 Windows 使用者加密保護。'); }
  }
  const has = name => { if (!NAMES.test(name)) throw new Error('Invalid secret name'); return existsSync(join(directory, `${name}.dpapi`)); };
  function readText(name) {
    if (!has(name)) throw new Error(`尚未建立加密項目「${name}」`);
    const encoded = pwsh(name, "$ErrorActionPreference='Stop'; $s=(Get-Content -LiteralPath $env:SECRETARY_SECRET_FILE -Raw).Trim() | ConvertTo-SecureString; [Console]::Out.Write([Net.NetworkCredential]::new('', $s).Password)");
    return Buffer.from(encoded, 'base64').toString('utf8');
  }
  function writeText(name, value, {replace = false} = {}) {
    if (typeof value !== 'string' || !value) throw new Error('Refusing to store an empty secret');
    if (has(name) && !replace) throw new Error(`加密項目「${name}」已存在；為避免覆蓋既有授權，未做任何變更`);
    ensureDirectory();
    pwsh(name, "$ErrorActionPreference='Stop'; $s=[Console]::In.ReadToEnd().Trim() | ConvertTo-SecureString -AsPlainText -Force; $s | ConvertFrom-SecureString | Set-Content -LiteralPath $env:SECRETARY_SECRET_FILE -Encoding ascii", Buffer.from(value, 'utf8').toString('base64'));
  }
  return {
    directory, has, readText, writeText,
    read: name => JSON.parse(readText(name)),
    write: (name, value, options) => writeText(name, JSON.stringify(value), options),
  };
}
