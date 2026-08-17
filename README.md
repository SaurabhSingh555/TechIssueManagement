# Tech Issue Management System Portal

A complete, production-ready web portal for centralized technology issue management:
**Issue → Investigation → RCA → Solution → Testing → Client-Wide Check → Global Fix →
Monitoring → Resolution → Closure → Recurrence Monitoring.**

## Stack (exactly as required)

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Frontend   | React + Vite + **JavaScript** (JSX) |
| Backend    | **Python + FastAPI**                |
| Database   | **Supabase PostgreSQL**             |
| Auth       | Supabase Auth + JWT                 |
| Deployment | Frontend → Vercel · Backend → Render/Railway |

No Next.js, no TypeScript, no Node backend, no ORM (raw SQL + Pydantic).

## Project structure

```
frontend (this repo root)
  src/
    components/     Layout, UI kit, charts, issue table
    pages/          Dashboard, IssueList, CreateIssue, IssueDetail,
                    Knowledge, Reports, AuditLog, Clients, Settings
    services/       api.js (FastAPI client), demoData.js (preview mode),
                    backend.js (facade), session.jsx (auth context)
    hooks/          useAsync
    utils/          constants, format, csv
    App.jsx  main.jsx  index.css
backend/
  app/
    main.py         FastAPI app + CORS
    config.py       env-driven settings
    database.py     psycopg3 pool
    security.py     JWT verification + role permissions
    schemas.py      Pydantic schemas
    routers/        auth, issues, workflow, dashboard, settings, misc
    services/       closure.py (closure engine), audit.py, notifications.py
  requirements.txt
database/
  schema.sql        COMPLETE schema → paste into Supabase SQL Editor
  rls.sql           standalone re-runnable RLS (already included in schema.sql)
docs/               SETUP, DATABASE_SETUP, deployments, API docs, testing checklist
.env.example        all environment variables (placeholders)
vercel.json         SPA rewrite for Vercel
```

## Quick start

1. **Database** — Supabase → SQL Editor → run `database/schema.sql`, then
   `database/migration_ai_similarity.sql` (AI similarity feature).
   (See `docs/DATABASE_SETUP.md`.)
2. **Backend** — `cd backend`, `pip install -r requirements.txt`, copy `.env.example` values into `backend/.env`, `uvicorn app.main:app --reload`. (See `docs/BACKEND_DEPLOYMENT.md`.)
3. **Frontend** — `npm install`, create `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, then `npm run dev`. (See `docs/FRONTEND_DEPLOYMENT.md`.)

### No dummy data

The system ships **empty** — no demo clients, issues or scenarios. In demo mode the
portal auto-signs you in with four role accounts (Admin / Manager / Tech Owner /
Viewer, switchable from the profile menu) so you can build and test your own data.
In production mode, sessions come from your own Supabase users.

## Preview / Demo mode

If `VITE_API_URL` and `VITE_SUPABASE_URL` are **not** configured, the frontend runs in
**Demo Mode** with an in-browser backend that mirrors the FastAPI backend 1:1 (including
the closure engine, recurrence rules, client-wide checks, monitoring and audit trail).
This lets you evaluate the entire portal without infrastructure — starting from a
clean, empty database.

## Security notes (important)

- `SUPABASE_SERVICE_ROLE_KEY` lives **only** in the backend environment. It is never
  sent to the browser. The frontend uses the **anon** key + the signed-in user's JWT.
- Business rules (closure validation, recurrence, client-wide completion, global-fix
  validation, permissions, SLA) are enforced **server-side** in FastAPI — and mirrored
  by the PostgreSQL function `can_close_issue()` + RLS policies.
- RLS is fully enabled. No table is open to the public.

## AI Previous-Issue Recognition (new feature)

Every new ticket automatically triggers a server-side similarity search
(FastAPI → embedding → **pgvector** in Supabase Postgres) and shows the top 5
previous similar issues with their RCA, solution, status and recurrence count.
Users can link tickets (same / related / duplicate / recurrence / not related),
recurrence is counted only from confirmed links, and resolved tickets become
searchable knowledge. The AI only recommends — it never changes anything
automatically. Embedding API keys live only in the backend.

## Docs

- `docs/SETUP.md` — full local development setup
- `docs/DATABASE_SETUP.md` — Supabase project, SQL, storage, auth
- `docs/FRONTEND_DEPLOYMENT.md` — Vercel deployment
- `docs/BACKEND_DEPLOYMENT.md` — Render / Railway deployment
- `docs/API_DOCUMENTATION.md` — complete endpoint reference
- `docs/TESTING.md` — full testing checklist
