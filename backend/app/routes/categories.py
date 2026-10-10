from fastapi import APIRouter, Depends

from app.assistant.data import visible_categories
from app.auth import get_optional_user
from app.db import get_conn

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
def list_categories(user: dict | None = Depends(get_optional_user)):
    """Built-in categories, plus the student's custom ones when logged in."""
    with get_conn() as conn:
        return {"categories": visible_categories(conn, user["id"] if user else None)}
