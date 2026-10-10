"""The normal app APIs that Gill's save cards call when the student presses the button."""
from tests.conftest import rows, signup


def test_budget_upsert_only_touches_sent_categories(client):
    headers = signup(client)
    client.put("/budgets/2026-10", json={"limits": [{"category_id": 2, "limit_cents": 20000}, {"category_id": 10, "limit_cents": 8000}]}, headers=headers)

    body = client.put("/budgets/2026-10", json={"limits": [{"category_id": 2, "limit_cents": 25000}]}, headers=headers).json()

    assert body == {
        "month": "2026-10",
        "limits": [
            {"category_id": 10, "category": "Eating out", "limit_cents": 8000},
            {"category_id": 2, "category": "Groceries", "limit_cents": 25000},
        ],
    }
    assert client.get("/budgets/2026-11", headers=headers).json()["limits"] == []


def test_budget_validation(client):
    headers = signup(client)
    duplicate = {"limits": [{"category_id": 2, "limit_cents": 1}, {"category_id": 2, "limit_cents": 2}]}
    assert client.put("/budgets/2026-10", json=duplicate, headers=headers).status_code == 422
    assert client.put("/budgets/2026-10", json={"limits": [{"category_id": 999, "limit_cents": 1}]}, headers=headers).status_code == 422
    assert client.put("/budgets/2026-10", json={"limits": [{"category_id": 2, "limit_cents": -1}]}, headers=headers).status_code == 422
    assert client.put("/budgets/26-10", json={"limits": [{"category_id": 2, "limit_cents": 1}]}, headers=headers).status_code == 422
    assert client.put("/budgets/2026-10", json={"limits": [{"category_id": 2, "limit_cents": 1}]}).status_code == 401


def test_cannot_budget_with_someone_elses_category(client):
    owner = signup(client, "owner@unc.edu")
    other = signup(client, "other@unc.edu")
    owner_id = client.get("/auth/me", headers=owner).json()["id"]
    from app.db import get_conn

    with get_conn() as conn:
        custom_id = conn.execute("INSERT INTO categories (user_id, name) VALUES (?, 'Boba')", (owner_id,)).lastrowid

    assert client.put("/budgets/2026-10", json={"limits": [{"category_id": custom_id, "limit_cents": 100}]}, headers=other).status_code == 422
    assert client.put("/budgets/2026-10", json={"limits": [{"category_id": custom_id, "limit_cents": 100}]}, headers=owner).status_code == 200
    names = [c["name"] for c in client.get("/categories", headers=owner).json()["categories"]]
    assert "Boba" in names and "Boba" not in [c["name"] for c in client.get("/categories").json()["categories"]]


def test_create_savings_goal(client):
    headers = signup(client)
    goal = {"name": "Spring break", "target_cents": 60000, "saved_cents": 15000, "target_date": "2027-03-07"}

    created = client.post("/savings-goals", json=goal, headers=headers)

    assert created.status_code == 201
    assert client.get("/savings-goals", headers=headers).json()["goals"] == [{"id": created.json()["id"], **goal}]
    assert client.post("/savings-goals", json={**goal, "target_cents": 0}, headers=headers).status_code == 422


def test_create_expense(client):
    headers = signup(client)

    created = client.post("/expenses", json={"amount_cents": 1200, "description": "Lunch", "category_id": 10, "spent_on": "2026-10-10"}, headers=headers)

    assert created.status_code == 201
    assert created.json()["source"] == "manual"
    assert rows("SELECT amount_cents, spent_on FROM expenses") == [{"amount_cents": 1200, "spent_on": "2026-10-10"}]
    assert client.post("/expenses", json={"amount_cents": 1200, "category_id": 999, "spent_on": "2026-10-10"}, headers=headers).status_code == 422
    assert client.post("/expenses", json={"amount_cents": 1200, "spent_on": "2026-10-10"}).status_code == 401
