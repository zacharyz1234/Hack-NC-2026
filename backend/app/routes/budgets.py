"""Monthly budgets. Written only when the student saves (for example from Gill's budget plan card)."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_conn

router = APIRouter(prefix="/budgets", tags=["budgets"])

MONTH = Path(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")


class LimitIn(BaseModel):
    category_id: int
    limit_cents: int = Field(ge=0, le=100_000_000)


class BudgetIn(BaseModel):
    limits: list[LimitIn] = Field(min_length=1, max_length=50)


def _read(conn: sqlite3.Connection, user_id: int, month: str) -> dict:
    rows = conn.execute(
        "SELECT b.category_id, c.name AS category, b.limit_cents FROM budgets b"
        " JOIN categories c ON c.id = b.category_id WHERE b.user_id = ? AND b.month = ? ORDER BY c.name",
        (user_id, month),
    ).fetchall()
    return {"month": month, "limits": [dict(row) for row in rows]}


@router.get("/{month}")
def get_budget(month: str = MONTH, user: dict = Depends(require_user)):
    with get_conn() as conn:
        return _read(conn, user["id"], month)


@router.put("/{month}")
def save_budget(body: BudgetIn, month: str = MONTH, user: dict = Depends(require_user)):
    """Sets the limits for the categories sent; other categories keep their limits."""
    ids = [limit.category_id for limit in body.limits]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=422, detail="Each category can only appear once")
    with get_conn() as conn:
        visible = {
            row["id"]
            for row in conn.execute("SELECT id FROM categories WHERE user_id IS NULL OR user_id = ?", (user["id"],))
        }
        if not set(ids) <= visible:
            raise HTTPException(status_code=422, detail="Unknown category")
        conn.executemany(
            "INSERT INTO budgets (user_id, category_id, month, limit_cents) VALUES (?, ?, ?, ?)"
            " ON CONFLICT (user_id, category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents",
            [(user["id"], limit.category_id, month, limit.limit_cents) for limit in body.limits],
        )
        return _read(conn, user["id"], month)
