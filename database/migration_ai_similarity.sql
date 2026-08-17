-- ============================================================================
-- MIGRATION: AI-BASED PREVIOUS ISSUE RECOGNITION & HISTORICAL RCA
-- Run in Supabase → SQL Editor AFTER schema.sql.
--
-- ADDITIVE ONLY: creates new tables/columns/functions/views.
-- Does NOT drop tables, does NOT delete or modify existing data.
-- ============================================================================

-- pgvector for server-side semantic similarity search (standard on Supabase)
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. New ticket fields (additive, nullable — existing rows unaffected)
-- ---------------------------------------------------------------------------
alter table tech_issues add column if not exists system_name text;     -- Application/System
alter table tech_issues add column if not exists error_message text;   -- exact error text reported

-- Simplified workflow: Client-Wide Check & Monitoring are no longer part of
-- the UI flow, so new tickets default to "not required". The closure engine
-- still enforces them whenever a row has them set to true.
alter table tech_issues alter column client_wide_check_required set default false;
alter table tech_issues alter column monitoring_required set default false;

-- ---------------------------------------------------------------------------
-- 2. RCA enrichment — extends the existing rca_logs table.
--    (No duplicate RCA table: investigation / verification fields are added
--     to rca_logs, which already stores root cause, contributing factors,
--     immediate (temporary) and permanent fixes, and preventive action.)
-- ---------------------------------------------------------------------------
alter table rca_logs add column if not exists investigation text;
alter table rca_logs add column if not exists verification_notes text;
alter table rca_logs add column if not exists verified boolean not null default false;
alter table rca_logs add column if not exists verified_by text;
alter table rca_logs add column if not exists verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Embeddings (search text -> vector). Dimension MUST match the backend
--    EMBEDDING_DIMENSIONS setting (default 256 for the built-in local
--    embedding engine; OpenAI text-embedding-3-small supports dimensions=256).
-- ---------------------------------------------------------------------------
create table if not exists issue_embeddings (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  embedding vector(256),
  search_text text,
  model text,
  created_at timestamptz not null default now(),
  unique (issue_id)
);

create index if not exists idx_embeddings_hnsw
  on issue_embeddings using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 4. Issue relationships (manually confirmed links between tickets)
-- ---------------------------------------------------------------------------
create table if not exists issue_relationships (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  related_issue_id uuid not null references tech_issues (id) on delete cascade,
  relationship_type text not null default 'same_issue'
    check (relationship_type in ('same_issue', 'related_issue', 'duplicate', 'recurrence', 'not_related')),
  similarity_score numeric(5,4),
  note text,
  confirmed boolean not null default true,
  confirmed_by uuid references users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (issue_id, related_issue_id, relationship_type),
  check (issue_id <> related_issue_id)
);

create index if not exists idx_relationships_issue on issue_relationships (issue_id);
create index if not exists idx_relationships_related on issue_relationships (related_issue_id);

-- ---------------------------------------------------------------------------
-- 5. Similarity results cache (kept after each search for dashboard metrics)
-- ---------------------------------------------------------------------------
create table if not exists issue_similarity_results (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  similar_issue_id uuid not null references tech_issues (id) on delete cascade,
  similarity numeric(5,4) not null,
  created_at timestamptz not null default now(),
  unique (issue_id, similar_issue_id)
);

create index if not exists idx_simres_issue on issue_similarity_results (issue_id);

-- ---------------------------------------------------------------------------
-- 6. Issue history view (over the existing audit_logs table — no duplicate
--    history table; keeps existing naming conventions)
-- ---------------------------------------------------------------------------
create or replace view issue_history as
select id,
       issue_id,
       issue_id_text,
       action,
       field_name,
       old_value,
       new_value,
       user_name as performed_by,
       timestamp as created_at
from audit_logs;

-- ---------------------------------------------------------------------------
-- 7. Default similarity thresholds (DB-driven, editable via Settings → AI)
-- ---------------------------------------------------------------------------
insert into app_settings (key, value)
values ('similarity_settings', '{"high": 0.90, "medium": 0.75}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Recurrence recompute — recurrence_count is based on CONFIRMED
--    same_issue/recurrence links, not on exact duplicate titles.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_recurrence(iid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count
  from issue_relationships
  where issue_id = iid
    and relationship_type in ('same_issue', 'recurrence')
    and confirmed;
  update tech_issues
  set recurrence = (v_count > 0),
      recurrence_count = v_count,
      updated_at = now()
  where id = iid;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security (same model as schema.sql)
-- ---------------------------------------------------------------------------
alter table issue_embeddings enable row level security;
drop policy if exists embeddings_select on issue_embeddings;
create policy embeddings_select on issue_embeddings for select using (public.can_view_issue(issue_id));
drop policy if exists embeddings_insert on issue_embeddings;
create policy embeddings_insert on issue_embeddings for insert with check (public.can_edit_issue(issue_id));
drop policy if exists embeddings_update on issue_embeddings;
create policy embeddings_update on issue_embeddings for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists embeddings_delete on issue_embeddings;
create policy embeddings_delete on issue_embeddings for delete using (public.get_my_role() = 'admin');

alter table issue_relationships enable row level security;
drop policy if exists relationships_select on issue_relationships;
create policy relationships_select on issue_relationships for select using (
  public.can_view_issue(issue_id) and public.can_view_issue(related_issue_id)
);
drop policy if exists relationships_insert on issue_relationships;
create policy relationships_insert on issue_relationships for insert with check (
  public.can_edit_issue(issue_id) and public.can_view_issue(related_issue_id)
);
drop policy if exists relationships_update on issue_relationships;
create policy relationships_update on issue_relationships for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists relationships_delete on issue_relationships;
create policy relationships_delete on issue_relationships for delete using (public.get_my_role() = 'admin');

alter table issue_similarity_results enable row level security;
drop policy if exists simres_select on issue_similarity_results;
create policy simres_select on issue_similarity_results for select using (
  public.can_view_issue(issue_id) and public.can_view_issue(similar_issue_id)
);
drop policy if exists simres_insert on issue_similarity_results;
create policy simres_insert on issue_similarity_results for insert with check (public.can_edit_issue(issue_id));
drop policy if exists simres_update on issue_similarity_results;
create policy simres_update on issue_similarity_results for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists simres_delete on issue_similarity_results;
create policy simres_delete on issue_similarity_results for delete using (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 10. Grants (mirror schema.sql)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on issue_embeddings to authenticated;
grant select, insert, update, delete on issue_relationships to authenticated;
grant select, insert, update, delete on issue_similarity_results to authenticated;
grant execute on function public.recompute_recurrence(uuid) to authenticated;
