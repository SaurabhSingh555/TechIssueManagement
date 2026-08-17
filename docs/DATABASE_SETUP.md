# Database Setup — Supabase PostgreSQL

Everything you need to run the SQL deliverables.

## 1. Create the project

1. Go to https://supabase.com → New project.
2. Note down: project URL, **anon** key, **service role** key (Settings → API),
   and the DB connection string (Settings → Database, "Session pooler" recommended).

## 2. Run the schema

1. Open **SQL Editor** in the Supabase dashboard.
2. New query → paste the **entire contents of `database/schema.sql`** → Run.
   The file creates (idempotently):
   - extensions (`pgcrypto`)
   - enums (`user_role`, `issue_priority`, `issue_status`, …)
   - 16 tables: `users`, `clients`, `processes`, `issue_categories`, `tech_issues`,
     `rca_logs`, `solutions`, `client_impact_checks`, `monitoring_logs`,
     `recurrence_tracker`, `audit_logs`, `attachments`, `notifications`,
     `sla_config`, `app_settings`, `notification_recipients`
   - unique constraints (`issue_id`, `client_code`, `(issue_id, client_id)`),
     foreign keys, indexes, timestamptz defaults
   - the `tech_issue_id_seq` sequence for `TECH-YYYY-NNN` IDs
   - functions: `generate_issue_id`, `set_updated_at`, `compute_sla`,
     audit triggers, `get_my_role`, `can_view_issue`, `can_edit_issue`,
     and the DB-level closure engine `can_close_issue(uuid)` returning JSONB
   - views: `tech_issue_dashboard`, `issue_detail_view`
   - **RLS enabled on every table with role-based policies**
   - default SLA config (Critical=1, High=2, Medium=5, Low=10 days)
3. If you ever need to re-apply just the policies, run `database/rls.sql`.

## 3. Add your own users (no seed data is shipped)

The schema ships **empty — no dummy data**. To add users:

1. **Authentication → Users → Add user** for each team member (email + password).
2. Copy the user's UUID (from the auth users list or the `auth.users` table) and
   insert their profile with a role:

```sql
insert into public.users (id, name, email, role, active)
values ('<uuid-from-auth-users>', 'Jane Doe', 'jane@company.com', 'manager', true);
```

Roles: `admin`, `manager`, `tech_owner`, `viewer`. Repeat for each user.

## 4. Authentication configuration

- Authentication → Providers → **Email** enabled (default).
- **Site URL** → your frontend URL (Vercel URL) and add the same URL to
  **Redirect URLs** (for email confirmation links).
- Disable email confirmation for quick testing if you prefer
  (Authentication → Providers → Email → "Confirm email" off).

## 5. Storage (attachments)

1. Storage → New bucket → name **`issue-attachments`** → **Private** (default private
   means files are only downloadable via signed URLs — recommended).
2. The backend uploads files using the service-role key and stores the private object
   path in `attachments.file_url`. Signed-URL download can be added later via the
   backend if needed.
3. Do **not** make the bucket public unless you explicitly accept public access.

## 6. RLS model (what the policies do)

| Role        | See                                       | Create/Update                                  |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| **admin**   | everything                                | everything (including settings/users)          |
| **manager** | all issues + audit logs + settings (read) | issues, RCA, solutions, checks, monitoring, recurrence |
| **tech_owner** | only issues assigned to / created by them | RCA/solutions/checks/monitoring on those issues |
| **viewer**  | all business tables (read-only)           | nothing                                        |

The backend connects with the **service-role key** (bypasses RLS) and enforces the
same role rules in Python. The policies protect direct access through the anon/
authenticated keys. Security-definer helpers (`get_my_role`, `can_view_issue`,
`can_edit_issue`) keep the policies simple and safe from recursive RLS.

## 7. AI similarity migration (new feature)

Run `database/migration_ai_similarity.sql` in the SQL Editor **after** `schema.sql`.
It is additive only (never drops tables or modifies existing data):

- `create extension if not exists vector` (pgvector)
- new columns: `tech_issues.system_name`, `tech_issues.error_message`;
  RCA enrichment: `rca_logs.investigation`, `verification_notes`, `verified`, `verified_by`, `verified_at`
- new tables: `issue_embeddings`, `issue_relationships`, `issue_similarity_results`
- view `issue_history` (over the existing `audit_logs` — no duplicate history table)
- function `recompute_recurrence(uuid)` — recurrence counts come from **confirmed links**
- default similarity thresholds in `app_settings` (`high=0.90`, `medium=0.75`), editable in the app (Settings → AI Similarity)

**Embedding dimension:** the pgvector column is `vector(256)` to match the default
`EMBEDDING_DIMENSIONS=256` (built-in local embedding engine). If you use OpenAI
embeddings, `text-embedding-3-small` supports `dimensions=256`; if you prefer the
full 1536, change both `EMBEDDING_DIMENSIONS` and the `vector(…)` column dimension
before creating any data.

## 8. Sanity checks

```sql
select * from tech_issue_dashboard;          -- aggregate KPIs
select * from can_close_issue('<issue-uuid>'); -- closure validation JSON
select * from issue_detail_view limit 1;      -- full issue bundle
select * from issue_history limit 5;          -- ticket history view
```

## 8. Postgres connection string (for the backend)

Use the **session pooler** string from Settings → Database:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Put it in the backend's `DATABASE_URL` env var.
