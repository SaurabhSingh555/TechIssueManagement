"""Issue CRUD + closure/reopen endpoints.

POST /api/issues                      create (auto TECH-YYYY-NNN ID)
GET  /api/issues                      list with filters/pagination
GET  /api/issues/{issue_id}           full detail bundle
PUT  /api/issues/{issue_id}           update (audited)
GET  /api/issues/{issue_id}/can-close closure validation
POST /api/issues/{issue_id}/close     closure (server-enforced)
POST /api/issues/{issue_id}/reopen    recurrence reopen
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from ..config import settings
from ..database import fetchall, fetchone, execute
from ..schemas import (IssueCreate, IssueUpdate, CloseRequest, ReopenRequest,
                       SimilarFindBody, RelationshipCreate, ConfirmSimilar)
from ..security import get_current_user, require_roles, require_issue_manager, require_closure
from ..services import similarity as sim
from ..services.audit import log_audit
from ..services.closure import can_close_issue, close_issue, reopen_issue, next_issue_id
from ..services.notifications import notify_new_issue, notify_assignment

router = APIRouter(tags=["issues"])

_SLA_SQL = """
case when i.status = 'Closed' then 'Closed'
     when (current_date - i.reported_date) > (select days from sla_config where priority = i.priority) then 'Overdue'
     when (current_date - i.reported_date) >= (select days from sla_config where priority = i.priority) - 1 then 'At Risk'
     else 'On Track' end
"""

_ISSUE_SELECT = f"""
select i.*,
       c.client_name, p.process_name, cat.category_name, u.name as assigned_name,
       (current_date - i.reported_date) as days_open,
       (i.reported_date + (select days from sla_config where priority = i.priority)) as sla_due_date,
       {_SLA_SQL} as sla_status
from tech_issues i
left join clients c on c.id = i.client_id
left join processes p on p.id = i.process_id
left join issue_categories cat on cat.id = i.category_id
left join users u on u.id = i.assigned_to
"""


@router.post("/api/issues")
def create_issue(payload: IssueCreate, user: dict = Depends(require_issue_manager)):
    client = fetchone("select * from clients where id = %s", (payload.client_id,))
    if client is None:
        raise HTTPException(status_code=422, detail="Client not found")
    issue_id = next_issue_id()
    row = fetchone(
        """
        insert into tech_issues
            (issue_id, reported_date, reported_by, client_id, process_id, category_id,
             issue_title, issue_description, business_impact, priority, status, assigned_to,
             system_name, error_message,
             client_wide_check_required, monitoring_required, monitoring_period,
             created_by, updated_by)
        values (%s, current_date, %s, %s, %s, %s, %s, %s, %s, %s, 'New', %s, %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (
            issue_id, payload.reported_by or user["name"], payload.client_id, payload.process_id,
            payload.category_id, payload.issue_title, payload.issue_description,
            payload.business_impact, payload.priority, payload.assigned_to,
            payload.system_name, payload.error_message,
            payload.client_wide_check_required, payload.monitoring_required,
            payload.monitoring_period, user["id"], user["id"],
        ),
    )
    log_audit(user["id"], row["id"], row["issue_id"], "Issue Created", "status", None, "New")
    if payload.attachment_file_name:
        execute(
            "insert into attachments (issue_id, file_name, file_type, uploaded_by) values (%s, %s, %s, %s)",
            (row["id"], payload.attachment_file_name, payload.attachment_file_type, user["name"]),
        )
    row = dict(row)
    row["client_name"] = client["client_name"]
    if row.get("process_id"):
        p = fetchone("select process_name from processes where id = %s", (row["process_id"],))
        row["process_name"] = p["process_name"] if p else None
    if row.get("category_id"):
        c = fetchone("select category_name from issue_categories where id = %s", (row["category_id"],))
        row["category_name"] = c["category_name"] if c else None
    notify_new_issue(row)

    # --- AI: automatic previous-issue recognition on creation ---------------
    # Server-side embedding + pgvector search. Advisory only.
    matches = []
    try:
        matches = sim.find_similar(row, 5)
    except Exception:
        pass
    row["similar_matches"] = matches
    row["similar_count"] = len(matches)
    return row


