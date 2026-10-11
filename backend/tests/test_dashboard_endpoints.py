"""Dashboard APIs: accounts, the combined transaction list, and goal edits."""
from tests.conftest import rows, seed_finances, signup, user_id


def test_accounts_and_transactions(client):
    headers = signup(client)
    seed_finances(user_id(client, headers))

    accounts = client.get("/accounts", headers=headers).json()["accounts"]
    assert [(a["type"], a["balance_cents"]) for a in accounts] == [("Checking", 134255), ("Savings", 500000)]

    txs = client.get("/transactions", headers=headers).json()["transactions"]
    assert set(txs[0]) == {
        "id", "kind", "description", "category_id", "category", "amount_cents", "date", "account_id", "account_type", "source",
    }
    by_desc = {t["description"]: t for t in txs}
    assert by_desc["Campus Coffee"]["amount_cents"] == -675 and by_desc["Campus Coffee"]["kind"] == "expense"
    assert by_desc["Paycheck"]["amount_cents"] == 200000 and by_desc["Paycheck"]["category"] == "Income"
    assert [t["date"] for t in txs] == sorted((t["date"] for t in txs), reverse=True)
    assert client.get("/transactions", headers=signup(client, "other@unc.edu")).json()["transactions"] == []


def test_create_edit_delete_transactions(client):
    headers = signup(client)
    uid = user_id(client, headers)
    seed_finances(uid)
    checking = client.get("/accounts", headers=headers).json()["accounts"][0]["id"]

    spent = client.post(
        "/transactions",
        json={"description": "Tacos", "amount_cents": -1250, "date": "2026-10-09", "category_id": 10, "account_id": checking},
        headers=headers,
    )
    earned = client.post("/transactions", json={"description": "Tutoring", "amount_cents": 4000, "date": "2026-10-09"}, headers=headers)

    assert spent.status_code == earned.status_code == 201
    tx = spent.json()
    assert (tx["kind"], tx["amount_cents"], tx["category"], tx["account_type"], tx["source"]) == ("expense", -1250, "Eating out", "Checking", "manual")
    assert earned.json()["kind"] == "income"
    assert rows("SELECT amount_cents FROM expenses WHERE description = 'Tacos'") == [{"amount_cents": 1250}]

    edited = client.patch(f"/transactions/{tx['id']}", json={"amount_cents": -1500, "description": "Big tacos", "category_id": None}, headers=headers)
    assert edited.status_code == 200
    assert (edited.json()["amount_cents"], edited.json()["description"], edited.json()["category"]) == (-1500, "Big tacos", None)
    assert client.patch(f"/transactions/{tx['id']}", json={"amount_cents": 1500}, headers=headers).status_code == 422
    assert client.patch(f"/transactions/{earned.json()['id']}", json={"description": "Tutor gig"}, headers=headers).json()["description"] == "Tutor gig"

    assert client.delete(f"/transactions/{tx['id']}", headers=headers).status_code == 204
    assert client.delete(f"/transactions/{tx['id']}", headers=headers).status_code == 404
    assert client.post("/transactions", json={"description": "x", "amount_cents": 0, "date": "2026-10-09"}, headers=headers).status_code == 422


def test_cannot_touch_someone_elses_transactions(client):
    owner = signup(client, "owner@unc.edu")
    seed_finances(user_id(client, owner))
    other = signup(client, "other@unc.edu")
    tx_id = client.get("/transactions", headers=owner).json()["transactions"][0]["id"]
    owner_account = client.get("/accounts", headers=owner).json()["accounts"][0]["id"]

    assert client.patch(f"/transactions/{tx_id}", json={"description": "mine now"}, headers=other).status_code == 404
    assert client.delete(f"/transactions/{tx_id}", headers=other).status_code == 404
    assert client.post(
        "/transactions", json={"description": "x", "amount_cents": -100, "date": "2026-10-09", "account_id": owner_account}, headers=other
    ).status_code == 422
    assert client.get("/transactions").status_code == 401


def test_update_savings_goal(client):
    headers = signup(client)
    goal = client.post("/savings-goals", json={"name": "Trip", "target_cents": 50000}, headers=headers).json()

    updated = client.patch(f"/savings-goals/{goal['id']}", json={"saved_cents": 12500, "name": "Spring trip"}, headers=headers)

    assert updated.json() == {**goal, "saved_cents": 12500, "name": "Spring trip"}
    assert client.patch(f"/savings-goals/{goal['id']}", json={"saved_cents": 1}, headers=signup(client, "x@unc.edu")).status_code == 404


def test_transaction_pagination_beyond_200(client):
    from app.db import get_conn

    headers = signup(client)
    uid = user_id(client, headers)
    seed_finances(uid)
    account_id = client.get("/accounts", headers=headers).json()["accounts"][0]["id"]
    with get_conn() as conn:
        conn.executemany(
            "INSERT INTO expenses (user_id, amount_cents, description, spent_on, source, account_id)"
            " VALUES (?, 100, ?, '2026-10-10', 'manual', ?)",
            [(uid, f"Purchase {i}", account_id) for i in range(205)],
        )
    all_rows = client.get("/transactions?limit=1000", headers=headers).json()["transactions"]
    first = client.get("/transactions", headers=headers).json()["transactions"]
    rest = client.get("/transactions?offset=200", headers=headers).json()["transactions"]
    assert len(first) == 200
    assert first + rest == all_rows
    assert len({row["id"] for row in all_rows}) == len(all_rows)
    assert client.get("/transactions?offset=1000", headers=headers).json() == {"transactions": []}
    assert client.get("/transactions?offset=-1", headers=headers).status_code == 422
    filtered = client.get(f"/transactions?account_id={account_id}&offset=200", headers=headers).json()["transactions"]
    assert filtered and all(row["account_id"] == account_id for row in filtered)
    other = signup(client, "other-paging@unc.edu")
    assert client.get("/transactions?offset=200", headers=other).json() == {"transactions": []}
