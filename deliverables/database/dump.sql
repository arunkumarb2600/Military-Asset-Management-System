-- ============================================================
--  MILITARY ASSET MANAGEMENT SYSTEM - database dump
--  Generated : 2026-09-28T14:32:50.811Z
--  Source    : C:\Users\ADMIN\OneDrive\Desktop\Military Asset Management System\backend\database\military_assets.db
--  Restore   : sqlite3 military_assets.db < dump.sql
--             (or: cp backend/database/military_assets.db)
-- ==============================================================
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- ---------- table: assignments ----------
DROP TABLE IF EXISTS assignments;
CREATE TABLE assignments (
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

-- ---------- table: audit_logs ----------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
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

-- ---------- table: bases ----------
DROP TABLE IF EXISTS bases;
CREATE TABLE bases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,          -- e.g. "B-01"
  name        TEXT    NOT NULL,                 -- e.g. "Fort Kabul"
  location    TEXT,
  commander   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- table: equipment_types ----------
DROP TABLE IF EXISTS equipment_types;
CREATE TABLE equipment_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,         -- e.g. "WPN-RIFLE"
  name         TEXT    NOT NULL,                -- e.g. "5.56mm Rifle"
  category     TEXT    NOT NULL,                -- Weapon | Vehicle | Ammunition | Equipment
  unit         TEXT    NOT NULL DEFAULT 'unit',-- unit of measure: unit / round / kg
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- table: expenditures ----------
DROP TABLE IF EXISTS expenditures;
CREATE TABLE expenditures (
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

-- ---------- table: opening_balances ----------
DROP TABLE IF EXISTS opening_balances;
CREATE TABLE opening_balances (
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

-- ---------- table: purchases ----------
DROP TABLE IF EXISTS purchases;
CREATE TABLE purchases (
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

-- ---------- table: stock_ledger ----------
DROP TABLE IF EXISTS stock_ledger;
CREATE TABLE stock_ledger (
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

-- ---------- table: transfers ----------
DROP TABLE IF EXISTS transfers;
CREATE TABLE transfers (
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

-- ---------- table: users ----------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
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

-- ---------- data: assignments (10 row(s)) ----------
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (1, 'ASN-0001', 1, 1, 12, 'Sgt. Imran Shah', 'AF-10293', 'Sergeant', '2026-08-25', '2026-10-18', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (2, 'ASN-0002', 1, 5, 2, 'Lt. Farhan Wali', 'AF-10450', 'Lieutenant', '2026-08-29', '2026-10-13', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (3, 'ASN-0003', 1, 8, 3000, 'Cpl. Nadim Rahimi', 'AF-10871', 'Corporal', '2026-08-31', '2026-10-04', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (4, 'ASN-0004', 1, 11, 40, 'Sgt. Bilal Noori', 'AF-11002', 'Sergeant', '2026-09-03', '2026-10-16', 'returned', 'Returned after inventory review', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (5, 'ASN-0005', 1, 3, 4, 'Maj. Tahir Sami', 'AF-10077', 'Major', '2026-09-10', '2026-10-06', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (6, 'ASN-0006', 2, 2, 6, 'Sgt. Akmal Jafari', 'AF-11320', 'Sergeant', '2026-08-28', '2026-10-10', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (7, 'ASN-0007', 2, 5, 3, 'Cpl. Yasin Qadir', 'AF-11455', 'Corporal', '2026-09-02', '2026-10-07', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (8, 'ASN-0008', 2, 9, 2500, 'Sgt. Marwan Sabir', 'AF-11580', 'Sergeant', '2026-09-09', '2026-10-02', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (9, 'ASN-0009', 3, 1, 9, 'Sgt. Omid Rahimi', 'AF-11701', 'Sergeant', '2026-09-04', '2026-10-08', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');
INSERT INTO assignments (id, reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id, personnel_rank, assigned_date, due_date, status, remarks, created_by, created_at) VALUES (10, 'ASN-0010', 3, 8, 1500, 'Cpl. Jawid Ansari', 'AF-11834', 'Corporal', '2026-09-13', '2026-10-01', 'active', 'Routine issue', 2, '2026-09-28 14:32:49');

-- ---------- data: audit_logs (7 row(s)) ----------
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (1, 1, 'admin@mams.mil', 'admin', 'USER_CREATED', 'user', 2, 'POST', '/api/admin/users', 201, '"role":"commander"', '10.0.0.5', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (2, 1, 'admin@mams.mil', 'admin', 'USER_CREATED', 'user', 3, 'POST', '/api/admin/users', 201, '"role":"commander"', '10.0.0.5', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (3, 2, 'commander.kabul@mams.mil', 'commander', 'PURCHASE_CREATED', 'purchase', 1, 'POST', '/api/purchases', 201, '"quantity":45000', '10.0.1.20', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (4, 5, 'logistics.kabul@mams.mil', 'logistics', 'TRANSFER_DISPATCHED', 'transfer', 1, 'POST', '/api/transfers', 201, '"quantity":20000', '10.0.1.44', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (5, 3, 'commander.kandahar@mams.mil', 'commander', 'ACCESS_DENIED', 'rbac', NULL, 'POST', '/api/purchases', 403, '"required":["logistics"]', '10.0.2.31', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (6, 4, 'commander.khost@mams.mil', 'commander', 'LOGIN_SUCCESS', 'auth', 3, 'POST', '/api/auth/login', 200, NULL, '10.0.3.9', '2026-09-28 14:32:49');
INSERT INTO audit_logs (id, user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address, created_at) VALUES (7, 6, 'logistics.kandahar@mams.mil', 'logistics', 'ASSIGNMENT_CREATED', 'assignment', 6, 'POST', '/api/assignments', 201, '"quantity":6', '10.0.2.77', '2026-09-28 14:32:49');

-- ---------- data: bases (4 row(s)) ----------
INSERT INTO bases (id, code, name, location, commander, created_at) VALUES (1, 'B-01', 'Fort Kabul', 'Kabul, Afghanistan', 'Brig. Gen. A. Rahimi', '2026-09-28 14:32:49');
INSERT INTO bases (id, code, name, location, commander, created_at) VALUES (2, 'B-02', 'Camp Vance', 'Kandahar, Afghanistan', 'Col. M. Dawoodi', '2026-09-28 14:32:49');
INSERT INTO bases (id, code, name, location, commander, created_at) VALUES (3, 'B-03', 'Fob Khost', 'Khost, Afghanistan', 'Lt. Col. S. Baker', '2026-09-28 14:32:49');
INSERT INTO bases (id, code, name, location, commander, created_at) VALUES (4, 'B-04', 'Naval Support Base', 'Karachi, Pakistan', 'Capt. F. Iqbal', '2026-09-28 14:32:49');

-- ---------- data: equipment_types (12 row(s)) ----------
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (1, 'WPN-RIFLE', '5.56mm Assault Rifle', 'Weapon', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (2, 'WPN-MG', '7.62mm Machine Gun', 'Weapon', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (3, 'WPN-SNIPER', '.308 Sniper Rifle', 'Weapon', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (4, 'WPN-PST', '9mm Pistol', 'Weapon', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (5, 'VEH-HILUX', 'Toyota Hilux 4x4', 'Vehicle', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (6, 'VEH-HMMWV', 'HMMWV Armoured', 'Vehicle', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (7, 'VEH-TRUCK', 'Cargo Truck 5t', 'Vehicle', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (8, 'AMM-556', '5.56x45mm Ammunition', 'Ammunition', 'round', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (9, 'AMM-762', '7.62x51mm Ammunition', 'Ammunition', 'round', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (10, 'AMM-SHELL', '120mm Mortar Shell', 'Ammunition', 'round', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (11, 'EQP-ARMOR', 'Body Armour Vest', 'Equipment', 'unit', '2026-09-28 14:32:49');
INSERT INTO equipment_types (id, code, name, category, unit, created_at) VALUES (12, 'EQP-NV', 'Night Vision Goggles', 'Equipment', 'unit', '2026-09-28 14:32:49');

-- ---------- data: expenditures (15 row(s)) ----------
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (1, 'EXP-0001', 1, 1, 1, 1, 'Sgt. Imran Shah', '2026-09-02', 'Damage / write-off', 'Barrel failure during live-fire', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (2, 'EXP-0002', 1, 1, 1, 1, 'Sgt. Imran Shah', '2026-09-10', 'Lost / missing', 'Inventory discrepancy', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (3, 'EXP-0003', 1, 8, 3, 400, 'Cpl. Nadim Rahimi', '2026-09-04', 'Fired in training', 'Live-fire exercise, sector 4', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (4, 'EXP-0004', 1, 8, 3, 600, 'Cpl. Nadim Rahimi', '2026-09-12', 'Operational use', '', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (5, 'EXP-0005', 1, 11, 4, 12, 'Sgt. Bilal Noori', '2026-09-13', 'Lost / missing', 'Inventory discrepancy', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (6, 'EXP-0006', 1, 5, 2, 1, 'Lt. Farhan Wali', '2026-09-08', 'Damage / write-off', 'Off-road impact during patrol', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (7, 'EXP-0007', 1, 3, 5, 1, 'Maj. Tahir Sami', '2026-09-18', 'Damage / write-off', 'Scope zeroed beyond service life', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (8, 'EXP-0008', 2, 2, 6, 1, 'Sgt. Akmal Jafari', '2026-09-16', 'Damage / write-off', 'Receiver group cracked', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (9, 'EXP-0009', 2, 5, 7, 1, 'Cpl. Yasin Qadir', '2026-09-17', 'Damage / write-off', 'Chassis crack', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (10, 'EXP-0010', 2, 9, 8, 300, 'Sgt. Marwan Sabir', '2026-09-19', 'Fired in training', 'Shooting competition reserve', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (11, 'EXP-0011', 3, 1, 9, 1, 'Sgt. Omid Rahimi', '2026-09-21', 'Damage / write-off', 'Trigger failure', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (12, 'EXP-0012', 3, 8, 10, 250, 'Cpl. Jawid Ansari', '2026-09-23', 'Operational use', '', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (13, 'EXP-0013', 1, 6, NULL, 1, NULL, '2026-09-07', 'Damage / write-off', 'Engine fire during maintenance trial', 2, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (14, 'EXP-0014', 2, 7, NULL, 1, NULL, '2026-09-14', 'Damage / write-off', 'Written off after bridge strike', 3, '2026-09-28 14:32:49');
INSERT INTO expenditures (id, reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by, created_at) VALUES (15, 'EXP-0015', 3, 12, NULL, 3, NULL, '2026-09-20', 'Lost / missing', 'Lost during night patrol', 4, '2026-09-28 14:32:49');

-- ---------- data: opening_balances (39 row(s)) ----------
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (1, 1, 1, '2026-05-31', 340, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (2, 1, 2, '2026-05-31', 48, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (3, 1, 3, '2026-05-31', 22, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (4, 1, 4, '2026-05-31', 90, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (5, 1, 5, '2026-05-31', 64, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (6, 1, 6, '2026-05-31', 26, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (7, 1, 7, '2026-05-31', 18, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (8, 1, 8, '2026-05-31', 180000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (9, 1, 9, '2026-05-31', 64000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (10, 1, 10, '2026-05-31', 3200, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (11, 1, 11, '2026-05-31', 300, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (12, 1, 12, '2026-05-31', 110, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (13, 2, 1, '2026-05-31', 260, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (14, 2, 2, '2026-05-31', 34, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (15, 2, 3, '2026-05-31', 14, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (16, 2, 4, '2026-05-31', 64, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (17, 2, 5, '2026-05-31', 48, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (18, 2, 6, '2026-05-31', 20, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (19, 2, 7, '2026-05-31', 12, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (20, 2, 8, '2026-05-31', 120000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (21, 2, 9, '2026-05-31', 41000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (22, 2, 10, '2026-05-31', 2100, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (23, 2, 11, '2026-05-31', 220, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (24, 2, 12, '2026-05-31', 80, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (25, 3, 1, '2026-05-31', 180, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (26, 3, 2, '2026-05-31', 20, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (27, 3, 3, '2026-05-31', 10, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (28, 3, 4, '2026-05-31', 40, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (29, 3, 5, '2026-05-31', 32, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (30, 3, 6, '2026-05-31', 14, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (31, 3, 7, '2026-05-31', 8, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (32, 3, 8, '2026-05-31', 85000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (33, 3, 9, '2026-05-31', 28000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (34, 3, 10, '2026-05-31', 1500, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (35, 3, 11, '2026-05-31', 150, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (36, 3, 12, '2026-05-31', 60, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (37, 4, 7, '2026-05-31', 22, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (38, 4, 11, '2026-05-31', 90, 'Physical stock take on record', 1, '2026-09-28 14:32:49');
INSERT INTO opening_balances (id, base_id, equipment_type_id, as_of_date, quantity, remarks, created_by, created_at) VALUES (39, 4, 9, '2026-05-31', 15000, 'Physical stock take on record', 1, '2026-09-28 14:32:49');

-- ---------- data: purchases (16 row(s)) ----------
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (1, 'PUR-0001', 1, 8, 45000, 0.42, 'Frontier Arms Co.', 'INV-90211', '2026-06-24', 'Bulk resupply for northern operations', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (2, 'PUR-0002', 1, 5, 12, 41500, 'Toyota Defence', 'INV-90318', '2026-07-12', 'Vehicle replacement programme', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (3, 'PUR-0003', 1, 11, 150, 128.5, 'ArmourTech Ltd', 'INV-90402', '2026-07-29', '', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (4, 'PUR-0004', 1, 1, 200, 685, 'Frontier Arms Co.', 'INV-90500', '2026-08-15', 'Annual readiness uplift', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (5, 'PUR-0005', 1, 9, 12000, 0.95, 'Frontier Arms Co.', 'INV-90555', '2026-08-29', '', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (6, 'PUR-0006', 1, 7, 6, 96500, 'Kamal Heavy Motors', 'INV-90601', '2026-09-11', '', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (7, 'PUR-0007', 1, 12, 40, 845, 'Opticore Systems', 'INV-90640', '2026-09-19', '', 5, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (8, 'PUR-0008', 2, 8, 30000, 0.4, 'Frontier Arms Co.', 'INV-90230', '2026-06-28', '', 6, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (9, 'PUR-0009', 2, 1, 150, 690, 'Frontier Arms Co.', 'INV-90488', '2026-08-07', '', 6, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (10, 'PUR-0010', 2, 6, 10, 128000, 'Kamal Heavy Motors', 'INV-90512', '2026-08-19', '', 6, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (11, 'PUR-0011', 2, 10, 1500, 6.8, 'Ordnance Supply Co.', 'INV-90590', '2026-09-03', 'Mortar restock', 6, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (12, 'PUR-0012', 3, 1, 120, 672, 'Frontier Arms Co.', 'INV-90377', '2026-07-20', 'Outpost reinforcement', 4, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (13, 'PUR-0013', 3, 5, 8, 40900, 'Toyota Defence', 'INV-90455', '2026-08-12', '', 4, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (14, 'PUR-0014', 3, 8, 18000, 0.41, 'Frontier Arms Co.', 'INV-90570', '2026-09-07', '', 4, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (15, 'PUR-0015', 4, 9, 20000, 0.92, 'Ordnance Supply Co.', 'INV-90110', '2026-06-10', 'Coastal artillery reserve', 1, '2026-09-28 14:32:49');
INSERT INTO purchases (id, reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by, created_at) VALUES (16, 'PUR-0016', 4, 7, 4, 95800, 'Kamal Heavy Motors', 'INV-90290', '2026-07-25', '', 1, '2026-09-28 14:32:49');

-- ---------- data: stock_ledger (85 row(s)) ----------
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (1, 1, 1, 'OPENING', 340, 1, 'opening_balances', 1, 'OPN-0001', '2026-05-31', 340, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (2, 1, 2, 'OPENING', 48, 1, 'opening_balances', 2, 'OPN-0002', '2026-05-31', 48, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (3, 1, 3, 'OPENING', 22, 1, 'opening_balances', 3, 'OPN-0003', '2026-05-31', 22, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (4, 1, 4, 'OPENING', 90, 1, 'opening_balances', 4, 'OPN-0004', '2026-05-31', 90, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (5, 1, 5, 'OPENING', 64, 1, 'opening_balances', 5, 'OPN-0005', '2026-05-31', 64, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (6, 1, 6, 'OPENING', 26, 1, 'opening_balances', 6, 'OPN-0006', '2026-05-31', 26, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (7, 1, 7, 'OPENING', 18, 1, 'opening_balances', 7, 'OPN-0007', '2026-05-31', 18, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (8, 1, 8, 'OPENING', 180000, 1, 'opening_balances', 8, 'OPN-0008', '2026-05-31', 180000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (9, 1, 9, 'OPENING', 64000, 1, 'opening_balances', 9, 'OPN-0009', '2026-05-31', 64000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (10, 1, 10, 'OPENING', 3200, 1, 'opening_balances', 10, 'OPN-0010', '2026-05-31', 3200, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (11, 1, 11, 'OPENING', 300, 1, 'opening_balances', 11, 'OPN-0011', '2026-05-31', 300, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (12, 1, 12, 'OPENING', 110, 1, 'opening_balances', 12, 'OPN-0012', '2026-05-31', 110, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (13, 2, 1, 'OPENING', 260, 1, 'opening_balances', 13, 'OPN-0013', '2026-05-31', 260, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (14, 2, 2, 'OPENING', 34, 1, 'opening_balances', 14, 'OPN-0014', '2026-05-31', 34, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (15, 2, 3, 'OPENING', 14, 1, 'opening_balances', 15, 'OPN-0015', '2026-05-31', 14, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (16, 2, 4, 'OPENING', 64, 1, 'opening_balances', 16, 'OPN-0016', '2026-05-31', 64, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (17, 2, 5, 'OPENING', 48, 1, 'opening_balances', 17, 'OPN-0017', '2026-05-31', 48, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (18, 2, 6, 'OPENING', 20, 1, 'opening_balances', 18, 'OPN-0018', '2026-05-31', 20, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (19, 2, 7, 'OPENING', 12, 1, 'opening_balances', 19, 'OPN-0019', '2026-05-31', 12, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (20, 2, 8, 'OPENING', 120000, 1, 'opening_balances', 20, 'OPN-0020', '2026-05-31', 120000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (21, 2, 9, 'OPENING', 41000, 1, 'opening_balances', 21, 'OPN-0021', '2026-05-31', 41000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (22, 2, 10, 'OPENING', 2100, 1, 'opening_balances', 22, 'OPN-0022', '2026-05-31', 2100, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (23, 2, 11, 'OPENING', 220, 1, 'opening_balances', 23, 'OPN-0023', '2026-05-31', 220, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (24, 2, 12, 'OPENING', 80, 1, 'opening_balances', 24, 'OPN-0024', '2026-05-31', 80, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (25, 3, 1, 'OPENING', 180, 1, 'opening_balances', 25, 'OPN-0025', '2026-05-31', 180, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (26, 3, 2, 'OPENING', 20, 1, 'opening_balances', 26, 'OPN-0026', '2026-05-31', 20, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (27, 3, 3, 'OPENING', 10, 1, 'opening_balances', 27, 'OPN-0027', '2026-05-31', 10, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (28, 3, 4, 'OPENING', 40, 1, 'opening_balances', 28, 'OPN-0028', '2026-05-31', 40, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (29, 3, 5, 'OPENING', 32, 1, 'opening_balances', 29, 'OPN-0029', '2026-05-31', 32, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (30, 3, 6, 'OPENING', 14, 1, 'opening_balances', 30, 'OPN-0030', '2026-05-31', 14, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (31, 3, 7, 'OPENING', 8, 1, 'opening_balances', 31, 'OPN-0031', '2026-05-31', 8, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (32, 3, 8, 'OPENING', 85000, 1, 'opening_balances', 32, 'OPN-0032', '2026-05-31', 85000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (33, 3, 9, 'OPENING', 28000, 1, 'opening_balances', 33, 'OPN-0033', '2026-05-31', 28000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (34, 3, 10, 'OPENING', 1500, 1, 'opening_balances', 34, 'OPN-0034', '2026-05-31', 1500, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (35, 3, 11, 'OPENING', 150, 1, 'opening_balances', 35, 'OPN-0035', '2026-05-31', 150, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (36, 3, 12, 'OPENING', 60, 1, 'opening_balances', 36, 'OPN-0036', '2026-05-31', 60, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (37, 4, 7, 'OPENING', 22, 1, 'opening_balances', 37, 'OPN-0037', '2026-05-31', 22, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (38, 4, 11, 'OPENING', 90, 1, 'opening_balances', 38, 'OPN-0038', '2026-05-31', 90, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (39, 4, 9, 'OPENING', 15000, 1, 'opening_balances', 39, 'OPN-0039', '2026-05-31', 15000, 'Opening balance - verified stock', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (40, 1, 8, 'PURCHASE', 45000, 1, 'purchases', 1, 'PUR-0001', '2026-06-24', 225000, 'Purchase from Frontier Arms Co.', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (41, 1, 5, 'PURCHASE', 12, 1, 'purchases', 2, 'PUR-0002', '2026-07-12', 76, 'Purchase from Toyota Defence', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (42, 1, 11, 'PURCHASE', 150, 1, 'purchases', 3, 'PUR-0003', '2026-07-29', 450, 'Purchase from ArmourTech Ltd', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (43, 1, 1, 'PURCHASE', 200, 1, 'purchases', 4, 'PUR-0004', '2026-08-15', 540, 'Purchase from Frontier Arms Co.', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (44, 1, 9, 'PURCHASE', 12000, 1, 'purchases', 5, 'PUR-0005', '2026-08-29', 76000, 'Purchase from Frontier Arms Co.', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (45, 1, 7, 'PURCHASE', 6, 1, 'purchases', 6, 'PUR-0006', '2026-09-11', 24, 'Purchase from Kamal Heavy Motors', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (46, 1, 12, 'PURCHASE', 40, 1, 'purchases', 7, 'PUR-0007', '2026-09-19', 150, 'Purchase from Opticore Systems', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (47, 2, 8, 'PURCHASE', 30000, 1, 'purchases', 8, 'PUR-0008', '2026-06-28', 150000, 'Purchase from Frontier Arms Co.', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (48, 2, 1, 'PURCHASE', 150, 1, 'purchases', 9, 'PUR-0009', '2026-08-07', 410, 'Purchase from Frontier Arms Co.', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (49, 2, 6, 'PURCHASE', 10, 1, 'purchases', 10, 'PUR-0010', '2026-08-19', 30, 'Purchase from Kamal Heavy Motors', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (50, 2, 10, 'PURCHASE', 1500, 1, 'purchases', 11, 'PUR-0011', '2026-09-03', 3600, 'Purchase from Ordnance Supply Co.', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (51, 3, 1, 'PURCHASE', 120, 1, 'purchases', 12, 'PUR-0012', '2026-07-20', 300, 'Purchase from Frontier Arms Co.', 4, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (52, 3, 5, 'PURCHASE', 8, 1, 'purchases', 13, 'PUR-0013', '2026-08-12', 40, 'Purchase from Toyota Defence', 4, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (53, 3, 8, 'PURCHASE', 18000, 1, 'purchases', 14, 'PUR-0014', '2026-09-07', 103000, 'Purchase from Frontier Arms Co.', 4, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (54, 4, 9, 'PURCHASE', 20000, 1, 'purchases', 15, 'PUR-0015', '2026-06-10', 35000, 'Purchase from Ordnance Supply Co.', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (55, 4, 7, 'PURCHASE', 4, 1, 'purchases', 16, 'PUR-0016', '2026-07-25', 26, 'Purchase from Kamal Heavy Motors', 1, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (56, 1, 8, 'TRANSFER_OUT', 20000, -1, 'transfers', 1, 'TRF-0001', '2026-08-04', 205000, 'Transfer to B-02', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (57, 2, 8, 'TRANSFER_IN', 20000, 1, 'transfers', 1, 'TRF-0001', '2026-08-07', 170000, 'Received from B-01', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (58, 1, 1, 'TRANSFER_OUT', 60, -1, 'transfers', 2, 'TRF-0002', '2026-08-11', 480, 'Transfer to B-03', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (59, 3, 1, 'TRANSFER_IN', 60, 1, 'transfers', 2, 'TRF-0002', '2026-08-14', 360, 'Received from B-01', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (60, 1, 5, 'TRANSFER_OUT', 6, -1, 'transfers', 3, 'TRF-0003', '2026-08-21', 70, 'Transfer to B-02', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (61, 2, 5, 'TRANSFER_IN', 6, 1, 'transfers', 3, 'TRF-0003', '2026-08-23', 54, 'Received from B-01', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (62, 2, 9, 'TRANSFER_OUT', 8000, -1, 'transfers', 4, 'TRF-0004', '2026-08-26', 33000, 'Transfer to B-01', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (63, 1, 9, 'TRANSFER_IN', 8000, 1, 'transfers', 4, 'TRF-0004', '2026-08-29', 84000, 'Received from B-02', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (64, 1, 9, 'TRANSFER_OUT', 10000, -1, 'transfers', 5, 'TRF-0005', '2026-09-01', 74000, 'Transfer to B-03', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (65, 3, 9, 'TRANSFER_IN', 10000, 1, 'transfers', 5, 'TRF-0005', '2026-09-04', 38000, 'Received from B-01', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (66, 2, 7, 'TRANSFER_OUT', 3, -1, 'transfers', 6, 'TRF-0006', '2026-09-06', 9, 'Transfer to B-03', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (67, 3, 7, 'TRANSFER_IN', 3, 1, 'transfers', 6, 'TRF-0006', '2026-09-09', 11, 'Received from B-02', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (68, 1, 11, 'TRANSFER_OUT', 100, -1, 'transfers', 7, 'TRF-0007', '2026-09-12', 350, 'Transfer to B-02', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (69, 2, 11, 'TRANSFER_IN', 100, 1, 'transfers', 7, 'TRF-0007', '2026-09-15', 320, 'Received from B-01', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (70, 1, 10, 'TRANSFER_OUT', 1200, -1, 'transfers', 8, 'TRF-0008', '2026-09-18', 2000, 'Transfer to B-03', 5, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (71, 2, 6, 'TRANSFER_OUT', 4, -1, 'transfers', 9, 'TRF-0009', '2026-09-22', 26, 'Transfer to B-01', 6, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (72, 1, 1, 'ASSIGNMENT', 12, -1, 'assignments', 1, 'ASN-0001', '2026-08-25', 468, 'Issued to Sgt. Imran Shah (Sergeant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (73, 1, 5, 'ASSIGNMENT', 2, -1, 'assignments', 2, 'ASN-0002', '2026-08-29', 68, 'Issued to Lt. Farhan Wali (Lieutenant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (74, 1, 8, 'ASSIGNMENT', 3000, -1, 'assignments', 3, 'ASN-0003', '2026-08-31', 202000, 'Issued to Cpl. Nadim Rahimi (Corporal)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (75, 1, 11, 'ASSIGNMENT', 40, -1, 'assignments', 4, 'ASN-0004', '2026-09-03', 310, 'Issued to Sgt. Bilal Noori (Sergeant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (76, 1, 3, 'ASSIGNMENT', 4, -1, 'assignments', 5, 'ASN-0005', '2026-09-10', 18, 'Issued to Maj. Tahir Sami (Major)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (77, 2, 2, 'ASSIGNMENT', 6, -1, 'assignments', 6, 'ASN-0006', '2026-08-28', 28, 'Issued to Sgt. Akmal Jafari (Sergeant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (78, 2, 5, 'ASSIGNMENT', 3, -1, 'assignments', 7, 'ASN-0007', '2026-09-02', 51, 'Issued to Cpl. Yasin Qadir (Corporal)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (79, 2, 9, 'ASSIGNMENT', 2500, -1, 'assignments', 8, 'ASN-0008', '2026-09-09', 30500, 'Issued to Sgt. Marwan Sabir (Sergeant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (80, 3, 1, 'ASSIGNMENT', 9, -1, 'assignments', 9, 'ASN-0009', '2026-09-04', 351, 'Issued to Sgt. Omid Rahimi (Sergeant)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (81, 3, 8, 'ASSIGNMENT', 1500, -1, 'assignments', 10, 'ASN-0010', '2026-09-13', 101500, 'Issued to Cpl. Jawid Ansari (Corporal)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (82, 1, 11, 'TRANSFER_IN', 40, 1, 'assignments', 4, 'ASN-0004', '2026-09-22', 350, 'Returned by Sgt. Bilal Noori (0 unit(s) expended)', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (83, 1, 6, 'EXPENDITURE', 1, -1, 'expenditures', 13, 'EXP-0013', '2026-09-07', 25, 'Damage / write-off (direct write-off) - Engine fire during maintenance trial', 2, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (84, 2, 7, 'EXPENDITURE', 1, -1, 'expenditures', 14, 'EXP-0014', '2026-09-14', 8, 'Damage / write-off (direct write-off) - Written off after bridge strike', 3, '2026-09-28 14:32:49');
INSERT INTO stock_ledger (id, base_id, equipment_type_id, tx_type, qty, direction, ref_table, ref_id, ref_no, txn_date, balance_after, remarks, created_by, created_at) VALUES (85, 3, 12, 'EXPENDITURE', 3, -1, 'expenditures', 15, 'EXP-0015', '2026-09-20', 57, 'Lost / missing (direct write-off) - Lost during night patrol', 4, '2026-09-28 14:32:49');

-- ---------- data: transfers (9 row(s)) ----------
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (1, 'TRF-0001', 1, 2, 8, 20000, 'received', '2026-08-04', '2026-08-07', 'Balance relief for southern sector', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (2, 'TRF-0002', 1, 3, 1, 60, 'received', '2026-08-11', '2026-08-14', '', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (3, 'TRF-0003', 1, 2, 5, 6, 'received', '2026-08-21', '2026-08-23', '', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (4, 'TRF-0004', 2, 1, 9, 8000, 'received', '2026-08-26', '2026-08-29', '', 6, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (5, 'TRF-0005', 1, 3, 9, 10000, 'received', '2026-09-01', '2026-09-04', 'Forward ammunition dump', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (6, 'TRF-0006', 2, 3, 7, 3, 'received', '2026-09-06', '2026-09-09', '', 6, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (7, 'TRF-0007', 1, 2, 11, 100, 'received', '2026-09-12', '2026-09-15', '', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (8, 'TRF-0008', 1, 3, 10, 1200, 'dispatched', '2026-09-18', NULL, 'IN TRANSIT - convoy delayed', 5, '2026-09-28 14:32:49');
INSERT INTO transfers (id, reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, received_date, remarks, created_by, created_at) VALUES (9, 'TRF-0009', 2, 1, 6, 4, 'dispatched', '2026-09-22', NULL, 'IN TRANSIT - awaiting escort', 6, '2026-09-28 14:32:49');

-- ---------- data: users (6 row(s)) ----------
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (1, 'System Administrator', 'admin@mams.mil', '$2a$10$j1c44MoUyiEOCTZAh9UB9evQJGNNAiNB.9QXyD.pccs0tUXFNBvVm', 'admin', NULL, 'Colonel (Ret.)', 1, '2026-09-28 14:32:49');
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (2, 'Brig. Gen. A. Rahimi', 'commander.kabul@mams.mil', '$2a$10$/lrSXbsNgSKC4bq9Tnn2QO2y6pWIsUPKveIkTOh3YW2pfVls39vU6', 'commander', 1, 'Brigadier General', 1, '2026-09-28 14:32:49');
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (3, 'Col. M. Dawoodi', 'commander.kandahar@mams.mil', '$2a$10$tDUuG1CWELQNIpubnplVnOEZUuESjB8T8sYaZQ7mCX7Yx39t9ubda', 'commander', 2, 'Colonel', 1, '2026-09-28 14:32:49');
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (4, 'Lt. Col. S. Baker', 'commander.khost@mams.mil', '$2a$10$evq1zVv6Br7wdxUqnkuo6O47hhvXjzWFE36rsjYyK3wUbfrQXzTnG', 'commander', 3, 'Lieutenant Colonel', 1, '2026-09-28 14:32:49');
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (5, 'Capt. Y. Hassan', 'logistics.kabul@mams.mil', '$2a$10$WwOzVC3cMELVzKteVj5q7uwGvso6maGIbvMHhq1AL3mtVc3wjd2Om', 'logistics', 1, 'Captain', 1, '2026-09-28 14:32:49');
INSERT INTO users (id, name, email, password_hash, role, base_id, rank, active, created_at) VALUES (6, 'Maj. R. Ahmed', 'logistics.kandahar@mams.mil', '$2a$10$KUyVjGt.Gq25M5cJIClt3eCSJlNXwaDMs/imu/P3t54Gbhltjyw8q', 'logistics', 2, 'Major', 1, '2026-09-28 14:32:49');

COMMIT;
PRAGMA foreign_keys = ON;
