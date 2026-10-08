// All locations derive from this kit folder; nothing is written outside it.
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const KIT = fileURLToPath(new URL('../../', import.meta.url));
export const TEMPLATE = join(KIT, 'app-template');
export const SCHEMA = join(KIT, 'schema');
export const WORK = join(KIT, 'work');
export const APP = join(WORK, 'app');
export const PRIVATE = join(WORK, 'private');
export const STATE = join(WORK, 'prepare-state.json');
export const SECRETS = join(KIT, '.secrets');
export const DEFAULT_CONFIG = join(KIT, '設定.json');
export const WRANGLER_CONFIG = join(APP, 'wrangler.jsonc');
export const SCHEMA_FILES = ['schema.sql', 'mail-deliveries.sql', 'production.sql'];

// Minimal flag parser: rejects anything not explicitly allowed.
export function parseArgs(argv, {flags = [], options = [], positionals = 0} = {}) {
  const result = {flags: new Set(), options: {}, positionals: []};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flags.includes(arg)) result.flags.add(arg);
    else if (options.includes(arg)) {
      if (i + 1 >= argv.length) throw new Error(`${arg} 後面需要一個值`);
      result.options[arg] = argv[++i];
    } else if (!arg.startsWith('--') && result.positionals.length < positionals) result.positionals.push(arg);
    else throw new Error(`不認得的參數：${arg}`);
  }
  return result;
}

export function fail(message, code = 1) {
  console.error('✗ ' + message);
  process.exit(code);
}
