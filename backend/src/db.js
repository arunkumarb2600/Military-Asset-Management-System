/**
 * Database layer.
 * - Opens (and creates) the SQLite file
 * - Applies database/schema.sql
 * - Exposes the shared `db` handle plus the ledger helpers that keep
 *   `stock_ledger.balance_after` correct.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const ROOT = path.join(__dirname, '..');                 // .../backend
const DB_FILE = process.env.DB_FILE || 'database/military_assets.db';
const DB_PATH = path.isAbsolute(DB_FILE)
  ? DB_FILE
  : path.join(ROOT, DB_FILE);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // concurrent reads while writing
db.pragma('foreign_keys = ON');     // enforce referential integrity

// Create tables if they do not exist yet (idempotent bootstrap).
db.exec(fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8'));

/* ------------------------------------------------------------------ *
 * LEDGER HELPERS
 * ------------------------------------------------------------------ */

/** Current closing balance of a base+equipment pair. */
function currentBalance(baseId, equipmentTypeId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(qty * direction), 0) AS bal
         FROM stock_ledger
        WHERE base_id = ? AND equipment_type_id = ?`
    )
    .get(baseId, equipmentTypeId);
  return row.bal;
}

/**
 * Append one movement to the ledger and stamp the resulting balance.
 * MUST be called inside the same transaction as the business row insert
 * so a document and its ledger line can never drift apart.
 */
function postLedger({
  baseId,
  equipmentTypeId,
  txType,
  qty,
  direction,
  refTable,
  refId,
  refNo,
  txnDate,
  remarks = null,
  createdBy = null
}) {
  const running = currentBalance(baseId, equipmentTypeId) + qty * direction;
  const info = db
    .prepare(
      `INSERT INTO stock_ledger
        (base_id, equipment_type_id, tx_type, qty, direction,
         ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      baseId, equipmentTypeId, txType, qty, direction,
      refTable, refId ?? null, refNo ?? null, txnDate, running, remarks, createdBy
    );
  return { ledgerId: info.lastInsertRowid, balanceAfter: running };
}

module.exports = { db, DB_PATH, currentBalance, postLedger };
