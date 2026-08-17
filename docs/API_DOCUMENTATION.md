# API Documentation — FastAPI Backend

Base URL: `https://<your-backend>/api` · Auth header: `Authorization: Bearer <supabase-jwt>`
Interactive docs: `https://<your-backend>/docs`

## Auth

| Method | Path          | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| GET    | `/auth/me`    | Current user + role (loaded from `users` table)    |
| GET    | `/health`     | Service + database health                          |

## Issues

| Method | Path                         | Description                                              |
| ------ | ---------------------------- | -------------------------------------------------------- |
| POST   | `/issues`                    | Create issue → auto `TECH-YYYY-NNN`, status `New`, defaults Client-Wide Check=Yes, Monitoring=Yes |
| GET    | `/issues`                    | List (filters: `search, client_id, process_id, category_id, priority, status, owner_id, recurrence, date_from, date_to, page, page_size`) — includes computed `days_open`, `sla_due_date`, `sla_status` |
| GET    | `/issues/{issue_id}`         | Full bundle: issue + rca + solutions + checks + monitoring + recurrences + attachments + audit |
| PUT    | `/issues/{issue_id}`         | Update fields (status/priority/assignment changes are audited; assignment sends a notification) |
| GET    | `/issues/{issue_id}/can-close` | Closure validation → `{"allowed": false, "blocking_reasons": [...]}` |
| POST   | `/issues/{issue_id}/close`   | **Server-enforced** closure. `409` with `blocking_reasons` when any prerequisite fails |
| POST   | `/issues/{issue_id}/reopen`  | Reopen as recurrence: sets recurrence, increments count, creates `recurrence_tracker`, resets cycle (original closure history preserved) |

Example closure-blocked response:

```json
{ "detail": { "msg": "Closure blocked by validation",
  "blocking_reasons": ["Client-Wide Check: Pending for Hatke Logistics", "Monitoring: Period not elapsed"] } }
```

## RCA

| Method | Path                          | Description                                          |
| ------ | ----------------------------- | ---------------------------------------------------- |
| GET    | `/rca?issue_id=`              | RCA records (history never overwritten)              |
| POST   | `/issues/{id}/rca`            | Add RCA (supersedes any In-Progress RCA)             |

## Solutions

| Method | Path                             | Description                                        |
| ------ | -------------------------------- | -------------------------------------------------- |
| GET    | `/solutions?issue_id=`           | All solutions                                      |
| POST   | `/issues/{id}/solutions`         | Add Temporary/Permanent solution                   |
| PUT    | `/solutions/{solution_id}`       | Update testing status / effectiveness. **Not Effective → issue returns to Under Investigation** |

## Client-Wide Checks

| Method | Path                                 | Description                                                        |
| ------ | ------------------------------------ | ------------------------------------------------------------------ |
| GET    | `/client-checks?issue_id=`           | Check records (client_name included)                               |
| POST   | `/issues/{id}/client-check/start`    | Creates rows for every active `relevant_for_client_wide_check` client (idempotent) |
| PUT    | `/client-checks/{check_id}`          | Record findings; auto-recomputes completion + `global_fix_required` (affected > 1) |
| GET    | `/issues/{id}/client-check/summary`  | `{total_relevant, checked, pending, affected, affected_clients, global_fix_required, global_fix_status, fix_pending}` |

## Monitoring

| Method | Path                               | Description                                                     |
| ------ | ---------------------------------- | --------------------------------------------------------------- |
| GET    | `/monitoring?issue_id=`            | Monitoring logs                                                 |
| POST   | `/issues/{id}/monitoring/start`    | Body `{"period_days": 7}` → sets start/end dates, status Monitoring |
| POST   | `/issues/{id}/monitoring/logs`     | Record check. Period elapsed + stable → result Successful → status Resolved |

## Recurrence

| Method | Path                        | Description                                        |
| ------ | --------------------------- | -------------------------------------------------- |
| GET    | `/recurrence`               | All recurrence tracker records                     |
| POST   | `/issues/{id}/recurrence`   | Record recurrence (increments count, flags issue)  |

## AI Similarity / Historical RCA (new)

