CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','unknown','completed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  completed_at TEXT,
  CHECK((status = 'completed') = (completed_at IS NOT NULL))
);
