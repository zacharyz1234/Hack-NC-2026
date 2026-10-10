"""Bank data from the Capital One Nessie sandbox. Student-triggered only; Gill can't call these."""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.db import get_conn
from app.services import nessie, nessie_sync

router = APIRouter(prefix="/nessie", tags=["nessie"])

UNREACHABLE = "The Nessie bank sandbox couldn't be reached. Try again in a bit."


@router.post("/sync")
def sync(user: dict = Depends(require_user)):
    """Copy the latest accounts, purchases and deposits into the app."""
    try:
        return nessie_sync.sync_user(user["id"])
    except nessie_sync.NotLinked:
        raise HTTPException(status_code=409, detail="No bank is linked yet. Use /nessie/connect-demo first.") from None
    except nessie.NessieError:
        raise HTTPException(status_code=502, detail=UNREACHABLE) from None


@router.post("/connect-demo")
def connect_demo(user: dict = Depends(require_user)):
    """Give this account a demo bank (checking, savings, purchases) in the Nessie sandbox, then sync it."""
    with get_conn() as conn:
        row = conn.execute("SELECT nessie_customer_id FROM users WHERE id = ?", (user["id"],)).fetchone()
    try:
        if not row["nessie_customer_id"]:
            customer_id = nessie.create_demo_customer("Demo", "Student")  # no real names sent to the sandbox
            with get_conn() as conn:
                conn.execute("UPDATE users SET nessie_customer_id = ? WHERE id = ?", (customer_id, user["id"]))
        return nessie_sync.sync_user(user["id"])
    except nessie.NessieError:
        raise HTTPException(status_code=502, detail=UNREACHABLE) from None
