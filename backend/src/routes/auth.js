/** POST /api/auth/login  +  GET /api/auth/me  */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken, publicUser, authenticate } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();

/* ------------------------------ login ------------------------------ */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    logAudit({ user: null, action: 'LOGIN_FAILED', entity: 'auth', method: 'POST', endpoint: '/api/auth/login', status: 400, ip: req.ip, details: { reason: 'missing credentials' } });
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logAudit({ user: null, action: 'LOGIN_FAILED', entity: 'auth', method: 'POST', endpoint: '/api/auth/login', status: 401, ip: req.ip, details: { email } });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (!user.active) {
    logAudit({ user, action: 'LOGIN_BLOCKED', entity: 'auth', method: 'POST', endpoint: '/api/auth/login', status: 403, ip: req.ip });
    return res.status(403).json({ error: 'This account has been deactivated. Contact the administrator.' });
  }

  logAudit({ user, action: 'LOGIN_SUCCESS', entity: 'auth', entityId: user.id, method: 'POST', endpoint: '/api/auth/login', status: 200, ip: req.ip });
  res.json({ token: signToken(user), user: publicUser(user) });
});

/* ------------------------------- me -------------------------------- */
router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
