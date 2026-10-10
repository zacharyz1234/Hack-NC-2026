"""Savings goals. Created only by the student (for example from Gill's savings calculator card)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_conn

router = APIRouter(prefix="/savings-goals", tags=["savings goals"])

COLUMNS = "id, name, target_cents, saved_cents, target_date"


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    target_cents: int = Field(gt=0, le=100_000_000)
    saved_cents: int = Field(0, ge=0, le=100_000_000)
    target_date: date | None = None


@router.get("")
def list_goals(user: dict = Depends(require_user)):
    with get_conn() as conn:
        rows = conn.execute(f"SELECT {COLUMNS} FROM savings_goals WHERE user_id = ? ORDER BY id", (user["id"],))
        return {"goals": [dict(row) for row in rows]}


class GoalPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    target_cents: int | None = Field(None, gt=0, le=100_000_000)
    saved_cents: int | None = Field(None, ge=0, le=100_000_000)
    target_date: date | None = None


@router.patch("/{goal_id}")
def update_goal(goal_id: int, body: GoalPatch, user: dict = Depends(require_user)):
    changes = {k: v.isoformat() if isinstance(v, date) else v for k, v in body.model_dump(exclude_unset=True).items()}
    with get_conn() as conn:
        if changes:
            assignments = ", ".join(f"{column} = ?" for column in changes)
            conn.execute(
                f"UPDATE savings_goals SET {assignments} WHERE id = ? AND user_id = ?",
                [*changes.values(), goal_id, user["id"]],
            )
        row = conn.execute(
            f"SELECT {COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?", (goal_id, user["id"])
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return dict(row)


@router.post("", status_code=201)
def create_goal(body: GoalIn, user: dict = Depends(require_user)):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO savings_goals (user_id, name, target_cents, saved_cents, target_date) VALUES (?, ?, ?, ?, ?)",
            (
                user["id"],
                body.name.strip(),
                body.target_cents,
                body.saved_cents,
                body.target_date.isoformat() if body.target_date else None,
            ),
        )
        return dict(conn.execute(f"SELECT {COLUMNS} FROM savings_goals WHERE id = ?", (cur.lastrowid,)).fetchone())
