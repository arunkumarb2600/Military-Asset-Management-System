/**
 * DASHBOARD  -  the single source of truth for the movement maths.
 *
 * Every figure is derived from the append-only `stock_ledger` table, so the
 * cards can never disagree with the transaction pages.
 *
 *   Opening Balance  = sum of all movements dated BEFORE `from`
 *   Closing Balance  = Opening + Purchases + Transfer In
 *                             - Transfer Out - Assigned - Direct Write-offs
 *   Net Movement     = Purchases + Transfer In - Transfer Out
 *   Expended         = total consumption in the period, read from the
 *                      `expenditures` document table.  Expenditure booked
 *                      against an assignment happened OFF base, so it is a
 *                      reporting figure and is deliberately NOT part of the
 *                      closing-balance arithmetic (see schema.sql).
 *
 * RBAC: a commander / logistics officer is silently scoped to their own base.
 */
const express = require('express');
const { db } = require('../db');
const { authenticate, effectiveBaseId } = require('../auth');

const router = express.Router();
router.use(authenticate);

/** Build the shared WHERE fragments from the ?from&to&baseId&equipmentTypeId filters. */
function buildFilter(req) {
  const scopeBase = effectiveBaseId(req);        // null => admin sees everything
  const baseId = scopeBase ?? (req.query.baseId ? Number(req.query.baseId) : null);
  const equipmentTypeId = req.query.equipmentTypeId ? Number(req.query.equipmentTypeId) : null;
  const from = req.query.from || '0000-01-01';   // inclusive
  const to = req.query.to || '9999-12-31';       // inclusive

  const where = [];
  const params = [];
  if (baseId) { where.push('l.base_id = ?'); params.push(baseId); }
  if (equipmentTypeId) { where.push('l.equipment_type_id = ?'); params.push(equipmentTypeId); }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params, from, to, baseId, equipmentTypeId };
}

