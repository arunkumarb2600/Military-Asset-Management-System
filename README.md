# Military Asset Management System (MAMS)

A web application for tracking the movement, assignment and expenditure of military
assets (vehicles, weapons, ammunition) across multiple bases — built for
transparency, streamlined logistics and accountability.

**Stack:** React 18 (Vite) · Node.js + Express · SQLite · JWT + bcrypt
**Tests:** 77/77 API tests · 39/39 headless-browser tests

---

## What it does

| Requirement | Where |
|---|---|
| Opening Balance, Closing Balance, Net Movement (Purchases + Transfers In − Transfers Out) | Dashboard KPI cards |
| Assigned and Expended asset tracking | Dashboard + Assignments page |
| Recording purchases for a specific base | Purchases page |
| Transfers between bases with full history and timestamps | Transfers page |
| Assignments to personnel and expended assets | Assignments & Expenditures page |
| Role-based access control (Admin / Base Commander / Logistics Officer) | Server middleware + scoped UI |
| API logging of all transactions | `audit_logs` table + Audit Log page |
| **Bonus** — click "Net Movement" for a Purchases / Transfer In / Transfer Out pop-up | Dashboard |
| **Bonus** — fully responsive, works on phone and desktop | All pages |

### The accounting identity

```
Closing Balance = Opening + Purchases + Transfer In
                  − Transfer Out − Assigned − Direct Write-offs

Net Movement    = Purchases + Transfer In − Transfer Out
```

Every figure on the dashboard is derived from one append-only `stock_ledger`
table, so the cards can never disagree with the transaction pages. This identity
is asserted automatically in the test suite.

---

## Quick start (2 terminals)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start
```

The database file is created and seeded automatically on first run.
API is now on **http://localhost:4000** — check `http://localhost:4000/api/health`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to port 4000, so no CORS
setup is needed in development.

### Login credentials

All demo accounts use the password **`Password123`**

| Role | Email | Scope |
|---|---|---|
| Admin | `admin@mams.mil` | All 4 bases, everything |
| Base Commander | `commander.kabul@mams.mil` | Fort Kabul only |
| Base Commander | `commander.kandahar@mams.mil` | Camp Vance only |
| Base Commander | `commander.khost@mams.mil` | Fob Khost only |
| Logistics Officer | `logistics.kabul@mams.mil` | Fort Kabul, purchases + transfers |
| Logistics Officer | `logistics.kandahar@mams.mil` | Camp Vance, purchases + transfers |

The login screen lists these with one-click fill.

---

## Useful commands

| Command | Where | What it does |
|---|---|---|
| `npm start` | backend | Run the API |
| `npm run dev` | backend | Run with auto-restart on change |
| `npm run seed` | backend | Seed demo data (no-op if data exists) |
| `npm run reset` | backend | Wipe everything and re-seed |
| `npm run dump` | backend | Write `deliverables/database/dump.sql` |
| `npm run smoke` | backend | Re-seeds the database, then runs 77 API + RBAC assertions |
| `npm run dev` | frontend | Vite dev server |
| `npm run build` | frontend | Production bundle in `dist/` |
| `node scripts/browser-check.js` | frontend | 39 real-browser UI assertions (needs Chrome) |
| `node scripts/screenshots.js` | frontend | Capture all screens to `deliverables/screenshots/` |

---

## Project layout

```
Military Asset Management System/
├── backend/
│   ├── database/schema.sql          # full annotated DDL
│   ├── database/military_assets.db  # created + seeded on first run
│   ├── src/
│   │   ├── server.js               # express app, routes, error handler
│   │   ├── db.js                   # connection, schema apply, ledger helpers
│   │   ├── auth.js                 # JWT + requireRole + base scoping
│   │   ├── audit.js                # audit middleware + secret sanitiser
│   │   ├── seed.js                 # demo data
│   │   ├── dump.js                 # SQL dump generator
│   │   └── routes/                 # auth, meta, dashboard, purchases,
│   │                              # transfers, assignments, expenditures, admin
│   └── scripts/smoke.js            # end-to-end API test
├── frontend/
│   ├── src/
│   │   ├── api.js                  # fetch wrapper, token handling
│   │   ├── auth.jsx                # session + permission context
│   │   ├── styles.css              # whole design system, no CSS framework
│   │   ├── components/             # Layout, UI primitives, reference data
│   │   └── pages/                  # Login, Dashboard, Purchases, Transfers,
│   │                              # Assignments, Users, AuditLog, NotFound
│   └── scripts/                    # browser-check.js, screenshots.js
├── deliverables/
│   ├── database/dump.sql           # SQL dump (schema + data)
│   ├── database/military_assets.db # database file
│   └── screenshots/                # 17 screenshots of every screen
├── docs/PROJECT_REPORT.html        # the PDF report source
└── render.yaml                     # Render deployment blueprint
```

