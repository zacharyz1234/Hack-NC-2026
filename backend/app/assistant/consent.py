"""Consent for Gill Gates' protected reads. Denied by default: no matching, unrevoked grant means no read.

Durations: "once" is never stored (the orchestrator runs that one call and audits it), "chat" is a
grant tied to one chat session, "always" lasts until the student turns it off.
"""
from app.assistant import audit, sessions
from app.assistant.scopes import SCOPES, WINDOWED
from app.db import get_conn, now_iso


def is_granted(user_id: int, session_id: str, scope: str, lookback_days: int) -> bool:
    """A live grant covers the read if it reaches back at least as far (transaction scopes only)."""
    lookback_days = lookback_days if scope in WINDOWED else 0
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM assistant_consents WHERE user_id = ? AND scope = ? AND revoked_at IS NULL"
            " AND (duration = 'always' OR (duration = 'chat' AND session_id = ?))"
            " AND max_lookback_days >= ? LIMIT 1",
            (user_id, scope, session_id, lookback_days),
        ).fetchone()
    return row is not None


def grant(user_id: int, session_id: str, scope: str, duration: str, lookback_days: int) -> None:
    if scope not in SCOPES or duration not in ("chat", "always"):
        raise ValueError(f"Bad grant {scope!r} / {duration!r}")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO assistant_consents (user_id, scope, duration, session_id, max_lookback_days, granted_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                user_id,
                scope,
                duration,
                session_id if duration == "chat" else None,
                lookback_days if scope in WINDOWED else 0,
                now_iso(),
            ),
        )


def active_grants(user_id: int, session_id: str) -> dict[str, str]:
    """scope -> 'always' or 'chat' for grants usable in this chat (shown to the model so it knows)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT scope, duration FROM assistant_consents WHERE user_id = ? AND revoked_at IS NULL"
            " AND (duration = 'always' OR session_id = ?)",
            (user_id, session_id),
        ).fetchall()
    grants: dict[str, str] = {}
    for row in rows:
        if grants.get(row["scope"]) != "always":
            grants[row["scope"]] = row["duration"]
    return grants


def statuses(user_id: int) -> list[dict]:
    """One row per scope for the privacy settings page."""
    sessions.purge_expired()  # so "chat" grants of expired chats don't show as active
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT c.scope, c.duration, c.granted_at FROM assistant_consents c"
            " LEFT JOIN assistant_sessions s ON s.id = c.session_id"
            " WHERE c.user_id = ? AND c.revoked_at IS NULL"
            " AND (c.duration = 'always' OR s.id IS NOT NULL)"
            " ORDER BY c.granted_at",
            (user_id,),
        ).fetchall()
    found: dict[str, dict] = {}
    for row in rows:
        current = found.get(row["scope"])
        if current is None or current["status"] != "always":
            found[row["scope"]] = {"status": row["duration"], "granted_at": row["granted_at"]}
    return [
        {
            "scope": scope,
            "title": info.title,
            "details": info.details,
            "status": found.get(scope, {}).get("status", "off"),
            "granted_at": found.get(scope, {}).get("granted_at"),
        }
        for scope, info in SCOPES.items()
    ]


def revoke(user_id: int, scope: str) -> None:
    """Stop all future reads of `scope` right away, and clear chats that already contain it."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE assistant_consents SET revoked_at = ? WHERE user_id = ? AND scope = ? AND revoked_at IS NULL",
            (now_iso(), user_id, scope),
        )
    cleared = sessions.forget_scope(user_id, scope)
    audit.log("consent_revoked", user_id=user_id, scope=scope, outcome=f"chats_cleared={cleared}")
