// Shared helpers. Tests run against a throwaway copy of the kit under
// tests/.tmp (created by run-all.mjs), never against real settings or secrets.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const KIT_COPY = process.env.KIT_COPY;
export const REAL_KIT = process.env.REAL_KIT;
if (!KIT_COPY || !REAL_KIT) throw new Error('Run tests through: node tests/run-all.mjs');

// Entirely fictional values (reserved .test domain, zero/sequence IDs).
export const FIXTURE = Object.freeze({
  sender: 'demo-sender@mail.test', recipient: 'demo-owner@mail.test', calendar: 'demo-owner@mail.test',
  timezone: 'Asia/Taipei', account_id: '0123456789abcdef0123456789abcdef',
  d1_database_name: 'ai-secretary-progress', d1_database_id: '00000000-0000-4000-8000-000000000000',
  worker_name: 'ai-secretary-progress', origin: 'https://ai-secretary-progress.demo-sub.workers.dev',
  google_project_id: 'demo-project-123456',
});

export const kitPath = (...parts) => join(KIT_COPY, ...parts);
export const kitImport = (...parts) => import(pathToFileURL(kitPath(...parts)).href);
export const writeConfig = values => writeFileSync(kitPath('設定.json'), JSON.stringify(values, null, 2));

export function runTool(script, args = []) {
  const result = spawnSync(process.execPath, [kitPath('tools', script), ...args], {cwd: KIT_COPY, encoding: 'utf8', timeout: 60000});
  return {status: result.status, out: (result.stdout || '') + (result.stderr || '')};
}
