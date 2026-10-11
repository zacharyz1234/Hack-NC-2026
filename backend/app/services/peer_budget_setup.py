"""Explicit, idempotent sandbox provisioning: python -m app.services.peer_budget_setup --month YYYY-MM.

Reads/writes only reserved fictional sandbox customers. Partial remote creations
are recovered by their deterministic names/descriptions on the next run. Each
snapshot replaces its predecessor only after every read succeeds.
"""
import argparse
import json
from contextlib import closing
from datetime import date

import httpx

from app.db import get_conn, init_db, now_iso
from app.services import nessie, peer_budgets as peers
from app.services.nessie_sync import map_category

PREFIX = "BowlStreetFictionalPeerV1"
MERCHANT = PREFIX + " Merchant"


def _get(client, path):
    response = client.get(path)
    if response.is_error:
        raise nessie.NessieError("Sandbox read failed")
    return response.json()


def _created(client, path, body):
    # Do not print provider bodies, URLs or bank identifiers in command output.
    response = client.post(path, json=body)
    if response.is_error:
        raise nessie.NessieError("Sandbox write failed")
    return response.json()["objectCreated"]


def setup(month: str):
    peers.MonthArgs(month=month)
    init_db()
    results = []
    # Serializes setup processes, including remote writes. Page reads remain read-only.
    with closing(get_conn()) as conn, nessie._client() as client:
        conn.execute("BEGIN IMMEDIATE")
        try:
            customers = _get(client, "/customers")
            merchants = _get(client, "/merchants")
            merchant = next((r for r in merchants if r.get("name") == MERCHANT), None)
            if merchant is None:
                merchant = _created(client, "/merchants", {"name": MERCHANT, "category": "shopping",
                    "address": nessie.DEMO_ADDRESS, "geocode": {"lat": 35.99, "lng": -78.9}})
            for profile in peers.PROFILES.values():
                try:
                    name = profile["id"]
                    customer = next((c for c in customers if c.get("first_name") == PREFIX
                                     and c.get("last_name") == name), None)
                    if customer is None:
                        customer = _created(client, "/customers", {"first_name": PREFIX,
                            "last_name": name, "address": nessie.DEMO_ADDRESS})
                        customers.append(customer)
                    customer_id = customer["_id"]
                    if conn.execute("SELECT 1 FROM users WHERE nessie_customer_id=?", (customer_id,)).fetchone():
                        raise nessie.NessieError("Reserved customer is linked to a student")
                    accounts = _get(client, f"/customers/{customer_id}/accounts")
                    account = next((a for a in accounts if a.get("nickname") == PREFIX
                                    and a.get("type", "").lower() == "checking"), None)
                    if account is None:
                        account = _created(client, f"/customers/{customer_id}/accounts", {
                            "type": "Checking", "nickname": PREFIX, "rewards": 0, "balance": 10000})
                    account_id = account["_id"]
                    if conn.execute("SELECT 1 FROM accounts WHERE nessie_id=?", (account_id,)).fetchone():
                        raise nessie.NessieError("Reserved account is linked to a student")
                    conn.execute("INSERT INTO demo_peer_profiles(id,name,housing,monthly_income_cents,nessie_customer_id,nessie_account_id)"
                                 " VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET"
                                 " name=excluded.name, housing=excluded.housing, monthly_income_cents=excluded.monthly_income_cents,"
                                 " nessie_customer_id=excluded.nessie_customer_id, nessie_account_id=excluded.nessie_account_id",
                                 (name, profile["name"], profile["housing"], profile["monthly_income_cents"], customer_id, account_id))
                    purchases = _get(client, f"/accounts/{account_id}/purchases")
                    deposits = _get(client, f"/accounts/{account_id}/deposits")
                    purchase_keys = {p.get("description") for p in purchases}
                    deposit_keys = {d.get("description") for d in deposits}
                    for index, item in enumerate(peers.sample_activity(profile, month)):
                        key = f"{PREFIX}|{name}|{month}|{index}"
                        if "income_cents" in item:
                            if key not in deposit_keys:
                                _created(client, f"/accounts/{account_id}/deposits", {
                                    "medium": "balance", "status": "completed", "transaction_date": item["date"],
                                    "amount": item["income_cents"] / 100, "description": key})
                        else:
                            key += "|" + item["category"]
                            if key not in purchase_keys:
                                _created(client, f"/accounts/{account_id}/purchases", {
                                    "merchant_id": merchant["_id"], "medium": "balance", "status": "completed",
                                    "purchase_date": item["date"], "amount": item["spending_cents"] / 100, "description": key})
                    # Refresh from the provider rather than assuming successful writes imply readable data.
                    purchases = _get(client, f"/accounts/{account_id}/purchases")
                    deposits = _get(client, f"/accounts/{account_id}/deposits")
                    expected_purchases, expected_deposits = set(), set()
                    for index, item in enumerate(peers.sample_activity(profile, month)):
                        key = f"{PREFIX}|{name}|{month}|{index}"
                        if "income_cents" in item:
                            expected_deposits.add(key)
                        else:
                            expected_purchases.add(key + "|" + item["category"])
                    if (not expected_purchases.issubset({p.get("description") for p in purchases if p.get("status") != "cancelled"})
                            or not expected_deposits.issubset({d.get("description") for d in deposits if d.get("status") != "cancelled"})):
                        raise nessie.NessieError("Incomplete sandbox refresh")
                    activity = []
                    merchant_cache = {}
                    for purchase in purchases:
                        day = purchase.get("purchase_date", "")[:10]
                        if not day.startswith(month + "-") or purchase.get("status") == "cancelled":
                            continue
                        date.fromisoformat(day)
                        description = purchase.get("description", "")
                        if description.startswith(f"{PREFIX}|{name}|{month}|"):
                            category = description.rsplit("|", 1)[-1]
                            if category not in peers.CATEGORIES:
                                category = "Uncategorized"
                        else:
                            mid = purchase.get("merchant_id")
                            if mid and mid not in merchant_cache:
                                merchant_cache[mid] = _get(client, f"/merchants/{mid}")
                            m = merchant_cache.get(mid, {})
                            category = map_category(m.get("category"), m.get("name", "")) or "Uncategorized"
                        amount = round(purchase["amount"] * 100)
                        if amount < 0:
                            raise ValueError("Invalid sandbox spending")
                        activity.append({"date": day, "category": category, "spending_cents": amount})
                    for deposit in deposits:
                        day = deposit.get("transaction_date", "")[:10]
                        if day.startswith(month + "-") and deposit.get("status") != "cancelled":
                            date.fromisoformat(day)
                            amount = round(deposit["amount"] * 100)
                            if amount < 0:
                                raise ValueError("Invalid sandbox income")
                            activity.append({"date": day, "income_cents": amount})
                    if not activity:
                        raise nessie.NessieError("No usable activity returned")
                    conn.execute("INSERT INTO demo_peer_snapshots VALUES (?,?,?,?,'nessie',?)"
                        " ON CONFLICT(profile_id,month) DO UPDATE SET budgets_json=excluded.budgets_json,"
                        " activity_json=excluded.activity_json, updated_at=excluded.updated_at",
                        (name, month, json.dumps(profile["budgets"]), json.dumps(activity), now_iso()))
                    results.append({"profile_id": name, "status": "refreshed"})
                except (nessie.NessieError, httpx.HTTPError, ValueError, KeyError, TypeError):
                    results.append({"profile_id": profile["id"], "status": "failed; previous snapshot preserved"})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True)
    args = parser.parse_args()
    try:
        results = setup(args.month)
    except (nessie.NessieError, httpx.HTTPError, ValueError, KeyError, TypeError):
        parser.exit(1, "Peer setup failed. Check the month, NESSIE_API_KEY and sandbox availability. Existing snapshots were preserved.\n")
    print(json.dumps(results, indent=2))
    if any(r["status"] != "refreshed" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
