CREATE TABLE IF NOT EXISTS mail_deliveries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('attempting','accepted','uncertain_or_failed','skipped_empty')),
  created_at TEXT NOT NULL,
  accepted_at TEXT
);
