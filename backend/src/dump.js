/**
 * Produces a plain-SQL dump of the database:
 *   deliverables/database/dump.sql   (schema + data, ready for psql/sqlite3)
 * Usage: npm run dump
 */
const fs = require('fs');
const path = require('path');
const { db, DB_PATH } = require('./db');

const OUT_DIR = path.join(__dirname, '..', '..', 'deliverables', 'database');
const OUT_FILE = path.join(OUT_DIR, 'dump.sql');

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const lines = [];
lines.push('-- ============================================================');
lines.push('--  MILITARY ASSET MANAGEMENT SYSTEM - database dump');
lines.push(`--  Generated : ${new Date().toISOString()}`);
lines.push(`--  Source    : ${DB_PATH}`);
lines.push('--  Restore   : sqlite3 military_assets.db < dump.sql');
lines.push('--             (or: cp backend/database/military_assets.db)');
lines.push('-- ==============================================================');
lines.push('PRAGMA foreign_keys = OFF;');
lines.push('BEGIN TRANSACTION;');
lines.push('');

const tables = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();

for (const t of tables) {
  lines.push(`-- ---------- table: ${t.name} ----------`);
  lines.push(`DROP TABLE IF EXISTS ${t.name};`);
  lines.push(t.sql + ';');
  lines.push('');
}

for (const t of tables) {
  const rows = db.prepare(`SELECT * FROM ${t.name}`).all();
  lines.push(`-- ---------- data: ${t.name} (${rows.length} row(s)) ----------`);
  if (rows.length === 0) { lines.push(''); continue; }
  const cols = Object.keys(rows[0]);
  for (const row of rows) {
    const values = cols.map((c) => q(row[c])).join(', ');
    lines.push(`INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${values});`);
  }
  lines.push('');
}

lines.push('COMMIT;');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');

const counts = tables.map((t) => `${t.name}=${db.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n}`).join('  ');
console.log(`Dump written -> ${OUT_FILE}`);
console.log(`Rows: ${counts}`);
