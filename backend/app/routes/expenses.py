"""Manual expenses. Added only by the student (for example from Gill's expense draft card)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_conn

router = APIRouter(prefix="/expenses", tags=["expenses"])

COLUMNS = "id, amount_cents, description, category_id, spent_on, source"


class ExpenseIn(BaseModel):
    amount_cents: int = Field(gt=0, le=100_000_000)
    description: str | None = Field(None, max_length=120)
    category_id: int | None = None
    spent_on: date


@router.post("", status_code=201)
def create_expense(body: ExpenseIn, user: dict = Depends(require_user)):
    with get_conn() as conn:
        if body.category_id is not None and not conn.execute(
            "SELECT 1 FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)", (body.category_id, user["id"])
        ).fetchone():
            raise HTTPException(status_code=422, detail="Unknown category")
        cur = conn.execute(
            "INSERT INTO expenses (user_id, category_id, amount_cents, description, spent_on, source)"
            " VALUES (?, ?, ?, ?, ?, 'manual')",
            (user["id"], body.category_id, body.amount_cents, body.description, body.spent_on.isoformat()),
        )
        return dict(conn.execute(f"SELECT {COLUMNS} FROM expenses WHERE id = ?", (cur.lastrowid,)).fetchone())
