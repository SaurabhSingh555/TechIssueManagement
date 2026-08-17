"""CLOSURE ENGINE — the most important business rule in the system.

An issue may only be Closed when ALL of the following are satisfied:
  1. RCA completed (rca_logs record with status = 'Completed')
  2. Root cause exists
  3. Permanent solution exists
  4. Testing completed (testing_status = 'Passed')
  5. Client-wide check completed
  6. EVERY relevant client checked
  7. Global fix completed if required
  8. Monitoring completed if required (period elapsed)
  9. Monitoring result = Successful
 10. No unresolved recurrence

This module is called by the backend API. The same rules also exist as the
PostgreSQL function `can_close_issue(issue_id)` (defense in depth — see
database/schema.sql). Frontend validation alone is NEVER trusted.
"""
from datetime import date
from fastapi import HTTPException

from ..database import fetchall, fetchone, execute
from ..services.audit import log_audit


def next_issue_id(conn=None) -> str:
    """Generate TECH-YYYY-NNN using a database sequence. Unique by constraint."""
    from ..database import get_conn
    ctx = get_conn() if conn is None else _NullContext(conn)
    with ctx as c:
        with c.cursor() as cur:
            cur.execute("select nextval('tech_issue_id_seq')")
            seq = cur.fetchone()["nextval"]
    year = date.today().year
    return f"TECH-{year}-{seq:03d}"


class _NullContext:
    def __init__(self, obj): self.obj = obj
    def __enter__(self): return self.obj
    def __exit__(self, *a): return False


def can_close_issue(issue_id: str) -> dict:
    """Return {'allowed': bool, 'blocking_reasons': [str, ...]}."""
    issue = fetchone(
        "select i.*, c.client_name from tech_issues i left join clients c on c.id = i.client_id "
        "where i.id = %s or i.issue_id = %s",
        (issue_id, issue_id),
    )
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    reasons: list[str] = []

    rca_done = fetchone(
        "select 1 from rca_logs where issue_id = %s and status = 'Completed' limit 1", (issue["id"],)
    )
    if not issue.get("root_cause"):
        reasons.append("RCA: Root cause missing")
    if rca_done is None:
        reasons.append("RCA: No completed RCA record")

    perm = fetchone(
        "select 1 from solutions where issue_id = %s and solution_type = 'Permanent' limit 1", (issue["id"],)
    )
    if not issue.get("permanent_solution") or perm is None:
        reasons.append("Solution: Permanent solution missing")

    if issue.get("testing_status") != "Passed":
        reasons.append("Testing: Not completed (must be Passed)")

    if issue.get("client_wide_check_required"):
        if issue.get("client_wide_check_status") != "Completed":
            reasons.append("Client-Wide Check: Not completed")
        else:
            pending = fetchall(
                """
                select c.client_name from clients c
                where c.active and c.relevant_for_client_wide_check
                  and not exists (
                    select 1 from client_impact_checks ch
                    where ch.client_id = c.id and ch.issue_id = %s and ch.check_date is not null
                  )
                """,
                (issue["id"],),
            )
            if pending:
                reasons.append(
                    "Client-Wide Check: Pending for " + ", ".join(p["client_name"] for p in pending)
                )
            unfixed = fetchall(
                """
                select c.client_name from client_impact_checks ch
                join clients c on c.id = ch.client_id
                where ch.issue_id = %s and ch.same_issue_found and ch.fix_required and not ch.fix_implemented
                """,
                (issue["id"],),
            )
            if unfixed:
                reasons.append(
                    "Affected client fix not implemented: " + ", ".join(u["client_name"] for u in unfixed)
                )

    if issue.get("global_fix_required") and issue.get("global_fix_status") != "Completed":
        reasons.append("Global Fix: Required but not completed")

    if issue.get("monitoring_required"):
        if not issue.get("monitoring_end_date"):
            reasons.append("Monitoring: Period not started")
        elif date.fromisoformat(str(issue["monitoring_end_date"])) > date.today():
            reasons.append(f"Monitoring: Period not elapsed (ends {issue['monitoring_end_date']})")
        if issue.get("monitoring_result") != "Successful":
            reasons.append("Monitoring: No successful result recorded")

    open_rec = fetchall(
        "select 1 from recurrence_tracker where original_issue_id = %s "
        "and status not in ('Resolved', 'Closed') limit 1",
        (issue["id"],),
    )
    if open_rec:
        reasons.append("Recurrence: Unresolved recurrence record exists")

    return {"allowed": len(reasons) == 0, "blocking_reasons": reasons}


