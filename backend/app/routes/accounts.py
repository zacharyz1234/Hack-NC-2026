"""Bank accounts for the dashboard (copied in by the Nessie sync)."""
from fastapi import APIRouter, Depends

from app.auth import require_user
from app.db import get_conn

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts(user: dict = Depends(require_user)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, type, nickname, balance_cents, synced_at FROM accounts WHERE user_id = ? ORDER BY type, id",
            (user["id"],),
        )
        return {"accounts": [dict(row) for row in rows]}
