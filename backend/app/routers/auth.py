"""Auth endpoints. Sign-in itself is done by Supabase Auth in the frontend;
these endpoints return the verified server-side user profile."""
from fastapi import APIRouter, Depends

from ..security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    """Returns the authenticated user and their role (loaded from the users table)."""
    return user
