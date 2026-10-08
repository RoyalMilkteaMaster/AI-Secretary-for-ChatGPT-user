// In-memory SQLite with the D1 calls the Worker uses (prepare/bind/first/all/run/batch).
import {DatabaseSync} from 'node:sqlite';

export function localD1(schemaTexts) {
  const sqlite = new DatabaseSync(':memory:');
  for (const text of schemaTexts) sqlite.exec(text);
  const wrap = (query, args = []) => ({
    bind: (...a) => wrap(query, a),
    async first() { return sqlite.prepare(query).get(...args) || null; },
    async all() { return {results: sqlite.prepare(query).all(...args)}; },
    async run() { return {meta: sqlite.prepare(query).run(...args)}; },
    _query: query, _args: args,
  });
  const DB = {
    prepare: wrap,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => ({results: sqlite.prepare(s._query).all(...s._args)})); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return {sqlite, DB};
}
