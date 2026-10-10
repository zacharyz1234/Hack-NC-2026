"""Create a demo student with bank data, a budget and a savings goal, so Gill has something to read.

Run from backend/:
    python -m scripts.seed_demo --email demo@unc.edu            # bank data from the Nessie sandbox
    python -m scripts.seed_demo --email demo@unc.edu --offline  # synthetic bank data, no network

Safe to re-run. All data is synthetic.
"""
import argparse
import random
from datetime import date, timedelta

from app.auth import hash_password
from app.db import get_conn, init_db, now_iso
from app.services import nessie, nessie_sync

DEMO_PASSWORD = "gill-demo-password"  # local testing only

OFFLINE_PURCHASES = [  # description, category, low $, high $
    ("Campus Coffee", "Eating out", 4, 9),
    ("Pizza Place", "Eating out", 12, 25),
    ("Green Grocer", "Groceries", 25, 70),
    ("Bus Pass Co", "Travel", 15, 30),
    ("Bookworm", "Education", 10, 60),
    ("Streamflix", "Subscriptions", 15.99, 15.99),
]


def ensure_user(email: str, password: str) -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            return row["id"]
        return conn.execute(
            "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, 'Demo Student')",
            (email, hash_password(password)),
        ).lastrowid


def category_ids() -> dict[str, int]:
    with get_conn() as conn:
        return {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM categories WHERE user_id IS NULL")}


def seed_offline_bank(user_id: int) -> None:
    """Looks like a Nessie sync (source 'nessie', deduped ids) but never leaves this machine."""
    rng, today, ids, synced_at = random.Random(user_id), date.today(), category_ids(), now_iso()
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO accounts (user_id, nessie_id, type, nickname, balance_cents, synced_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (user_id, f"offline-checking-{user_id}", "Checking", "Everyday", 134255, synced_at),
                (user_id, f"offline-savings-{user_id}", "Savings", "Rainy Day", 500000, synced_at),
            ],
        )
        for i in range(24):
            description, category, low, high = rng.choice(OFFLINE_PURCHASES)
            conn.execute(
                "INSERT OR IGNORE INTO expenses (user_id, category_id, amount_cents, description, spent_on, source, nessie_id)"
                " VALUES (?, ?, ?, ?, ?, 'nessie', ?)",
                (user_id, ids[category], round(rng.uniform(low, high) * 100), description,
                 (today - timedelta(days=i * 2)).isoformat(), f"offline-{user_id}-{i}"),
            )
        for i, days_ago in enumerate((1, 15, 29, 43)):
            conn.execute(
                "INSERT OR IGNORE INTO income (user_id, source, amount_cents, frequency, received_on, nessie_id)"
                " VALUES (?, 'Paycheck', 100000, 'biweekly', ?, ?)",
                (user_id, (today - timedelta(days=days_ago)).isoformat(), f"offline-pay-{user_id}-{i}"),
            )


def seed_nessie_bank(user_id: int) -> dict:
    with get_conn() as conn:
        customer_id = conn.execute("SELECT nessie_customer_id FROM users WHERE id = ?", (user_id,)).fetchone()[0]
    if not customer_id:
        customer_id = nessie.create_demo_customer("Demo", "Student")
        with get_conn() as conn:
            conn.execute("UPDATE users SET nessie_customer_id = ? WHERE id = ?", (customer_id, user_id))
    return nessie_sync.sync_user(user_id)


def seed_plans(user_id: int) -> None:
    today, ids = date.today(), category_ids()
    month = today.strftime("%Y-%m")
    spring_break = date(today.year + (1 if today.month >= 3 else 0), 3, 7)
    with get_conn() as conn:
        conn.executemany(
            "INSERT INTO budgets (user_id, category_id, month, limit_cents) VALUES (?, ?, ?, ?)"
            " ON CONFLICT (user_id, category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents",
            [
                (user_id, ids["Eating out"], month, 12000),
                (user_id, ids["Groceries"], month, 20000),
                (user_id, ids["Subscriptions"], month, 2000),
                (user_id, ids["Travel"], month, 6000),
            ],
        )
        if not conn.execute("SELECT 1 FROM savings_goals WHERE user_id = ? AND name = 'Spring break'", (user_id,)).fetchone():
            conn.execute(
                "INSERT INTO savings_goals (user_id, name, target_cents, saved_cents, target_date)"
                " VALUES (?, 'Spring break', 60000, 15000, ?)",
                (user_id, spring_break.isoformat()),
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default="demo@unc.edu")
    parser.add_argument("--password", default=DEMO_PASSWORD)
    parser.add_argument("--offline", action="store_true", help="synthetic bank data instead of the Nessie sandbox")
    args = parser.parse_args()

    init_db()
    user_id = ensure_user(args.email.strip().lower(), args.password)
    if args.offline:
        seed_offline_bank(user_id)
        print("bank data: synthetic (offline)")
    else:
        try:
            print("bank data: Nessie sandbox", seed_nessie_bank(user_id))
        except nessie.NessieError as exc:
            raise SystemExit(f"Nessie failed ({exc}). Re-run with --offline for synthetic data.") from None
    seed_plans(user_id)
    print(f"budget + 'Spring break' goal ready. Log in as {args.email} with password {args.password!r}")


if __name__ == "__main__":
    main()
