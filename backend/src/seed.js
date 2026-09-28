/**
 * Demo data seeder.  Idempotent: does nothing if users already exist.
 *   npm run seed     -> seed only if empty
 *   npm run reset    -> wipe every table and re-seed
 */
const bcrypt = require('bcryptjs');
const { db, postLedger } = require('./db');

const force = process.argv.includes('--force');

/* ------------------------- reference data -------------------------- */
const BASES = [
  ['B-01', 'Fort Kabul',        'Kabul, Afghanistan',      'Brig. Gen. A. Rahimi'],
  ['B-02', 'Camp Vance',        'Kandahar, Afghanistan',   'Col. M. Dawoodi'],
  ['B-03', 'Fob Khost',         'Khost, Afghanistan',      'Lt. Col. S. Baker'],
  ['B-04', 'Naval Support Base','Karachi, Pakistan',       'Capt. F. Iqbal']
];

const EQUIPMENT = [
  ['WPN-RIFLE',  '5.56mm Assault Rifle',   'Weapon',     'unit'],
  ['WPN-MG',     '7.62mm Machine Gun',      'Weapon',     'unit'],
  ['WPN-SNIPER', '.308 Sniper Rifle',       'Weapon',     'unit'],
  ['WPN-PST',    '9mm Pistol',             'Weapon',     'unit'],
  ['VEH-HILUX',  'Toyota Hilux 4x4',       'Vehicle',    'unit'],
  ['VEH-HMMWV',  'HMMWV Armoured',         'Vehicle',    'unit'],
  ['VEH-TRUCK',  'Cargo Truck 5t',         'Vehicle',    'unit'],
  ['AMM-556',    '5.56x45mm Ammunition',   'Ammunition', 'round'],
  ['AMM-762',    '7.62x51mm Ammunition',   'Ammunition', 'round'],
  ['AMM-SHELL',  '120mm Mortar Shell',     'Ammunition', 'round'],
  ['EQP-ARMOR',  'Body Armour Vest',       'Equipment',  'unit'],
  ['EQP-NV',     'Night Vision Goggles',   'Equipment',  'unit']
];

const USERS = [
  ['System Administrator', 'admin@mams.mil',      'admin',     null, 'Colonel (Ret.)'],
  ['Brig. Gen. A. Rahimi',  'commander.kabul@mams.mil', 'commander', 'B-01', 'Brigadier General'],
  ['Col. M. Dawoodi',      'commander.kandahar@mams.mil', 'commander', 'B-02', 'Colonel'],
  ['Lt. Col. S. Baker',    'commander.khost@mams.mil', 'commander', 'B-03', 'Lieutenant Colonel'],
  ['Capt. Y. Hassan',      'logistics.kabul@mams.mil', 'logistics', 'B-01', 'Captain'],
  ['Maj. R. Ahmed',        'logistics.kandahar@mams.mil', 'logistics', 'B-02', 'Major']
];

const PASSWORD = 'Password123';

/* --------------------------- date helpers -------------------------- */
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => iso(Date.now() - n * DAY);

function wipe() {
  const tables = ['audit_logs', 'stock_ledger', 'expenditures', 'assignments', 'transfers', 'purchases', 'opening_balances', 'users', 'equipment_types', 'bases'];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('" + tables.join("','") + "')").run();
}