---

## API reference

All routes are under `/api`. Everything except `POST /auth/login` and
`GET /health` needs `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/login` | public | `{email,password}` → `{token,user}` |
| `GET` | `/auth/me` | any | Current user profile |

### Reference data
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/meta/bases` | any | Bases — scoped to one base for non-admins |
| `GET` | `/meta/equipment-types` | any | Equipment catalogue |
| `GET` | `/meta/permissions` | any | What the current role may do |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard/summary?from&to&baseId&equipmentTypeId` | All KPI totals + per-equipment and per-base breakdown |
| `GET` | `/dashboard/net-movement?…` | **Pop-up** drill-down: individual purchase / transfer-in / transfer-out rows |
| `GET` | `/dashboard/balances?…` | Current stock per base × equipment |
| `GET` | `/dashboard/movements?…&limit=` | Ledger with running `balance_after` |

### Transactions
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/purchases?from&to&baseId&equipmentTypeId&q` | any | Purchase history |
| `GET` | `/purchases/summary?…` | any | Count, units, total value |
| `POST` | `/purchases` | admin, commander, logistics | Record a purchase |
| `GET` | `/transfers?…&status` | any | Transfer history (either side of the route) |
| `POST` | `/transfers` | admin, commander, logistics | Dispatch — stock leaves the sender |
| `POST` | `/transfers/:id/receive` | admin, commander, logistics | Confirm receipt — stock arrives |
| `POST` | `/transfers/:id/cancel` | admin, commander, logistics | Cancel in transit — stock returns |
| `GET` | `/assignments?…&status` | any | Assignment history |
| `POST` | `/assignments` | admin, commander | Issue assets to personnel |
| `POST` | `/assignments/:id/return` | admin, commander | Return the un-expended remainder to base |
| `GET` | `/expenditures?…&reason` | any | Expenditure history + reason list |
| `POST` | `/expenditures` | admin, commander | Record consumption or a write-off |

### Administration
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/admin/users` | admin | List users (never returns password hashes) |
| `POST` | `/admin/users` | admin | Create user |
| `PATCH` | `/admin/users/:id` | admin | Change role, base or active flag |
| `DELETE` | `/admin/users/:id` | admin | Delete user |
| `GET` | `/admin/audit?action&entity&from&to&q` | admin | Audit log with filters |

### Example

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mams.mil","password":"Password123"}' | jq -r .token)

curl -s "http://localhost:4000/api/dashboard/summary" -H "Authorization: Bearer $TOKEN" | jq .summary
```

---

## Deployment

### Backend → Render

`render.yaml` is a ready blueprint. Push to GitHub, then in Render choose
**New → Blueprint**, pick the repo, and set:

- `CORS_ORIGIN` → your deployed frontend URL
- `JWT_SECRET` → let Render generate it

### Frontend → Vercel / Netlify

```bash
cd frontend
VITE_API_URL=https://mams-api.onrender.com npm run build
```

- **Vercel** — `frontend/vercel.json` is included; set `VITE_API_URL` in the UI.
- **Netlify** — `frontend/netlify.toml` is included; base directory `frontend`,
  build `npm run build`, publish `dist`.

---

## Going to production

This build is deliberately simple. For real deployment:

1. **Persist the database.** SQLite is a file. On Render's free tier the disk is
   ephemeral, so data resets on a cold start. Attach a Persistent Disk and set
   `DB_FILE` to a path on it, or migrate the schema to PostgreSQL — only
   `backend/src/db.js` and the SQL in the routes would change.
2. **Rotate the secret.** Set a strong `JWT_SECRET`
   (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
3. **Rate-limit `/auth/login`** to slow brute-force attempts.
4. **Serve over HTTPS only** and terminate TLS at the platform.
5. **Add CSRF protection** if the API is ever called from a browser session
   rather than a bearer-token client.
