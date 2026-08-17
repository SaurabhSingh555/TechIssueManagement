# Testing Checklist

Use this to verify the system end-to-end. Run `schema.sql` first (no seed data is
shipped — the system starts empty), add your own users and clients, then work
through every item. Demo mode starts empty with four role accounts for quick testing.

For the AI similarity feature, also run `database/migration_ai_similarity.sql`
after `schema.sql` (production) — demo mode includes the similarity engine
in-browser automatically.

## Authentication & Roles

- [ ] App opens directly (no login page) — demo mode auto-signs in as Admin
- [ ] Profile menu → "Switch demo role" switches Admin / Manager / Tech Owner / Viewer instantly
- [ ] Admin role → full menu incl. Settings write access
- [ ] Manager role → can create issues, manage workflow, view audit
- [ ] Tech Owner role → sees only issues assigned to them in All Issues (RLS + API filter)
- [ ] Viewer role → read-only (no create/edit buttons anywhere)
- [ ] Production: invalid/expired Supabase token → 401 from the API
- [ ] Direct API call without token → 401; with viewer token on admin endpoint → 403
- [ ] RLS: query `tech_issues` from Supabase with the tech-owner user JWT → only assigned rows

## Issue Management

- [ ] Create issue → auto ID `TECH-YYYY-NNN`, status `New`, defaults set
- [ ] Duplicate issue_id impossible (unique constraint; attempt → error)
- [ ] Attachment selected at creation → appears in Attachments tab
- [ ] Critical/High creation → notification row created (+ email if SMTP configured)
- [ ] Assign issue → audit entry (old → new user) + notification to assignee
- [ ] Status change → audit entry + timeline moves
- [ ] Global search finds by ID, title, client, description, category, owner
- [ ] Filters (date/client/process/category/priority/status/owner/recurrence) work
- [ ] Pagination works; aging badge + SLA badge + days open correct per issue

## RCA / Solutions / Testing

- [ ] Add 2 RCA records → both visible, first marked Superseded (history preserved)
- [ ] Add Temporary + Permanent solution → issue fields update
- [ ] Mark solution "Not Effective" → issue returns to Under Investigation
- [ ] Testing result Passed → checkpoint updates

## Client-Wide Check & Global Fix

- [ ] New issue → Start Client-Wide Check → one row per active relevant client
- [ ] Mark 2 clients "Same Issue = Yes" → `global_fix_required = Yes` automatically
- [ ] Mark one client fix pending → closure blocked with "Affected client fix not implemented"
- [ ] Summary cards (Checked / Pending / Affected / Global Fix) match the table
- [ ] Inactive / non-relevant client never appears in checks

## Monitoring

- [ ] Start 7-day monitoring → dates set, status Monitoring
- [ ] Record stable check before end date → closure blocked ("Period not elapsed")
- [ ] Record check on/after end date with stable=Yes → result Successful, status Resolved
- [ ] Record check with issue_recurred=Yes → result Failed

## Closure Engine (critical)

- [ ] Attempt close on an issue with no RCA → 409 + "RCA: …" reasons, attempt audited
- [ ] Attempt close with pending client check → blocked with client names
- [ ] Attempt close with global fix pending → blocked
- [ ] Attempt close with monitoring pending → blocked
- [ ] After all prerequisites → close succeeds, `final_closure_status = Closed`, audit entry
- [ ] DB function: `select can_close_issue('<uuid>')` returns same verdict as API

## Recurrence / Reopen

- [ ] Reopen a closed issue → recurrence=Yes, recurrence_count incremented
- [ ] `recurrence_tracker` row created; new RCA required
- [ ] Original closure history still in Audit tab (not deleted)
- [ ] New cycle: RCA → solution → testing → check → monitoring → close again
- [ ] Close blocked while recurrence record unresolved

## Dashboard / Reports / Audit

- [ ] Dashboard KPIs match database counts (compare with `tech_issue_dashboard` view)
- [ ] All 8 charts render with data; filters change KPIs
- [ ] Each report type shows correct data
- [ ] CSV export downloads a valid CSV (client-side and `/api/reports/{type}/export`)
- [ ] Audit log shows every action with user, timestamp, old → new values
- [ ] "Closure Blocked" appears in audit after a blocked attempt

## Notifications & Attachments

- [ ] Bell shows seeded notifications; unread badge counts correctly
- [ ] Clicking a notification navigates to the issue
- [ ] With SMTP configured: notification emails delivered; without: app still works

## Settings (admin)

- [ ] Change SLA days → SLA badges/due dates recompute on next fetch
- [ ] Toggle client "relevant for client-wide check" → affects future checks
- [ ] Add/remove process, category, recipient, monitoring period
- [ ] Change user role → that user's access changes on next request

## AI Previous-Issue Recognition

Sample test tickets (create them in order with any client; System field = "SmartPing OB"):

**Ticket 1 (resolve it first):**
- Title: `SmartPing OB API calls are not reaching the client`
- Description: `Outbound API calls from SmartPing to the client OB system are timing out. Client reports no data since this morning.`
- Error Message: `401 Unauthorized — token invalid`
- Then: add RCA (root cause `API authentication token had expired.`), add a permanent solution (`Regenerate the API token and update the API configuration.`), set solution effectiveness → Effective, untick Client-Wide Check/Monitoring in advanced options if you want a fast close, and close it.

**Ticket 2:**
- Title: `SmartPing OB API calls not landing — client requests failing`
- Description: `SmartPing OB API calls are not landing with the client. Requests failing with an authentication error since yesterday.`
- Error Message: `401 auth failure`

Expected behaviour:
- [ ] Creating ticket 2 shows toast "🔍 1 previous similar issue(s) found" and lands on the Similar Issues tab
- [ ] Ticket 1 listed with similarity %, status, RCA and solution
- [ ] ≥90% → "Very Similar Issue" + 🧠 AI Recommendation card with recommended checks
- [ ] [Link as Same Issue] → recurrence badge appears on ticket 2; recurrence_count = 1
- [ ] [Not Related] asks for confirmation and stores the decision
- [ ] Knowledge page: searching "OB API not landing" returns ticket 1 with RCA + solution
- [ ] Dashboard: AI Match Rate / With & Without Matches / Top Recurring / Most Common RCA / Most Common Systems update
- [ ] RCA tab: Verify button records verification (who/when) in the audit trail
- [ ] Recurring banner on ticket 2: "🚨 Recurring Issue … previous solution may not be a permanent fix"
- [ ] Audit log shows "Similar Issue Linked" and "Similarity Search" entries
- [ ] Thresholds editable in Settings → AI Similarity (admin); lowering Medium threshold surfaces more matches
- [ ] No API keys visible in the browser (network tab + bundle)

## Security

- [ ] `SUPABASE_SERVICE_ROLE_KEY` absent from the frontend bundle (check Vercel env + network tab)
- [ ] anon key alone cannot insert into `tech_issues` (RLS blocks)
- [ ] Viewer token cannot write via REST API (403)
