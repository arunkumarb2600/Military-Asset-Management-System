/**
 * EXPENDITURES  (assets consumed / written off, usually against an assignment)
 *   GET  /api/expenditures          list + filters
 *   GET  /api/expenditures/summary  count / units / top reasons
 *   POST /api/expenditures          record an expenditure
 *
 * RBAC: admin | commander only.
 * If the expenditure is linked to an assignment, the assignment quantity is
 * decremented and it is closed as 'expended' once everything is consumed.
 */
const express = require('express');
const { db, postLedger, currentBalance } = require('../db');
const { authenticate, requireRole, effectiveBaseId, assertBaseAllowed } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const REASONS = ['Fired in training', 'Operational use', 'Damage / write-off', 'Lost / missing', 'Maintenance consumption', 'Other'];

const SELECT_EXPENDITURE = `
  SELECT x.*, b.name AS base, b.code AS baseCode,
         e.name AS equipment, e.code AS equipmentCode, e.category, e.unit,
         a.reference_no AS assignment_ref, a.personnel_name AS assigned_to,
         COALESCE(u.name,'system') AS created_by_name
    FROM expenditures x
    JOIN bases b           ON b.id = x.base_id
    JOIN equipment_types e ON e.id = x.equipment_type_id
    LEFT JOIN assignments a ON a.id = x.assignment_id
    LEFT JOIN users u      ON u.id = x.created_by`;

function filters(req) {
  const scope = effectiveBaseId(req);
  const where = [];
  const params = [];
  if (scope) { where.push('x.base_id = ?'); params.push(scope); }
  else if (req.query.baseId) { where.push('x.base_id = ?'); params.push(Number(req.query.baseId)); }
  if (req.query.equipmentTypeId) { where.push('x.equipment_type_id = ?'); params.push(Number(req.query.equipmentTypeId)); }
  if (req.query.reason) { where.push('x.reason = ?'); params.push(String(req.query.reason)); }
  if (req.query.from) { where.push('x.expended_date >= ?'); params.push(String(req.query.from)); }
  if (req.query.to) { where.push('x.expended_date <= ?'); params.push(String(req.query.to)); }
  if (req.query.q) { where.push('(x.personnel_name LIKE ? OR x.reference_no LIKE ? OR x.remarks LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

router.get('/', (req, res) => {
  const f = filters(req);
  res.json({
    expenditures: db.prepare(`${SELECT_EXPENDITURE} ${f.clause} ORDER BY x.expended_date DESC, x.id DESC LIMIT 500`).all(...f.params),
    reasons: REASONS
  });
});

router.get('/summary', (req, res) => {
  const f = filters(req);
  const totals = db
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(x.quantity),0) AS units FROM expenditures x ${f.clause}`)
    .get(...f.params);
  const byReason = db
    .prepare(`SELECT x.reason, COALESCE(SUM(x.quantity),0) AS units FROM expenditures x ${f.clause} GROUP BY x.reason ORDER BY units DESC`)
    .all(...f.params);
  res.json({ summary: { ...totals, byReason } });
});

/* ------------------------------ create ----------------------------- */
const create = db.transaction((user, body) => {
  const baseId = Number(body.baseId);
  const equipmentTypeId = Number(body.equipmentTypeId);
  const quantity = Number(body.quantity);
  const expendedDate = String(body.expendedDate || '').slice(0, 10);
  const assignmentId = body.assignmentId ? Number(body.assignmentId) : null;

  if (!baseId || !equipmentTypeId) throw Object.assign(new Error('Base and equipment type are required.'), { status: 400 });
  if (!body.reason) throw Object.assign(new Error('A reason is required for every expenditure.'), { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('Quantity must be a whole number greater than zero.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expendedDate)) throw Object.assign(new Error('Expenditure date is required (YYYY-MM-DD).'), { status: 400 });

  assertBaseAllowed({ user }, baseId);

  // Validate the linked assignment (same base, same equipment, enough left)
  if (assignmentId) {
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
    if (!a) throw Object.assign(new Error('Linked assignment not found.'), { status: 400 });
    if (a.base_id !== baseId) throw Object.assign(new Error('Linked assignment belongs to a different base.'), { status: 400 });
    if (a.equipment_type_id !== equipmentTypeId) throw Object.assign(new Error('Linked assignment is for different equipment.'), { status: 400 });
    if (a.status !== 'active') throw Object.assign(new Error('Linked assignment is already closed.'), { status: 400 });
    const used = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM expenditures WHERE assignment_id = ?').get(assignmentId).q;
    if (used + quantity > a.quantity) {
      throw Object.assign(new Error(`Only ${a.quantity - used} unit(s) remain on assignment ${a.reference_no}.`), { status: 400 });
    }
  }

  const next = db.prepare('SELECT COUNT(*) AS n FROM expenditures').get().n + 1;
  const referenceNo = `EXP-${String(next).padStart(4, '0')}`;

  const info = db
    .prepare(
      `INSERT INTO expenditures
        (reference_no, base_id, equipment_type_id, assignment_id, quantity, personnel_name, expended_date, reason, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(referenceNo, baseId, equipmentTypeId, assignmentId, quantity,
         body.personnelName || null, expendedDate, body.reason, body.remarks || null, user.id);

  const id = Number(info.lastInsertRowid);

  // Stock rule (see schema header):
  //  - linked to an assignment -> the stock already left the base when the
  //    assignment was issued, so NO second ledger line is written.
  //  - not linked             -> a direct write-off of base-held stock, so a
  //    negative EXPENDITURE line IS written.
  let ledger = { ledgerId: null, balanceAfter: null };
  if (assignmentId) {
    const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
    const used = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM expenditures WHERE assignment_id = ?').get(assignmentId).q;
    if (used >= a.quantity) {
      db.prepare(`UPDATE assignments SET status='expended' WHERE id = ?`).run(assignmentId);
    }
  } else {
    const available = currentBalance(baseId, equipmentTypeId);
    if (quantity > available) {
      throw Object.assign(new Error(`Insufficient stock: only ${available} unit(s) held at this base.`), { status: 400 });
    }
    ledger = postLedger({
      baseId, equipmentTypeId, txType: 'EXPENDITURE', qty: quantity, direction: -1,
      refTable: 'expenditures', refId: id, refNo: referenceNo, txnDate: expendedDate,
      remarks: `${body.reason} (direct write-off)${body.remarks ? ' - ' + body.remarks : ''}`,
      createdBy: user.id
    });
  }

  return { id, reference_no: referenceNo, balanceAfter: ledger.balanceAfter, stockImpact: assignmentId ? 'assignment' : 'base' };
});

router.post('/', requireRole('admin', 'commander'), (req, res, next) => {
  try {
    const result = create(req.user, req.body || {});
    logAudit({ user: req.user, action: 'EXPENDITURE_RECORDED', entity: 'expenditure', entityId: result.id, method: 'POST', endpoint: '/api/expenditures', status: 201, ip: req.ip, details: { ...req.body, reference_no: result.reference_no } });
    res.status(201).json({ expenditure: result, message: `Expenditure ${result.reference_no} recorded.` });
  } catch (e) { next(e); }
});

module.exports = router;
