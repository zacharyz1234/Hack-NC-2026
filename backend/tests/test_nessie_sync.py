"""Copying Nessie sandbox data into SQLite (network calls replaced with fixtures)."""
import pytest

from app.db import get_conn
from app.services import nessie, nessie_sync
from tests.conftest import rows, signup, user_id

ACCOUNTS = [
    {"_id": "acc1", "type": "Checking", "nickname": "Everyday", "balance": 1342.55},
    {"_id": "acc2", "type": "Savings", "nickname": "Rainy Day", "balance": 5000},
]
PURCHASES = {
    "acc1": [
        {"_id": "p1", "merchant_id": "m1", "purchase_date": "2026-10-08", "amount": 6.75, "status": "completed"},
        {"_id": "p2", "merchant_id": "m2", "purchase_date": "2026-10-05", "amount": 54.1, "status": "pending"},
        {"_id": "p3", "merchant_id": "m3", "purchase_date": "2026-10-01", "amount": 15.99, "status": "completed"},
        {"_id": "p4", "merchant_id": "m4", "purchase_date": "2026-09-28", "amount": 40, "status": "cancelled"},
    ],
    "acc2": [],
}
DEPOSITS = {"acc1": [{"_id": "d1", "transaction_date": "2026-10-01", "amount": 2000, "description": "Paycheck", "status": "completed"}], "acc2": []}
MERCHANTS = {
    "m1": {"name": "Campus Coffee", "category": ["food"]},
    "m2": {"name": "Green Grocer", "category": "food"},
    "m3": {"name": "Streamflix", "category": ["entertainment"]},
    "m4": {"name": "Gone", "category": ["food"]},
}


@pytest.fixture
def fake_nessie(monkeypatch):
    monkeypatch.setattr(nessie, "get_accounts", lambda customer_id: ACCOUNTS)
    monkeypatch.setattr(nessie, "get_purchases", lambda account_id: PURCHASES[account_id])
    monkeypatch.setattr(nessie, "get_deposits", lambda account_id: DEPOSITS[account_id])
    monkeypatch.setattr(nessie, "get_merchant", lambda merchant_id: MERCHANTS[merchant_id])


def _link(uid: int) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE users SET nessie_customer_id = 'cust1' WHERE id = ?", (uid,))


def test_sync_copies_and_maps_and_dedupes(client, fake_nessie):
    headers = signup(client)
    _link(user_id(client, headers))

    first = client.post("/nessie/sync", headers=headers).json()
    second = client.post("/nessie/sync", headers=headers).json()

    assert (first["accounts"], first["expenses_added"], first["income_added"]) == (2, 3, 1)
    assert (second["expenses_added"], second["income_added"]) == (0, 0)
    assert rows(
        "SELECT e.description, c.name AS category, e.amount_cents, e.source FROM expenses e"
        " LEFT JOIN categories c ON c.id = e.category_id ORDER BY e.spent_on DESC"
    ) == [
        {"description": "Campus Coffee", "category": "Eating out", "amount_cents": 675, "source": "nessie"},
        {"description": "Green Grocer", "category": "Groceries", "amount_cents": 5410, "source": "nessie"},
        {"description": "Streamflix", "category": "Subscriptions", "amount_cents": 1599, "source": "nessie"},
    ]
    assert rows("SELECT type, nickname, balance_cents FROM accounts ORDER BY type") == [
        {"type": "Checking", "nickname": "Everyday", "balance_cents": 134255},
        {"type": "Savings", "nickname": "Rainy Day", "balance_cents": 500000},
    ]
    assert rows("SELECT source, amount_cents FROM income") == [{"source": "Paycheck", "amount_cents": 200000}]


def test_unreadable_purchases_skip_that_account_only(client, fake_nessie, monkeypatch):
    def purchases(account_id):
        if account_id == "acc1":
            raise nessie.NessieError("400 on GET")
        return []

    monkeypatch.setattr(nessie, "get_purchases", purchases)
    headers = signup(client)
    _link(user_id(client, headers))

    result = client.post("/nessie/sync", headers=headers).json()

    assert (result["accounts"], result["expenses_added"], result["income_added"]) == (2, 0, 1)
    assert result["warnings"] == ["Couldn't read purchases for Everyday"]


def test_sync_needs_a_linked_bank(client, fake_nessie):
    headers = signup(client)
    assert client.post("/nessie/sync", headers=headers).status_code == 409


@pytest.mark.parametrize(
    "category, name, expected",
    [
        (["food"], "Campus Coffee", "Eating out"),
        ("food", "Green Grocer", "Groceries"),
        (["entertainment"], "Streamflix", "Subscriptions"),
        (["transport"], "Bus Pass Co", "Travel"),
        (["education"], "Bookworm", "Education"),
        (["pets"], "Pet Palace", None),
        (None, "Mystery", None),
    ],
)
def test_category_mapping(category, name, expected):
    assert nessie_sync.map_category(category, name) == expected