def close_issue(issue_id: str, remarks: str, user: dict) -> dict:
    """Server-side closure enforcement. Raises HTTPException(409) when blocked."""
    check = can_close_issue(issue_id)
    issue = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))

    if not check["allowed"]:
        log_audit(
            user_id=user["id"],
            issue_id=issue["id"],
            issue_id_text=issue["issue_id"],
            action="Closure Blocked",
            field_name="closure",
            old_value=None,
            new_value="Blocked: " + "; ".join(check["blocking_reasons"]),
        )
        raise HTTPException(
            status_code=409,
            detail={"msg": "Closure blocked by validation", "blocking_reasons": check["blocking_reasons"]},
        )

    execute(
        """
        update tech_issues
        set status = 'Resolved', final_closure_status = 'Closed', closure_date = now(),
            closure_remarks = %s, updated_at = now(), updated_by = %s
        where id = %s
        """,
        (remarks, user["id"], issue["id"]),
    )
    log_audit(
        user_id=user["id"], issue_id=issue["id"], issue_id_text=issue["issue_id"],
        action="Closure", field_name="final_closure_status",
        old_value=issue.get("final_closure_status") or "Resolved", new_value="Closed",
    )
    return {"closed": True, "issue_id": issue["issue_id"]}


def reopen_issue(issue_id: str, description: str, user: dict) -> dict:
    """Reopen a closed/resolved issue as a recurrence.

    - marks recurrence = Yes, increments recurrence_count
    - creates a recurrence_tracker record (new RCA/solution/checks/monitoring required)
    - resets workflow flags — original closure history is preserved via audit_logs
    """
    issue = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    if issue["status"] not in ("Closed", "Resolved"):
        raise HTTPException(status_code=409, detail="Only a Closed/Resolved issue can be reopened as a recurrence")

    execute(
        """
        update tech_issues
        set recurrence = true,
            recurrence_count = coalesce(recurrence_count, 0) + 1,
            status = 'Reopened',
            final_closure_status = 'Reopened',
            testing_status = 'Pending',
            client_wide_check_status = 'Pending',
            global_fix_required = false,
            global_fix_status = 'Not Required',
            monitoring_result = null,
            monitoring_start_date = null,
            monitoring_end_date = null,
            permanent_solution = null,
            updated_at = now(), updated_by = %s
        where id = %s
        """,
        (user["id"], issue["id"]),
    )
    execute(
        """
        insert into recurrence_tracker
            (original_issue_id, recurrence_date, client_id, same_issue, recurrence_description,
             new_rca_required, owner, status, remarks)
        values (%s, current_date, %s, true, %s, true, %s, 'Under RCA',
                'Original closure history preserved.')
        """,
        (issue["id"], issue["client_id"], description,
         issue.get("assigned_to") and fetchone("select name from users where id = %s", (issue["assigned_to"],))["name"] or ""),
    )
    log_audit(
        user_id=user["id"], issue_id=issue["id"], issue_id_text=issue["issue_id"],
        action="Issue Reopened", field_name="recurrence", old_value="false", new_value="true",
    )
    log_audit(
        user_id=user["id"], issue_id=issue["id"], issue_id_text=issue["issue_id"],
        action="Recurrence Recorded", field_name="recurrence_tracker",
        old_value=None, new_value="Same issue — new RCA required",
    )
    return {"reopened": True, "issue_id": issue["issue_id"], "recurrence_count": (issue["recurrence_count"] or 0) + 1}


def compute_sla(reported_date, priority: str, closed: bool) -> dict:
    """SLA computed from the DB-driven sla_config table."""
    cfg = fetchone(
        "select (select days from sla_config where priority = 'Critical') as critical, "
        "(select days from sla_config where priority = 'High') as high, "
        "(select days from sla_config where priority = 'Medium') as medium, "
        "(select days from sla_config where priority = 'Low') as low"
    )
    days = {"Critical": cfg["critical"], "High": cfg["high"], "Medium": cfg["medium"], "Low": cfg["low"]}[priority]
    from datetime import datetime
    start = datetime.fromisoformat(str(reported_date))
    open_days = max(0, (date.today() - start.date()).days)
    if closed:
        status = "Closed"
    elif open_days > days:
        status = "Overdue"
    elif open_days >= days - 1:
        status = "At Risk"
    else:
        status = "On Track"
    return {"due_date": str(start.date() + __import__("datetime").timedelta(days=days)), "days": days,
            "days_open": open_days, "status": status}
