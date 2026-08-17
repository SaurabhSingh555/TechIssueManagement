"""Workflow endpoints: RCA, solutions, client-wide checks, monitoring, recurrence.

POST /api/issues/{id}/rca                add RCA (history preserved)
GET  /api/rca                            list all RCA
POST /api/issues/{id}/solutions          add solution
GET  /api/solutions                      list all solutions
PUT  /api/solutions/{id}                 update testing/effectiveness
POST /api/issues/{id}/client-check/start create check rows for all relevant clients
PUT  /api/client-checks/{id}             update a client check record
GET  /api/issues/{id}/client-check/summary  computed summary
POST /api/issues/{id}/monitoring/start   start monitoring period
POST /api/issues/{id}/monitoring/logs    record a monitoring check
GET  /api/monitoring                     list all monitoring logs
POST /api/issues/{id}/recurrence         record recurrence
GET  /api/recurrence                     list all recurrence records
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import fetchall, fetchone, execute
from ..schemas import (RcaCreate, RcaUpdate, SolutionCreate, SolutionUpdate,
                       ClientCheckUpdate, MonitoringStart, MonitoringLogCreate, RecurrenceCreate)
from ..security import get_current_user, require_workflow_manager, require_issue_manager
from ..services.audit import log_audit

router = APIRouter(tags=["workflow"])


def _issue(issue_id: str) -> dict:
    row = fetchone("select * from tech_issues where id = %s or issue_id = %s", (issue_id, issue_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return row


# ================= RCA =================
@router.get("/api/rca")
def list_rca(issue_id: str | None = None, user: dict = Depends(get_current_user)):
    if issue_id:
        row = _issue(issue_id)
        return fetchall("select * from rca_logs where issue_id = %s order by rca_date desc", (row["id"],))
    return fetchall(
        "select r.*, i.issue_id as issue_id_text from rca_logs r join tech_issues i on i.id = r.issue_id order by r.rca_date desc"
    )


@router.post("/api/issues/{issue_id}/rca")
def create_rca(issue_id: str, payload: RcaCreate, user: dict = Depends(require_workflow_manager)):
    row = _issue(issue_id)
    # previous In Progress RCA is superseded — history never overwritten
    execute("update rca_logs set status = 'Superseded' where issue_id = %s and status = 'In Progress'", (row["id"],))
    rec = fetchone(
        """
        insert into rca_logs (issue_id, rca_date, root_cause, technical_cause, process_cause,
                              contributing_factors, temporary_fix, permanent_fix, preventive_action,
                              investigation, verification_notes, owner, status, remarks, created_by)
        values (%s, current_date, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (row["id"], payload.root_cause, payload.technical_cause, payload.process_cause,
         payload.contributing_factors, payload.temporary_fix, payload.permanent_fix,
         payload.preventive_action, payload.investigation, payload.verification_notes,
         payload.owner, payload.status, payload.remarks, user["id"]),
    )
    if not row.get("root_cause"):
        execute("update tech_issues set root_cause = %s, updated_at = now(), updated_by = %s where id = %s",
                (payload.root_cause, user["id"], row["id"]))
    if row["status"] in ("New", "Under Investigation"):
        execute("update tech_issues set status = 'RCA In Progress' where id = %s", (row["id"],))
    log_audit(user["id"], row["id"], row["issue_id"], "RCA Added", "rca_logs", None, payload.root_cause[:60])
    return rec


@router.put("/api/rca/{rca_id}")
def update_rca(rca_id: str, payload: RcaUpdate, user: dict = Depends(require_workflow_manager)):
    """Update/verify an RCA record. Verification is human-confirmed and audited."""
    rec = fetchone("select * from rca_logs where id = %s", (rca_id,))
    if rec is None:
        raise HTTPException(status_code=404, detail="RCA record not found")
    issue = fetchone("select * from tech_issues where id = %s", (rec["issue_id"],))
    data = payload.model_dump(exclude_unset=True)
    if data.get("verified") and not rec.get("verified"):
        data["verified_at"] = "now()"
        data["verified_by"] = data.get("verified_by") or user["name"]
        log_audit(user["id"], rec["issue_id"], issue["issue_id"], "RCA Verified",
                  "rca_logs", None, "Verification recorded")
    for field, value in data.items():
        if field == "verified_at":
            continue
        if value is not None:
            if field == "verified_at":
                execute("update rca_logs set verified_at = now() where id = %s", (rca_id,))
            else:
                execute(f"update rca_logs set {field} = %s where id = %s", (value, rca_id))
    if data.get("verified"):
        execute("update rca_logs set verified_at = now() where id = %s", (rca_id,))
    log_audit(user["id"], rec["issue_id"], issue["issue_id"], "RCA Updated",
              "rca_logs", None, "RCA record updated")
    return fetchone("select * from rca_logs where id = %s", (rca_id,))