/* ----------------------- 1. KPI summary ---------------------------- */
router.get('/summary', (req, res) => {
  const { where, params, from, to } = buildFilter(req);

  const totals = db
    .prepare(
      `SELECT
         -- opening = everything dated before the window start, PLUS any
         -- day-one OPENING line that happens to sit inside the window
         -- (otherwise the identity would not close for windows that start
         -- after the stock take).
         COALESCE(SUM(CASE WHEN l.txn_date <  ? THEN l.qty * l.direction END), 0)
       + COALESCE(SUM(CASE WHEN l.tx_type = 'OPENING' AND l.txn_date >= ? AND l.txn_date <= ?
                        THEN l.qty * l.direction END), 0) AS opening,
         COALESCE(SUM(CASE WHEN l.txn_date <= ? THEN l.qty * l.direction END), 0) AS closing,
         COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type = 'PURCHASE'    THEN l.qty END), 0) AS purchases,
         COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type = 'TRANSFER_IN' THEN l.qty END), 0) AS transferIn,
         COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type = 'TRANSFER_OUT' THEN l.qty END), 0) AS transferOut,
         COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type = 'ASSIGNMENT'   THEN l.qty END), 0) AS assigned,
         COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type = 'EXPENDITURE'  THEN l.qty END), 0) AS writeOffs
       FROM stock_ledger l ${where}`
    )
    .get(from, from, to, to, from, to, from, to, from, to, from, to, from, to, ...params);

  const netMovement = totals.purchases + totals.transferIn - totals.transferOut;

  // Expended is a document-level figure (includes off-base consumption
  // against assignments), so it is queried from `expenditures` directly.
  const expWhere = where ? where.replace(/\bl\./g, 'x.') : '';
  const expended = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN x.expended_date BETWEEN ? AND ? THEN x.quantity END), 0) AS total,
              COUNT(CASE WHEN x.expended_date BETWEEN ? AND ? THEN 1 END) AS entries
         FROM expenditures x ${expWhere}`
    )
    .get(from, to, from, to, ...params).total;

  // Closing stock grouped by equipment type (for the breakdown table)
  const byEquipment = db
    .prepare(
      `SELECT e.id AS equipmentTypeId, e.code, e.name, e.category, e.unit,
              COALESCE(SUM(CASE WHEN l.txn_date <  ? THEN l.qty * l.direction END), 0)
            + COALESCE(SUM(CASE WHEN l.tx_type = 'OPENING' AND l.txn_date >= ? AND l.txn_date <= ?
                             THEN l.qty * l.direction END), 0) AS opening,
              COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type='PURCHASE'    THEN l.qty END), 0) AS purchases,
              COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type='TRANSFER_IN' THEN l.qty END), 0) AS transferIn,
              COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type='TRANSFER_OUT' THEN l.qty END), 0) AS transferOut,
              COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type='ASSIGNMENT'   THEN l.qty END), 0) AS assigned,
              COALESCE(SUM(CASE WHEN l.txn_date BETWEEN ? AND ? AND l.tx_type='EXPENDITURE'  THEN l.qty END), 0) AS writeOffs,
              COALESCE(SUM(CASE WHEN l.txn_date <= ? THEN l.qty * l.direction END), 0) AS closing
         FROM stock_ledger l
         JOIN equipment_types e ON e.id = l.equipment_type_id
         ${where}
        GROUP BY e.id
        ORDER BY e.category, e.name`
    )
    .all(from, from, to, from, to, from, to, from, to, from, to, from, to, to, ...params)
    .map((r) => ({ ...r, netMovement: r.purchases + r.transferIn - r.transferOut }));

  // Closing stock grouped by base (admin view)
  const byBase = db
    .prepare(
      `SELECT b.id AS baseId, b.code, b.name,
              COALESCE(SUM(CASE WHEN l.txn_date <  ? THEN l.qty * l.direction END), 0)
            + COALESCE(SUM(CASE WHEN l.tx_type = 'OPENING' AND l.txn_date >= ? AND l.txn_date <= ?
                             THEN l.qty * l.direction END), 0) AS opening,
              COALESCE(SUM(CASE WHEN l.txn_date <= ? THEN l.qty * l.direction END), 0) AS closing
         FROM stock_ledger l
         JOIN bases b ON b.id = l.base_id
         ${where}
        GROUP BY b.id
        ORDER BY b.name`
    )
    .all(from, from, to, to, ...params);

  res.json({
    filters: { from: from === '0000-01-01' ? null : from, to: to === '9999-12-31' ? null : to, baseId: buildFilter(req).baseId, equipmentTypeId: buildFilter(req).equipmentTypeId },
    formula: 'Opening + Purchases + Transfer In - Transfer Out - Assigned - Direct Write-offs = Closing   |   Net Movement = Purchases + Transfer In - Transfer Out',
    summary: {
      openingBalance: totals.opening,
      closingBalance: totals.closing,
      purchases: totals.purchases,
      transferIn: totals.transferIn,
      transferOut: totals.transferOut,
      assigned: totals.assigned,
      writeOffs: totals.writeOffs,
      expended,
      netMovement
    },
    byEquipment,
    byBase
  });
});

/* -------------- 2. Net Movement drill-down (pop-up) --------------- */
router.get('/net-movement', (req, res) => {
  const { where, params, from, to } = buildFilter(req);
  const range = 'l.txn_date BETWEEN ? AND ?';

  const rows = db
    .prepare(
      `SELECT l.id AS id, l.tx_type, l.qty, l.direction, l.txn_date, l.ref_no, l.remarks,
              b.name AS base, e.name AS equipment, e.unit,
              COALESCE(u.name, 'system') AS created_by_name
         FROM stock_ledger l
         JOIN bases b            ON b.id = l.base_id
         JOIN equipment_types e  ON e.id = l.equipment_type_id
         LEFT JOIN users u       ON u.id = l.created_by
         ${where ? where + ' AND' : 'WHERE'} ${range} AND l.tx_type IN ('PURCHASE','TRANSFER_IN','TRANSFER_OUT')
        ORDER BY l.txn_date DESC, l.id DESC`
    )
    .all(from, to, ...params);

  const group = (type) =>
    rows
      .filter((r) => r.tx_type === type)
      // `amount` is always a positive unit count; the sign is carried by
      // `direction` so the UI can render Transfer Out with a minus sign.
      .map((r) => ({ ...r, amount: r.qty }));

  const purchases = group('PURCHASE');
  const transferIn = group('TRANSFER_IN');
  const transferOut = group('TRANSFER_OUT');

  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
  const p = sum(purchases), ti = sum(transferIn), to_ = sum(transferOut);

  res.json({
    summary: {
      purchases: p,
      transferIn: ti,
      transferOut: to_,
      netMovement: p + ti - to_
    },
    purchases, transferIn, transferOut
  });
});

/* -------------- 3. Current stock (per base x equipment) ------------ */
router.get('/balances', (req, res) => {
  const scope = effectiveBaseId(req);
  const baseId = scope ?? (req.query.baseId ? Number(req.query.baseId) : null);
  const equipmentTypeId = req.query.equipmentTypeId ? Number(req.query.equipmentTypeId) : null;

  const where = [];
  const params = [];
  if (baseId) { where.push('l.base_id = ?'); params.push(baseId); }
  if (equipmentTypeId) { where.push('l.equipment_type_id = ?'); params.push(equipmentTypeId); }

  const rows = db
    .prepare(
      `SELECT b.id AS baseId, b.code AS baseCode, b.name AS baseName,
              e.id AS equipmentTypeId, e.code AS equipmentCode, e.name AS equipmentName,
              e.category, e.unit,
              COALESCE(SUM(l.qty * l.direction), 0) AS closingBalance
         FROM stock_ledger l
         JOIN bases b           ON b.id = l.base_id
         JOIN equipment_types e ON e.id = l.equipment_type_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        GROUP BY b.id, e.id
        HAVING closingBalance <> 0
        ORDER BY b.name, e.category, e.name`
    )
    .all(...params);

  res.json({ balances: rows });
});

/* -------------- 4. Movement history (full ledger) ------------------ */
router.get('/movements', (req, res) => {
  const { where, params, from, to } = buildFilter(req);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db
    .prepare(
      `SELECT l.*, b.name AS base, e.name AS equipment, e.code AS equipmentCode, e.unit
         FROM stock_ledger l
         JOIN bases b           ON b.id = l.base_id
         JOIN equipment_types e ON e.id = l.equipment_type_id
         ${where ? where + ' AND' : 'WHERE'} l.txn_date BETWEEN ? AND ?
        ORDER BY l.txn_date DESC, l.id DESC
        LIMIT ?`
    )
    .all(from, to, ...params, limit);
  res.json({ movements: rows });
});

module.exports = router;
