// Runs the Wrangler version pinned in package.json from this kit's node_modules.
// No shell is involved; secret values are only ever passed through stdin.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {KIT} from './paths.mjs';

export function wranglerBin() {
  const bin = join(KIT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(bin)) throw new Error('尚未安裝 Wrangler：請先在教材資料夾執行 npm install');
  return bin;
}

export function runWrangler(args, {input} = {}) {
  const result = spawnSync(process.execPath, [wranglerBin(), ...args], {
    cwd: KIT, input, windowsHide: true,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  return result.status ?? 1;
}

// Secret pipe: value goes to stdin of `wrangler secret put NAME`, never argv.
export function putSecret(name, value, configPath, runner = runWrangler) {
  if (!/^[A-Z][A-Z0-9_]{1,60}$/.test(name)) throw new Error('Invalid secret name');
  if (typeof value !== 'string' || !value) throw new Error(`${name} 沒有值，未安裝`);
  return runner(['secret', 'put', name, '--config', configPath], {input: value});
}
