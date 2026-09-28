/**
 * TRANSFERS  (movement of stock between bases)
 *   GET  /api/transfers          list + filters
 *   GET  /api/transfers/summary  in / out / in-transit totals
 *   POST /api/transfers          dispatch  -> TRANSFER_OUT leg on the sending base
 *   POST /api/transfers/:id/receive  -> TRANSFER_IN leg on the receiving base
 *   POST /api/transfers/:id/cancel   -> reversing TRANSFER_IN on the sending base
 *
 * Why two legs?  If a truck leaves Fort Kabul on the 3rd and arrives on the 9th,
 * the quantity must not be counted at both bases.  It leaves on dispatch
 * ("in transit") and only re-enters the ledger on receipt, which is exactly how
 * a physical stock take will reconcile.
 */
const express = require('express');
const { db, postLedger, currentBalance } = require('../db');
const { authenticate, requireRole, effectiveBaseId, assertBaseAllowed } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate);

const SELECT_TRANSFER = `
  SELECT t.*, fb.name AS from_base, fb.code AS from_base_code,
         tb.name AS to_base,   tb.code AS to_base_code,
         e.name AS equipment, e.code AS equipmentCode, e.category, e.unit,
         COALESCE(u.name, 'system') AS created_by_name
    FROM transfers t
    JOIN bases fb          ON fb.id = t.from_base_id
    JOIN bases tb          ON tb.id = t.to_base_id
    JOIN equipment_types e ON e.id  = t.equipment_type_id
    LEFT JOIN users u      ON u.id  = t.created_by`;

