// Runs built-in Windows PowerShell 5.1. PSModulePath is dropped so a value
// inherited from PowerShell 7 (e.g. Windows Terminal's default) cannot make 5.1
// load incompatible modules ("CouldNotAutoloadMatchingModule").
import {spawnSync} from 'node:child_process';

export function windowsPowerShell(command, {input, env = {}} = {}) {
  if (process.platform !== 'win32') throw new Error('這個步驟只能在 Windows 執行');
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    input, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024, env: {...base, ...env},
  });
}
