Military Asset Management System - Submission Package
====================================================

WHAT THIS PACKAGE CONTAINS
--------------------------
  README.md ................ Full documentation, API reference, setup, deployment
  render.yaml .............. Render deployment blueprint for the backend
  docs/ .................... Project report source (HTML)

  backend/ ................. Node.js + Express API
    database/schema.sql ..... Annotated database schema
    src/ .................... All application source code
    scripts/smoke.js ........ 77 automated API + RBAC tests
    package.json ............ Backend dependencies and npm scripts

  frontend/ ................ React 18 + Vite client
    src/ .................... All application source code
    scripts/browser-check.js  39 automated browser tests
    scripts/screenshots.js .. Screenshot generator
    vercel.json / netlify.toml ... Frontend deployment configs

  deliverables/
    Military-Asset-Management-System-Project-Report.pdf
                             The 31-page project report (all required sections)
    database/dump.sql ........ Full SQL dump: schema + demo data
    database/military_assets.db  Ready-to-run database file
    screenshots/ ............ 17 screenshots of every screen


HOW TO RUN FROM THIS PACKAGE
----------------------------
  Prerequisites: Node.js 20 or newer. Nothing else - no database server,
  no Docker, no Python.

  1. Open a terminal in the backend folder:

       cd backend
       npm install
       npm start

     The database is created and seeded automatically on first run.

  2. Open a second terminal in the frontend folder:

       cd frontend
       npm install
       npm run dev

  3. Open http://localhost:5173 and sign in with any account below.


LOGIN CREDENTIALS (password for all accounts: Password123)
----------------------------------------------------------
  admin@mams.mil                  Admin            - all bases, full access
  commander.kabul@mams.mil        Base Commander   - Fort Kabul only
  commander.kandahar.mams.mil     Base Commander   - Camp Vance only
  commander.khost@mams.mil        Base Commander   - Fob Khost only
  logistics.kabul@mams.mil        Logistics Officer- Fort Kabul, purchases + transfers
  logistics.kandahar.mams.mil     Logistics Officer- Camp Vance, purchases + transfers

  Note: .env files are intentionally not included. Copy .env.example to .env
  in each folder if you need to customise ports, the database path or the
  JWT secret.


RUNNING THE TESTS
-----------------
  Backend  (needs the API running on port 4000):
      cd backend
      npm run smoke                 -> expect: PASSED: 77    FAILED: 0
                                     (re-seeds the database first, so the test
                                      suite is safe to run repeatedly)

  Frontend (needs both servers running, and Google Chrome):
      cd frontend
      node scripts/browser-check.js -> expect: PASSED: 39    FAILED: 0


RESTORING THE DATABASE
----------------------
  Either let the application seed itself automatically (recommended), or:

      cd backend
      npm run reset                 # wipe and re-seed
      npm run dump                  # regenerate dump.sql

  To restore manually, copy deliverables/database/military_assets.db into
  backend/database/, or run:  sqlite3 military_assets.db < dump.sql


IMPORTANT NOTE ON DEPLOYMENT
---------------------------
  The included deployment configs deploy the app to a live URL, but the
  database is a single SQLite file. On a host with an ephemeral disk (such as
  Render's free tier) the database is reset and re-seeded on every cold start,
  so records created during a demo will not persist. For permanent storage,
  attach a persistent disk or migrate the schema to PostgreSQL. See the
  "Going to production" section of README.md.
