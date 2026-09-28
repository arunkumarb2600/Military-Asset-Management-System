/**
 * Authentication + Role Based Access Control.
 *
 * RBAC model
 *  ----------
 *  role        base scope        purchases  transfers  assignments  expenditures  users  audit
 *  ---------   --------------    ---------  ---------  -----------  ------------  -----  -----
 *  admin       ALL bases         CRUD       CRUD       CRUD         CRUD          CRUD   read
 *  commander   own base only     create     create     create        create        read   read
 *  logistics   own base only     CRUD       CRUD       -             -             -      read
 *
 *  Enforcement happens in two layers:
 *   1. `requireRole(...)`  - coarse gate on the route (is this role allowed here?)
 *   2. `scopeToBase`       - row-level gate: a commander/logistics user can only
 *                            ever read or write rows belonging to their own base.
 */
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { logAudit } = require('./audit');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const ROLES = { ADMIN: 'admin', COMMANDER: 'commander', LOGISTICS: 'logistics' };

/* ----------------------------- helpers ----------------------------- */

/** Sign a session token for a user row. */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, base_id: user.base_id, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(u) {
  if (!u) return null;
  const base = u.base_id ? db.prepare('SELECT id, code, name FROM bases WHERE id = ?').get(u.base_id) : null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    rank: u.rank,
    baseId: u.base_id,
    base: base ? base.name : null,
    baseCode: base ? base.code : null
  };
}

/* ----------------------- 1. authenticate --------------------------- */
/** Verifies the Bearer token and attaches the fresh user row to req.user. */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    logAudit({ user: null, action: 'UNAUTHENTICATED', entity: 'auth', method: req.method, endpoint: req.originalUrl, status: 401, ip: req.ip });
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.sub);
    if (!user) throw new Error('user inactive or deleted');
    req.user = user;
    next();
  } catch (e) {
    logAudit({ user: null, action: 'INVALID_TOKEN', entity: 'auth', method: req.method, endpoint: req.originalUrl, status: 401, ip: req.ip, details: { error: e.message } });
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

/* --------------------- 2. coarse role gate ------------------------- */
/** requireRole('admin') / requireRole('admin','commander') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      logAudit({ user: req.user, action: 'ACCESS_DENIED', entity: 'rbac', method: req.method, endpoint: req.originalUrl, status: 403, ip: req.ip, details: { required: roles, actual: req.user.role } });
      return res.status(403).json({
        error: `Access denied: your role (${req.user.role}) cannot perform this action.`
      });
    }
    next();
  };
}

/* --------------------- 3. row-level base scope --------------------- */
/**
 * Returns the base id a non-admin user is locked to, or `null` for admin
 * (meaning "all bases").  Callers use it to add a WHERE base_id = ? filter
 * so a commander can never see or touch another commander's stock.
 */
function effectiveBaseId(req) {
  if (req.user.role === ROLES.ADMIN) return null;
  return req.user.base_id;
}

/**
 * Rejects a write that targets a base the user does not own.
 * Admins may write to any base.
 */
function assertBaseAllowed(req, baseId) {
  if (req.user.role === ROLES.ADMIN) return;
  if (Number(baseId) !== Number(req.user.base_id)) {
    const err = new Error('You can only manage assets for your assigned base.');
    err.status = 403;
    throw err;
  }
}

module.exports = { ROLES, signToken, publicUser, authenticate, requireRole, effectiveBaseId, assertBaseAllowed };
