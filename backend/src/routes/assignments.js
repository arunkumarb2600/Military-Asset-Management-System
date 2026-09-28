/**
 * ASSIGNMENTS  (issues from a base to named personnel)
 *   GET  /api/assignments          list + filters
 *   GET  /api/assignments/summary  active / returned / expended totals
 *   POST /api/assignments          create  -> ASSIGNMENT leg (stock leaves the base)
 *   POST /api/assignments/:id/return  -> TRANSFER_IN leg (stock comes back to the base)
 *
 * RBAC: logistics officers are read-only here (admin | commander only).
 */
const express = require('express');
const { db, postLedger, currentBalance } = require('../db');
const { authenticate, requireRole, effectiveBaseId, assertBaseAllowed } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const SELECT_ASSIGNMENT = `
  SELECT a.*, b.name AS base, b.code AS baseCode,
         e.name AS equipment, e.code AS equipmentCode, e.category, e.unit,
         COALESCE(u.name,'system') AS created_by_name,
         (SELECT COALESCE(SUM(x.quantity),0) FROM expenditures x WHERE x.assignment_id = a.id) AS expended_qty
    FROM assignments a
    JOIN bases b           ON b.id = a.base_id
    JOIN equipment_types e ON e.id = a.equipment_type_id
    LEFT JOIN users u      ON u.id = a.created_by`;

