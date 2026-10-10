import sqlite3



### made by Bryce and claude.
### get user accounts and compare for a simple login, for now.
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from app.auth import (
    bearer,
    create_session,
    delete_session,
    get_optional_user,
    hash_password,
    require_user,
    verify_password,
)
from app.db import get_conn

router = APIRouter(prefix="/auth", tags=["auth"])





class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/register", status_code=201)
def register(body: RegisterIn):
    email = body.email.strip().lower()
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
                (email, hash_password(body.password), body.display_name),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {"id": cur.lastrowid, "email": email, "display_name": body.display_name}
    return {"token": create_session(user["id"]), "user": user}


@router.post("/login")
def login(body: LoginIn):
    email = body.email.strip().lower()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = {"id": row["id"], "email": row["email"], "display_name": row["display_name"]}
    return {"token": create_session(user["id"]), "user": user}


@router.post("/logout", status_code=204)
def logout(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if creds is not None:
        delete_session(creds.credentials)


@router.get("/me")
def me(user: dict = Depends(require_user)):
    return user


@router.get("/whoami")
def whoami(user: dict | None = Depends(get_optional_user)):
    """Example of an optional-login route: works for guests and users."""
    return {"guest": user is None, "user": user}