function filters(req) {
  const scope = effectiveBaseId(req);
  // A non-admin sees transfers where their base is EITHER side.
  const where = [];
  const params = [];
  if (scope) {
    where.push('(t.from_base_id = ? OR t.to_base_id = ?)');
    params.push(scope, scope);
  } else if (req.query.baseId) {
    const b = Number(req.query.baseId);
    where.push('(t.from_base_id = ? OR t.to_base_id = ?)');
    params.push(b, b);
  }
  if (req.query.equipmentTypeId) { where.push('t.equipment_type_id = ?'); params.push(Number(req.query.equipmentTypeId)); }
  if (req.query.status) { where.push('t.status = ?'); params.push(String(req.query.status)); }
  if (req.query.from) { where.push('t.transfer_date >= ?'); params.push(String(req.query.from)); }
  if (req.query.to) { where.push('t.transfer_date <= ?'); params.push(String(req.query.to)); }
  if (req.query.q) { where.push('(t.reference_no LIKE ? OR t.remarks LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }

  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

/* ------------------------------ list ------------------------------- */
router.get('/', (req, res) => {
  const f = filters(req);
  res.json({
    transfers: db.prepare(`${SELECT_TRANSFER} ${f.clause} ORDER BY t.transfer_date DESC, t.id DESC LIMIT 500`).all(...f.params)
  });
});

/* ----------------------------- summary ----------------------------- */
router.get('/summary', (req, res) => {
  const f = filters(req);
  const t = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status='dispatched' THEN quantity END),0) AS inTransitUnits,
              COALESCE(SUM(CASE WHEN status='received'  THEN quantity END),0) AS receivedUnits,
              COALESCE(SUM(CASE WHEN status='cancelled' THEN quantity END),0) AS cancelledUnits
         FROM transfers t ${f.clause}`
    )
    .get(...f.params);
  res.json({ summary: t });
});

/* ----------------------------- dispatch ---------------------------- */
const dispatch = db.transaction((user, body) => {
  const fromBaseId = Number(body.fromBaseId);
  const toBaseId = Number(body.toBaseId);
  const equipmentTypeId = Number(body.equipmentTypeId);
  const quantity = Number(body.quantity);
  const transferDate = String(body.transferDate || '').slice(0, 10);

  if (!fromBaseId || !toBaseId || !equipmentTypeId) throw Object.assign(new Error('From base, to base and equipment type are required.'), { status: 400 });
  if (fromBaseId === toBaseId) throw Object.assign(new Error('From base and to base must be different.'), { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('Quantity must be a whole number greater than zero.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) throw Object.assign(new Error('Transfer date is required (YYYY-MM-DD).'), { status: 400 });

  // A commander may only move stock OUT of their own base; they cannot pull
  // stock into it without the sending commander authorising it.
  assertBaseAllowed({ user }, fromBaseId);

  const available = currentBalance(fromBaseId, equipmentTypeId);
  if (quantity > available) {
    throw Object.assign(new Error(`Insufficient stock: only ${available} unit(s) available at the sending base.`), { status: 400 });
  }

  const next = db.prepare('SELECT COUNT(*) AS n FROM transfers').get().n + 1;
  const referenceNo = `TRF-${String(next).padStart(4, '0')}`;

  const info = db
    .prepare(
      `INSERT INTO transfers
        (reference_no, from_base_id, to_base_id, equipment_type_id, quantity, status, transfer_date, remarks, created_by)
       VALUES (?,?,?,?,?, 'dispatched', ?,?,?)`
    )
    .run(referenceNo, fromBaseId, toBaseId, equipmentTypeId, quantity, transferDate, body.remarks || null, user.id);

  const transferId = Number(info.lastInsertRowid);
  const eq = db.prepare('SELECT name FROM equipment_types WHERE id = ?').get(equipmentTypeId);
  const fb = db.prepare('SELECT name FROM bases WHERE id = ?').get(fromBaseId);
  const tb = db.prepare('SELECT name FROM bases WHERE id = ?').get(toBaseId);

  const ledger = postLedger({
    baseId: fromBaseId, equipmentTypeId,
    txType: 'TRANSFER_OUT', qty: quantity, direction: -1,
    refTable: 'transfers', refId: transferId, refNo: referenceNo,
    txnDate: transferDate,
    remarks: body.remarks || `Transfer to ${tb.name}`,
    createdBy: user.id
  });

  return { id: transferId, reference_no: referenceNo, from: fb.name, to: tb.name, equipment: eq.name, balanceAfter: ledger.balanceAfter };
});

router.post('/', requireRole('admin', 'commander', 'logistics'), (req, res, next) => {
  try {
    const result = dispatch(req.user, req.body || {});
    logAudit({ user: req.user, action: 'TRANSFER_DISPATCHED', entity: 'transfer', entityId: result.id, method: 'POST', endpoint: '/api/transfers', status: 201, ip: req.ip, details: { ...req.body, reference_no: result.reference_no } });
    res.status(201).json({ transfer: result, message: `Transfer ${result.reference_no} dispatched. Stock leaves the sending base now.` });
  } catch (e) { next(e); }
});

/* ------------------------------ receive ---------------------------- */
const receive = db.transaction((user, transferId, receivedDate) => {
  const t = db.prepare('SELECT * FROM transfers WHERE id = ?').get(transferId);
  if (!t) throw Object.assign(new Error('Transfer not found.'), { status: 404 });
  if (t.status !== 'dispatched') throw Object.assign(new Error(`Transfer is already ${t.status}.`), { status: 400 });

  // The receiving base authorises the receipt.
  assertBaseAllowed({ user }, t.to_base_id);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(receivedDate || '').slice(0, 10))
    ? String(receivedDate).slice(0, 10)
    : t.transfer_date;

  db.prepare(`UPDATE transfers SET status = 'received', received_date = ? WHERE id = ?`).run(date, transferId);

  const ledger = postLedger({
    baseId: t.to_base_id, equipmentTypeId: t.equipment_type_id,
    txType: 'TRANSFER_IN', qty: t.quantity, direction: 1,
    refTable: 'transfers', refId: t.id, refNo: t.reference_no,
    txnDate: date,
    remarks: `Received from transfer ${t.reference_no}`,
    createdBy: user.id
  });
  return { id: t.id, reference_no: t.reference_no, balanceAfter: ledger.balanceAfter };
});

router.post('/:id/receive', requireRole('admin', 'commander', 'logistics'), (req, res, next) => {
  try {
    const result = receive(req.user, Number(req.params.id), (req.body || {}).receivedDate);
    logAudit({ user: req.user, action: 'TRANSFER_RECEIVED', entity: 'transfer', entityId: result.id, method: 'POST', endpoint: `/api/transfers/${req.params.id}/receive`, status: 200, ip: req.ip, details: req.body });
    res.json({ transfer: result, message: `Transfer ${result.reference_no} received and added to stock.` });
  } catch (e) { next(e); }
});

/* ------------------------------ cancel ----------------------------- */
/** Cancelling returns the in-transit quantity to the sending base. */
const cancel = db.transaction((user, transferId, reason) => {
  const t = db.prepare('SELECT * FROM transfers WHERE id = ?').get(transferId);
  if (!t) throw Object.assign(new Error('Transfer not found.'), { status: 404 });
  if (t.status !== 'dispatched') throw Object.assign(new Error('Only a transfer that is still in transit can be cancelled.'), { status: 400 });
  assertBaseAllowed({ user }, t.from_base_id);

  const date = new Date().toISOString().slice(0, 10);
  db.prepare(`UPDATE transfers SET status = 'cancelled', remarks = COALESCE(remarks,'') || ? WHERE id = ?`)
    .run(` | CANCELLED: ${reason || 'no reason given'}`, transferId);

  const ledger = postLedger({
    baseId: t.from_base_id, equipmentTypeId: t.equipment_type_id,
    txType: 'TRANSFER_IN', qty: t.quantity, direction: 1,
    refTable: 'transfers', refId: t.id, refNo: t.reference_no,
    txnDate: date,
    remarks: `Reversal - transfer ${t.reference_no} cancelled in transit`,
    createdBy: user.id
  });
  return { id: t.id, reference_no: t.reference_no, balanceAfter: ledger.balanceAfter };
});

router.post('/:id/cancel', requireRole('admin', 'commander', 'logistics'), (req, res, next) => {
  try {
    const result = cancel(req.user, Number(req.params.id), (req.body || {}).reason);
    logAudit({ user: req.user, action: 'TRANSFER_CANCELLED', entity: 'transfer', entityId: result.id, method: 'POST', endpoint: `/api/transfers/${req.params.id}/cancel`, status: 200, ip: req.ip, details: req.body });
    res.json({ transfer: result, message: `Transfer ${result.reference_no} cancelled. Stock returned to the sending base.` });
  } catch (e) { next(e); }
});

module.exports = router;
