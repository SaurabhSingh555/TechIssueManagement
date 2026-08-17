"""Settings endpoints — all configurable values are database-driven.

Clients, processes, categories, users/roles, SLA, monitoring periods,
notification recipients.
"""
from fastapi import APIRouter, Depends, HTTPException

from ..database import fetchall, fetchone, execute
from ..schemas import (ClientCreate, ClientUpdate, ProcessCreate, CategoryCreate,
                       UserUpdate, SlaUpdate, PeriodsUpdate, RecipientCreate, RecipientUpdate,
                       SimilaritySettingsUpdate)
from ..security import get_current_user, require_admin
from ..services.audit import log_audit

router = APIRouter(tags=["settings"])


# ---------------- master data (read by everyone authenticated) ----------------
@router.get("/api/settings")
def get_settings(user: dict = Depends(get_current_user)):
    sla = {r["priority"]: r["days"] for r in fetchall("select priority, days from sla_config")}
    periods = fetchall("select value from app_settings where key = 'monitoring_periods'")
    recipients = fetchall("select * from notification_recipients order by name")
    sim_row = fetchone("select value from app_settings where key = 'similarity_settings'")
    similarity = sim_row["value"] if sim_row else {"high": 0.90, "medium": 0.75}
    return {"sla": sla, "monitoring_periods": periods[0]["value"] if periods else [3, 7, 14, 30],
            "recipients": recipients, "similarity": similarity}


@router.get("/api/settings/clients")
def list_clients(user: dict = Depends(get_current_user)):
    return fetchall("""
        select c.*, (select count(*) from tech_issues i where i.client_id = c.id) as issue_count
        from clients c order by c.client_name
    """)


@router.post("/api/settings/clients")
def create_client(payload: ClientCreate, user: dict = Depends(require_admin)):
    if fetchone("select 1 from clients where client_code = %s", (payload.client_code.upper(),)):
        raise HTTPException(status_code=409, detail="Client code already exists")
    rec = fetchone(
        "insert into clients (client_code, client_name, active, relevant_for_client_wide_check, owner) values (%s, %s, %s, %s, %s) returning *",
        (payload.client_code.upper(), payload.client_name, payload.active, payload.relevant_for_client_wide_check, payload.owner),
    )
    log_audit(user["id"], None, None, "Client Added", "clients", None, rec["client_name"])
    return rec