function seed() {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const baseId = {};
  for (const [code, name, loc, cmd] of BASES) {
    baseId[code] = Number(db.prepare('INSERT INTO bases (code,name,location,commander,created_at) VALUES (?,?,?,?,?)').run(code, name, loc, cmd, now).lastInsertRowid);
  }
  const eqId = {};
  for (const [code, name, cat, unit] of EQUIPMENT) {
    eqId[code] = Number(db.prepare('INSERT INTO equipment_types (code,name,category,unit,created_at) VALUES (?,?,?,?,?)').run(code, name, cat, unit, now).lastInsertRowid);
  }

  const userId = {};
  for (const [name, email, role, baseCode, rank] of USERS) {
    const id = Number(
      db.prepare('INSERT INTO users (name,email,password_hash,role,base_id,rank,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(name, email, bcrypt.hashSync(PASSWORD, 10), role, baseCode ? baseId[baseCode] : null, rank, now).lastInsertRowid
    );
    userId[email.split('@')[0]] = id;
  }
  const admin = userId['admin'];
  const cmdKabul = userId['commander.kabul'];
  const cmdKandahar = userId['commander.kandahar'];
  const logKabul = userId['logistics.kabul'];
  const logKandahar = userId['logistics.kandahar'];
  const cmdKhost = userId['commander.khost'];

  /* ---------- 1. Opening balances (day-one verified stock) ---------- */
  const opening = [
    ['B-01', 'WPN-RIFLE',  340], ['B-01', 'WPN-MG', 48], ['B-01', 'WPN-SNIPER', 22],
    ['B-01', 'WPN-PST',    90], ['B-01', 'VEH-HILUX', 64], ['B-01', 'VEH-HMMWV', 26],
    ['B-01', 'VEH-TRUCK',  18], ['B-01', 'AMM-556', 180000], ['B-01', 'AMM-762', 64000],
    ['B-01', 'AMM-SHELL',  3200], ['B-01', 'EQP-ARMOR', 300], ['B-01', 'EQP-NV', 110],

    ['B-02', 'WPN-RIFLE',  260], ['B-02', 'WPN-MG', 34], ['B-02', 'WPN-SNIPER', 14],
    ['B-02', 'WPN-PST',    64], ['B-02', 'VEH-HILUX', 48], ['B-02', 'VEH-HMMWV', 20],
    ['B-02', 'VEH-TRUCK', 12], ['B-02', 'AMM-556', 120000], ['B-02', 'AMM-762', 41000],
    ['B-02', 'AMM-SHELL',  2100], ['B-02', 'EQP-ARMOR', 220], ['B-02', 'EQP-NV', 80],

    ['B-03', 'WPN-RIFLE',  180], ['B-03', 'WPN-MG', 20], ['B-03', 'WPN-SNIPER', 10],
    ['B-03', 'WPN-PST',    40], ['B-03', 'VEH-HILUX', 32], ['B-03', 'VEH-HMMWV', 14],
    ['B-03', 'VEH-TRUCK',   8], ['B-03', 'AMM-556',  85000], ['B-03', 'AMM-762', 28000],
    ['B-03', 'AMM-SHELL',  1500], ['B-03', 'EQP-ARMOR', 150], ['B-03', 'EQP-NV', 60],

    ['B-04', 'VEH-TRUCK',  22], ['B-04', 'EQP-ARMOR', 90], ['B-04', 'AMM-762', 15000]
  ];

  const runAll = db.transaction(() => {
    // Opening balances, dated 120 days ago
    for (const [b, e, qty] of opening) {
      const date = daysAgo(120);
      const info = db
        .prepare('INSERT INTO opening_balances (base_id,equipment_type_id,as_of_date,quantity,remarks,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(baseId[b], eqId[e], date, qty, 'Physical stock take on record', admin, now);
      const oid = Number(info.lastInsertRowid);
      postLedger({
        baseId: baseId[b], equipmentTypeId: eqId[e], txType: 'OPENING', qty, direction: 1,
        refTable: 'opening_balances', refId: oid, refNo: `OPN-${String(oid).padStart(4, '0')}`,
        txnDate: date, remarks: 'Opening balance - verified stock', createdBy: admin
      });
    }

    /* ------------------------ 2. Purchases ----------------------- */
    const purchases = [
      ['B-01', 'AMM-556',  45000, 0.42, 'Frontier Arms Co.',   'INV-90211', 96, logKabul,      'Bulk resupply for northern operations'],
      ['B-01', 'VEH-HILUX',   12, 41500, 'Toyota Defence',     'INV-90318', 78, logKabul,      'Vehicle replacement programme'],
      ['B-01', 'EQP-ARMOR',  150, 128.5, 'ArmourTech Ltd',     'INV-90402', 61, logKabul,      ''],
      ['B-01', 'WPN-RIFLE',  200, 685.0, 'Frontier Arms Co.',  'INV-90500', 44, logKabul,      'Annual readiness uplift'],
      ['B-01', 'AMM-762',   12000, 0.95, 'Frontier Arms Co.',  'INV-90555', 30, logKabul,      ''],
      ['B-01', 'VEH-TRUCK',    6, 96500, 'Kamal Heavy Motors', 'INV-90601', 17, logKabul,      ''],
      ['B-01', 'EQP-NV',      40,  845.0,'Opticore Systems',   'INV-90640',  9, logKabul,      ''],

      ['B-02', 'AMM-556',  30000, 0.40, 'Frontier Arms Co.',  'INV-90230', 92, logKandahar,   ''],
      ['B-02', 'WPN-RIFLE', 150,  690.0, 'Frontier Arms Co.',  'INV-90488', 52, logKandahar,   ''],
      ['B-02', 'VEH-HMMWV',  10, 128000,'Kamal Heavy Motors', 'INV-90512', 40, logKandahar,   ''],
      ['B-02', 'AMM-SHELL', 1500, 6.80, 'Ordnance Supply Co.','INV-90590', 25, logKandahar,   'Mortar restock'],

      ['B-03', 'WPN-RIFLE', 120,  672.0, 'Frontier Arms Co.',  'INV-90377', 70, cmdKhost,     'Outpost reinforcement'],
      ['B-03', 'VEH-HILUX',   8, 40900,  'Toyota Defence',     'INV-90455', 47, cmdKhost,     ''],
      ['B-03', 'AMM-556',  18000, 0.41,  'Frontier Arms Co.',  'INV-90570', 21, cmdKhost,     ''],

      ['B-04', 'AMM-762',  20000, 0.92,  'Ordnance Supply Co.','INV-90110', 110, admin,        'Coastal artillery reserve'],
      ['B-04', 'VEH-TRUCK',   4,  95800, 'Kamal Heavy Motors', 'INV-90290', 65, admin,        '']
    ];
    let pn = 0;
    for (const [b, e, qty, cost, supplier, invoice, ago, by, remarks] of purchases) {
      const date = daysAgo(ago);
      const ref = `PUR-${String(++pn).padStart(4, '0')}`;
      const info = db
        .prepare('INSERT INTO purchases (reference_no,base_id,equipment_type_id,quantity,unit_cost,supplier,invoice_no,purchase_date,remarks,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(ref, baseId[b], eqId[e], qty, cost, supplier, invoice, date, remarks, by, now);
      postLedger({
        baseId: baseId[b], equipmentTypeId: eqId[e], txType: 'PURCHASE', qty, direction: 1,
        refTable: 'purchases', refId: Number(info.lastInsertRowid), refNo: ref, txnDate: date,
        remarks: `Purchase from ${supplier}`, createdBy: by
      });
    }

    /* ------------------------ 3. Transfers ----------------------- */
    // [from, to, equipment, qty, daysAgo, receivedDaysAgo|null, by, remarks]
    const transfers = [
      ['B-01', 'B-02', 'AMM-556',  20000, 55, 52, logKabul,     'Balance relief for southern sector'],
      ['B-01', 'B-03', 'WPN-RIFLE',  60,   48, 45, logKabul,     ''],
      ['B-01', 'B-02', 'VEH-HILUX',   6,   38, 36, logKabul,     ''],
      ['B-02', 'B-01', 'AMM-762',   8000,  33, 30, logKandahar,  ''],
      ['B-01', 'B-03', 'AMM-762',  10000,  27, 24, logKabul,     'Forward ammunition dump'],
      ['B-02', 'B-03', 'VEH-TRUCK',  3,    22, 19, logKandahar,  ''],
      ['B-01', 'B-02', 'EQP-ARMOR', 100,   16, 13, logKabul,     ''],
      ['B-01', 'B-03', 'AMM-SHELL', 1200,  10, null, logKabul,    'IN TRANSIT - convoy delayed'],
      ['B-02', 'B-01', 'VEH-HMMWV',  4,     6, null, logKandahar, 'IN TRANSIT - awaiting escort']
    ];
    let tn = 0;
    for (const [fb, tb, e, qty, ago, recv, by, remarks] of transfers) {
      const date = daysAgo(ago);
      const ref = `TRF-${String(++tn).padStart(4, '0')}`;
      const info = db
        .prepare(`INSERT INTO transfers (reference_no,from_base_id,to_base_id,equipment_type_id,quantity,status,transfer_date,remarks,created_by,created_at) VALUES (?,?,?,?,?,'dispatched',?,?,?,?)`)
        .run(ref, baseId[fb], baseId[tb], eqId[e], qty, date, remarks, by, now);
      const tid = Number(info.lastInsertRowid);
      postLedger({
        baseId: baseId[fb], equipmentTypeId: eqId[e], txType: 'TRANSFER_OUT', qty, direction: -1,
        refTable: 'transfers', refId: tid, refNo: ref, txnDate: date, remarks: `Transfer to ${tb}`, createdBy: by
      });
      if (recv != null) {
        const rdate = daysAgo(recv);
        db.prepare(`UPDATE transfers SET status='received', received_date=? WHERE id=?`).run(rdate, tid);
        postLedger({
          baseId: baseId[tb], equipmentTypeId: eqId[e], txType: 'TRANSFER_IN', qty, direction: 1,
          refTable: 'transfers', refId: tid, refNo: ref, txnDate: rdate,
          remarks: `Received from ${fb}`, createdBy: by
        });
      }
    }

    /* ---------------------- 4. Assignments ----------------------- */
    const people = [
      ['Sgt. Imran Shah',        'AF-10293', 'Sergeant',       'B-01', 'WPN-RIFLE',  12, 34, 20],
      ['Lt. Farhan Wali',        'AF-10450', 'Lieutenant',     'B-01', 'VEH-HILUX',   2, 30, 15],
      ['Cpl. Nadim Rahimi',      'AF-10871', 'Corporal',       'B-01', 'AMM-556',  3000, 28,  6],
      ['Sgt. Bilal Noori',       'AF-11002', 'Sergeant',       'B-01', 'EQP-ARMOR',  40, 25, 18],
      ['Maj. Tahir Sami',        'AF-10077', 'Major',          'B-01', 'WPN-SNIPER',  4, 18,  8],
      ['Sgt. Akmal Jafari',      'AF-11320', 'Sergeant',       'B-02', 'WPN-MG',      6, 31, 12],
      ['Cpl. Yasin Qadir',       'AF-11455', 'Corporal',       'B-02', 'VEH-HILUX',   3, 26,  9],
      ['Sgt. Marwan Sabir',      'AF-11580', 'Sergeant',       'B-02', 'AMM-762',  2500, 19,  4],
      ['Sgt. Omid Rahimi',       'AF-11701', 'Sergeant',       'B-03', 'WPN-RIFLE',   9, 24, 10],
      ['Cpl. Jawid Ansari',      'AF-11834', 'Corporal',       'B-03', 'AMM-556',  1500, 15,  3]
    ];
    const assignmentId = [];
    let an = 0;
    for (const [name, sid, rank, b, e, qty, ago, dueIn] of people) {
      const date = daysAgo(ago);
      const ref = `ASN-${String(++an).padStart(4, '0')}`;
      const info = db
        .prepare(`INSERT INTO assignments (reference_no,base_id,equipment_type_id,quantity,personnel_name,personnel_id,personnel_rank,assigned_date,due_date,status,remarks,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?)`)
        .run(ref, baseId[b], eqId[e], qty, name, sid, rank, date, daysAgo(-dueIn), 'Routine issue', cmdKabul, now);
      const aid = Number(info.lastInsertRowid);
      assignmentId.push({ id: aid, base: b, eq: e, name, ref });
      postLedger({
        baseId: baseId[b], equipmentTypeId: eqId[e], txType: 'ASSIGNMENT', qty, direction: -1,
        refTable: 'assignments', refId: aid, refNo: ref, txnDate: date,
        remarks: `Issued to ${name} (${rank})`, createdBy: cmdKabul
      });
    }

    /* ------------- 4b. One returned assignment demo ------------------ */
    // ASN-0004 issued 40 body armour, 12 were lost -> 28 come back to base.
    {
      const a = db.prepare(`SELECT * FROM assignments WHERE reference_no = 'ASN-0004'`).get();
      if (a) {
        const spent = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM expenditures WHERE assignment_id=?').get(a.id).q;
        const remaining = a.quantity - spent;
        const date = daysAgo(6);
        db.prepare(`UPDATE assignments SET status='returned', remarks='Returned after inventory review' WHERE id=?`).run(a.id);
        postLedger({
          baseId: a.base_id, equipmentTypeId: a.equipment_type_id, txType: 'TRANSFER_IN', qty: remaining, direction: 1,
          refTable: 'assignments', refId: a.id, refNo: a.reference_no, txnDate: date,
          remarks: `Returned by ${a.personnel_name} (${spent} unit(s) expended)`, createdBy: cmdKabul
        });
      }
    }

    /* ---------------------- 5. Expenditures ---------------------- */
    // [assignmentIndex, quantity, reason, remarks, daysAgo]
    // Quantities respect the unit of the assigned item (rounds vs units).
    const spends = [
      [0, 1,   'Damage / write-off', 'Barrel failure during live-fire',    26],
      [0, 1,   'Lost / missing',     'Inventory discrepancy',              18],
      [2, 400, 'Fired in training',  'Live-fire exercise, sector 4',       24],
      [2, 600, 'Operational use',    '',                                   16],
      [3, 12,  'Lost / missing',     'Inventory discrepancy',              15],
      [1, 1,   'Damage / write-off', 'Off-road impact during patrol',      20],
      [4, 1,   'Damage / write-off', 'Scope zeroed beyond service life',   10],
      [5, 1,   'Damage / write-off', 'Receiver group cracked',             12],
      [6, 1,   'Damage / write-off', 'Chassis crack',                      11],
      [7, 300, 'Fired in training',  'Shooting competition reserve',        9],
      [8, 1,   'Damage / write-off', 'Trigger failure',                     7],
      [9, 250, 'Operational use',    '',                                    5]
    ];
    let en = 0;
    for (const [idx, qty, reason, remarks, ago] of spends) {
      const a = assignmentId[idx];
      if (!a) continue;
      const date = daysAgo(ago);
      const ref = `EXP-${String(++en).padStart(4, '0')}`;
      const info = db
        .prepare('INSERT INTO expenditures (reference_no,base_id,equipment_type_id,assignment_id,quantity,personnel_name,expended_date,reason,remarks,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(ref, baseId[a.base], eqId[a.eq], a.id, qty, a.name, date, reason, remarks, cmdKabul, now);
      // Linked expenditure: stock already left the base at assignment time,
      // so no ledger line is posted (see database/schema.sql).
      const used = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM expenditures WHERE assignment_id=?').get(a.id).q;
      if (used >= db.prepare('SELECT quantity FROM assignments WHERE id=?').get(a.id).quantity) {
        db.prepare(`UPDATE assignments SET status='expended' WHERE id=?`).run(a.id);
      }
    }

    /* ----------- 5b. Direct write-offs of base-held stock ------------ */
    // Not linked to any assignment: the asset is consumed while still on
    // the base books, so a negative EXPENDITURE ledger line IS written.
    const direct = [
      ['B-01', 'VEH-HMMWV',  1, 'Damage / write-off', 'Engine fire during maintenance trial', 21, cmdKabul],
      ['B-02', 'VEH-TRUCK',  1, 'Damage / write-off', 'Written off after bridge strike',        14, cmdKandahar],
      ['B-03', 'EQP-NV',     3, 'Lost / missing',     'Lost during night patrol',                  8, cmdKhost]
    ];
    for (const [b, e, qty, reason, remarks, ago, by] of direct) {
      const date = daysAgo(ago);
      const ref = `EXP-${String(++en).padStart(4, '0')}`;
      const info = db
        .prepare('INSERT INTO expenditures (reference_no,base_id,equipment_type_id,assignment_id,quantity,personnel_name,expended_date,reason,remarks,created_by,created_at) VALUES (?,?,?,NULL,?,NULL,?,?,?,?,?)')
        .run(ref, baseId[b], eqId[e], qty, date, reason, remarks, by, now);
      postLedger({
        baseId: baseId[b], equipmentTypeId: eqId[e], txType: 'EXPENDITURE', qty, direction: -1,
        refTable: 'expenditures', refId: Number(info.lastInsertRowid), refNo: ref, txnDate: date,
        remarks: `${reason} (direct write-off) - ${remarks}`, createdBy: by
      });
    }

    /* --------------------- 6. Audit log samples ------------------- */
    const audit = [
      [admin, 'admin@mams.mil', 'admin', 'USER_CREATED', 'user', 2, 'POST', '/api/admin/users', 201, '"role":"commander"', '10.0.0.5'],
      [admin, 'admin@mams.mil', 'admin', 'USER_CREATED', 'user', 3, 'POST', '/api/admin/users', 201, '"role":"commander"', '10.0.0.5'],
      [cmdKabul, 'commander.kabul@mams.mil', 'commander', 'PURCHASE_CREATED', 'purchase', 1, 'POST', '/api/purchases', 201, '"quantity":45000', '10.0.1.20'],
      [logKabul, 'logistics.kabul@mams.mil', 'logistics', 'TRANSFER_DISPATCHED', 'transfer', 1, 'POST', '/api/transfers', 201, '"quantity":20000', '10.0.1.44'],
      [cmdKandahar, 'commander.kandahar@mams.mil', 'commander', 'ACCESS_DENIED', 'rbac', null, 'POST', '/api/purchases', 403, '"required":["logistics"]', '10.0.2.31'],
      [cmdKhost, 'commander.khost@mams.mil', 'commander', 'LOGIN_SUCCESS', 'auth', 3, 'POST', '/api/auth/login', 200, null, '10.0.3.9'],
      [logKandahar, 'logistics.kandahar@mams.mil', 'logistics', 'ASSIGNMENT_CREATED', 'assignment', 6, 'POST', '/api/assignments', 201, '"quantity":6', '10.0.2.77']
    ];
    for (const [uid, email, role, action, entity, eid, method, endpoint, status, details, ip] of audit) {
      db.prepare('INSERT INTO audit_logs (user_id,username,role,action,entity,entity_id,method,endpoint,status_code,details,ip_address,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(uid, email, role, action, entity, eid, method, endpoint, status, details, ip, now);
    }
  });

  runAll();
}

/** Called on server boot: seed only if the database has no users. */
function ensureSeeded() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0 && !force) return false;
  if (force) wipe();
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  seed();
  return true;
}

if (require.main === module) {
  const did = ensureSeeded();
  const c = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log(did ? `Seeded demo data (${c} users).` : 'Database already contains data - nothing to do. Use "npm run reset" to re-seed.');
  console.log('Logins: admin@mams.mil / commander.kabul@mams.mil / logistics.kabul@mams.mil  (password: Password123)');
}

module.exports = { ensureSeeded };
