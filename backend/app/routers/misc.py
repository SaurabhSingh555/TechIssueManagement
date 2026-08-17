"""Audit logs + notifications endpoints."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..database import fetchall, execute
from ..security import get_current_user, require_roles

router = APIRouter(tags=["misc"])


@router.get("/api/audit-logs")
def list_audit_logs(
    issue_id: str | None = None,
    action: str | None = None,
    user: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    _user: dict = Depends(require_roles("admin", "manager")),
):
    where, params = [], []
    if issue_id:
        where.append("issue_id_text ilike %s"); params.append(f"%{issue_id}%")
    if action:
        where.append("action = %s"); params.append(action)
    if user:
        where.append("coalesce(user_name, '') ilike %s"); params.append(f"%{user}%")
    wsql = ("where " + " and ".join(where)) if where else ""
    total = fetchall(f"select count(*) as c from audit_logs {wsql}", tuple(params))[0]["c"]
    rows = fetchall(
        f"select * from audit_logs {wsql} order by timestamp desc limit %s offset %s",
        tuple(params + [page_size, (page - 1) * page_size]),
    )
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/api/notifications")
def list_notifications(user: dict = Depends(get_current_user)):
    rows = fetchall(
        """
        select * from notifications
        where recipient = %s or recipient is null
        order by sent_at desc limit 100
        """,
        (user["email"],),
    )
    unread = sum(1 for r in rows if r.get("status") != "Sent")
    return {"items": rows, "unread": unread}


class ReadRequest(BaseModel):
    pass


@router.post("/api/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: dict = Depends(get_current_user)):
    execute(
        "update notifications set status = 'Sent' where id = %s and (recipient = %s or recipient is null)",
        (notification_id, user["email"]),
    )
    return {"ok": True}