@router.put("/api/settings/clients/{client_id}")
def update_client(client_id: str, payload: ClientUpdate, user: dict = Depends(require_admin)):
    rec = fetchone(
        "update clients set client_code = %s, client_name = %s, active = %s, relevant_for_client_wide_check = %s, owner = %s, updated_at = now() where id = %s returning *",
        (payload.client_code.upper(), payload.client_name, payload.active, payload.relevant_for_client_wide_check, payload.owner, client_id),
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return rec


@router.delete("/api/settings/clients/{client_id}")
def delete_client(client_id: str, user: dict = Depends(require_admin)):
    execute("delete from clients where id = %s", (client_id,))
    return {"ok": True}


@router.get("/api/settings/processes")
def list_processes(user: dict = Depends(get_current_user)):
    return fetchall("select * from processes order by process_name")


@router.post("/api/settings/processes")
def create_process(payload: ProcessCreate, user: dict = Depends(require_admin)):
    return fetchone("insert into processes (process_name, active) values (%s, %s) returning *", (payload.process_name, payload.active))


@router.put("/api/settings/processes/{process_id}")
def update_process(process_id: str, payload: ProcessCreate, user: dict = Depends(require_admin)):
    return fetchone("update processes set process_name = %s, active = %s where id = %s returning *", (payload.process_name, payload.active, process_id))


@router.delete("/api/settings/processes/{process_id}")
def delete_process(process_id: str, user: dict = Depends(require_admin)):
    execute("delete from processes where id = %s", (process_id,))
    return {"ok": True}


@router.get("/api/settings/categories")
def list_categories(user: dict = Depends(get_current_user)):
    return fetchall("select * from issue_categories order by category_name")


@router.post("/api/settings/categories")
def create_category(payload: CategoryCreate, user: dict = Depends(require_admin)):
    return fetchone("insert into issue_categories (category_name, active) values (%s, %s) returning *", (payload.category_name, payload.active))


@router.put("/api/settings/categories/{category_id}")
def update_category(category_id: str, payload: CategoryCreate, user: dict = Depends(require_admin)):
    return fetchone("update issue_categories set category_name = %s, active = %s where id = %s returning *", (payload.category_name, payload.active, category_id))


@router.delete("/api/settings/categories/{category_id}")
def delete_category(category_id: str, user: dict = Depends(require_admin)):
    execute("delete from issue_categories where id = %s", (category_id,))
    return {"ok": True}


@router.get("/api/settings/users")
def list_users(user: dict = Depends(get_current_user)):
    return fetchall("select id, name, email, role, active, created_at from users order by name")


@router.put("/api/settings/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_admin)):
    rec = fetchone("select * from users where id = %s", (user_id,))
    if rec is None:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            execute(f"update users set {field} = %s, updated_at = now() where id = %s", (value, user_id))
    log_audit(user["id"], None, None, "User Updated", "users", None, f"{rec['name']} role -> {payload.role}")
    return fetchone("select id, name, email, role, active from users where id = %s", (user_id,))


# ---------------- SLA ----------------
@router.put("/api/settings/sla")
def update_sla(payload: SlaUpdate, user: dict = Depends(require_admin)):
    for priority, days in payload.model_dump().items():
        execute("update sla_config set days = %s where priority = %s", (days, priority))
    log_audit(user["id"], None, None, "SLA Updated", "sla_config", None, str(payload.model_dump()))
    return payload


# ---------------- monitoring periods ----------------
@router.put("/api/settings/monitoring-periods")
def update_periods(payload: PeriodsUpdate, user: dict = Depends(require_admin)):
    periods = sorted({p for p in payload.periods if 1 <= p <= 365})
    if not periods:
        raise HTTPException(status_code=422, detail="At least one period required")
    execute(
        "insert into app_settings (key, value) values ('monitoring_periods', %s) "
        "on conflict (key) do update set value = excluded.value",
        (periods,),
    )
    return {"periods": periods}


# ---------------- AI similarity thresholds ----------------
@router.put("/api/settings/similarity")
def update_similarity(payload: SimilaritySettingsUpdate, user: dict = Depends(require_admin)):
    """Configurable similarity thresholds (DB-driven):
    >= high → "Very Similar Issue", >= medium → "Potentially Similar Issue"."""
    if payload.high_threshold < payload.medium_threshold:
        raise HTTPException(status_code=422, detail="high_threshold must be >= medium_threshold")
    execute(
        "insert into app_settings (key, value) values ('similarity_settings', %s) "
        "on conflict (key) do update set value = excluded.value",
        ({"high": payload.high_threshold, "medium": payload.medium_threshold},),
    )
    log_audit(user["id"], None, None, "Similarity Settings Updated", "app_settings", None,
              str({"high": payload.high_threshold, "medium": payload.medium_threshold}))
    return {"high": payload.high_threshold, "medium": payload.medium_threshold}


# ---------------- notification recipients ----------------
@router.get("/api/settings/recipients")
def list_recipients(user: dict = Depends(get_current_user)):
    return fetchall("select * from notification_recipients order by name")


@router.post("/api/settings/recipients")
def create_recipient(payload: RecipientCreate, user: dict = Depends(require_admin)):
    return fetchone(
        "insert into notification_recipients (email, name, notify_critical, notify_high, notify_sla, active) values (%s, %s, %s, %s, %s, %s) returning *",
        (payload.email, payload.name, payload.notify_critical, payload.notify_high, payload.notify_sla, payload.active),
    )


@router.put("/api/settings/recipients/{recipient_id}")
def update_recipient(recipient_id: str, payload: RecipientUpdate, user: dict = Depends(require_admin)):
    rec = fetchone(
        "update notification_recipients set email = %s, name = %s, notify_critical = %s, notify_high = %s, notify_sla = %s, active = %s where id = %s returning *",
        (payload.email, payload.name, payload.notify_critical, payload.notify_high, payload.notify_sla, payload.active, recipient_id),
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return rec


@router.delete("/api/settings/recipients/{recipient_id}")
def delete_recipient(recipient_id: str, user: dict = Depends(require_admin)):
    execute("delete from notification_recipients where id = %s", (recipient_id,))
    return {"ok": True}
