-- ============================================================================
-- TECH ISSUE MANAGEMENT SYSTEM — ROW LEVEL SECURITY (standalone)
-- Re-runnable file. schema.sql already contains these policies; run this file
-- only if you need to re-apply RLS after changes.
--
-- Roles:  admin = everything · manager = view all + manage workflow ·
--         tech_owner = assigned issues only · viewer = read-only
-- The FastAPI backend connects with the service-role key (bypasses RLS).
-- These policies protect direct access via the public anon/authenticated keys.
-- ============================================================================

-- helper functions (security definer — safe against recursive RLS)
create or replace function public.get_my_id()
returns uuid language sql stable security definer set search_path = public as $$
  select auth.uid() $$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from users where id = auth.uid() $$;

create or replace function public.can_view_issue(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.get_my_role() in ('admin', 'manager', 'viewer') then true
    when public.get_my_role() = 'tech_owner' then exists (
      select 1 from tech_issues i where i.id = iid
        and (i.assigned_to = auth.uid() or i.created_by = auth.uid()))
    else false
  end $$;

create or replace function public.can_edit_issue(iid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.get_my_role() in ('admin', 'manager') then true
    when public.get_my_role() = 'tech_owner' then exists (
      select 1 from tech_issues i where i.id = iid and i.assigned_to = auth.uid())
    else false
  end $$;

-- users
alter table users enable row level security;
drop policy if exists users_select on users; create policy users_select on users for select
  using (id = auth.uid() or public.get_my_role() in ('admin', 'manager'));
drop policy if exists users_update on users; create policy users_update on users for update
  using (id = auth.uid() or public.get_my_role() = 'admin') with check (id = auth.uid() or public.get_my_role() = 'admin');
drop policy if exists users_insert on users; create policy users_insert on users for insert with check (public.get_my_role() = 'admin');
drop policy if exists users_delete on users; create policy users_delete on users for delete using (public.get_my_role() = 'admin');

-- master data: readable by all authenticated; managed by admin
alter table clients enable row level security;
drop policy if exists clients_select on clients; create policy clients_select on clients for select using (auth.role() = 'authenticated');
drop policy if exists clients_admin_i on clients; create policy clients_admin_i on clients for insert with check (public.get_my_role() = 'admin');
drop policy if exists clients_admin_u on clients; create policy clients_admin_u on clients for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists clients_admin_d on clients; create policy clients_admin_d on clients for delete using (public.get_my_role() = 'admin');

alter table processes enable row level security;
drop policy if exists processes_select on processes; create policy processes_select on processes for select using (auth.role() = 'authenticated');
drop policy if exists processes_admin_i on processes; create policy processes_admin_i on processes for insert with check (public.get_my_role() = 'admin');
drop policy if exists processes_admin_u on processes; create policy processes_admin_u on processes for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists processes_admin_d on processes; create policy processes_admin_d on processes for delete using (public.get_my_role() = 'admin');

alter table issue_categories enable row level security;
drop policy if exists categories_select on issue_categories; create policy categories_select on issue_categories for select using (auth.role() = 'authenticated');
drop policy if exists categories_admin_i on issue_categories; create policy categories_admin_i on issue_categories for insert with check (public.get_my_role() = 'admin');
drop policy if exists categories_admin_u on issue_categories; create policy categories_admin_u on issue_categories for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists categories_admin_d on issue_categories; create policy categories_admin_d on issue_categories for delete using (public.get_my_role() = 'admin');

-- tech_issues
alter table tech_issues enable row level security;
drop policy if exists issues_select on tech_issues; create policy issues_select on tech_issues for select using (
  public.get_my_role() in ('admin', 'manager', 'viewer')
  or (public.get_my_role() = 'tech_owner' and (assigned_to = auth.uid() or created_by = auth.uid())));
drop policy if exists issues_insert on tech_issues; create policy issues_insert on tech_issues for insert with check (public.get_my_role() in ('admin', 'manager'));
drop policy if exists issues_update on tech_issues; create policy issues_update on tech_issues for update using (
  public.get_my_role() in ('admin', 'manager') or (public.get_my_role() = 'tech_owner' and assigned_to = auth.uid()))
  with check (public.get_my_role() in ('admin', 'manager') or (public.get_my_role() = 'tech_owner' and assigned_to = auth.uid()));
drop policy if exists issues_delete on tech_issues; create policy issues_delete on tech_issues for delete using (public.get_my_role() = 'admin');

-- child tables follow the parent issue's visibility/editability
alter table rca_logs enable row level security;
drop policy if exists rca_select on rca_logs; create policy rca_select on rca_logs for select using (public.can_view_issue(issue_id));
drop policy if exists rca_insert on rca_logs; create policy rca_insert on rca_logs for insert with check (public.can_edit_issue(issue_id));
drop policy if exists rca_update on rca_logs; create policy rca_update on rca_logs for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists rca_delete on rca_logs; create policy rca_delete on rca_logs for delete using (public.get_my_role() = 'admin');

alter table solutions enable row level security;
drop policy if exists solutions_select on solutions; create policy solutions_select on solutions for select using (public.can_view_issue(issue_id));
drop policy if exists solutions_insert on solutions; create policy solutions_insert on solutions for insert with check (public.can_edit_issue(issue_id));
drop policy if exists solutions_update on solutions; create policy solutions_update on solutions for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists solutions_delete on solutions; create policy solutions_delete on solutions for delete using (public.get_my_role() = 'admin');

alter table client_impact_checks enable row level security;
drop policy if exists checks_select on client_impact_checks; create policy checks_select on client_impact_checks for select using (public.can_view_issue(issue_id));
drop policy if exists checks_insert on client_impact_checks; create policy checks_insert on client_impact_checks for insert with check (public.can_edit_issue(issue_id));
drop policy if exists checks_update on client_impact_checks; create policy checks_update on client_impact_checks for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists checks_delete on client_impact_checks; create policy checks_delete on client_impact_checks for delete using (public.get_my_role() = 'admin');

alter table monitoring_logs enable row level security;
drop policy if exists monitoring_select on monitoring_logs; create policy monitoring_select on monitoring_logs for select using (public.can_view_issue(issue_id));
drop policy if exists monitoring_insert on monitoring_logs; create policy monitoring_insert on monitoring_logs for insert with check (public.can_edit_issue(issue_id));
drop policy if exists monitoring_update on monitoring_logs; create policy monitoring_update on monitoring_logs for update using (public.can_edit_issue(issue_id)) with check (public.can_edit_issue(issue_id));
drop policy if exists monitoring_delete on monitoring_logs; create policy monitoring_delete on monitoring_logs for delete using (public.get_my_role() = 'admin');

alter table recurrence_tracker enable row level security;
drop policy if exists recurrence_select on recurrence_tracker; create policy recurrence_select on recurrence_tracker for select using (public.can_view_issue(original_issue_id));
drop policy if exists recurrence_insert on recurrence_tracker; create policy recurrence_insert on recurrence_tracker for insert with check (public.can_edit_issue(original_issue_id));
drop policy if exists recurrence_update on recurrence_tracker; create policy recurrence_update on recurrence_tracker for update using (public.can_edit_issue(original_issue_id)) with check (public.can_edit_issue(original_issue_id));
drop policy if exists recurrence_delete on recurrence_tracker; create policy recurrence_delete on recurrence_tracker for delete using (public.get_my_role() = 'admin');

alter table attachments enable row level security;
drop policy if exists attachments_select on attachments; create policy attachments_select on attachments for select using (public.can_view_issue(issue_id));
drop policy if exists attachments_insert on attachments; create policy attachments_insert on attachments for insert with check (public.can_edit_issue(issue_id));
drop policy if exists attachments_delete on attachments; create policy attachments_delete on attachments for delete using (public.get_my_role() = 'admin');

alter table audit_logs enable row level security;
drop policy if exists audit_select on audit_logs; create policy audit_select on audit_logs for select using (public.get_my_role() in ('admin', 'manager'));
drop policy if exists audit_insert on audit_logs; create policy audit_insert on audit_logs for insert with check (public.get_my_role() = 'admin');

alter table notifications enable row level security;
drop policy if exists notifications_select on notifications; create policy notifications_select on notifications for select using (
  public.get_my_role() in ('admin', 'manager') or recipient = (select email from users where id = auth.uid()) or recipient is null);
drop policy if exists notifications_update on notifications; create policy notifications_update on notifications for update using (
  public.get_my_role() = 'admin' or recipient = (select email from users where id = auth.uid()));
drop policy if exists notifications_insert on notifications; create policy notifications_insert on notifications for insert with check (public.get_my_role() = 'admin');

alter table sla_config enable row level security;
drop policy if exists sla_select on sla_config; create policy sla_select on sla_config for select using (auth.role() = 'authenticated');
drop policy if exists sla_admin on sla_config; create policy sla_admin on sla_config for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

alter table app_settings enable row level security;
drop policy if exists app_settings_select on app_settings; create policy app_settings_select on app_settings for select using (auth.role() = 'authenticated');
drop policy if exists app_settings_admin on app_settings; create policy app_settings_admin on app_settings for all using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

alter table notification_recipients enable row level security;
drop policy if exists recipients_select on notification_recipients; create policy recipients_select on notification_recipients for select using (auth.role() = 'authenticated');
drop policy if exists recipients_admin_i on notification_recipients; create policy recipients_admin_i on notification_recipients for insert with check (public.get_my_role() = 'admin');
drop policy if exists recipients_admin_u on notification_recipients; create policy recipients_admin_u on notification_recipients for update using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
drop policy if exists recipients_admin_d on notification_recipients; create policy recipients_admin_d on notification_recipients for delete using (public.get_my_role() = 'admin');
