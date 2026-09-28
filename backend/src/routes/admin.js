/**
 * ADMIN AREA  (admin role only)
 *   GET    /api/admin/users
 *   POST   /api/admin/users
 *   PATCH  /api/admin/users/:id        update role / base / active
 *   DELETE /api/admin/users/:id
 *   GET    /api/admin/audit            audit log with filters
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticate, requireRole, publicUser } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

/* ------------------------------ users ------------------------------ */
router.get('/users', (req, res) => {
  // Columns are listed explicitly - never SELECT * - so password_hash can
  // never leave the server.
  res.json({
    users: db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.base_id, u.rank, u.active, u.created_at,
                b.name AS base_name, b.code AS base_code
           FROM users u LEFT JOIN bases b ON b.id = u.base_id
          ORDER BY u.role, u.name`
      )
      .all()
  });
});

const createUser = db.transaction((actor, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '').trim();
  const baseId = body.baseId ? Number(body.baseId) : null;

  if (!body.name || !String(body.name).trim()) throw Object.assign(new Error('Name is required.'), { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('A valid email address is required.'), { status: 400 });
  if (!/^(admin|commander|logistics)$/.test(role)) throw Object.assign(new Error('Role must be admin, commander or logistics.'), { status: 400 });
  if (!body.password || String(body.password).length < 6) throw Object.assign(new Error('Password must be at least 6 characters.'), { status: 400 });
  if (role !== 'admin' && !baseId) throw Object.assign(new Error('A commander or logistics officer must be attached to a base.'), { status: 400 });
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email)) throw Object.assign(new Error('That email is already registered.'), { status: 409 });

  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role, base_id, rank) VALUES (?,?,?,?,?,?)')
    .run(String(body.name).trim(), email, bcrypt.hashSync(String(body.password), 10), role, role === 'admin' ? null : baseId, body.rank || null);

  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)));
});

router.post('/users', (req, res, next) => {
  try {
    const user = createUser(req.user, req.body || {});
    logAudit({ user: req.user, action: 'USER_CREATED', entity: 'user', entityId: user.id, method: 'POST', endpoint: '/api/admin/users', status: 201, ip: req.ip, details: { email: user.email, role: user.role, baseId: user.baseId } });
    res.status(201).json({ user, message: `User ${user.email} created.` });
  } catch (e) { next(e); }
});

router.patch('/users/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    const body = req.body || {};
    const role = body.role ?? existing.role;
    const baseId = body.baseId === undefined ? existing.base_id : (body.baseId ? Number(body.baseId) : null);
    const active = body.active === undefined ? existing.active : (body.active ? 1 : 0);

    if (!/^(admin|commander|logistics)$/.test(role)) throw Object.assign(new Error('Invalid role.'), { status: 400 });
    if (role !== 'admin' && !baseId) throw Object.assign(new Error('A commander or logistics officer must be attached to a base.'), { status: 400 });
    if (existing.id === req.user.id && active === 0) throw Object.assign(new Error('You cannot deactivate your own account.'), { status: 400 });
    if (existing.id === req.user.id && role !== 'admin') throw Object.assign(new Error('You cannot remove your own admin role.'), { status: 400 });

    db.prepare('UPDATE users SET role=?, base_id=?, active=?, rank=COALESCE(?, rank) WHERE id=?')
      .run(role, role === 'admin' ? null : baseId, active, body.rank || null, id);

    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    logAudit({ user: req.user, action: 'USER_UPDATED', entity: 'user', entityId: id, method: 'PATCH', endpoint: `/api/admin/users/${id}`, status: 200, ip: req.ip, details: { role, baseId, active } });
    res.json({ user, message: `User ${user.email} updated.` });
  } catch (e) { next(e); }
});

router.delete('/users/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) throw Object.assign(new Error('You cannot delete your own account.'), { status: 400 });
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'User not found.' });
    if (db.prepare('SELECT COUNT(*) AS n FROM users WHERE role=? AND active=1').get('admin').n <= 1 && existing.role === 'admin') {
      throw Object.assign(new Error('At least one active administrator must remain.'), { status: 400 });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logAudit({ user: req.user, action: 'USER_DELETED', entity: 'user', entityId: id, method: 'DELETE', endpoint: `/api/admin/users/${id}`, status: 200, ip: req.ip, details: { email: existing.email } });
    res.json({ message: `User ${existing.email} deleted.` });
  } catch (e) { next(e); }
});

/* ------------------------------ audit ------------------------------ */
router.get('/audit', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`%${req.query.action}%`); }
  if (req.query.entity) { where.push('a.entity = ?'); params.push(String(req.query.entity)); }
  if (req.query.userId) { where.push('a.user_id = ?'); params.push(Number(req.query.userId)); }
  if (req.query.from) { where.push('date(a.created_at) >= ?'); params.push(String(req.query.from)); }
  if (req.query.to) { where.push('date(a.created_at) <= ?'); params.push(String(req.query.to)); }
  if (req.query.q) { where.push('(a.username LIKE ? OR a.endpoint LIKE ? OR a.details LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(req.query.limit) || 200, 1000);

  res.json({
    logs: db.prepare(`SELECT a.* FROM audit_logs a ${clause} ORDER BY a.id DESC LIMIT ?`).all(...params, limit),
    total: db.prepare(`SELECT COUNT(*) AS n FROM audit_logs a ${clause}`).get(...params).n
  });
});

module.exports = router;