| Method | Path                                        | Description |
| ------ | ------------------------------------------- | ----------- |
| POST   | `/issues/{id}/find-similar`                 | (Re)run server-side similarity search. Body `{"search_text": "…"}` (optional override). Returns `{"issue_id", "matches": [{issue_id, similarity, status, root_cause, permanent_solution, recurrence_count, technical_cause, contributing_factors, preventive_action}]}` — top 5 |
| GET    | `/issues/{id}/similar`                      | Stored similarity matches from the last search |
| GET    | `/issues/{id}/relationships`                | Confirmed links to previous tickets |
| POST   | `/issues/{id}/relationships`                | Link tickets. Body `{"related_issue_id", "relationship_type": "same_issue"|"related_issue"|"duplicate"|"recurrence"|"not_related", "similarity_score", "note"}`. Duplicate relationships prevented by unique constraint |
| POST   | `/issues/{id}/confirm-similar`              | [Mark as Same Issue] / [Not the Same Issue] — stored confirmation; same_issue updates the recurrence counter |
| GET    | `/issues/{id}/history`                      | Complete ticket history (`issue_history` view over audit_logs) |
| GET    | `/issues/search?q=&client_id=&process_id=&category_id=&date_from=&date_to=&limit=` | Knowledge base search — tickets with documented RCA; `q` ranked via pgvector semantic search |
| PUT    | `/rca/{rca_id}`                             | Update/verify an RCA record (verification, investigation, notes — audited) |
| PUT    | `/settings/similarity`                      | Admin: `{"high_threshold": 0.90, "medium_threshold": 0.75}` (DB-driven) |

On `POST /api/issues` the response now includes `similar_matches` (top 5) and
`similar_count` — the automatic previous-issue recognition run.

Similarity tiers: ≥ high threshold → "Very Similar Issue", ≥ medium threshold →
"Potentially Similar Issue", below → "Low Similarity".

## Dashboard & Reports

| Method | Path                           | Description                                            |
| ------ | ------------------------------ | ------------------------------------------------------ |
| GET    | `/dashboard`                   | KPIs + chart series, filterable (same filters as issues) |
| GET    | `/reports/{type}`              | `monthly, client, category, rca, solution, recurrence` |
| GET    | `/reports/{type}/export`       | CSV download (Content-Disposition attachment)          |

## Settings (admin for writes)

| Method | Path                                  | Notes                                    |
| ------ | ------------------------------------- | ---------------------------------------- |
| GET    | `/settings`                           | SLA map + monitoring periods + recipients |
| GET/POST/PUT/DELETE | `/settings/clients[/{id}]`   | Master data (admin writes)               |
| GET/POST/PUT/DELETE | `/settings/processes[/{id}]` |                                          |
| GET/POST/PUT/DELETE | `/settings/categories[/{id}]` |                                         |
| GET    | `/settings/users` / PUT `/settings/users/{id}` | Role management (admin)     |
| PUT    | `/settings/sla`                       | `{"Critical": 1, "High": 2, ...}`         |
| PUT    | `/settings/monitoring-periods`        | `{"periods": [3,7,14,30]}`                |
| GET/POST/PUT/DELETE | `/settings/recipients[/{id}]` | Notification recipients (admin)  |

## Misc

| Method | Path                                 | Notes                          |
| ------ | ------------------------------------ | ------------------------------ |
| GET    | `/audit-logs`                        | Filters: `issue_id, action, user`, paginated. Admin/Manager |
| GET    | `/notifications`                     | Current user's notifications   |
| POST   | `/notifications/{id}/read`           | Mark as sent/read              |
| GET    | `/issues/{id}/attachments`           | Attachment metadata            |
| POST   | `/issues/{id}/attachments`           | multipart upload → Supabase Storage `issue-attachments` bucket (private) |

## Errors

All errors return JSON: `{"detail": "..."}` (or `{"detail": {"msg", "blocking_reasons"}}`).
Status codes: `400` validation, `401` unauthenticated, `403` forbidden role,
`404` not found, `409` business rule conflict (e.g. closure blocked), `422` bad payload.
