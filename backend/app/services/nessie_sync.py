"""Copy a student's Nessie sandbox accounts, purchases and deposits into SQLite.

This (run from the student's "Refresh bank data" button or a script) is the only way bank data
enters the app; Gill never triggers it. Re-running is safe: rows are deduped on nessie_id.
"""
import re

from app.db import get_conn, now_iso
from app.services import nessie

# Nessie merchant category -> our built-in category. Anything unmapped stays uncategorized.
CATEGORY_MAP = {
    "food": "Eating out",
    "restaurant": "Eating out",
    "grocery": "Groceries",
    "groceries": "Groceries",
    "transport": "Travel",
    "transportation": "Travel",
    "travel": "Travel",
    "gas": "Auto",
    "auto": "Auto",
    "education": "Education",
    "books": "Education",
    "insurance": "Insurance",
    "utilities": "Bills",
    "bills": "Bills",
    "shopping": "Shopping",
    "clothing": "Shopping",
}
GROCERY_NAMES = re.compile(r"grocer|supermarket|market", re.IGNORECASE)
SUBSCRIPTION_NAMES = re.compile(r"flix|stream|spotify|hulu|subscription", re.IGNORECASE)


class NotLinked(Exception):
    pass


def map_category(nessie_category: str | list | None, merchant_name: str) -> str | None:
    """The merchant's name wins for groceries and subscriptions; otherwise use Nessie's category."""
    if GROCERY_NAMES.search(merchant_name):
        return "Groceries"
    if SUBSCRIPTION_NAMES.search(merchant_name):
        return "Subscriptions"
    categories = [nessie_category] if isinstance(nessie_category, str) else nessie_category or []
    for category in categories:
        if mapped := CATEGORY_MAP.get(str(category).strip().lower()):
            return mapped
    return None


def sync_user(user_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT nessie_customer_id FROM users WHERE id = ?", (user_id,)).fetchone()
    customer_id = row["nessie_customer_id"] if row else None
    if not customer_id:
        raise NotLinked()

    # Fetch everything first so no database lock is held during network calls.
    accounts = nessie.get_accounts(customer_id)
    purchases, deposits, merchants, warnings = [], [], {}, []
    for account in accounts:
        try:
            account_purchases = nessie.get_purchases(account["_id"])
        except nessie.NessieError:
            # Nessie can't return purchases created without a status; keep the rest of the sync.
            warnings.append(f"Couldn't read purchases for {account.get('nickname') or account.get('type')}")
            account_purchases = []
        for purchase in account_purchases:
            if purchase.get("status") == "cancelled" or not purchase.get("purchase_date"):
                continue
            merchant_id = purchase.get("merchant_id")
            if merchant_id and merchant_id not in merchants:
                try:
                    merchants[merchant_id] = nessie.get_merchant(merchant_id)
                except nessie.NessieError:
                    merchants[merchant_id] = {}
            purchases.append((account["_id"], purchase))
        deposits += [
            (account["_id"], d)
            for d in nessie.get_deposits(account["_id"])
            if d.get("status") != "cancelled" and d.get("transaction_date")
        ]

    synced_at = now_iso()
    expenses_added = income_added = 0
    with get_conn() as conn:
        category_ids = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM categories WHERE user_id IS NULL")}
        for account in accounts:
            conn.execute(
                "INSERT INTO accounts (user_id, nessie_id, type, nickname, balance_cents, synced_at)"
                " VALUES (?, ?, ?, ?, ?, ?)"
                " ON CONFLICT (nessie_id) DO UPDATE SET type = excluded.type, nickname = excluded.nickname,"
                " balance_cents = excluded.balance_cents, synced_at = excluded.synced_at"
                " WHERE accounts.user_id = excluded.user_id",
                (user_id, account["_id"], account.get("type", "Account"), account.get("nickname"),
                 round(account.get("balance", 0) * 100), synced_at),
            )
        account_ids = {
            r["nessie_id"]: r["id"] for r in conn.execute("SELECT id, nessie_id FROM accounts WHERE user_id = ?", (user_id,))
        }
        for account_nessie_id, purchase in purchases:
            merchant = merchants.get(purchase.get("merchant_id"), {})
            name = merchant.get("name") or purchase.get("description") or "Purchase"
            category = map_category(merchant.get("category"), name)
            cur = conn.execute(
                "INSERT OR IGNORE INTO expenses"
                " (user_id, category_id, amount_cents, description, spent_on, source, nessie_id, account_id)"
                " VALUES (?, ?, ?, ?, ?, 'nessie', ?, ?)",
                (user_id, category_ids.get(category), round(purchase["amount"] * 100), name,
                 purchase["purchase_date"][:10], purchase["_id"], account_ids.get(account_nessie_id)),
            )
            expenses_added += cur.rowcount
        for account_nessie_id, deposit in deposits:
            cur = conn.execute(
                "INSERT OR IGNORE INTO income (user_id, source, amount_cents, frequency, received_on, nessie_id, account_id)"
                " VALUES (?, ?, ?, 'once', ?, ?, ?)",
                (user_id, deposit.get("description") or "Deposit", round(deposit["amount"] * 100),
                 deposit["transaction_date"][:10], deposit["_id"], account_ids.get(account_nessie_id)),
            )
            income_added += cur.rowcount
    return {
        "accounts": len(accounts),
        "expenses_added": expenses_added,
        "income_added": income_added,
        "synced_at": synced_at,
        "warnings": warnings,
    }