# ================= SOLUTIONS =================
@router.get("/api/solutions")
def list_solutions(issue_id: str | None = None, user: dict = Depends(get_current_user)):
    if issue_id:
        row = _issue(issue_id)
        return fetchall("select * from solutions where issue_id = %s order by proposed_date desc", (row["id"],))
    return fetchall(
        "select s.*, i.issue_id as issue_id_text from solutions s join tech_issues i on i.id = s.issue_id order by s.proposed_date desc"
    )


@router.post("/api/issues/{issue_id}/solutions")
def create_solution(issue_id: str, payload: SolutionCreate, user: dict = Depends(require_workflow_manager)):
    row = _issue(issue_id)
    rec = fetchone(
        """
        insert into solutions (issue_id, solution_description, solution_type, proposed_date,
                               implemented_by, testing_required, solution_effective, evidence_url)
        values (%s, %s, %s, current_date, %s, %s, %s, %s)
        returning *
        """,
        (row["id"], payload.solution_description, payload.solution_type, payload.implemented_by,
         payload.testing_required, payload.solution_effective, payload.evidence_url),
    )
    if payload.solution_type == "Permanent":
        execute("update tech_issues set permanent_solution = %s, status = case when status in ('RCA In Progress','New','Under Investigation') then 'Solution Proposed' else status end, updated_at = now(), updated_by = %s where id = %s",
                (payload.solution_description, user["id"], row["id"]))
    else:
        execute("update tech_issues set temporary_solution = %s, updated_at = now(), updated_by = %s where id = %s",
                (payload.solution_description, user["id"], row["id"]))
    log_audit(user["id"], row["id"], row["issue_id"], "Solution Added", "solutions", None, f"{payload.solution_type}: {payload.solution_description[:60]}")
    return rec


