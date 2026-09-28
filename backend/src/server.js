/**
 * Military Asset Management System - API entry point.
 *
 *   PORT   : process.env.PORT (default 4000)
 *   DB     : backend/database/military_assets.db  (auto-created + seeded on first run)
 *   Stack  : Node.js + Express 4 + better-sqlite3 (SQLite) + JWT + bcrypt
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { DB_PATH } = require('./db');
const { ensureSeeded } = require('./seed');
const { auditMiddleware } = require('./audit');

const app = express();
const PORT = process.env.PORT || 4000;

/* --------------------------- global setup -------------------------- */
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(auditMiddleware);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', service: 'MAMS API', database: path.basename(DB_PATH), time: new Date().toISOString() })
);

/* ----------------------------- routes ------------------------------ */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/meta', require('./routes/meta'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/expenditures', require('./routes/expenditures'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

/* --------------------- error handler (logged too) ------------------ */
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  try {
    const { logAudit } = require('./audit');
    logAudit({ user: req.user || null, action: 'API_ERROR', entity: 'api', method: req.method, endpoint: req.originalUrl, status, ip: req.ip, details: { message: err.message } });
  } catch { /* logging must never mask the real error */ }
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : err.message });
});

/* ---------------------------- bootstrap --------------------------- */
if (require.main === module) {
  const created = ensureSeeded();
  if (created) console.log('Database seeded with demo data (first run).');
  app.listen(PORT, () => {
    console.log(`\n  MAMS API running  ->  http://localhost:${PORT}`);
    console.log(`  Database          ->  ${DB_PATH}`);
    console.log(`  Health check      ->  http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