@router.get("/api/issues")
def list_issues(
    search: str | None = None,
    client_id: str | None = None,
    process_id: str | None = None,
    category_id: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    owner_id: str | None = None,
    recurrence: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    where, params = [], []
    if search:
        where.append(
            "(i.issue_id ilike %s or i.issue_title ilike %s or i.issue_description ilike %s "
            "or c.client_name ilike %s or cat.category_name ilike %s or u.name ilike %s)"
        )
        params += [f"%{search}%"] * 6
    if client_id: where.append("i.client_id = %s"); params.append(client_id)
    if process_id: where.append("i.process_id = %s"); params.append(process_id)
    if category_id: where.append("i.category_id = %s"); params.append(category_id)
    if priority: where.append("i.priority = %s"); params.append(priority)
    if status: where.append("i.status = %s"); params.append(status)
    if owner_id: where.append("i.assigned_to = %s"); params.append(owner_id)
    if recurrence in ("true", "false"):
        where.append("i.recurrence = %s"); params.append(recurrence == "true")
    if date_from: where.append("i.reported_date >= %s"); params.append(date_from)
    if date_to: where.append("i.reported_date <= %s"); params.append(date_to)

    # Tech owners see assigned/relevant issues only (same rule as RLS)
    if user["role"] == "tech_owner":
        where.append("(i.assigned_to = %s or i.created_by = %s)")
        params += [user["id"], user["id"]]

    wsql = ("where " + " and ".join(where)) if where else ""
    total = fetchall(f"select count(*) as c from tech_issues i left join clients c on c.id=i.client_id left join users u on u.id=i.assigned_to left join issue_categories cat on cat.id=i.category_id {wsql}", tuple(params))[0]["c"]
    rows = fetchall(
        f"{_ISSUE_SELECT} {wsql} order by i.reported_date desc limit %s offset %s",
        tuple(params + [page_size, (page - 1) * page_size]),
    )
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/api/issues/search")
def search_issues(
    q: str | None = None,
    client_id: str | None = None,
    process_id: str | None = None,
    category_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Knowledge base search — resolved/historical tickets with documented RCA.
    When `q` is provided, ranking uses server-side pgvector semantic search."""
    base_select = """
        i.id, i.issue_id, i.issue_title, i.status, i.priority, i.recurrence_count,
        i.root_cause, i.permanent_solution, i.temporary_solution, i.system_name,
        i.reported_date, i.closure_date,
        c.client_name, p.process_name, cat.category_name
    """
    where = ["i.root_cause is not null", "i.root_cause <> ''"]
    params: list = []
    if client_id: where.append("i.client_id = %s"); params.append(client_id)
    if process_id: where.append("i.process_id = %s"); params.append(process_id)
    if category_id: where.append("i.category_id = %s"); params.append(category_id)
    if date_from: where.append("i.reported_date >= %s"); params.append(date_from)
    if date_to: where.append("i.reported_date <= %s"); params.append(date_to)
    if user["role"] == "tech_owner":
        where.append("(i.assigned_to = %s or i.created_by = %s)")
        params += [user["id"], user["id"]]
    wsql = " and ".join(where)
    joins = ("left join clients c on c.id = i.client_id "
             "left join processes p on p.id = i.process_id "
             "left join issue_categories cat on cat.id = i.category_id")
    if q and q.strip():
        vec, _ = sim.embed(q.strip())
        v = sim._vec_str(vec)
        rows = fetchall(
            f"""
            select {base_select},
                   (1 - (e.embedding <=> %s::vector))::float as similarity
            from issue_embeddings e
            join tech_issues i on i.id = e.issue_id
            {joins}
            where e.embedding is not null and {wsql}
            order by e.embedding <=> %s::vector asc
            limit %s
            """,
            tuple([v] + params + [v, limit]),
        )
    else:
        rows = fetchall(
            f"select {base_select}, null::float as similarity from tech_issues i {joins} "
            f"where {wsql} order by i.closure_date desc nulls last limit %s",
            tuple(params + [limit]),
        )
    return {"items": rows}


@router.get("/api/issues/{issue_id}")
def get_issue(issue_id: str, user: dict = Depends(get_current_user)):
    row = fetchone(f"{_ISSUE_SELECT} where i.id = %s or i.issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    if user["role"] == "tech_owner" and row["assigned_to"] != user["id"] and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only view issues assigned to you")
    iid = row["id"]
    return {
        "issue": row,
        "rca": fetchall("select * from rca_logs where issue_id = %s order by rca_date desc", (iid,)),
        "solutions": fetchall("select * from solutions where issue_id = %s order by proposed_date desc", (iid,)),
        "checks": fetchall(
            "select ch.*, c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id where ch.issue_id = %s order by c.client_name", (iid,)),
        "monitoring": fetchall("select * from monitoring_logs where issue_id = %s order by check_date desc", (iid,)),
        "recurrences": fetchall("select * from recurrence_tracker where original_issue_id = %s order by recurrence_date desc", (iid,)),
        "attachments": fetchall("select * from attachments where issue_id = %s order by created_at desc", (iid,)),
        "audit": fetchall("select * from audit_logs where issue_id = %s order by timestamp desc limit 200", (iid,)),
        "similar": _safe_similar(iid),
        "relationships": _safe_relationships(iid),
    }


def _safe_similar(iid: str):
    try:
        return sim.stored_matches(iid, 5)
    except Exception:
        return []


def _safe_relationships(iid: str):
    try:
        return fetchall(
            """
            select r.*, ri.issue_id as related_issue_id_text,
                   ri.issue_title as related_title, ri.status as related_status
            from issue_relationships r
            join tech_issues ri on ri.id = r.related_issue_id
            where r.issue_id = %s order by r.created_at desc
            """,
            (iid,),
        )
    except Exception:
        return []


@router.put("/api/issues/{issue_id}")
def update_issue(issue_id: str, payload: IssueUpdate, user: dict = Depends(require_issue_manager)):
    row = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    changed_text = any(
        payload.model_dump(exclude_unset=True).get(k) is not None
        and payload.model_dump(exclude_unset=True).get(k) != row.get(k)
        for k in ("issue_title", "issue_description", "error_message", "system_name")
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None or (row.get(field) is not None and value == row[field]):
            continue
        # audit the important changes
        if field in ("status", "priority", "assigned_to", "root_cause", "permanent_solution",
                     "temporary_solution", "testing_status", "client_wide_check_status",
                     "global_fix_status", "final_closure_status"):
            label = {"status": "Status Change", "priority": "Priority Change", "assigned_to": "Assignment"}.get(field, field.replace("_", " ").title())
            old_v = row.get(field)
            if field == "assigned_to":
                if old_v:
                    o = fetchone("select name from users where id = %s", (old_v,))
                    old_v = o["name"] if o else old_v
                n = fetchone("select name from users where id = %s", (value,))
                new_v = n["name"] if n else value
                email = n["email"] if n else None
                notify_assignment(dict(row), email)
            else:
                new_v = value
            log_audit(user["id"], row["id"], row["issue_id"], label, field, old_v, new_v)
        execute(f"update tech_issues set {field} = %s, updated_at = now(), updated_by = %s where id = %s", (value, user["id"], row["id"]))
    # re-run the AI similarity search if search-relevant fields changed
    if changed_text:
        try:
            enriched = fetchone(f"{_ISSUE_SELECT} where i.id = %s", (row["id"],))
            sim.find_similar(enriched, 5)
        except Exception:
            pass
    return fetchone(f"{_ISSUE_SELECT} where i.id = %s", (row["id"],))


@router.get("/api/issues/{issue_id}/can-close")
def can_close(issue_id: str, user: dict = Depends(require_closure)):
    return can_close_issue(issue_id)


@router.post("/api/issues/{issue_id}/close")
def close(issue_id: str, payload: CloseRequest, user: dict = Depends(require_closure)):
    return close_issue(issue_id, payload.remarks, user)


@router.post("/api/issues/{issue_id}/reopen")
def reopen(issue_id: str, payload: ReopenRequest, user: dict = Depends(require_closure)):
    return reopen_issue(issue_id, payload.description, user)


# ---------------- AI similarity / relationships / history ----------------
@router.post("/api/issues/{issue_id}/find-similar")
def find_similar(issue_id: str, payload: SimilarFindBody, user: dict = Depends(get_current_user)):
    """(Re)run the server-side similarity search and return the top matches."""
    row = fetchone(f"{_ISSUE_SELECT} where i.id = %s or i.issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    if user["role"] == "tech_owner" and row["assigned_to"] != user["id"] and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only run similarity search on issues assigned to you")
    if payload.search_text:
        row = dict(row)
        row["issue_title"] = payload.search_text
    matches = sim.find_similar(row, 5)
    return {"issue_id": row["issue_id"], "matches": matches}


@router.get("/api/issues/{issue_id}/similar")
def get_similar(issue_id: str, user: dict = Depends(get_current_user)):
    """Stored similarity matches from the last search for this issue."""
    row = fetchone("select id from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return sim.stored_matches(row["id"], 5)


@router.get("/api/issues/{issue_id}/relationships")
def get_relationships(issue_id: str, user: dict = Depends(get_current_user)):
    row = fetchone("select id from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return _safe_relationships(row["id"])


def _upsert_relationship(issue_id: str, payload: RelationshipCreate, user: dict):
    issue = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    related = fetchone("select * from tech_issues where id = %s or issue_id = %s",
                       (payload.related_issue_id, payload.related_issue_id))
    if related is None:
        raise HTTPException(status_code=404, detail="Related issue not found")
    if related["id"] == issue["id"]:
        raise HTTPException(status_code=409, detail="Cannot link an issue to itself")
    valid = ("same_issue", "related_issue", "duplicate", "recurrence", "not_related")
    if payload.relationship_type not in valid:
        raise HTTPException(status_code=422, detail=f"relationship_type must be one of {valid}")
    rec = fetchone(
        """
        insert into issue_relationships
            (issue_id, related_issue_id, relationship_type, similarity_score, note,
             confirmed, confirmed_by, confirmed_at)
        values (%s, %s, %s, %s, %s, true, %s, now())
        on conflict (issue_id, related_issue_id, relationship_type) do update
        set similarity_score = excluded.similarity_score, confirmed = true,
            confirmed_by = excluded.confirmed_by, confirmed_at = now()
        returning *
        """,
        (issue["id"], related["id"], payload.relationship_type,
         payload.similarity_score, payload.note, user["id"]),
    )
    if payload.relationship_type in ("same_issue", "recurrence"):
        sim.recompute_recurrence(issue["id"])
    log_audit(user["id"], issue["id"], issue["issue_id"], "Similar Issue Linked",
              "issue_relationships", None,
              f"{related['issue_id']} linked as {payload.relationship_type}")
    return rec


@router.post("/api/issues/{issue_id}/relationships")
def create_relationship(issue_id: str, payload: RelationshipCreate,
                        user: dict = Depends(require_issue_manager)):
    """Link the current ticket to a previous one (human-confirmed).
    Prevented from creating duplicate relationships by a unique constraint."""
    return _upsert_relationship(issue_id, payload, user)


@router.post("/api/issues/{issue_id}/confirm-similar")
def confirm_similar(issue_id: str, payload: ConfirmSimilar,
                    user: dict = Depends(require_issue_manager)):
    """[Mark as Same Issue] / [Not the Same Issue] — stores the confirmation.
    Recurrence counting is based on these confirmed links, never on keywords."""
    rel = RelationshipCreate(
        related_issue_id=payload.related_issue_id,
        relationship_type=payload.relationship_type,
        note=payload.note,
    )
    return _upsert_relationship(issue_id, rel, user)


@router.get("/api/issues/{issue_id}/history")
def issue_history(issue_id: str, user: dict = Depends(get_current_user)):
    """Complete ticket history (from the issue_history view over audit_logs)."""
    row = fetchone("select id from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return {"items": fetchall(
        "select * from issue_history where issue_id = %s order by created_at desc", (row["id"],))}


# ---------------- Attachments (Supabase Storage) ----------------
@router.get("/api/issues/{issue_id}/attachments")
def list_attachments(issue_id: str, user: dict = Depends(get_current_user)):
    row = fetchone("select id from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return fetchall("select * from attachments where issue_id = %s order by created_at desc", (row["id"],))


@router.post("/api/issues/{issue_id}/attachments")
async def upload_attachment(issue_id: str, file: UploadFile = File(...), user: dict = Depends(require_issue_manager)):
    from ..security import get_supabase
    row = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    url = None
    try:
        supabase = get_supabase()
        path = f"{row['issue_id']}/{file.filename}"
        supabase.storage.from_("issue-attachments").upload(path, content, {"content-type": file.content_type or "application/octet-stream"})
        url = f"{settings.supabase_url}/storage/v1/object/private/issue-attachments/{path}"
    except Exception:
        pass  # storage optional — record metadata regardless
    rec = fetchone(
        "insert into attachments (issue_id, file_name, file_url, file_type, uploaded_by) values (%s, %s, %s, %s, %s) returning *",
        (row["id"], file.filename, url, file.content_type, user["name"]),
    )
    log_audit(user["id"], row["id"], row["issue_id"], "Attachment Added", "attachments", None, file.filename)
    return rec
