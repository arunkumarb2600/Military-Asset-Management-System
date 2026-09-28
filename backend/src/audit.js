/**
 * API / transaction audit logging.
 *
 * Every meaningful event is appended to `audit_logs`:
 *   - successful business transactions (purchase created, transfer received...)
 *   - record updates and deletes
 *   - authentication events (login success/failure, bad token)
 *   - RBAC denials
 *   - GET requests to sensitive read endpoints (audit trail / users)
 *
 * Logging never throws: an audit failure must not break a business call.
 */
const { db } = require('./db');

const SENSITIVE = new Set(['password', 'password_hash', 'token', 'jwt', 'secret']);

/** Strip secrets before anything is written to the log. */
function sanitise(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitise);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.has(k.toLowerCase())) continue;
    out[k] = v && typeof v === 'object' ? sanitise(v) : v;
  }
  return out;
}

function logAudit({ user, action, entity, entityId = null, method = null, endpoint = null, status = 200, details = null, ip = null }) {
  try {
    db.prepare(
      `INSERT INTO audit_logs
        (user_id, username, role, action, entity, entity_id, method, endpoint, status_code, details, ip_address)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      user ? user.id : null,
      user ? user.email : null,
      user ? user.role : null,
      action,
      entity,
      entityId,
      method,
      endpoint,
      status,
      details ? JSON.stringify(sanitise(details)) : null,
      ip
    );
  } catch (e) {
    console.error('[audit] failed to write audit log:', e.message);
  }
}

/**
 * Express middleware: logs the request AFTER the response is sent so the
 * real status code is captured. Mount it globally.
 */
function auditMiddleware(req, res, next) {
  res.on('finish', () => {
    // Only record state-changing calls and sensitive reads.
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const sensitiveRead =
      req.method === 'GET' && /\/(audit|users)/.test(req.originalUrl);
    if (!mutating && !sensitiveRead) return;

    let body = req.body && Object.keys(req.body).length ? sanitise(req.body) : null;
    // Keep the log compact: don't duplicate large lists.
    if (body && JSON.stringify(body).length > 2000) body = { _truncated: true };

    logAudit({
      user: req.user || null,
      action: `${req.method} ${mutating ? 'TRANSACTION' : 'READ'}`,
      entity: entityFromUrl(req.originalUrl),
      method: req.method,
      endpoint: req.originalUrl,
      status: res.statusCode,
      details: body,
      ip: req.ip
    });
  });
  next();
}

function entityFromUrl(url) {
  const m = url.match(/^\/api\/([a-z-]+)/i);
  return m ? m[1] : 'system';
}

module.exports = { logAudit, auditMiddleware, sanitise };
