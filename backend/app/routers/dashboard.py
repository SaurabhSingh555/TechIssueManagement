"""Dashboard KPIs + reports + CSV export.

GET /api/dashboard                KPI summary + chart series (filterable)
GET /api/reports/{type}           monthly | client | category | rca | solution | recurrence
GET /api/reports/{type}/export    CSV download
"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..database import fetchall
from ..security import get_current_user
from ..routers.issues import _ISSUE_SELECT

router = APIRouter(tags=["dashboard"])

AGE_BUCKETS = [("0-2 days", 0, 2), ("3-7 days", 3, 7), ("8-14 days", 8, 14), ("15-30 days", 15, 30), ("30+ days", 31, 10**9)]


def _filtered_issues(search=None, client_id=None, process_id=None, category_id=None,
                     priority=None, status=None, owner_id=None, date_from=None, date_to=None):
    where, params = [], []
    if search:
        where.append("(i.issue_id ilike %s or i.issue_title ilike %s or c.client_name ilike %s)")
        params += [f"%{search}%"] * 3
    if client_id: where.append("i.client_id = %s"); params.append(client_id)
    if process_id: where.append("i.process_id = %s"); params.append(process_id)
    if category_id: where.append("i.category_id = %s"); params.append(category_id)
    if priority: where.append("i.priority = %s"); params.append(priority)
    if status: where.append("i.status = %s"); params.append(status)
    if owner_id: where.append("i.assigned_to = %s"); params.append(owner_id)
    if date_from: where.append("i.reported_date >= %s"); params.append(date_from)
    if date_to: where.append("i.reported_date <= %s"); params.append(date_to)
    wsql = ("where " + " and ".join(where)) if where else ""
    return fetchall(f"{_ISSUE_SELECT} {wsql} order by i.reported_date desc", tuple(params))


def _count_by(items, key_fn, order=None):
    counts = {}
    for i in items:
        k = key_fn(i) or "—"
        counts[k] = counts.get(k, 0) + 1
    entries = [{"label": k, "value": v} for k, v in counts.items()]
    if order:
        entries.sort(key=lambda e: order.index(e["label"]) if e["label"] in order else 999)
    return entries


@router.get("/api/dashboard")
def dashboard(search: str | None = None, client_id: str | None = None, process_id: str | None = None,
              category_id: str | None = None, priority: str | None = None, status: str | None = None,
              owner_id: str | None = None, date_from: str | None = None, date_to: str | None = None,
              user: dict = Depends(get_current_user)):
    items = _filtered_issues(search, client_id, process_id, category_id, priority, status, owner_id, date_from, date_to)
    open_items = [i for i in items if i["status"] not in ("Closed", "Resolved")]
    closed = [i for i in items if i["status"] == "Closed" and i["closure_date"]]
    avg_res = 0.0
    if closed:
        avg_res = sum((i["closure_date"].date() - i["reported_date"]).days for i in closed) / len(closed)

    def aging_of(i):
        days = (datetime.now().date() - i["reported_date"]).days
        return next((label for label, lo, hi in AGE_BUCKETS if lo <= days <= hi), "30+ days")

    affected_clients = fetchall(
        "select count(distinct client_id) as c from client_impact_checks where same_issue_found")[0]["c"]

    kpi = {
        "total": len(items),
        "open": len(open_items),
        "critical": len([i for i in open_items if i["priority"] == "Critical"]),
        "high": len([i for i in open_items if i["priority"] == "High"]),
        "rcaPending": len([i for i in open_items if not i.get("root_cause")]),
        "solutionPending": len([i for i in open_items if i.get("root_cause") and not i.get("permanent_solution")]),
        "testingPending": len([i for i in open_items if i.get("testing_status") != "Passed"]),
        "clientCheckPending": len([i for i in items if i.get("client_wide_check_required") and i.get("client_wide_check_status") in ("Pending", "In Progress")]),
        "globalFixPending": len([i for i in items if i.get("global_fix_required") and i.get("global_fix_status") != "Completed"]),
        "monitoringPending": len([i for i in items if i.get("monitoring_required") and i.get("monitoring_result") not in ("Successful",) and i.get("monitoring_result") is not None or (i.get("monitoring_required") and i.get("status") == "Monitoring")]),
        "closed": len(closed),
        "recurring": len([i for i in items if i.get("recurrence")]),
        "avgResolutionDays": round(avg_res, 1),
        "affectedClients": affected_clients,
    }

    # ---- AI similarity / historical-match metrics -------------------------
    total_all = fetchall("select count(*) as c from tech_issues")[0]["c"]
    with_matches = fetchall("select count(distinct issue_id) as c from issue_similarity_results")[0]["c"]
    kpi["resolved"] = len([i for i in items if i["status"] in ("Resolved", "Closed")])
    kpi["issuesWithMatches"] = with_matches
    kpi["issuesWithoutMatches"] = max(0, total_all - with_matches)
    kpi["aiMatchRate"] = round(100.0 * with_matches / total_all, 1) if total_all else 0.0
    kpi["topRecurring"] = [
        {"label": r["issue_id"], "value": r["recurrence_count"]}
        for r in fetchall(
            "select issue_id, recurrence_count from tech_issues where recurrence_count > 0 "
            "order by recurrence_count desc limit 6")
    ]
    kpi["mostCommonRCA"] = [
        {"label": r["label"], "value": r["value"]}
        for r in fetchall(
            "select left(root_cause, 42) as label, count(*)::int as value from tech_issues "
            "where root_cause is not null and root_cause <> '' group by 1 order by 2 desc limit 6")
    ]
    kpi["mostCommonSystems"] = [
        {"label": r["label"], "value": r["value"]}
        for r in fetchall(
            "select coalesce(nullif(system_name, ''), coalesce(p.process_name, 'Uncategorized')) as label, "
            "count(*)::int as value from tech_issues i left join processes p on p.id = i.process_id "
            "group by 1 order by 2 desc limit 6")
    ]

    months = []
    now = datetime.now()
    for back in range(5, -1, -1):
        y, m = (now.year, now.month - back)
        while m < 1:
            m += 12; y -= 1
        label = datetime(y, m, 1).strftime("%b %y")
        months.append({"label": label, "value": len([i for i in items if i["reported_date"].year == y and i["reported_date"].month == m])})

    return {
        "kpi": kpi,
        "byClient": _count_by(items, lambda i: i.get("client_name")),
        "byCategory": _count_by(items, lambda i: i.get("category_name")),
        "byPriority": _count_by(items, lambda i: i["priority"], ["Critical", "High", "Medium", "Low"]),
        "byStatus": _count_by(items, lambda i: i["status"]),
        "byMonth": months,
        "topClients": sorted(_count_by(items, lambda i: i.get("client_name")), key=lambda e: -e["value"]),
        "recurringByClient": _count_by([i for i in items if i.get("recurrence")], lambda i: i.get("client_name")),
        "aging": [
            {"label": label, "value": len([i for i in open_items if aging_of(i) == label])}
            for label, _, _ in AGE_BUCKETS
        ],
        "sla": {
            "overdue": len([i for i in open_items if i.get("sla_status") == "Overdue"]),
            "atRisk": len([i for i in open_items if i.get("sla_status") == "At Risk"]),
            "onTrack": len([i for i in open_items if i.get("sla_status") == "On Track"]),
        },
    }


def _report_data(report_type: str, date_from: str | None, date_to: str | None):
    items = _filtered_issues(date_from=date_from, date_to=date_to)
    closed = [i for i in items if i["status"] == "Closed" and i["closure_date"]]
    avg_res = round(sum((i["closure_date"].date() - i["reported_date"]).days for i in closed) / len(closed), 1) if closed else 0

    if report_type == "monthly":
        rows = [
            {"label": "Total Issues", "value": len(items)},
            {"label": "Closed", "value": len(closed)},
            {"label": "Open", "value": len(items) - len(closed)},
            {"label": "Recurring", "value": len([i for i in items if i["recurrence"]])},
            {"label": "Critical / High", "value": len([i for i in items if i["priority"] in ("Critical", "High")])},
            {"label": "Average Resolution (days)", "value": avg_res},
        ]
        return {"title": "Monthly Tech Issue Report", "columns": [{"key": "label", "label": "Metric"}, {"key": "value", "label": "Value"}], "rows": rows}

    if report_type == "client":
        clients = fetchall("select * from clients order by client_name")
        rows = []
        for c in clients:
            ci = [i for i in items if i["client_id"] == c["id"]]
            cclosed = [i for i in ci if i["status"] == "Closed" and i["closure_date"]]
            cavg = round(sum((i["closure_date"].date() - i["reported_date"]).days for i in cclosed) / len(cclosed), 1) if cclosed else 0
            rows.append({"client": c["client_name"], "code": c["client_code"], "issues": len(ci),
                         "recurring": len([i for i in ci if i["recurrence"]]),
                         "open": len([i for i in ci if i["status"] not in ("Closed", "Resolved")]),
                         "avg_resolution_days": cavg})
        return {"title": "Client-wise Report", "columns": [{"key": "client", "label": "Client"}, {"key": "code", "label": "Code"}, {"key": "issues", "label": "Issues"}, {"key": "recurring", "label": "Recurring"}, {"key": "open", "label": "Open"}, {"key": "avg_resolution_days", "label": "Avg Resolution (days)"}], "rows": rows}

    if report_type == "category":
        cats = fetchall("select * from issue_categories order by category_name")
        rows = [{"category": c["category_name"], "issues": len([i for i in items if i["category_id"] == c["id"]]),
                 "open": len([i for i in items if i["category_id"] == c["id"] and i["status"] not in ("Closed", "Resolved")]),
                 "recurring": len([i for i in items if i["category_id"] == c["id"] and i["recurrence"]]),
                 "critical_high": len([i for i in items if i["category_id"] == c["id"] and i["priority"] in ("Critical", "High")])}
                for c in cats]
        return {"title": "Category-wise Report", "columns": [{"key": "category", "label": "Category"}, {"key": "issues", "label": "Issues"}, {"key": "open", "label": "Open"}, {"key": "recurring", "label": "Recurring"}, {"key": "critical_high", "label": "Critical / High"}], "rows": rows}

    if report_type == "rca":
        rows = fetchall("select r.*, i.issue_id from rca_logs r join tech_issues i on i.id = r.issue_id order by r.rca_date desc")
        return {"title": "RCA Effectiveness Report",
                "columns": [{"key": "issue_id", "label": "Issue"}, {"key": "rca_date", "label": "Date"}, {"key": "status", "label": "Status"}, {"key": "owner", "label": "Owner"}, {"key": "root_cause", "label": "Root Cause"}, {"key": "preventive_action", "label": "Preventive Action"}],
                "rows": rows}

    if report_type == "solution":
        rows = fetchall("select s.*, i.issue_id from solutions s join tech_issues i on i.id = s.issue_id order by s.proposed_date desc")
        return {"title": "Solution Effectiveness Report",
                "columns": [{"key": "issue_id", "label": "Issue"}, {"key": "solution_type", "label": "Type"}, {"key": "implemented_date", "label": "Implemented"}, {"key": "testing_status", "label": "Testing"}, {"key": "solution_effective", "label": "Effectiveness"}, {"key": "solution_description", "label": "Description"}],
                "rows": rows}

    if report_type == "recurrence":
        rows = fetchall("select r.*, i.issue_id, c.client_name from recurrence_tracker r join tech_issues i on i.id = r.original_issue_id left join clients c on c.id = r.client_id order by r.recurrence_date desc")
        return {"title": "Recurrence Report",
                "columns": [{"key": "issue_id", "label": "Issue"}, {"key": "client_name", "label": "Client"}, {"key": "recurrence_date", "label": "Date"}, {"key": "status", "label": "Status"}, {"key": "recurrence_description", "label": "Description"}, {"key": "owner", "label": "Owner"}],
                "rows": rows}

    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail=f"Unknown report type: {report_type}")


@router.get("/api/reports/{report_type}")
def report(report_type: str, date_from: str | None = None, date_to: str | None = None, user: dict = Depends(get_current_user)):
    return _report_data(report_type, date_from, date_to)


@router.get("/api/reports/{report_type}/export")
def report_export(report_type: str, date_from: str | None = None, date_to: str | None = None, user: dict = Depends(get_current_user)):
    data = _report_data(report_type, date_from, date_to)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c["label"] for c in data["columns"]])
    for row in data["rows"]:
        writer.writerow([row.get(c["key"], "") for c in data["columns"]])
    buf.seek(0)
    return StreamingResponse(
        iter(["\ufeff" + buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tims-{report_type}-report.csv"'},
    )
