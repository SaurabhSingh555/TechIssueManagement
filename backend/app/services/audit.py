"""Audit logging service — every important action/change is recorded."""
import json

from ..database import execute


def log_audit(user_id, issue_id=None, issue_id_text=None, action="Action", field_name=None,
              old_value=None, new_value=None, ip_address=None, metadata: dict | None = None):
    """Insert an audit_logs row. Never raises — audit failure must not break the API."""
    try:
        execute(
            """
            insert into audit_logs (user_id, issue_id, issue_id_text, action, field_name,
                                    old_value, new_value, ip_address, metadata)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id, issue_id, issue_id_text, action, field_name,
                str(old_value)[:2000] if old_value is not None else None,
                str(new_value)[:2000] if new_value is not None else None,
                ip_address,
                json.dumps(metadata or {}),
            ),
        )
    except Exception:  # pragma: no cover
        pass
