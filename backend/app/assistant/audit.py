"""Gill Gates audit trail: who, which tool or scope, what happened, when. Never amounts or descriptions."""
from app.db import get_conn


def log(
    event: str,
    *,
    user_id: int | None,
    session_id: str | None = None,
    tool: str | None = None,
    scope: str | None = None,
    outcome: str | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO assistant_audit_log (user_id, session_id, event, tool, scope, outcome)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, session_id, event, tool, scope, outcome),
        )
