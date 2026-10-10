import sqlite3
from pathlib import Path

from app.config import DB_PATH

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA_PATH.read_text())
