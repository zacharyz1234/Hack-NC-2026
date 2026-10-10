import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_conn


### made by bryce and claude 
### user verification and keeps the our teams original idea of optional accounts
PBKDF2_ITERATIONS = 600_000
SESSION_DAYS = 30

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"{PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    iterations, salt, digest = stored.split("$")
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(candidate.hex(), digest)


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires.isoformat()),
        )
    return token


def delete_session(token: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict | None:
    """Logged-in user, or None for guests. Use on routes where login is optional."""
    if creds is None:
        return None
    with get_conn() as conn:
        row = conn.execute(
            "SELECT u.id, u.email, u.display_name, s.expires_at FROM sessions s"
            " JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (creds.credentials,),
        ).fetchone()
    if row is None or datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        return None
    return {"id": row["id"], "email": row["email"], "display_name": row["display_name"]}


def require_user(user: dict | None = Depends(get_optional_user)) -> dict:
    """Logged-in user, or 401. Use on routes that need an account."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user
