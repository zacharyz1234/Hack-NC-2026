import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app.config import DB_PATH


### Using sql lite

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")  # SQLite ignores ON DELETE CASCADE without this
    return conn


@contextmanager
def readonly_conn() -> Iterator[sqlite3.Connection]:
    """Read-only connection for Gill Gates' data tools. Any write through it raises sqlite3.OperationalError."""
    conn = sqlite3.connect(Path(DB_PATH).resolve().as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA_PATH.read_text())
        _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Add columns that schema.sql gained after a local app.db was first created."""
    _add_column(conn, "users", "nessie_customer_id", "TEXT")
    if _add_column(conn, "income", "nessie_id", "TEXT"):
        # SQLite can't ADD a UNIQUE column, so the uniqueness comes from an index instead
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS income_nessie_id ON income(nessie_id)")


def _add_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> bool:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column in columns:
        return False
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    return True
