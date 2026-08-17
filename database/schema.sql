-- ============================================================================
-- TECH ISSUE MANAGEMENT SYSTEM — COMPLETE DATABASE SCHEMA
-- Run this file in: Supabase → SQL Editor → New Query → Paste → Run.
-- The system ships EMPTY (no dummy/seed data) — add your own users and
-- master data. See docs/DATABASE_SETUP.md.
--
-- Contains: extensions, enums, tables, indexes, constraints, sequences,
--           functions, views, triggers, RLS and RLS policies.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================ ENUMS ========================================
create type user_role as enum ('admin', 'manager', 'tech_owner', 'viewer');
create type issue_priority as enum ('Critical', 'High', 'Medium', 'Low');
create type issue_status as enum (
  'New', 'Under Investigation', 'RCA In Progress', 'Solution Proposed', 'Testing',
  'Client-Wide Check', 'Global Fix', 'Monitoring', 'Resolved', 'Closed', 'Reopened');
create type testing_status as enum ('Pending', 'In Progress', 'Passed', 'Failed');
create type solution_effectiveness as enum ('Pending', 'Effective', 'Partially Effective', 'Not Effective');
create type rca_status as enum ('Draft', 'In Progress', 'Completed', 'Superseded');
create type global_fix_status as enum ('Pending', 'In Progress', 'Completed', 'Not Required');
create type check_status as enum ('Pending', 'In Progress', 'Completed');
create type monitoring_status as enum ('Pending', 'In Progress', 'Successful', 'Failed');
create type notification_status as enum ('Pending', 'Sent', 'Failed');
create type recurrence_status as enum ('Open', 'Under RCA', 'Resolved', 'Closed');
create type solution_type as enum ('Temporary', 'Permanent');

-- ============================ TABLES =======================================

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  client_name text not null,
  active boolean not null default true,
  relevant_for_client_wide_check boolean not null default true,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table processes (
  id uuid primary key default gen_random_uuid(),
  process_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table issue_categories (
  id uuid primary key default gen_random_uuid(),
  category_name text not null unique,
  active boolean not null default true
);

create table tech_issues (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null unique,
  reported_date date not null default current_date,
  reported_by text,
  client_id uuid references clients (id) on delete set null,
  process_id uuid references processes (id) on delete set null,
  category_id uuid references issue_categories (id) on delete set null,
  issue_title text not null,
  issue_description text,
  business_impact text,
  priority issue_priority not null default 'Medium',
  status issue_status not null default 'New',
  assigned_to uuid references users (id) on delete set null,
  root_cause text,
  temporary_solution text,
  permanent_solution text,
  solution_implemented_date date,
  testing_status testing_status not null default 'Pending',
  testing_result text,
  client_wide_check_required boolean not null default false,
  client_wide_check_status check_status not null default 'Pending',
  global_fix_required boolean not null default false,
  global_fix_status global_fix_status not null default 'Not Required',
  monitoring_required boolean not null default false,
  monitoring_period int,
  monitoring_start_date date,
  monitoring_end_date date,
  monitoring_result text,
  recurrence boolean not null default false,
  recurrence_count int not null default 0,
  final_closure_status text,
  closure_date timestamptz,
  closure_remarks text,
  sla_due_date date,
  sla_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint chk_monitoring_period check (monitoring_period is null or monitoring_period > 0)
);

create table rca_logs (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  rca_date date not null default current_date,
  root_cause text not null,
  technical_cause text,
  process_cause text,
  contributing_factors text,
  temporary_fix text,
  permanent_fix text,
  preventive_action text,
  owner text,
  status rca_status not null default 'In Progress',
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null
);

create table solutions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  solution_description text not null,
  solution_type solution_type not null default 'Permanent',
  proposed_date date not null default current_date,
  implemented_date date,
  implemented_by text,
  testing_required boolean not null default true,
  testing_status testing_status not null default 'Pending',
  testing_result text,
  solution_effective solution_effectiveness not null default 'Pending',
  evidence_url text,
  remarks text,
  created_at timestamptz not null default now()
);

