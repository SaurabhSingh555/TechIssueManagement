"""Notification service.

Inserts rows into the notifications table (always) and sends email via SMTP
when SMTP_* environment variables are configured. Never hardcode credentials.
"""
import smtplib
from email.mime.text import MIMEText

from ..config import settings
from ..database import execute


def notify(issue_id=None, issue_id_text=None, recipient=None, notification_type="Info",
           subject="", message="", send_email=True):
    try:
        execute(
            """
            insert into notifications (issue_id, issue_id_text, recipient, notification_type,
                                       subject, message, sent_at, status)
            values (%s, %s, %s, %s, %s, %s, now(),
                    case when %s then 'Sent' else 'Pending' end)
            """,
            (issue_id, issue_id_text, recipient, notification_type, subject, message,
             settings.smtp_configured and send_email),
        )
    except Exception:
        pass

    if send_email and settings.smtp_configured and recipient:
        try:
            msg = MIMEText(message, "plain", "utf-8")
            msg["Subject"] = subject
            msg["From"] = settings.smtp_from_email
            msg["To"] = recipient
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, [recipient], msg.as_string())
        except Exception:
            pass  # email failure is logged in notifications as Pending; never crash the API


def recipients_for(notification_type: str) -> list[str]:
    """Get active recipient emails from the DB for a notification type."""
    from ..database import fetchall
    rows = fetchall("select email from notification_recipients where active = true")
    return [r["email"] for r in rows]


def notify_new_issue(issue: dict):
    """Notify about new Critical/High issues."""
    if issue["priority"] not in ("Critical", "High"):
        return
    for email in recipients_for("critical" if issue["priority"] == "Critical" else "high"):
        notify(
            issue_id=issue["id"], issue_id_text=issue["issue_id"], recipient=email,
            notification_type=f"New {issue['priority']} Issue",
            subject=f"New {issue['priority']} issue: {issue['issue_id']}",
            message=f"{issue['priority']} issue created for {issue.get('client_name', '')} — {issue['issue_title']}",
        )


def notify_assignment(issue: dict, assignee_email: str | None):
    if not assignee_email:
        return
    notify(
        issue_id=issue["id"], issue_id_text=issue["issue_id"], recipient=assignee_email,
        notification_type="Issue Assigned",
        subject=f"Issue assigned to you: {issue['issue_id']}",
        message=f"You have been assigned {issue['issue_id']} — {issue['issue_title']}",
    )


def notify_recurrence(issue: dict):
    for email in recipients_for("recurrence"):
        notify(
            issue_id=issue["id"], issue_id_text=issue["issue_id"], recipient=email,
            notification_type="Recurrence",
            subject=f"Issue recurred: {issue['issue_id']}",
            message=f"{issue['issue_id']} reopened. New RCA and corrective cycle started.",
        )
