// Schema files may only create empty tables; no seed rows or destructive SQL.
export function schemaOnly(text) {
  const statements = text.split(';').map(s => s.replace(/--.*$/gm, '').trim()).filter(Boolean);
  return statements.length > 0 && statements.every(s => /^CREATE TABLE IF NOT EXISTS\s/i.test(s) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\b/i.test(s));
}