create table client_impact_checks (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  checked_by text,
  check_date date,
  same_issue_found boolean not null default false,
  severity text,
  impact text,
  fix_required boolean not null default false,
  fix_implemented boolean not null default false,
  monitoring_required boolean not null default false,
  monitoring_status check_status not null default 'Pending',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issue_id, client_id)
);

create table monitoring_logs (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  monitoring_start_date date,
  monitoring_end_date date,
  monitoring_period int,
  check_date date not null default current_date,
  issue_recurred boolean not null default false,
  system_stable boolean not null default true,
  result monitoring_status not null default 'In Progress',
  checked_by text,
  remarks text,
  created_at timestamptz not null default now()
);

create table recurrence_tracker (
  id uuid primary key default gen_random_uuid(),
  original_issue_id uuid not null references tech_issues (id) on delete cascade,
  recurrence_date date not null default current_date,
  client_id uuid references clients (id) on delete set null,
  same_issue boolean not null default true,
  recurrence_description text,
  new_rca_required boolean not null default true,
  new_rca text,
  new_solution text,
  preventive_action text,
  owner text,
  status recurrence_status not null default 'Open',
  closure_date date,
  remarks text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  user_id uuid references users (id) on delete set null,
  user_name text,
  issue_id uuid references tech_issues (id) on delete set null,
  issue_id_text text,
  action text not null,
  field_name text,
  old_value text,
  new_value text,
  timestamp timestamptz not null default now(),
  ip_address text,
  metadata jsonb not null default '{}'::jsonb
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references tech_issues (id) on delete cascade,
  file_name text not null,
  file_url text,
  file_type text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table notifications (
  id bigserial primary key,
  issue_id uuid references tech_issues (id) on delete cascade,
  issue_id_text text,
  recipient text,
  notification_type text,
  subject text,
  message text,
  sent_at timestamptz default now(),
  status notification_status not null default 'Pending'
);

create table sla_config (
  priority issue_priority primary key,
  days int not null check (days between 1 and 365)
);

create table app_settings (
  key text primary key,
  value jsonb not null
);

create table notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  notify_critical boolean not null default true,
  notify_high boolean not null default true,
  notify_sla boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================ SEQUENCE (issue IDs) =========================
create sequence if not exists tech_issue_id_seq start with 1 increment by 1;

-- ============================ INDEXES =======================================
create index idx_issues_status on tech_issues (status);
create index idx_issues_priority on tech_issues (priority);
create index idx_issues_client on tech_issues (client_id);
create index idx_issues_process on tech_issues (process_id);
create index idx_issues_category on tech_issues (category_id);
create index idx_issues_assigned on tech_issues (assigned_to);
create index idx_issues_reported_date on tech_issues (reported_date desc);
create index idx_issues_recurrence on tech_issues (recurrence);
create index idx_rca_issue on rca_logs (issue_id);
create index idx_solutions_issue on solutions (issue_id);
create index idx_checks_issue on client_impact_checks (issue_id);
create index idx_checks_client on client_impact_checks (client_id);
create index idx_checks_found on client_impact_checks (same_issue_found) where same_issue_found;
create index idx_monitoring_issue on monitoring_logs (issue_id);
create index idx_recurrence_issue on recurrence_tracker (original_issue_id);
create index idx_audit_issue on audit_logs (issue_id_text);
create index idx_audit_timestamp on audit_logs (timestamp desc);
create index idx_attachments_issue on attachments (issue_id);
create index idx_notifications_recipient on notifications (recipient);

-- ============================ FUNCTIONS =====================================

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger users_set_updated before update on users for each row execute function public.set_updated_at();
create trigger clients_set_updated before update on clients for each row execute function public.set_updated_at();
create trigger issues_set_updated before update on tech_issues for each row execute function public.set_updated_at();
create trigger checks_set_updated before update on client_impact_checks for each row execute function public.set_updated_at();

-- Auto issue ID: TECH-YYYY-NNN
create or replace function public.generate_issue_id()
returns text language sql as $$
  select 'TECH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('tech_issue_id_seq')::text, 3, '0')
$$;

create or replace function public.issue_before_insert()
returns trigger language plpgsql as $$
begin
  if new.issue_id is null or new.issue_id = '' then
    new.issue_id := public.generate_issue_id();
  end if;
  return new;
end $$;

create trigger tech_issues_generate_id
before insert on tech_issues for each row execute function public.issue_before_insert();

-- SLA computation (driven by sla_config table)
create or replace function public.compute_sla()
returns trigger language plpgsql as $$
declare v_days int;
begin
  select days into v_days from sla_config where priority = new.priority;
  if v_days is null then v_days := 5; end if;
  new.sla_due_date := new.reported_date + v_days;
  if new.status = 'Closed' then
    new.sla_status := 'Closed';
  elsif current_date > new.sla_due_date then
    new.sla_status := 'Overdue';
  elsif current_date >= new.sla_due_date - 1 then
    new.sla_status := 'At Risk';
  else
    new.sla_status := 'On Track';
  end if;
  return new;
end $$;

create trigger tech_issues_sla
before insert or update of priority, reported_date, status on tech_issues
for each row execute function public.compute_sla();

-- ---- Audit helpers (SECURITY DEFINER so triggers bypass RLS) ----
create or replace function public.audit_record(p_issue_id uuid, p_issue_id_text text,
    p_action text, p_field text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  v_user := auth.uid();
  select name into v_name from users where id = v_user;
  insert into audit_logs (user_id, user_name, issue_id, issue_id_text, action, field_name, old_value, new_value)
  values (v_user, v_name, p_issue_id, p_issue_id_text, p_action, p_field, p_old, p_new);
end $$;

-- Audit every important change on tech_issues
create or replace function public.audit_issue_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  v_user := coalesce(new.updated_by, auth.uid());
  if new.status is distinct from old.status then
    insert into audit_logs (user_id, user_name, issue_id, issue_id_text, action, field_name, old_value, new_value)
    select v_user, u.name, new.id, new.issue_id, 'Status Change', 'status', old.status::text, new.status::text
    from users u where u.id = v_user;
  end if;
  if new.priority is distinct from old.priority then
    insert into audit_logs (user_id, user_name, issue_id, issue_id_text, action, field_name, old_value, new_value)
    select v_user, u.name, new.id, new.issue_id, 'Priority Change', 'priority', old.priority::text, new.priority::text
    from users u where u.id = v_user;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into audit_logs (user_id, user_name, issue_id, issue_id_text, action, field_name, old_value, new_value)
    select v_user, u.name, new.id, new.issue_id, 'Assignment', 'assigned_to',
           (select name from users where id = old.assigned_to),
           (select name from users where id = new.assigned_to)
    from users u where u.id = v_user;
  end if;
  if new.root_cause is distinct from old.root_cause then
    perform public.audit_record(new.id, new.issue_id, 'RCA Updated', 'root_cause', old.root_cause, new.root_cause);
  end if;
  if new.permanent_solution is distinct from old.permanent_solution then
    perform public.audit_record(new.id, new.issue_id, 'Solution Updated', 'permanent_solution', old.permanent_solution, new.permanent_solution);
  end if;
  if new.testing_status is distinct from old.testing_status then
    perform public.audit_record(new.id, new.issue_id, 'Testing Updated', 'testing_status', old.testing_status::text, new.testing_status::text);
  end if;
  if new.client_wide_check_status is distinct from old.client_wide_check_status then
    perform public.audit_record(new.id, new.issue_id, 'Client-Wide Check Status', 'client_wide_check_status', old.client_wide_check_status::text, new.client_wide_check_status::text);
  end if;
  if new.global_fix_status is distinct from old.global_fix_status then
    perform public.audit_record(new.id, new.issue_id, 'Global Fix', 'global_fix_status', old.global_fix_status::text, new.global_fix_status::text);
  end if;
  if new.monitoring_result is distinct from old.monitoring_result then
    perform public.audit_record(new.id, new.issue_id, 'Monitoring Result', 'monitoring_result', old.monitoring_result, new.monitoring_result);
  end if;
  if new.final_closure_status is distinct from old.final_closure_status then
    perform public.audit_record(new.id, new.issue_id, 'Closure', 'final_closure_status', old.final_closure_status, new.final_closure_status);
  end if;
  return new;
end $$;

create trigger tech_issues_audit
after update on tech_issues for each row execute function public.audit_issue_changes();

create or replace function public.audit_rca_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_record(new.issue_id, (select issue_id from tech_issues where id = new.issue_id), 'RCA Added', 'rca_logs', null, left(new.root_cause, 60));
  return new;
end $$;
create trigger rca_audit after insert on rca_logs for each row execute function public.audit_rca_insert();

create or replace function public.audit_solution_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_record(new.issue_id, (select issue_id from tech_issues where id = new.issue_id), 'Solution Added', 'solutions', null, new.solution_type::text || ': ' || left(new.solution_description, 60));
  return new;
end $$;
create trigger solutions_audit after insert on solutions for each row execute function public.audit_solution_insert();

create or replace function public.audit_check_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_client text;
begin
  select client_name into v_client from clients where id = new.client_id;
  if new.same_issue_found is distinct from old.same_issue_found then
    perform public.audit_record(new.issue_id, (select issue_id from tech_issues where id = new.issue_id), 'Client-Wide Check', 'client_impact_checks', null, v_client || ': Same Issue Found = ' || case when new.same_issue_found then 'Yes' else 'No' end);
  end if;
  return new;
end $$;
create trigger checks_audit after insert or update on client_impact_checks for each row execute function public.audit_check_change();

create or replace function public.audit_monitoring_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_record(new.issue_id, (select issue_id from tech_issues where id = new.issue_id), 'Monitoring Check', 'monitoring_logs', null, new.result::text);
  return new;
end $$;
create trigger monitoring_audit after insert on monitoring_logs for each row execute function public.audit_monitoring_insert();

create or replace function public.audit_recurrence_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_record(new.original_issue_id, (select issue_id from tech_issues where id = new.original_issue_id), 'Recurrence Recorded', 'recurrence_tracker', null, 'Same issue — new RCA required');
  return new;
end $$;
create trigger recurrence_audit after insert on recurrence_tracker for each row execute function public.audit_recurrence_insert();

-- Keep recurrence counter in sync
create or replace function public.sync_recurrence_count() returns trigger language plpgsql as $$
begin
  update tech_issues set recurrence = true, recurrence_count = coalesce(recurrence_count, 0) + 1
  where id = new.original_issue_id;
  return new;
end $$;
create trigger recurrence_sync after insert on recurrence_tracker for each row execute function public.sync_recurrence_count();

-- ============================ RLS HELPERS ===================================

create or replace function public.get_my_id()
returns uuid language sql stable security definer set search_path = public as $$
  select auth.uid()
$$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from users where id = auth.uid()
$$;

create or replace function public.can_view_issue(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.get_my_role() in ('admin', 'manager', 'viewer') then true
    when public.get_my_role() = 'tech_owner' then exists (
      select 1 from tech_issues i where i.id = iid
        and (i.assigned_to = auth.uid() or i.created_by = auth.uid()))
    else false
  end
$$;

create or replace function public.can_edit_issue(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.get_my_role() in ('admin', 'manager') then true
    when public.get_my_role() = 'tech_owner' then exists (
      select 1 from tech_issues i where i.id = iid and i.assigned_to = auth.uid())
    else false
  end
$$;

-- ============================ DB-LEVEL CLOSURE ENGINE =======================
-- Mirrors the Python implementation in backend/app/services/closure.py
create or replace function public.can_close_issue(p_issue uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i record;
  reasons text[] := '{}';
  client_name_rec record;
  pending_names text[];
begin
  select * into i from tech_issues where id = p_issue;
  if i is null then return jsonb_build_object('allowed', false, 'blocking_reasons', array['Issue not found']); end if;

  if i.root_cause is null or i.root_cause = '' then
    reasons := array_append(reasons, 'RCA: Root cause missing');
  end if;
  if not exists (select 1 from rca_logs where issue_id = i.id and status = 'Completed') then
    reasons := array_append(reasons, 'RCA: No completed RCA record');
  end if;
  if i.permanent_solution is null or i.permanent_solution = '' then
    reasons := array_append(reasons, 'Solution: Permanent solution missing');
  end if;
  if i.testing_status <> 'Passed' then
    reasons := array_append(reasons, 'Testing: Not completed (must be Passed)');
  end if;
  if i.client_wide_check_required then
    if i.client_wide_check_status <> 'Completed' then
      reasons := array_append(reasons, 'Client-Wide Check: Not completed');
    else
      select coalesce(array_agg(c.client_name), '{}') into pending_names
      from clients c
      where c.active and c.relevant_for_client_wide_check
        and not exists (select 1 from client_impact_checks ch where ch.client_id = c.id and ch.issue_id = i.id and ch.check_date is not null);
      if array_length(pending_names, 1) > 0 then
        reasons := array_append(reasons, 'Client-Wide Check: Pending for ' || array_to_string(pending_names, ', '));
      end if;
      for client_name_rec in
        select c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id
        where ch.issue_id = i.id and ch.same_issue_found and ch.fix_required and not ch.fix_implemented
      loop
        reasons := array_append(reasons, 'Affected client fix not implemented: ' || client_name_rec.client_name);
      end loop;
    end if;
  end if;
  if i.global_fix_required and i.global_fix_status <> 'Completed' then
    reasons := array_append(reasons, 'Global Fix: Required but not completed');
  end if;
  if i.monitoring_required then
    if i.monitoring_end_date is null then
      reasons := array_append(reasons, 'Monitoring: Period not started');
    elsif i.monitoring_end_date > current_date then
      reasons := array_append(reasons, 'Monitoring: Period not elapsed (ends ' || i.monitoring_end_date::text || ')');
    end if;
    if i.monitoring_result is distinct from 'Successful' then
      reasons := array_append(reasons, 'Monitoring: No successful result recorded');
    end if;
  end if;
  if exists (select 1 from recurrence_tracker where original_issue_id = i.id and status not in ('Resolved', 'Closed')) then
    reasons := array_append(reasons, 'Recurrence: Unresolved recurrence record exists');
  end if;

  return jsonb_build_object('allowed', array_length(reasons, 1) is null,
                            'blocking_reasons', coalesce(reasons, '{}'));
end $$;

-- ============================ VIEWS =========================================

-- Management dashboard aggregates
create or replace view tech_issue_dashboard as
select
  (select count(*)::int from tech_issues) as total_issues,
  (select count(*)::int from tech_issues where status not in ('Closed', 'Resolved')) as open_issues,
  (select count(*)::int from tech_issues where status = 'Closed') as closed_issues,
  (select count(*)::int from tech_issues where priority = 'Critical' and status <> 'Closed') as critical_issues,
  (select count(*)::int from tech_issues where priority = 'High' and status <> 'Closed') as high_priority_issues,
  (select count(*)::int from tech_issues where root_cause is null and status not in ('Closed', 'Resolved')) as rca_pending,
  (select count(*)::int from tech_issues where root_cause is not null and (permanent_solution is null or permanent_solution = '') and status not in ('Closed', 'Resolved')) as solution_pending,
  (select count(*)::int from tech_issues where testing_status <> 'Passed' and status not in ('Closed', 'Resolved')) as testing_pending,
  (select count(*)::int from tech_issues where client_wide_check_required and client_wide_check_status in ('Pending', 'In Progress')) as client_wide_check_pending,
  (select count(*)::int from tech_issues where global_fix_required and global_fix_status <> 'Completed') as global_fix_pending,
  (select count(*)::int from tech_issues where monitoring_required and (monitoring_result is null or monitoring_result <> 'Successful') and status not in ('Closed')) as monitoring_pending,
  (select count(*)::int from tech_issues where recurrence) as recurring_issues,
  (select coalesce(round(avg(extract(epoch from (closure_date - reported_date)) / 86400)::numeric, 1), 0) from tech_issues where status = 'Closed' and closure_date is not null) as avg_resolution_days,
  (select count(distinct client_id)::int from client_impact_checks where same_issue_found) as affected_clients;

-- Full issue detail (issue + client + process + category + related records)
create or replace view issue_detail_view as
select
  i.*,
  c.client_name, p.process_name, cat.category_name, u.name as assigned_name,
  (select coalesce(jsonb_agg(r order by r.rca_date desc), '[]'::jsonb)
     from rca_logs r where r.issue_id = i.id) as rca,
  (select coalesce(jsonb_agg(s order by s.proposed_date desc), '[]'::jsonb)
     from solutions s where s.issue_id = i.id) as solutions,
  (select coalesce(jsonb_agg(ch order by ch.check_date desc nulls last), '[]'::jsonb)
     from client_impact_checks ch where ch.issue_id = i.id) as client_checks,
  (select coalesce(jsonb_agg(m order by m.check_date desc), '[]'::jsonb)
     from monitoring_logs m where m.issue_id = i.id) as monitoring_logs,
  (select coalesce(jsonb_agg(rt order by rt.recurrence_date desc), '[]'::jsonb)
     from recurrence_tracker rt where rt.original_issue_id = i.id) as recurrences,
  (select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
     from attachments a where a.issue_id = i.id) as attachments,
  (select coalesce(jsonb_agg(al order by al.timestamp desc), '[]'::jsonb)
     from audit_logs al where al.issue_id = i.id) as audit_trail
from tech_issues i
left join clients c on c.id = i.client_id
left join processes p on p.id = i.process_id
left join issue_categories cat on cat.id = i.category_id
left join users u on u.id = i.assigned_to;

-- ============================ GRANTS ========================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on sequence tech_issue_id_seq to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_id() to authenticated;
grant execute on function public.can_view_issue(uuid) to authenticated;
grant execute on function public.can_edit_issue(uuid) to authenticated;
grant execute on function public.can_close_issue(uuid) to authenticated;

-- ============================ ROW LEVEL SECURITY ============================
-- RLS rules by role:
--   admin      -> everything (policy per table)
--   manager    -> view everything, create/update issues, manage RCA, solutions,
--                 client checks, monitoring, recurrence, view audit
--   tech_owner -> view/update assigned issues, manage RCA/solutions/checks/monitoring
--   viewer     -> read-only on all business tables
-- The backend uses the service-role key and bypasses RLS; these policies
-- protect direct access through the public anon/authenticated keys.

alter table users enable row level security;
drop policy if exists users_select on users;
create policy users_select on users for select
  using (id = auth.uid() or public.get_my_role() in ('admin', 'manager'));
drop policy if exists users_update on users;
create policy users_update on users for update
  using (id = auth.uid() or public.get_my_role() = 'admin')
  with check (id = auth.uid() or public.get_my_role() = 'admin');
drop policy if exists users_insert on users;
create policy users_insert on users for insert with check (public.get_my_role() = 'admin');
drop policy if exists users_delete on users;
create policy users_delete on users for delete using (public.get_my_role() = 'admin');

alter table clients enable row level security;
drop policy if exists clients_select on clients;
create policy clients_select on clients for select using (auth.role() = 'authenticated');
drop policy if exists clients_admin on clients for insert with check (public.get_my_role() = 'admin');
drop policy if exists clients_admin_update on clients for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists clients_admin_delete on clients for delete using (public.get_my_role() = 'admin');

alter table processes enable row level security;
drop policy if exists processes_select on processes;
create policy processes_select on processes for select using (auth.role() = 'authenticated');
drop policy if exists processes_admin_i on processes for insert with check (public.get_my_role() = 'admin');
drop policy if exists processes_admin_u on processes for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists processes_admin_d on processes for delete using (public.get_my_role() = 'admin');

alter table issue_categories enable row level security;
drop policy if exists categories_select on issue_categories;
create policy categories_select on issue_categories for select using (auth.role() = 'authenticated');
drop policy if exists categories_admin_i on issue_categories for insert with check (public.get_my_role() = 'admin');
drop policy if exists categories_admin_u on issue_categories for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists categories_admin_d on issue_categories for delete using (public.get_my_role() = 'admin');

alter table tech_issues enable row level security;
drop policy if exists issues_select on tech_issues;
create policy issues_select on tech_issues for select using (
  public.get_my_role() in ('admin', 'manager', 'viewer')
  or (public.get_my_role() = 'tech_owner' and (assigned_to = auth.uid() or created_by = auth.uid()))
);
drop policy if exists issues_insert on tech_issues;
create policy issues_insert on tech_issues for insert with check (public.get_my_role() in ('admin', 'manager'));
drop policy if exists issues_update on tech_issues;
create policy issues_update on tech_issues for update using (
  public.get_my_role() in ('admin', 'manager')
  or (public.get_my_role() = 'tech_owner' and assigned_to = auth.uid())
) with check (
  public.get_my_role() in ('admin', 'manager')
  or (public.get_my_role() = 'tech_owner' and assigned_to = auth.uid())
);
drop policy if exists issues_delete on tech_issues;
create policy issues_delete on tech_issues for delete using (public.get_my_role() = 'admin');

-- Child tables: visibility/editing follows the parent issue
alter table rca_logs enable row level security;
create policy rca_select on rca_logs for select using (public.can_view_issue(issue_id));
create policy rca_insert on rca_logs for insert with check (public.can_edit_issue(issue_id));
create policy rca_update on rca_logs for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
create policy rca_delete on rca_logs for delete using (public.get_my_role() = 'admin');

alter table solutions enable row level security;
create policy solutions_select on solutions for select using (public.can_view_issue(issue_id));
create policy solutions_insert on solutions for insert with check (public.can_edit_issue(issue_id));
create policy solutions_update on solutions for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
create policy solutions_delete on solutions for delete using (public.get_my_role() = 'admin');

alter table client_impact_checks enable row level security;
create policy checks_select on client_impact_checks for select using (public.can_view_issue(issue_id));
create policy checks_insert on client_impact_checks for insert with check (public.can_edit_issue(issue_id));
create policy checks_update on client_impact_checks for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
create policy checks_delete on client_impact_checks for delete using (public.get_my_role() = 'admin');

alter table monitoring_logs enable row level security;
create policy monitoring_select on monitoring_logs for select using (public.can_view_issue(issue_id));
create policy monitoring_insert on monitoring_logs for insert with check (public.can_edit_issue(issue_id));
create policy monitoring_update on monitoring_logs for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
create policy monitoring_delete on monitoring_logs for delete using (public.get_my_role() = 'admin');

alter table recurrence_tracker enable row level security;
create policy recurrence_select on recurrence_tracker for select using (public.can_view_issue(original_issue_id));
create policy recurrence_insert on recurrence_tracker for insert with check (public.can_edit_issue(original_issue_id));
create policy recurrence_update on recurrence_tracker for update using (public.can_edit_issue(original_issue_id)) with check (public.can_edit_issue(original_issue_id));
create policy recurrence_delete on recurrence_tracker for delete using (public.get_my_role() = 'admin');

alter table attachments enable row level security;
create policy attachments_select on attachments for select using (public.can_view_issue(issue_id));
create policy attachments_insert on attachments for insert with check (public.can_edit_issue(issue_id));
create policy attachments_delete on attachments for delete using (public.get_my_role() = 'admin');

alter table audit_logs enable row level security;
create policy audit_select on audit_logs for select using (public.get_my_role() in ('admin', 'manager'));
create policy audit_insert on audit_logs for insert with check (public.get_my_role() = 'admin');

alter table notifications enable row level security;
create policy notifications_select on notifications for select using (
  public.get_my_role() in ('admin', 'manager')
  or recipient = (select email from users where id = auth.uid())
  or recipient is null
);
create policy notifications_update on notifications for update using (
  public.get_my_role() = 'admin' or recipient = (select email from users where id = auth.uid())
);
create policy notifications_insert on notifications for insert with check (public.get_my_role() = 'admin');

alter table sla_config enable row level security;
create policy sla_select on sla_config for select using (auth.role() = 'authenticated');
create policy sla_admin on sla_config for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

alter table app_settings enable row level security;
create policy app_settings_select on app_settings for select using (auth.role() = 'authenticated');
create policy app_settings_admin on app_settings for all using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

alter table notification_recipients enable row level security;
create policy recipients_select on notification_recipients for select using (auth.role() = 'authenticated');
create policy recipients_admin_i on notification_recipients for insert with check (public.get_my_role() = 'admin');
create policy recipients_admin_u on notification_recipients for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy recipients_admin_d on notification_recipients for delete using (public.get_my_role() = 'admin');

-- ============================ DEFAULT SLA CONFIG ============================
insert into sla_config (priority, days) values
  ('Critical', 1), ('High', 2), ('Medium', 5), ('Low', 10)
on conflict (priority) do nothing;

insert into app_settings (key, value)
values ('monitoring_periods', '[3, 7, 14, 30]'::jsonb)
on conflict (key) do nothing;
