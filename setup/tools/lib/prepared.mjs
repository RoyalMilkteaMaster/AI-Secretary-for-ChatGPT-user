// Gate used by every tool that talks to Cloudflare or the deployed service:
// the settings must be complete and valid, prepare.mjs must have been run on
// exactly these settings, and work/app must be an unmodified generated copy.
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {APP, STATE, TEMPLATE, WRANGLER_CONFIG, DEFAULT_CONFIG} from './paths.mjs';
import {loadValidated, fingerprint} from './config.mjs';

export const DAILY_CRON = '0 1 * * *';

export function ownerSettings(config, policyDate) {
  return {configured: true, sender: config.sender, recipient: config.recipient, calendar: config.calendar, origin: config.origin, policy_date: policyDate};
}

export function wranglerSettings(config, daily) {
  return {
    name: config.worker_name,
    main: 'worker.mjs',
    account_id: config.account_id,
    compatibility_date: '2026-10-06',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: false,
    observability: {enabled: false},
    vars: {AMP_SENDER: config.sender, DAILY_ENABLED: daily ? 'true' : 'false'},
    triggers: {crons: daily ? [DAILY_CRON] : []},
    d1_databases: [{binding: 'DB', database_name: config.d1_database_name, database_id: config.d1_database_id}],
  };
}

export const parseJsonc = text => JSON.parse(text.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n'));
export const parseOwner = text => JSON.parse(text.slice(text.indexOf('Object.freeze(') + 14, text.lastIndexOf(');')));

export function loadPrepared(configPath = DEFAULT_CONFIG, stage = 'prepare') {
  const config = loadValidated(configPath, stage);
  if (!existsSync(STATE) || !existsSync(WRANGLER_CONFIG)) throw new Error('尚未產生工作副本：請先執行 node tools/prepare.mjs');
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  if (state.config_fingerprint !== fingerprint(config)) throw new Error('設定.json 在上次 prepare 之後被修改過：請重新執行 node tools/prepare.mjs');
  const daily = state.daily_enabled === true;
  const expectedWrangler = JSON.stringify(wranglerSettings(config, daily));
  if (JSON.stringify(parseJsonc(readFileSync(WRANGLER_CONFIG, 'utf8'))) !== expectedWrangler)
    throw new Error('work/app/wrangler.jsonc 與設定不符（可能被手動修改）：請重新執行 node tools/prepare.mjs');
  const owner = parseOwner(readFileSync(join(APP, 'owner-config.mjs'), 'utf8'));
  if (JSON.stringify(owner) !== JSON.stringify(ownerSettings(config, state.policy_date)))
    throw new Error('work/app/owner-config.mjs 與設定不符：請重新執行 node tools/prepare.mjs');
  for (const file of readdirSync(TEMPLATE)) {
    if (file === 'owner-config.mjs') continue;
    const copy = join(APP, file);
    if (!existsSync(copy) || readFileSync(copy, 'utf8') !== readFileSync(join(TEMPLATE, file), 'utf8'))
      throw new Error(`work/app/${file} 與教材範本不同（不要手動修改工作副本）：請重新執行 node tools/prepare.mjs`);
  }
  if (daily && !config.origin) throw new Error('每日寄信開啟時必須有 origin');
  return {config, state, daily};
}
