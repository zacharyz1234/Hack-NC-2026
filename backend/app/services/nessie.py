"""Capital One Nessie sandbox client: a mock bank with customers, accounts, purchases and deposits.

The app never reads Nessie live for Gill. app/services/nessie_sync.py copies a student's data into
SQLite, and Gill's tools read SQLite only.
"""
import random
from datetime import date, timedelta

import httpx

from app.config import NESSIE_API_KEY

BASE_URL = "https://api.nessieisreal.com"

DEMO_ADDRESS = {"street_number": "1", "street_name": "Main St", "city": "Durham", "state": "NC", "zip": "27701"}
DEMO_MERCHANTS = [
    ("Campus Coffee", "food"),
    ("Green Grocer", "food"),
    ("Bus Pass Co", "transport"),
    ("Bookworm", "education"),
    ("Streamflix", "entertainment"),
]


class NessieError(Exception):
    pass


def _client() -> httpx.Client:
    if not NESSIE_API_KEY:
        raise NessieError("NESSIE_API_KEY is not set")
    return httpx.Client(base_url=BASE_URL, timeout=30, params={"key": NESSIE_API_KEY})


def _get(path: str) -> list | dict:
    try:
        with _client() as client:
            response = client.get(path)
    except httpx.HTTPError as exc:
        raise NessieError(f"GET {path} failed: {exc.__class__.__name__}") from exc
    if response.is_error:
        raise NessieError(f"{response.status_code} on GET {path}")
    return response.json()


def _post(client: httpx.Client, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    if response.is_error:
        raise NessieError(f"{response.status_code} on POST {path}: {response.text}")
    return response.json()["objectCreated"]


def get_accounts(customer_id: str) -> list[dict]:
    return _get(f"/customers/{customer_id}/accounts")


def get_purchases(account_id: str) -> list[dict]:
    return _get(f"/accounts/{account_id}/purchases")


def get_deposits(account_id: str) -> list[dict]:
    return _get(f"/accounts/{account_id}/deposits")


def get_merchant(merchant_id: str) -> dict:
    return _get(f"/merchants/{merchant_id}")


def create_demo_customer(first_name: str = "Sam", last_name: str = "Rivera") -> str:
    """Create a sandbox customer with checking + savings, 20 purchases and a paycheck. Returns the customer id."""
    try:
        with _client() as client:
            customer = _post(client, "/customers", {"first_name": first_name, "last_name": last_name, "address": DEMO_ADDRESS})
            checking = _post(client, f"/customers/{customer['_id']}/accounts", {
                "type": "Checking", "nickname": "Everyday", "rewards": 0, "balance": 1500,
            })
            _post(client, f"/customers/{customer['_id']}/accounts", {
                "type": "Savings", "nickname": "Rainy Day", "rewards": 0, "balance": 5000,
            })
            merchants = [
                _post(client, "/merchants", {
                    "name": name, "category": category, "address": DEMO_ADDRESS, "geocode": {"lat": 35.99, "lng": -78.9},
                })
                for name, category in DEMO_MERCHANTS
            ]
            today = date.today()
            for i in range(20):
                merchant = random.choice(merchants)
                _post(client, f"/accounts/{checking['_id']}/purchases", {
                    "merchant_id": merchant["_id"],
                    "medium": "balance",
                    "purchase_date": (today - timedelta(days=i * 2)).isoformat(),
                    "amount": round(random.uniform(4, 80), 2),
                    "status": "completed",  # without it, Nessie can't read the purchase back (GET returns 400)
                    "description": merchant["name"],
                })
            _post(client, f"/accounts/{checking['_id']}/deposits", {
                "medium": "balance",
                "status": "completed",
                "transaction_date": today.isoformat(),
                "amount": 2000,
                "description": "Paycheck",
            })
    except httpx.HTTPError as exc:
        raise NessieError(f"Nessie request failed: {exc.__class__.__name__}") from exc
    return customer["_id"]
