# Backend Deployment — Render / Railway

The FastAPI backend lives in `backend/`. Any Python-compatible host works
(Render, Railway, Fly.io, PythonAnywhere…).

## 1. Deploy to Render

1. Push the repo to GitHub.
2. Render → New → **Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (Render → Environment):

| Variable                     | Value                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| `SUPABASE_URL`               | `https://<project-ref>.supabase.co`                                   |
| `SUPABASE_SERVICE_ROLE_KEY`  | Supabase **service role** key (server-side only)                      |
| `DATABASE_URL`               | Supabase session-pooler Postgres string (`postgresql://postgres...`)  |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` | SMTP credentials for notification emails (optional) |
| `FRONTEND_URL`               | your Vercel URL, e.g. `https://tims-portal.vercel.app`                |
| `CORS_ORIGINS`               | `https://tims-portal.vercel.app,http://localhost:5173` (comma-separated) |

5. Deploy. Verify: `https://<your-api>.onrender.com/api/health` → `{"status":"ok","database":true}`.

## 2. Deploy to Railway

1. Railway → New Project → Deploy from GitHub.
2. Add a Postgres… no — **do not** provision a new database; you use Supabase.
   Set the same env vars as above.
3. Build: `pip install -r requirements.txt`; Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Railway automatically assigns `$PORT` — use it exactly as shown.

## 3. CORS configuration

The backend only accepts origins listed in `CORS_ORIGINS` (comma-separated).
After deploying the frontend, add its URL there and redeploy the backend.

## 4. Local run (repeat for convenience)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env     # fill in values
uvicorn app.main:app --reload --port 8000
```

API docs available at `/docs` (Swagger UI) and `/redoc`.

## 5. Important security rules

- `SUPABASE_SERVICE_ROLE_KEY` is **only** set on the backend host. Never commit it,
  never add it to Vercel.
- All business rules (closure engine, recurrence, client-wide completion,
  global-fix validation, permissions, SLA) execute here in Python — the frontend
  is never trusted for these decisions.
- Authentication: the frontend obtains a Supabase JWT at login and sends it as
  `Authorization: Bearer <token>`; the backend verifies it with the service-role
  client (`auth.get_user(token)`) before executing anything.
