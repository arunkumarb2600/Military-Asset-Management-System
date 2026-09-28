-- =====================================================================
--  MILITARY ASSET MANAGEMENT SYSTEM (MAMS)
--  Database : SQLite 3 (relational, ACID, FK-enforced)
--  File     : backend/data/military_assets.db
--  Engine   : better-sqlite3 (synchronous driver, WAL journal mode)
-- =====================================================================
--  Design note
--  -----------
--  Every single change to stock (opening, purchase, transfer in/out,
--  assignment, direct write-off) is written to ONE append-only table called
--  `stock_ledger`.  `purchases`, `transfers`, `assignments` and
--  `expenditures` are the *business documents* (who/why/invoice no).
--  `stock_ledger` is the *accounting truth* (what actually happened to the
--  quantity, and the running balance).  Balances are therefore never
--  stored, they are always derived from the ledger, which guarantees:
--
--      Opening + Purchases + Transfer In - Transfer Out
--            - Assigned - Direct Write-offs = Closing        (CLOSE)
--      Net Movement = Purchases + Transfer In - Transfer Out
--
--  NOTE on expenditure: when an expenditure is recorded against an
--  ASSIGNMENT the stock has already left the base (the ASSIGNMENT line
--  removed it), so no second ledger line is written - only the assignments
--  / expenditures documents change.  An expenditure NOT linked to an
--  assignment is a direct write-off of base-held stock and DOES post a
--  negative EXPENDITURE line.  This is what stops stock being counted twice.
--  `balance_after` gives a running balance for a transparent audit trail.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. BASES  (military installations that hold stock)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,          -- e.g. "B-01"
  name        TEXT    NOT NULL,                 -- e.g. "Fort Kabul"
  location    TEXT,
  commander   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- 2. EQUIPMENT TYPES  (catalogue of trackable assets)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,         -- e.g. "WPN-RIFLE"
  name         TEXT    NOT NULL,                -- e.g. "5.56mm Rifle"
  category     TEXT    NOT NULL,                -- Weapon | Vehicle | Ammunition | Equipment
  unit         TEXT    NOT NULL DEFAULT 'unit',-- unit of measure: unit / round / kg
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- 3. USERS  (identity + role + base scoping)
--    role: admin | commander | logistics
--      admin       -> full access, all bases
--      commander   -> read/write, locked to `base_id`
--      logistics   -> purchases + transfers only
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,               -- bcrypt hash, never stored plain
  role          TEXT    NOT NULL CHECK (role IN ('admin','commander','logistics')),
  base_id       INTEGER REFERENCES bases(id) ON DELETE SET NULL, -- NULL only for admin
  rank          TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---------------------------------------------------------------------
-- 4. OPENING BALANCES
--    Physical stock verified on day one.  Kept as its own table so the
--    opening figure is auditable and signed off, not just a ledger line.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opening_balances (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id           INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE CASCADE,
  as_of_date        TEXT    NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity >= 0),
  remarks           TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (base_id, equipment_type_id, as_of_date)
);

-- ---------------------------------------------------------------------
-- 5. PURCHASES  (Procurement received INTO a base)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no      TEXT    NOT NULL UNIQUE,     -- e.g. "PUR-0001"
  base_id           INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost         REAL    NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier          TEXT,
  invoice_no        TEXT,
  purchase_date     TEXT    NOT NULL,            -- YYYY-MM-DD (business date)
  remarks           TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchases_base_date ON purchases(base_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_equip    ON purchases(equipment_type_id);

-- ---------------------------------------------------------------------
-- 6. TRANSFERS  (movement between bases)
--    Two-legged document: DISPATCHED legs out of `from_base_id`,
--    RECEIVED legs into `to_base_id`.  Quantity leaves on dispatch and
--    arrives on receipt, so in-transit stock is never double counted.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transfers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no      TEXT    NOT NULL UNIQUE,     -- e.g. "TRF-0001"
  from_base_id      INTEGER NOT NULL REFERENCES bases(id) ON DELETE RESTRICT,
  to_base_id        INTEGER NOT NULL REFERENCES bases(id) ON DELETE RESTRICT,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  status            TEXT    NOT NULL CHECK (status IN ('dispatched','received','cancelled')),
  transfer_date     TEXT    NOT NULL,            -- date dispatched
  received_date     TEXT,
  remarks           TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_base_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_to   ON transfers(to_base_id, transfer_date);

-- ---------------------------------------------------------------------
-- 7. ASSIGNMENTS  (assets issued from a base to a person)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no      TEXT    NOT NULL UNIQUE,     -- e.g. "ASN-0001"
  base_id           INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  personnel_name    TEXT    NOT NULL,
  personnel_id      TEXT,                        -- service number
  personnel_rank    TEXT,
  assigned_date     TEXT    NOT NULL,
  due_date          TEXT,
  status            TEXT    NOT NULL CHECK (status IN ('active','returned','expended')),
  remarks           TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_base ON assignments(base_id, assigned_date);

-- ---------------------------------------------------------------------
-- 8. EXPENDITURES  (assets consumed / written off against an assignment)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenditures (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no      TEXT    NOT NULL UNIQUE,     -- e.g. "EXP-0001"
  base_id           INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  assignment_id     INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  personnel_name    TEXT,
  expended_date     TEXT    NOT NULL,
  reason            TEXT    NOT NULL,            -- Fired in training / Damage / Loss
  remarks           TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenditures_base ON expenditures(base_id, expended_date);

-- ---------------------------------------------------------------------
-- 9. STOCK LEDGER  (append-only movement truth - powers the Dashboard)
--    tx_type: OPENING | PURCHASE | TRANSFER_IN | TRANSFER_OUT
--             | ASSIGNMENT | EXPENDITURE | ADJUSTMENT
--    qty is always POSITIVE; `direction` carries the sign (+1 / -1).
--    EXPENDITURE lines exist only for direct write-offs of base-held stock
--    (see header note).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_ledger (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id           INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  equipment_type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  tx_type           TEXT    NOT NULL,
  qty               INTEGER NOT NULL CHECK (qty > 0),
  direction         INTEGER NOT NULL CHECK (direction IN (1,-1)),
  ref_table         TEXT,                        -- purchases|transfers|assignments|expenditures|opening_balances
  ref_id            INTEGER,
  ref_no            TEXT,
  txn_date          TEXT    NOT NULL,            -- YYYY-MM-DD
  balance_after     INTEGER NOT NULL,            -- running closing balance of this base+equipment
  remarks           TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_base_equip_date ON stock_ledger(base_id, equipment_type_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_ledger_base_date        ON stock_ledger(base_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_ledger_type_date        ON stock_ledger(txn_date);
CREATE INDEX IF NOT EXISTS idx_ledger_xtype            ON stock_ledger(tx_type);

-- ---------------------------------------------------------------------
-- 10. API / TRANSACTION AUDIT LOG
--      Every mutating call and every authentication event is recorded
--      here for accountability ("who did what, when, from where").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username      TEXT,
  role          TEXT,
  action        TEXT    NOT NULL,                -- LOGIN | CREATE | UPDATE | DELETE | ...
  entity        TEXT    NOT NULL,                -- purchase | transfer | user | ...
  entity_id     INTEGER,
  method        TEXT,
  endpoint      TEXT,
  status_code   INTEGER,
  details       TEXT,                            -- JSON payload (sanitised)
  ip_address    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity, entity_id);
