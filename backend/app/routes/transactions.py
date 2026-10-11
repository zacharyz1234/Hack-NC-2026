"""The dashboard's transaction list: expenses and income together, with signed amounts.

Ids are "e<id>" for expenses and "i<id>" for income. Negative amount_cents = money out (an expense),
positive = money in (income). The student edits these directly; Gill never calls these routes.
"""
import datetime as dt
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_conn

router = APIRouter(prefix="/transactions", tags=["transactions"])

_SELECT = """
SELECT * FROM (
    SELECT 'e' || e.id AS id, 'expense' AS kind, e.description, e.category_id, c.name AS category,
           -e.amount_cents AS amount_cents, e.spent_on AS date, e.account_id, a.type AS account_type,
           e.source, e.user_id
    FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN accounts a ON a.id = e.account_id
    UNION ALL
    SELECT 'i' || i.id, 'income', i.source, NULL, 'Income', i.amount_cents, i.received_on, i.account_id,
           a.type, CASE WHEN i.nessie_id IS NULL THEN 'manual' ELSE 'nessie' END, i.user_id
    FROM income i
    LEFT JOIN accounts a ON a.id = i.account_id
)
"""


class TransactionIn(BaseModel):
    description: str = Field(min_length=1, max_length=120)
    amount_cents: int = Field(ge=-100_000_000, le=100_000_000, description="Negative = purchase, positive = income")
    date: dt.date
    category_id: int | None = None
    account_id: int | None = None


class TransactionPatch(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=120)
    amount_cents: int | None = Field(None, ge=-100_000_000, le=100_000_000)
    date: dt.date | None = None
    category_id: int | None = None
    account_id: int | None = None


def _one(conn: sqlite3.Connection, user_id: int, tx_id: str) -> dict:
    row = conn.execute(_SELECT + " WHERE id = ? AND user_id = ?", (tx_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _public(row)


def _public(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys() if k != "user_id"}


def _check_refs(conn: sqlite3.Connection, user_id: int, category_id: int | None, account_id: int | None) -> None:
    if category_id is not None and not conn.execute(
        "SELECT 1 FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)", (category_id, user_id)
    ).fetchone():
        raise HTTPException(status_code=422, detail="Unknown category")
    if account_id is not None and not conn.execute(
        "SELECT 1 FROM accounts WHERE id = ? AND user_id = ?", (account_id, user_id)
    ).fetchone():
        raise HTTPException(status_code=422, detail="Unknown account")


def _parse(tx_id: str) -> tuple[str, int]:
    match = re.fullmatch(r"([ei])(\d+)", tx_id)
    if not match:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return ("expenses" if match[1] == "e" else "income"), int(match[2])


@router.get("")
def list_transactions(
    account_id: int | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_user),
):
    where, params = "WHERE user_id = ?", [user["id"]]
    if account_id is not None:
        where += " AND account_id = ?"
        params.append(account_id)
    with get_conn() as conn:
        rows = conn.execute(_SELECT + where + " ORDER BY date DESC, id DESC LIMIT ? OFFSET ?", [*params, limit, offset]).fetchall()
    return {"transactions": [_public(row) for row in rows]}


@router.post("", status_code=201)
def create_transaction(body: TransactionIn, user: dict = Depends(require_user)):
    if body.amount_cents == 0:
        raise HTTPException(status_code=422, detail="Amount can't be zero")
    with get_conn() as conn:
        _check_refs(conn, user["id"], body.category_id, body.account_id)
        if body.amount_cents < 0:
            cur = conn.execute(
                "INSERT INTO expenses (user_id, category_id, amount_cents, description, spent_on, source, account_id)"
                " VALUES (?, ?, ?, ?, ?, 'manual', ?)",
                (user["id"], body.category_id, -body.amount_cents, body.description, body.date.isoformat(), body.account_id),
            )
            return _one(conn, user["id"], f"e{cur.lastrowid}")
        cur = conn.execute(
            "INSERT INTO income (user_id, source, amount_cents, received_on, account_id) VALUES (?, ?, ?, ?, ?)",
            (user["id"], body.description, body.amount_cents, body.date.isoformat(), body.account_id),
        )
        return _one(conn, user["id"], f"i{cur.lastrowid}")


@router.patch("/{tx_id}")
def update_transaction(tx_id: str, body: TransactionPatch, user: dict = Depends(require_user)):
    table, row_id = _parse(tx_id)
    changes = body.model_dump(exclude_unset=True)
    with get_conn() as conn:
        _one(conn, user["id"], tx_id)
        _check_refs(conn, user["id"], changes.get("category_id"), changes.get("account_id"))
        if "amount_cents" in changes:
            amount = changes.pop("amount_cents")
            if amount == 0 or (amount < 0) != (table == "expenses"):
                raise HTTPException(
                    status_code=422, detail="Keep the same sign; to switch purchase/income, delete and re-add it"
                )
            changes["amount_cents"] = abs(amount)
        columns = {
            "expenses": {"description": "description", "date": "spent_on", "category_id": "category_id"},
            "income": {"description": "source", "date": "received_on"},
        }[table] | {"amount_cents": "amount_cents", "account_id": "account_id"}
        updates = {columns[k]: (v.isoformat() if isinstance(v, dt.date) else v) for k, v in changes.items() if k in columns}
        if updates:
            assignments = ", ".join(f"{column} = ?" for column in updates)
            conn.execute(f"UPDATE {table} SET {assignments} WHERE id = ? AND user_id = ?", [*updates.values(), row_id, user["id"]])
        return _one(conn, user["id"], tx_id)


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: str, user: dict = Depends(require_user)):
    table, row_id = _parse(tx_id)
    with get_conn() as conn:
        if conn.execute(f"DELETE FROM {table} WHERE id = ? AND user_id = ?", (row_id, user["id"])).rowcount == 0:
            raise HTTPException(status_code=404, detail="Transaction not found")
