CREATE TABLE IF NOT EXISTS step_details (
  step_id TEXT PRIMARY KEY REFERENCES steps(id),
  activity TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  due_at TEXT,
  not_before TEXT,
  source_chat TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','test')),
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secretary_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS digest_runs (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, accepted_at TEXT, included_ids TEXT NOT NULL DEFAULT '[]',
  calendar_checked_at TEXT, error_code TEXT
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  hash TEXT PRIMARY KEY, family TEXT NOT NULL, type TEXT NOT NULL,
  client_id TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_approvals (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
