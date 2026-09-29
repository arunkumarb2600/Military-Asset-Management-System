/**
 * OPENING BALANCES  (verified day-one stock)
 *   GET  /api/opening-balances   list + filters (?baseId&equipmentTypeId&q)
 *   POST /api/opening-balances   record or top-up starting stock
 *                                (admin | commander)
 *
 * An opening balance is the quantity of one item already held at a base on
 * a given date - the figure every later calculation starts from.  The
 * opening_balances row and its stock_ledger line are written in one
 * transaction, so the dashboard's Opening Balance figure is always the sum
 * of what was entered here.
 *
 * To keep data entry simple this route ADDS to any existing opening balance
 * for the same base + item + date rather than rejecting the duplicate, so an
 * officer can build a total up in several small steps (or after several
 * physical stock takes) without having to work out the running total.
 */
const express = require('express');
const { db, postLedger, currentBalance } = require('../db');
const { authenticate, requireRole, effectiveBaseId, assertBaseAllowed } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const SELECT_OPENING = `
  SELECT o.id, o.as_of_date, o.quantity, o.remarks, o.created_at,
         o.base_id, o.equipment_type_id,
         b.name AS base, b.code AS baseCode,
         e.name AS equipment, e.code AS equipmentCode, e.category, e.unit,
         COALESCE(u.name, 'system') AS created_by_name
    FROM opening_balances o
    JOIN bases b           ON b.id = o.base_id
    JOIN equipment_types e ON e.id = o.equipment_type_id
    LEFT JOIN users u      ON u.id = o.created_by`;

function filters(req) {
  const scope = effectiveBaseId(req);
  const baseId = scope ?? (req.query.baseId ? Number(req.query.baseId) : null);
  const equipmentTypeId = req.query.equipmentTypeId ? Number(req.query.equipmentTypeId) : null;
  const search = req.query.q ? `%${String(req.query.q).trim()}%` : null;

  const where = [];
  const params = [];
  if (baseId) { where.push('o.base_id = ?'); params.push(baseId); }
  if (equipmentTypeId) { where.push('o.equipment_type_id = ?'); params.push(equipmentTypeId); }
  if (search) {
    where.push('(e.name LIKE ? OR e.code LIKE ? OR b.name LIKE ? OR b.code LIKE ?)');
    params.push(search, search, search, search);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/* ------------------------------- list ------------------------------ */
router.get('/', (req, res) => {
  const f = filters(req);
  const rows = db
    .prepare(`${SELECT_OPENING} ${f.clause} ORDER BY o.as_of_date DESC, o.id DESC`)
    .all(...f.params);

  // Current on-hand for each base/item pair, so the page can show how much
  // stock is there now next to the figure that was entered.
  const balances = {};
  for (const r of rows) {
    const k = `${r.base_id}:${r.equipment_type_id}`;
    if (balances[k] == null) balances[k] = currentBalance(r.base_id, r.equipment_type_id);
  }
  res.json({ openingBalances: rows.map((r) => ({ ...r, currentBalance: balances[`${r.base_id}:${r.equipment_type_id}`] })) });
});

/* ------------------------------ create ----------------------------- */
const create = db.transaction((user, body) => {
  const baseId = Number(body.baseId);
  const equipmentTypeId = Number(body.equipmentTypeId);
  const quantity = Number(body.quantity);
  const asOfDate = String(body.asOfDate || '').slice(0, 10);

  if (!baseId || !equipmentTypeId) throw Object.assign(new Error('Base and equipment type are required.'), { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('Quantity must be a whole number greater than zero.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw Object.assign(new Error('As-of date is required (YYYY-MM-DD).'), { status: 400 });

  assertBaseAllowed({ user }, baseId);

  // Add to an existing opening balance for the same base/item/date so that
  // entering figures in several small steps produces one clean total.
  const existing = db
    .prepare('SELECT id, quantity FROM opening_balances WHERE base_id = ? AND equipment_type_id = ? AND as_of_date = ?')
    .get(baseId, equipmentTypeId, asOfDate);

  let openingId;
  let total;
  if (existing) {
    total = existing.quantity + quantity;
    db.prepare('UPDATE opening_balances SET quantity = ? WHERE id = ?').run(total, existing.id);
    openingId = existing.id;
  } else {
    const info = db
      .prepare('INSERT INTO opening_balances (base_id,equipment_type_id,as_of_date,quantity,remarks,created_by,created_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
      .run(baseId, equipmentTypeId, asOfDate, quantity, body.remarks || 'Physical stock take on record', user.id);
    openingId = Number(info.lastInsertRowid);
    total = quantity;
  }

  const referenceNo = `OPN-${String(openingId).padStart(4, '0')}`;

  postLedger({
    baseId, equipmentTypeId,
    txType: 'OPENING', qty: quantity, direction: 1,
    refTable: 'opening_balances', refId: openingId, refNo: referenceNo,
    txnDate: asOfDate,
    remarks: body.remarks || 'Opening balance - verified stock',
    createdBy: user.id
  });

  const eq = db.prepare('SELECT name FROM equipment_types WHERE id = ?').get(equipmentTypeId);
  const bse = db.prepare('SELECT name FROM bases WHERE id = ?').get(baseId);

  return {
    id: openingId,
    reference_no: referenceNo,
    base: bse.name,
    equipment: eq.name,
    added: quantity,
    openingTotal: total,
    currentBalance: currentBalance(baseId, equipmentTypeId)
  };
});

router.post('/', requireRole('admin', 'commander'), (req, res, next) => {
  try {
    const result = create(req.user, req.body || {});
    logAudit({ user: req.user, action: 'OPENING_BALANCE_RECORDED', entity: 'opening_balance', entityId: result.id, method: 'POST', endpoint: '/api/opening-balances', status: 201, ip: req.ip, details: { ...req.body, reference_no: result.reference_no } });
    res.status(201).json({ openingBalance: result, message: `Opening balance recorded. ${result.base} / ${result.equipment} now starts at ${result.openingTotal}.` });
  } catch (e) { next(e); }
});

module.exports = router;