@router.put("/api/solutions/{solution_id}")
def update_solution(solution_id: str, payload: SolutionUpdate, user: dict = Depends(require_workflow_manager)):
    rec = fetchone("select * from solutions where id = %s", (solution_id,))
    if rec is None:
        raise HTTPException(status_code=404, detail="Solution not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            execute(f"update solutions set {field} = %s where id = %s", (value, solution_id))
    issue = fetchone("select * from tech_issues where id = %s", (rec["issue_id"],))
    if payload.testing_status == "Passed":
        execute("update tech_issues set testing_status = 'Passed', testing_result = %s, updated_at = now(), updated_by = %s where id = %s",
                (payload.testing_result or "", user["id"], rec["issue_id"]))
    if payload.solution_effective == "Not Effective":
        # Return the issue to investigation / RCA
        execute("update tech_issues set status = 'Under Investigation', testing_status = 'Pending', updated_at = now(), updated_by = %s where id = %s",
                (user["id"], rec["issue_id"]))
        log_audit(user["id"], issue["id"], issue["issue_id"], "Solution Not Effective", "status", "Testing", "Under Investigation")
    return fetchone("select * from solutions where id = %s", (solution_id,))


# ================= CLIENT-WIDE CHECKS =================
@router.get("/api/client-checks")
def list_checks(issue_id: str | None = None, user: dict = Depends(get_current_user)):
    if issue_id:
        row = _issue(issue_id)
        return fetchall(
            "select ch.*, c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id where ch.issue_id = %s order by c.client_name",
            (row["id"],))
    return fetchall(
        "select ch.*, c.client_name, i.issue_id as issue_id_text from client_impact_checks ch join clients c on c.id = ch.client_id join tech_issues i on i.id = ch.issue_id order by ch.created_at desc"
    )


@router.post("/api/issues/{issue_id}/client-check/start")
def start_client_check(issue_id: str, user: dict = Depends(require_workflow_manager)):
    """Creates a check record for every active relevant client (idempotent)."""
    row = _issue(issue_id)
    created = fetchone(
        """
        with relevant as (
            select id from clients where active and relevant_for_client_wide_check
        )
        insert into client_impact_checks (issue_id, client_id, checked_by, monitoring_status)
        select %s, r.id, '', 'Pending' from relevant r
        where not exists (
            select 1 from client_impact_checks ch where ch.issue_id = %s and ch.client_id = r.id
        )
        returning id
        """,
        (row["id"], row["id"]),
    )
    execute("update tech_issues set client_wide_check_status = 'In Progress', updated_at = now(), updated_by = %s where id = %s", (user["id"], row["id"]))
    log_audit(user["id"], row["id"], row["issue_id"], "Client-Wide Check Started", "client_wide_check_status", "Pending", "In Progress")
    rows = fetchall(
        "select ch.*, c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id where ch.issue_id = %s order by c.client_name",
        (row["id"],))
    return {"created": len(rows), "total": len(rows), "rows": rows}


@router.put("/api/client-checks/{check_id}")
def update_check(check_id: str, payload: ClientCheckUpdate, user: dict = Depends(require_workflow_manager)):
    rec = fetchone("select * from client_impact_checks where id = %s", (check_id,))
    if rec is None:
        raise HTTPException(status_code=404, detail="Check record not found")
    issue = fetchone("select * from tech_issues where id = %s", (rec["issue_id"],))
    monitoring_status = "Completed" if (payload.fix_required and payload.fix_implemented) or not payload.fix_required else payload.monitoring_status
    execute(
        """
        update client_impact_checks
        set same_issue_found = %s, severity = %s, impact = %s, fix_required = %s, fix_implemented = %s,
            monitoring_required = %s, monitoring_status = %s, remarks = %s, check_date = current_date,
            checked_by = %s, updated_at = now()
        where id = %s
        """,
        (payload.same_issue_found, payload.severity, payload.impact, payload.fix_required, payload.fix_implemented,
         payload.monitoring_required, monitoring_status, payload.remarks, user["name"], check_id),
    )
    # Recompute completion + global fix requirement
    pending = fetchall(
        """
        select 1 from clients c
        where c.active and c.relevant_for_client_wide_check
          and not exists (
            select 1 from client_impact_checks ch where ch.client_id = c.id and ch.issue_id = %s and ch.check_date is not null
          )
        limit 1
        """,
        (issue["id"],),
    )
    affected = fetchall(
        "select count(*) as c from client_impact_checks where issue_id = %s and same_issue_found", (issue["id"],))
    execute(
        "update tech_issues set client_wide_check_status = %s, global_fix_required = %s, "
        "global_fix_status = case when %s then (case when global_fix_status = 'Not Required' then 'Pending' else global_fix_status end) else 'Not Required' end, "
        "updated_at = now(), updated_by = %s where id = %s",
        ("Completed" if not pending else "In Progress", affected[0]["c"] > 1, affected[0]["c"] > 1, user["id"], issue["id"]),
    )
    client = fetchone("select client_name from clients where id = %s", (rec["client_id"],))
    log_audit(user["id"], issue["id"], issue["issue_id"], "Client-Wide Check", "client_impact_checks",
              None, f"{client['client_name']}: Same Issue Found = {'Yes' if payload.same_issue_found else 'No'}")
    return fetchone("select ch.*, c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id where ch.id = %s", (check_id,))


@router.get("/api/issues/{issue_id}/client-check/summary")
def check_summary(issue_id: str, user: dict = Depends(get_current_user)):
    row = _issue(issue_id)
    total = fetchall("select count(*) as c from clients where active and relevant_for_client_wide_check")[0]["c"]
    rows = fetchall("select ch.*, c.client_name from client_impact_checks ch join clients c on c.id = ch.client_id where ch.issue_id = %s", (row["id"],))
    checked = [r for r in rows if r["check_date"]]
    affected = [r for r in rows if r["same_issue_found"]]
    return {
        "total_relevant": total,
        "checked": len(checked),
        "pending": max(0, total - len(checked)),
        "affected": len(affected),
        "affected_clients": [a["client_name"] for a in affected],
        "global_fix_required": row.get("global_fix_required") or len(affected) > 1,
        "global_fix_status": row.get("global_fix_status"),
        "fix_pending": [a["client_name"] for a in affected if a["fix_required"] and not a["fix_implemented"]],
    }


# ================= MONITORING =================
@router.get("/api/monitoring")
def list_monitoring(issue_id: str | None = None, user: dict = Depends(get_current_user)):
    if issue_id:
        row = _issue(issue_id)
        return fetchall("select * from monitoring_logs where issue_id = %s order by check_date desc", (row["id"],))
    return fetchall(
        "select m.*, i.issue_id as issue_id_text from monitoring_logs m join tech_issues i on i.id = m.issue_id order by m.check_date desc"
    )


@router.post("/api/issues/{issue_id}/monitoring/start")
def start_monitoring(issue_id: str, payload: MonitoringStart, user: dict = Depends(require_workflow_manager)):
    row = _issue(issue_id)
    execute(
        """
        update tech_issues
        set monitoring_required = true, monitoring_period = %s,
            monitoring_start_date = current_date,
            monitoring_end_date = current_date + %s * interval '1 day',
            monitoring_result = 'In Progress',
            status = 'Monitoring',
            updated_at = now(), updated_by = %s
        where id = %s
        """,
        (payload.period_days, payload.period_days, user["id"], row["id"]),
    )
    log_audit(user["id"], row["id"], row["issue_id"], "Monitoring Started", "monitoring", None, f"{payload.period_days}-day period started")
    return fetchone("select * from tech_issues where id = %s", (row["id"],))


@router.post("/api/issues/{issue_id}/monitoring/logs")
def add_monitoring_log(issue_id: str, payload: MonitoringLogCreate, user: dict = Depends(require_workflow_manager)):
    row = _issue(issue_id)
    rec = fetchone(
        """
        insert into monitoring_logs (issue_id, monitoring_start_date, monitoring_end_date, monitoring_period,
                                     check_date, issue_recurred, system_stable, result, checked_by, remarks)
        values (%s, %s, %s, %s, current_date, %s, %s, %s, %s, %s)
        returning *
        """,
        (row["id"], row.get("monitoring_start_date"), row.get("monitoring_end_date"), row.get("monitoring_period"),
         payload.issue_recurred, payload.system_stable, payload.result, user["name"], payload.remarks),
    )
    if payload.issue_recurred:
        execute("update tech_issues set monitoring_result = 'Failed', updated_at = now() where id = %s", (row["id"],))
    else:
        final = "Successful" if row.get("monitoring_end_date") and row["monitoring_end_date"] <= date.today() else "In Progress"
        execute(
            "update tech_issues set monitoring_result = %s, status = case when %s = 'Successful' then 'Resolved' else status end, updated_at = now(), updated_by = %s where id = %s",
            (final, final, user["id"], row["id"]),
        )
        if final == "Successful":
            log_audit(user["id"], row["id"], row["issue_id"], "Monitoring Result", "monitoring_result", None, "Successful")
    return rec


# ================= RECURRENCE =================
@router.get("/api/recurrence")
def list_recurrence(user: dict = Depends(get_current_user)):
    return fetchall(
        "select r.*, i.issue_id as issue_id_text, c.client_name from recurrence_tracker r "
        "join tech_issues i on i.id = r.original_issue_id left join clients c on c.id = r.client_id "
        "order by r.recurrence_date desc"
    )


@router.post("/api/issues/{issue_id}/recurrence")
def record_recurrence(issue_id: str, payload: RecurrenceCreate, user: dict = Depends(require_workflow_manager)):
    row = _issue(issue_id)
    execute(
        "update tech_issues set recurrence = true, recurrence_count = coalesce(recurrence_count, 0) + 1, updated_at = now(), updated_by = %s where id = %s",
        (user["id"], row["id"]),
    )
    rec = fetchone(
        """
        insert into recurrence_tracker (original_issue_id, recurrence_date, client_id, same_issue,
                                        recurrence_description, new_rca_required, new_rca, new_solution,
                                        preventive_action, owner, status)
        values (%s, current_date, %s, %s, %s, true, %s, %s, %s, %s, %s)
        returning *
        """,
        (row["id"], row["client_id"], payload.same_issue, payload.recurrence_description,
         payload.new_rca, payload.new_solution, payload.preventive_action, payload.owner, payload.status),
    )
    log_audit(user["id"], row["id"], row["issue_id"], "Recurrence Recorded", "recurrence_tracker", None, "Same issue recorded")
    return rec
