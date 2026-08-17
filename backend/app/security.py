"""Authentication & authorization.

The frontend signs in directly with Supabase Auth and sends the Supabase JWT as
`Authorization: Bearer <token>`. The backend verifies that JWT with the Supabase
service-role key (which NEVER leaves the backend), then loads the user's role
from the public.users table.

Role permissions:
  admin       — everything
  manager     — view all, create/update issues, RCA, solutions, client checks,
                monitoring, recurrence, dashboard, audit
  tech_owner  — assigned/relevant issues, RCA, solutions, client checks, monitoring
  viewer      — read-only
"""
from fastapi import Depends, Header, HTTPException
from supabase import create_client

from .config import settings
from .database import fetchone

_supabase = None


def get_supabase():
    global _supabase
    if _supabase is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise HTTPException(status_code=500, detail="Supabase is not configured on the backend.")
        _supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _supabase


def get_current_user(authorization: str = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        resp = get_supabase().auth.get_user(token)
        uid = resp.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    row = fetchone(
        "select id, name, email, role, active from users where id = %s", (uid,)
    )
    if row is None:
        raise HTTPException(status_code=403, detail="User profile not found in users table")
    if not row["active"]:
        raise HTTPException(status_code=403, detail="User account is inactive")
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}


def require_roles(*roles: str):
    """Dependency enforcing one of the given roles."""
    def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user
    return dep


# Convenience dependencies
require_admin = require_roles("admin")
require_issue_manager = require_roles("admin", "manager")          # create/update issues
require_workflow_manager = require_roles("admin", "manager", "tech_owner")  # RCA/solutions/checks/monitoring
require_closure = require_roles("admin", "manager", "tech_owner")
