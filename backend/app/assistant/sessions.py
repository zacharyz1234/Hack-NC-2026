"""Storage for Gill Gates chats.

A session row holds the Gemini transcript (so the model sees the conversation), any tool calls
waiting on the student (`pending`), and small bookkeeping (`meta`). Chats belong to one user, expire
after ASSISTANT_SESSION_TTL_HOURS idle, and are wiped when the student turns off access to data they
contain.
"""
import json
import secrets
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.assistant.scopes import SCOPES
from app.config import ASSISTANT_SESSION_TTL_HOURS, GEMINI_MODEL
from app.db import get_conn, now_iso


@dataclass
class Session:
    id: str
    user_id: int | None
    state: str = "ready"
    transcript: list[dict] = field(default_factory=list)
    pending: dict | None = None
    meta: dict = field(default_factory=dict)


def _cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=ASSISTANT_SESSION_TTL_HOURS)).isoformat()


def purge_expired() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM assistant_sessions WHERE updated_at < ?", (_cutoff(),))


def create(user_id: int | None, prompt_version: str) -> Session:
    purge_expired()
    session = Session(id="as_" + secrets.token_urlsafe(16), user_id=user_id)
    now = now_iso()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO assistant_sessions (id, user_id, model, prompt_version, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (session.id, user_id, GEMINI_MODEL, prompt_version, now, now),
        )
    return session


def load(session_id: str, user_id: int | None) -> Session | None:
    """The chat, if it exists, hasn't expired, and belongs to this user."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM assistant_sessions WHERE id = ? AND user_id IS ? AND updated_at >= ?",
            (session_id, user_id, _cutoff()),
        ).fetchone()
    if row is None:
        return None
    return Session(
        id=row["id"],
        user_id=row["user_id"],
        state=row["state"],
        transcript=json.loads(row["transcript"]),
        pending=json.loads(row["pending"]) if row["pending"] else None,
        meta=json.loads(row["meta"]),
    )


def save(session: Session) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE assistant_sessions SET state = ?, transcript = ?, pending = ?, meta = ?, updated_at = ? WHERE id = ?",
            (
                session.state,
                json.dumps(session.transcript),
                json.dumps(session.pending) if session.pending else None,
                json.dumps(session.meta),
                now_iso(),
                session.id,
            ),
        )


def delete(session_id: str, user_id: int | None) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM assistant_sessions WHERE id = ? AND user_id IS ?", (session_id, user_id))
    return cur.rowcount > 0


def forget_scope(user_id: int, scope: str) -> int:
    """Clear every chat of this user that contains data read under `scope`.

    Gemini is stateless: each turn re-sends the whole transcript. Wiping these chats is what makes
    "turn off access" stop the data from reaching Gemini again (including Gill's own replies that
    quoted it). Returns how many chats were cleared.
    """
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, transcript, pending, meta FROM assistant_sessions WHERE user_id = ?", (user_id,)
        ).fetchall()
        cleared = 0
        for row in rows:
            pending = json.loads(row["pending"]) if row["pending"] else {}
            used = any(scope in entry.get("scopes", []) for entry in json.loads(row["transcript"])) or any(
                scope in call.get("read_scopes", []) for call in pending.get("calls", [])
            )
            if not used:
                continue
            meta = json.loads(row["meta"])
            meta["ui_notices"] = meta.get("ui_notices", []) + [
                f"You turned off access to {SCOPES[scope].noun}, so Gill cleared this chat's earlier messages."
            ]
            meta["notices"] = []
            meta["declined"] = []
            conn.execute(
                "UPDATE assistant_sessions SET transcript = '[]', pending = NULL, state = 'ready', meta = ? WHERE id = ?",
                (json.dumps(meta), row["id"]),
            )
            cleared += 1
    return cleared


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


@contextmanager
def lock(session_id: str) -> Iterator[None]:
    """One request at a time per chat, so two quick clicks can't both resume the same paused turn."""
    with _locks_guard:
        session_lock = _locks.setdefault(session_id, threading.Lock())
    with session_lock:
        yield
