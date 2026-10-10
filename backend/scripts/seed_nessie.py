"""Seed the Nessie sandbox with a customer, two accounts, merchants and purchases.

Run from backend/:  python -m scripts.seed_nessie
"""
import random
from datetime import date, timedelta

import httpx

from app.config import NESSIE_API_KEY

BASE_URL = "https://api.nessieisreal.com"

MERCHANTS = [
    ("Campus Coffee", "food"),
    ("Green Grocer", "food"),
    ("Bus Pass Co", "transport"),
    ("Bookworm", "education"),
    ("Streamflix", "entertainment"),
]


def post(client: httpx.Client, path: str, body: dict) -> dict:
    resp = client.post(path, params={"key": NESSIE_API_KEY}, json=body)
    if resp.is_error:
        raise SystemExit(f"{resp.status_code} on POST {path}: {resp.text}")
    return resp.json()["objectCreated"]


def main() -> None:
    if not NESSIE_API_KEY:
        raise SystemExit("NESSIE_API_KEY is not set (see .env.example)")

    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        customer = post(client, "/customers", {
            "first_name": "Sam",
            "last_name": "Rivera",
            "address": {
                "street_number": "1",
                "street_name": "Main St",
                "city": "Durham",
                "state": "NC",
                "zip": "27701",
            },
        })
        print("customer", customer["_id"])

        checking = post(client, f"/customers/{customer['_id']}/accounts", {
            "type": "Checking", "nickname": "Everyday", "rewards": 0, "balance": 1500,
        })
        savings = post(client, f"/customers/{customer['_id']}/accounts", {
            "type": "Savings", "nickname": "Rainy Day", "rewards": 0, "balance": 5000,
        })
        print("accounts", checking["_id"], savings["_id"])

        merchants = [
            post(client, "/merchants", {
                "name": name,
                "category": cat,
                "address": {
                    "street_number": "1",
                    "street_name": "Main St",
                    "city": "Durham",
                    "state": "NC",
                    "zip": "27701",
                },
                "geocode": {"lat": 35.99, "lng": -78.9},
            })
            for name, cat in MERCHANTS
        ]

        today = date.today()
        for i in range(20):
            merchant = random.choice(merchants)
            post(client, f"/accounts/{checking['_id']}/purchases", {
                "merchant_id": merchant["_id"],
                "medium": "balance",
                "purchase_date": (today - timedelta(days=i * 2)).isoformat(),
                "amount": round(random.uniform(4, 80), 2),
                "description": merchant["name"],
            })
        post(client, f"/accounts/{checking['_id']}/deposits", {
            "medium": "balance",
            "status": "completed",
            "transaction_date": today.isoformat(),
            "amount": 2000,
            "description": "Paycheck",
        })
        print("seeded 20 purchases and 1 deposit")


if __name__ == "__main__":
    main()
