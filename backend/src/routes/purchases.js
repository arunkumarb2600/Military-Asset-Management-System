/**
 * PURCHASES  (Procurement received into a base)
 *   GET  /api/purchases        list + filters (?from&to&baseId&equipmentTypeId&q)
 *   GET  /api/purchases/summary  totals for the selected filter
 *   POST /api/purchases        record a purchase  (admin | commander | logistics)
 *
 * Stock documents are immutable by design so the audit trail can never be
 * rewritten.  The purchase row and its stock_ledger line are written inside
 * one transaction.
 */
const express = require('express');
const { db, postLedger, currentBalance } = require('../db');
const { authenticate, requireRole, effectiveBaseId, assertBaseAllowed } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const SELECT_PURCHASE = `
  SELECT p.id, p.reference_no, p.quantity, p.unit_cost,
         (p.quantity * p.unit_cost) AS total_cost,
         p.supplier, p.invoice_no, p.purchase_date, p.remarks,
         p.created_at, p.base_id, p.equipment_type_id,
         b.name AS base, b.code AS baseCode,
         e.name AS equipment, e.code AS equipmentCode, e.category, e.unit,
         COALESCE(u.name, 'system') AS created_by_name
    FROM purchases p
    JOIN bases b           ON b.id = p.base_id
    JOIN equipment_types e ON e.id = p.equipment_type_id
    LEFT JOIN users u      ON u.id = p.created_by`;

function filters(req) {
  const scope = effectiveBaseId(req);
  const baseId = scope ?? (req.query.baseId ? Number(req.query.baseId) : null);
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || '9999-12-31';
  const equipmentTypeId = req.query.equipmentTypeId ? Number(req.query.equipmentTypeId) : null;
  const search = req.query.q ? `%${String(req.query.q).trim()}%` : null;

  const where = [];
  const params = [];
  if (baseId) { where.push('p.base_id = ?'); params.push(baseId); }
  if (equipmentTypeId) { where.push('p.equipment_type_id = ?'); params.push(equipmentTypeId); }
  if (search) { where.push('(p.invoice_no LIKE ? OR p.supplier LIKE ? OR p.reference_no LIKE ?)'); params.push(search, search, search); }
  where.push('p.purchase_date BETWEEN ? AND ?');
  params.push(from, to);

  return { clause: 'WHERE ' + where.join(' AND '), params, from, to, baseId, equipmentTypeId };
}

/* ------------------------------ list ------------------------------- */
router.get('/', (req, res) => {
  const f = filters(req);
  const rows = db
    .prepare(`${SELECT_PURCHASE} ${f.clause} ORDER BY p.purchase_date DESC, p.id DESC LIMIT 500`)
    .all(...f.params);
  res.json({ purchases: rows });
});

/* ----------------------------- summary ----------------------------- */
router.get('/summary', (req, res) => {
  const f = filters(req);
  const t = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(p.quantity),0) AS units, COALESCE(SUM(p.quantity*p.unit_cost),0) AS value
         FROM purchases p ${f.clause}`
    )
    .get(...f.params);
  res.json({ summary: t });
});

/* ------------------------------ create ----------------------------- */
const create = db.transaction((user, body) => {
  const baseId = Number(body.baseId);
  const equipmentTypeId = Number(body.equipmentTypeId);
  const quantity = Number(body.quantity);
  const unitCost = body.unitCost === '' || body.unitCost == null ? 0 : Number(body.unitCost);
  const purchaseDate = String(body.purchaseDate || '').slice(0, 10);

  if (!baseId || !equipmentTypeId) throw Object.assign(new Error('Base and equipment type are required.'), { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('Quantity must be a whole number greater than zero.'), { status: 400 });
  if (Number.isNaN(unitCost) || unitCost < 0) throw Object.assign(new Error('Unit cost cannot be negative.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw Object.assign(new Error('Purchase date is required (YYYY-MM-DD).'), { status: 400 });

  assertBaseAllowed({ user }, baseId);

  const next = db.prepare(`SELECT COUNT(*) AS n FROM purchases`).get().n + 1;
  const referenceNo = `PUR-${String(next).padStart(4, '0')}`;

  const info = db
    .prepare(
      `INSERT INTO purchases
        (reference_no, base_id, equipment_type_id, quantity, unit_cost, supplier, invoice_no, purchase_date, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(referenceNo, baseId, equipmentTypeId, quantity, unitCost,
         body.supplier || null, body.invoiceNo || null, purchaseDate, body.remarks || null, user.id);

  const purchaseId = Number(info.lastInsertRowid);
  const eq = db.prepare('SELECT name FROM equipment_types WHERE id = ?').get(equipmentTypeId);
  const bse = db.prepare('SELECT name FROM bases WHERE id = ?').get(baseId);

  const ledger = postLedger({
    baseId, equipmentTypeId,
    txType: 'PURCHASE', qty: quantity, direction: 1,
    refTable: 'purchases', refId: purchaseId, refNo: referenceNo,
    txnDate: purchaseDate,
    remarks: body.remarks || `Purchase from ${body.supplier || 'supplier'}`,
    createdBy: user.id
  });

  return {
    id: purchaseId, reference_no: referenceNo,
    base: bse.name, equipment: eq.name,
    balanceAfter: ledger.balanceAfter
  };
});

router.post('/', requireRole('admin', 'commander', 'logistics'), (req, res, next) => {
  try {
    const result = create(req.user, req.body || {});
    logAudit({ user: req.user, action: 'PURCHASE_CREATED', entity: 'purchase', entityId: result.id, method: 'POST', endpoint: '/api/purchases', status: 201, ip: req.ip, details: { ...req.body, reference_no: result.reference_no } });
    res.status(201).json({ purchase: result, message: `Purchase ${result.reference_no} recorded.` });
  } catch (e) { next(e); }
});

module.exports = router;
