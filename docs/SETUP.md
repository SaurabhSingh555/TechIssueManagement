# Local Development Setup

Complete walkthrough to run the whole stack locally.

## 0. Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project (free tier is fine) — see `DATABASE_SETUP.md` first

## 1. Database (Supabase)

1. Create a Supabase project.
2. Open **SQL Editor** → New query → paste the entire contents of `database/schema.sql` → **Run**.
3. New query → paste `database/migration_ai_similarity.sql` → **Run** (AI similarity feature).
4. Verify: run `select * from tech_issue_dashboard;` — the dashboard view exists.
   The system ships **empty** (no dummy data); add your own users and master data
   (see `DATABASE_SETUP.md`).

## 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env          # then fill in real values (below)
uvicorn app.main:app --reload --port 8000
```

Backend `.env` values:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase → Settings → API>
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
SMTP_HOST=            # optional — leave empty to disable email
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@yourcompany.com
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# AI similarity (optional — leave blank for the built-in local embedding engine)
EMBEDDING_API_URL=     # e.g. https://api.openai.com/v1
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=256
SIMILARITY_HIGH_THRESHOLD=0.90
SIMILARITY_MEDIUM_THRESHOLD=0.75
```

Check: `curl http://localhost:8000/api/health` → `{"status":"ok","database":true}`.
Interactive API docs: http://localhost:8000/docs

## 3. Frontend (React + Vite)

```bash
# repo root
npm install
cp .env.example .env              # fill in the VITE_* values (below)
npm run dev                       # http://localhost:5173
```

Frontend `.env` values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
VITE_API_URL=http://localhost:8000
```

The portal opens automatically — there is no login page. In demo mode you are
signed in as the Admin role account (switch roles from the profile menu); in
production mode your Supabase session is restored automatically.

> **Demo Mode:** leave the three `VITE_*` variables empty and the portal runs with an
> in-browser demo backend (same UI, same business rules). Useful for quick evaluation.

## 4. First steps in a clean system

1. **Settings → Clients** — add your clients.
2. Optionally add **Processes** and **Categories** in Settings.
3. **Create Issue** — the system assigns `TECH-YYYY-NNN` automatically and
   immediately shows previous similar issues (AI recognition).
4. Walk the simplified workflow on the issue page: RCA → Solution → Testing (mark Passed) → Close.
5. Reopen a closed issue to test the recurrence cycle.
