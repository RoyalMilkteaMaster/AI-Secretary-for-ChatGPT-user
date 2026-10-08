// Loads and validates 設定.json. Every value must be the viewer's own; empty
// strings mean "not filled yet". Unknown keys are rejected to catch typos.
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const FIELDS = {
  sender: '專用寄件 Gmail（寄出每日總覽）',
  recipient: '收件主帳號（收信、個人日曆、日曆授權帳號）',
  calendar: '要管理的個人日曆 ID（通常與收件主帳號相同）',
  timezone: '時區，本版只支援 Asia/Taipei',
  account_id: 'Cloudflare 帳戶 ID（32 位英數）',
  d1_database_name: 'D1 資料庫名稱',
  d1_database_id: 'D1 資料庫 ID（UUID）',
  worker_name: 'Worker 名稱',
  origin: '服務網址，例如 https://<worker_name>.<你的子網域>.workers.dev（首次部署後填）',
  google_project_id: 'Google Cloud 專案 ID',
};

const STAGES = {
  instructions: ['sender', 'recipient', 'calendar', 'timezone'],
  prepare: ['sender', 'recipient', 'calendar', 'timezone', 'account_id', 'd1_database_name', 'd1_database_id', 'worker_name'],
};
STAGES.google = [...STAGES.prepare, 'google_project_id'];
STAGES.ready = [...STAGES.google, 'origin'];

const email = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const placeholder = /[<>＜＞【】]|你的|請填|填入|@example\.(?:com|org|net)$|example\.com|xxxx|replace_me/i;
const checks = {
  sender: v => email.test(v) || '不是有效的電子郵件地址',
  recipient: v => email.test(v) || '不是有效的電子郵件地址',
  calendar: v => email.test(v) || '日曆 ID 格式應像電子郵件地址（例如主帳號地址，或 …@group.calendar.google.com）',
  timezone: v => v === 'Asia/Taipei' || '本版只支援 Asia/Taipei（排程 0 1 * * * ＝台灣 09:00）',
  account_id: v => /^[0-9a-f]{32}$/.test(v) || '應為 32 位小寫英數（Cloudflare 帳戶 ID）',
  d1_database_name: v => /^[a-z0-9][a-z0-9_-]{0,62}$/.test(v) || '只能用小寫英數、-、_',
  d1_database_id: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) || '應為 UUID（wrangler d1 create 顯示的 database_id）',
  worker_name: v => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v) || '只能用小寫英數與 -',
  google_project_id: v => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v) || '應為 Google Cloud 專案 ID（不是專案名稱或專案編號）',
  origin: (v, c) => {
    let url;
    try { url = new URL(v); } catch { return '不是有效網址'; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || v !== url.origin)
      return '只填 https://主機名稱，不要加路徑、斜線結尾、埠號或參數';
    if (url.hostname.endsWith('.workers.dev')) {
      const labels = url.hostname.split('.');
      if (labels.length !== 4 || labels[0] !== c.worker_name)
        return `workers.dev 網址應為 https://${c.worker_name || '<worker_name>'}.<你的子網域>.workers.dev，與 worker_name 一致`;
    }
    return true;
  },
};

export function readConfigFile(path) {
  if (!existsSync(path)) throw new Error(`找不到設定檔：${path}\n請先把「設定.example.json」複製成「設定.json」再填寫。`);
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')); }
  catch { throw new Error('設定.json 不是有效的 JSON（常見原因：少了逗號或引號）'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('設定.json 內容必須是一個 JSON 物件');
  return raw;
}

// Returns {config, errors, missing}. Optional fields are validated only when filled.
export function validateConfig(raw, stage = 'prepare') {
  if (!STAGES[stage]) throw new Error('Unknown validation stage');
  const required = STAGES[stage];
  const errors = [], missing = [], config = {};
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) continue;
    if (!Object.hasOwn(FIELDS, key)) errors.push(`不認得的欄位「${key}」（拼字錯誤？）`);
  }
  for (const key of Object.keys(FIELDS)) {
    const value = raw[key] ?? '';
    if (typeof value !== 'string') { errors.push(`${key}：必須是文字`); continue; }
    const normalized = ['sender', 'recipient', 'calendar'].includes(key) ? value.trim().toLowerCase() : value.trim();
    config[key] = normalized;
    if (!normalized) { if (required.includes(key)) missing.push(key); continue; }
    if (placeholder.test(normalized) && key !== 'timezone') { errors.push(`${key}：仍是範例或說明文字，請換成你自己的值`); continue; }
    const ok = checks[key](normalized, config); // FIELDS order puts worker_name before origin
    if (ok !== true) errors.push(`${key}：${ok}`);
  }
  if (config.sender && config.recipient && config.sender === config.recipient)
    errors.push('sender 與 recipient 不可相同：寄件請用專用 Gmail，收件用主帳號');
  for (const key of missing) errors.push(`${key}：尚未填寫（${FIELDS[key]}）`);
  return {config, errors, missing};
}

// Fingerprint of everything that defines "whose service this is". Changing any
// of these after acceptance resets the daily switch until accepted again.
export function fingerprint(config) {
  const core = ['sender', 'recipient', 'calendar', 'timezone', 'account_id', 'd1_database_name', 'd1_database_id', 'worker_name', 'origin', 'google_project_id'];
  return createHash('sha256').update(JSON.stringify(core.map(k => [k, config[k] || '']))).digest('hex');
}

export function loadValidated(path, stage) {
  const {config, errors} = validateConfig(readConfigFile(path), stage);
  if (errors.length) throw new Error('設定.json 尚未完成：\n  - ' + errors.join('\n  - '));
  return config;
}
