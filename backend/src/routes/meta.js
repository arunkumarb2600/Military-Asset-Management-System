/**
 * Reference data used to populate every filter dropdown in the UI.
 * Bases are filtered by RBAC: a commander / logistics officer only ever
 * receives their own base in the list.
 */
const express = require('express');
const { db } = require('../db');
const { authenticate, effectiveBaseId } = require('../auth');

const router = express.Router();
router.use(authenticate);

router.get('/bases', (req, res) => {
  const scope = effectiveBaseId(req);
  const rows = scope
    ? db.prepare('SELECT id, code, name, location, commander FROM bases WHERE id = ?').all(scope)
    : db.prepare('SELECT id, code, name, location, commander FROM bases ORDER BY name').all();
  res.json({ bases: rows });
});

router.get('/equipment-types', (req, res) => {
  res.json({
    equipmentTypes: db
      .prepare('SELECT id, code, name, category, unit FROM equipment_types ORDER BY category, name')
      .all()
  });
});

/** Lightweight permission map the frontend uses to hide/disable controls. */
router.get('/permissions', (req, res) => {
  const role = req.user.role;
  const can = {
    viewAllBases: role === 'admin',
    managePurchases: ['admin', 'commander', 'logistics'].includes(role),
    manageTransfers: ['admin', 'commander', 'logistics'].includes(role),
    manageAssignments: ['admin', 'commander'].includes(role),
    manageExpenditures: ['admin', 'commander'].includes(role),
    manageUsers: role === 'admin',
    viewAudit: true
  };
  res.json({ role, permissions: can });
});

module.exports = router;
