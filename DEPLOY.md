# Deploying MAMS to Vercel (+ Render for the API)

## The one thing to understand first

Your app is two separate programs:

| Part | What it is | Where it must run | Why |
|---|---|---|---|
| **Frontend** | React 18 + Vite, builds to static files | **Vercel** ✅ | Pure HTML/CSS/JS. Vercel is ideal. |
| **Backend** | Express + `better-sqlite3` (native C++ module) | **Render** ⚠️ | Vercel Functions run on AWS Lambda — no native modules, no persistent disk. SQLite cannot run there. |

So the final result is a **Vercel URL for the UI** pointing at a **Render URL for the API**.
This is the standard split for this stack, and it is why `render.yaml` is included.

Already prepared and verified for you:

- [x] Vercel CLI installed (v60.1.3)
- [x] Git repository initialised, 1 commit, 74 files, **no secrets or `node_modules`**
- [x] `.gitignore` written
- [x] `frontend/vercel.json` — Vite build, `dist` output, SPA rewrites
- [x] `render.yaml` — Render blueprint for the API
- [x] Production build verified with `VITE_API_URL` correctly baked into the bundle

---

## Step 1 — Push to GitHub

You need a GitHub repository for both Render and Vercel to pull from.

1. On github.com click **New repository**. Name it `military-asset-management-system`.
   Do **not** tick "Add a README" (you already have one).
2. In this project's folder, connect it and push:

```bash
cd "C:/Users/ADMIN/OneDrive/Desktop/Military Asset Management System"
git remote add origin https://github.com/<YOUR-USERNAME>/military-asset-management-system.git
git branch -M main
git push -u origin main
```

If Git asks for a password, GitHub no longer accepts account passwords — use a
**Personal Access Token** (github.com → Settings → Developer settings →
Personal access tokens → Fine-grained, grant `Contents: read & write`).

---

## Step 2 — Deploy the backend to Render (do this first)

The frontend needs the backend URL, so deploy the API first.

1. Go to **dashboard.render.com → New → Blueprint**
2. Connect the GitHub repo you just pushed. Render finds `render.yaml` automatically.
3. Set these environment variables:

   | Key | Value |
   |---|---|
   | `CORS_ORIGIN` | **Required** — your Vercel URL, e.g. `https://my-app.vercel.app`. You can fill this in after step 3 once you know the URL. |
   | `JWT_SECRET` | tick "generate" — Render creates a strong random one |
   | `DB_FILE` | `database/military_assets.db` (default, fine) |

4. Click **Apply**, then **Create**. First build takes 2–4 minutes.
5. When it goes green you get a URL like
   `https://mams-api.onrender.com`. **Save it.**
6. Verify it: open `https://mams-api.onrender.com/api/health`
   → should show `{"status":"ok", ...}`

> **Note:** Render's free tier sleeps after 15 minutes idle and restarts take ~50s,
> and the disk is ephemeral so the database re-seeds on each cold start. Fine for a
> demo. For permanent data, add a Persistent Disk (paid).

---

## Step 3 — Deploy the frontend to Vercel

```bash
cd "C:/Users/ADMIN/OneDrive/Desktop/Military Asset Management System/frontend"
vercel login
```

This opens a browser — confirm the login there, then return to the terminal.

Set the API URL, then deploy:

```bash
vercel --prod \
  --build-env VITE_API_URL=https://mams-api.onrender.com
```

You get a URL like `https://military-asset-management-system.vercel.app`.

> If `vercel login` cannot open a browser, run `vercel login --github` instead
> (uses a device code, works over SSH/remote sessions).

---

## Step 4 — Allow the frontend to call the API

Go back to **Render → your service → Environment**, and set:

```
CORS_ORIGIN = https://military-asset-management-system.vercel.app
```

Save. Render redeploys automatically. Wait for it to go green.

---

## Step 5 — Test the live site

1. Open the Vercel URL. The login screen should load with the demo buttons.
2. Sign in as `admin@mams.mil` / `Password123`.
3. If you get a CORS error in the browser console, the `CORS_ORIGIN` value in
   step 4 is wrong or the redeploy has not finished.

### Updating later

After any code change, redeploy the frontend:

```bash
cd frontend
vercel --prod --build-env VITE_API_URL=https://mams-api.onrender.com
```

If you `git push` to the main branch, both Render and Vercel redeploy on their own.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login fails, network error in console | Backend URL not baked in | Rebuild with `--build-env VITE_API_URL=...` |
| `CORS` error in console | `CORS_ORIGIN` not set (or wrong) on Render | Must match the Vercel origin exactly, no trailing slash. Accepts a comma-separated list. |
| Page 404 on refresh (e.g. `/purchases`) | SPA rewrites missing | `frontend/vercel.json` already has them; confirm deploy picked up the file |
| First request very slow | Free-tier cold start | Expected; Render sleeps when idle |
| Data disappears after a while | Ephemeral disk | Expected on free tier; add a Persistent Disk or run locally |
| "Build failed" on Vercel | Wrong root directory | Set **Root Directory** to `frontend` in project settings |