function filters(req) {
  const scope = effectiveBaseId(req);
  const where = [];
  const params = [];
  if (scope) { where.push('a.base_id = ?'); params.push(scope); }
  else if (req.query.baseId) { where.push('a.base_id = ?'); params.push(Number(req.query.baseId)); }
  if (req.query.equipmentTypeId) { where.push('a.equipment_type_id = ?'); params.push(Number(req.query.equipmentTypeId)); }
  if (req.query.status) { where.push('a.status = ?'); params.push(String(req.query.status)); }
  if (req.query.from) { where.push('a.assigned_date >= ?'); params.push(String(req.query.from)); }
  if (req.query.to) { where.push('a.assigned_date <= ?'); params.push(String(req.query.to)); }
  if (req.query.q) { where.push('(a.personnel_name LIKE ? OR a.personnel_id LIKE ? OR a.reference_no LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

router.get('/', (req, res) => {
  const f = filters(req);
  res.json({ assignments: db.prepare(`${SELECT_ASSIGNMENT} ${f.clause} ORDER BY a.assigned_date DESC, a.id DESC LIMIT 500`).all(...f.params) });
});

router.get('/summary', (req, res) => {
  const f = filters(req);
  res.json({
    summary: db
      .prepare(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN status='active'    THEN quantity END),0) AS activeUnits,
                COALESCE(SUM(CASE WHEN status='returned'  THEN quantity END),0) AS returnedUnits,
                COALESCE(SUM(CASE WHEN status='expended'  THEN quantity END),0) AS expendedUnits
           FROM assignments a ${f.clause}`
      )
      .get(...f.params)
  });
});

/* ------------------------------ create ----------------------------- */
const create = db.transaction((user, body) => {
  const baseId = Number(body.baseId);
  const equipmentTypeId = Number(body.equipmentTypeId);
  const quantity = Number(body.quantity);
  const assignedDate = String(body.assignedDate || '').slice(0, 10);

  if (!baseId || !equipmentTypeId) throw Object.assign(new Error('Base and equipment type are required.'), { status: 400 });
  if (!body.personnelName || !String(body.personnelName).trim()) throw Object.assign(new Error('Personnel name is required.'), { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('Quantity must be a whole number greater than zero.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(assignedDate)) throw Object.assign(new Error('Assignment date is required (YYYY-MM-DD).'), { status: 400 });

  assertBaseAllowed({ user }, baseId);

  const available = currentBalance(baseId, equipmentTypeId);
  if (quantity > available) throw Object.assign(new Error(`Insufficient stock: only ${available} unit(s) available at this base.`), { status: 400 });

  const next = db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n + 1;
  const referenceNo = `ASN-${String(next).padStart(4, '0')}`;

  const info = db
    .prepare(
      `INSERT INTO assignments
        (reference_no, base_id, equipment_type_id, quantity, personnel_name, personnel_id,
         personnel_rank, assigned_date, due_date, status, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?, 'active', ?,?)`
    )
    .run(referenceNo, baseId, equipmentTypeId, quantity, String(body.personnelName).trim(),
         body.personnelId || null, body.personnelRank || null, assignedDate,
         body.dueDate || null, body.remarks || null, user.id);

  const id = Number(info.lastInsertRowid);
  const eq = db.prepare('SELECT name FROM equipment_types WHERE id = ?').get(equipmentTypeId);
  const ledger = postLedger({
    baseId, equipmentTypeId, txType: 'ASSIGNMENT', qty: quantity, direction: -1,
    refTable: 'assignments', refId: id, refNo: referenceNo, txnDate: assignedDate,
    remarks: `Issued to ${body.personnelName}${body.personnelRank ? ' (' + body.personnelRank + ')' : ''}`,
    createdBy: user.id
  });

  return { id, reference_no: referenceNo, equipment: eq.name, personnel: body.personnelName, balanceAfter: ledger.balanceAfter };
});

router.post('/', requireRole('admin', 'commander'), (req, res, next) => {
  try {
    const result = create(req.user, req.body || {});
    logAudit({ user: req.user, action: 'ASSIGNMENT_CREATED', entity: 'assignment', entityId: result.id, method: 'POST', endpoint: '/api/assignments', status: 201, ip: req.ip, details: { ...req.body, reference_no: result.reference_no } });
    res.status(201).json({ assignment: result, message: `Assignment ${result.reference_no} recorded for ${result.personnel}.` });
  } catch (e) { next(e); }
});

/* ------------------------------ return ----------------------------- */
/**
 * Returns whatever is still held on the assignment (assigned qty minus
 * anything already expended) back to base stock.  Spent quantity is not
 * returned because it no longer exists.
 */
const returnStock = db.transaction((user, id, returnedDate) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!a) throw Object.assign(new Error('Assignment not found.'), { status: 404 });
  if (a.status !== 'active') throw Object.assign(new Error(`Only an active assignment can be returned (this one is ${a.status}).`), { status: 400 });
  assertBaseAllowed({ user }, a.base_id);

  const spent = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM expenditures WHERE assignment_id = ?').get(id).q;
  const remaining = a.quantity - spent;
  if (remaining <= 0) {
    db.prepare(`UPDATE assignments SET status='expended' WHERE id = ?`).run(id);
    throw Object.assign(new Error('Nothing left to return - the whole assignment has been expended.'), { status: 400 });
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(returnedDate || '').slice(0, 10))
    ? String(returnedDate).slice(0, 10)
    : a.assigned_date;

  db.prepare(`UPDATE assignments SET status='returned' WHERE id = ?`).run(id);
  const ledger = postLedger({
    baseId: a.base_id, equipmentTypeId: a.equipment_type_id,
    txType: 'TRANSFER_IN', qty: remaining, direction: 1,
    refTable: 'assignments', refId: a.id, refNo: a.reference_no, txnDate: date,
    remarks: `Returned by ${a.personnel_name}${spent ? ` (${spent} unit(s) expended)` : ''}`,
    createdBy: user.id
  });
  return { id: a.id, reference_no: a.reference_no, returned: remaining, expended: spent, balanceAfter: ledger.balanceAfter };
});

router.post('/:id/return', requireRole('admin', 'commander'), (req, res, next) => {
  try {
    const result = returnStock(req.user, Number(req.params.id), (req.body || {}).returnedDate);
    logAudit({ user: req.user, action: 'ASSIGNMENT_RETURNED', entity: 'assignment', entityId: result.id, method: 'POST', endpoint: `/api/assignments/${req.params.id}/return`, status: 200, ip: req.ip, details: req.body });
    res.json({ assignment: result, message: `Assignment ${result.reference_no} closed - ${result.returned} unit(s) returned to base stock.` });
  } catch (e) { next(e); }
});

module.exports = router;
