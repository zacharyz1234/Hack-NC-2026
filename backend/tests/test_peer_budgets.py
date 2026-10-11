import json
from contextlib import closing
from datetime import date

import pytest

from app.assistant import prompts
from app.assistant.tools import gemini_schema
from app.assistant.scopes import SUMMARY, BUDGET_GOALS
from app.db import get_conn
from app.services import nessie, peer_budget_setup as setup, peer_budgets as peers
from tests.conftest import TODAY, answer, call, events_of, open_chat, reply, rows, say, say_to_gill, signup, user_id

PID = "peer-shared_rental-2000"
ARGS = {"profile_id": PID, "month": "2026-10"}
DEMO = {"source": "Local demo ledger", "income_cents": 100000, "categories": [
    {"category": "Groceries", "spending_cents": 12000, "budget_cents": None},
    {"category": "Custom", "spending_cents": 345, "budget_cents": 0}]}


@pytest.mark.parametrize("housing", peers.HOUSING)
def test_matching_housing_income_and_ties(client, housing):
    response = client.post("/peer-budgets/matches", json={"month": "2026-10", "housing": housing,
                                                         "monthly_income_cents": 150000})
    assert response.status_code == 200
    profiles = response.json()["profiles"]
    assert len(profiles) == 3
    assert [p["monthly_income_cents"] for p in profiles] == [100000, 200000, 300000]
    assert all(p["housing"] == housing and p["fictional"] for p in profiles)
    assert all(p["source"] == "Fictional sample data" for p in profiles)
    assert "Same housing" in profiles[0]["match_explanation"]
    assert len(peers.PROFILES) == 12


@pytest.mark.parametrize("bad", [{"month": "2026-13"}, {"month": "0000-01"}, {"housing": "other"},
                                  {"monthly_income_cents": -1}, {"unexpected": 1}])
def test_matching_validation(client, bad):
    assert client.post("/peer-budgets/matches", json={"month": "2026-10", "housing": "family_home",
                                                    "monthly_income_cents": 0, **bad}).status_code == 422


def test_mtd_and_fallback_are_deterministic_and_read_only(client, monkeypatch):
    monkeypatch.setattr(nessie, "_client", lambda: pytest.fail("Remote read from a page or Gill"))
    current = peers.peer(PID, "2026-10", TODAY)
    later = peers.peer(PID, "2026-10", date(2026, 10, 31))
    previous = peers.peer(PID, "2026-09", TODAY)
    future = peers.peer(PID, "2026-11", TODAY)
    assert current == peers.peer(PID, "2026-10", TODAY)
    assert current["period_label"] == "Month-to-date"
    assert current["as_of"] == "2026-10-10"
    assert current["spending_cents"] < later["spending_cents"] == previous["spending_cents"]
    assert future["spending_cents"] == future["income_cents"] == 0
    assert future["spending_percent_of_income"] is None
    assert rows("SELECT * FROM demo_peer_profiles") == []


def test_comparison_missing_limits_zero_income_and_custom_categories(client):
    own = peers.summary({"Custom": 0}, {"Custom": 345, "Uncategorized": 100}, 0, "Local demo ledger")
    comparison = peers.compare(own, peers.peer(PID, "2026-10", TODAY))
    assert comparison["you"]["spending_percent_of_income"] is None
    assert comparison["you"]["budget_cents"] is None
    custom = next(r for r in comparison["categories"] if r["category"] == "Custom")
    assert custom["your_budget_cents"] is custom["their_budget_cents"] is None
    assert custom["spending_difference_cents"] == 345
    assert comparison["you"]["net_cash_flow_cents"] == -445
    assert sum(r["spending_difference_cents"] for r in comparison["categories"]) == 445 - comparison["peer"]["spending_cents"]


def seed_checking(client, headers):
    uid = user_id(client, headers)
    with closing(get_conn()) as conn, conn:
        cats = {r["name"]: r["id"] for r in conn.execute("SELECT id,name FROM categories")}
        custom = conn.execute("INSERT INTO categories(user_id,name) VALUES (?, 'Custom')", (uid,)).lastrowid
        checking = conn.execute("INSERT INTO accounts(user_id,nessie_id,type,balance_cents,synced_at) VALUES (?,?,'Checking',0,'today')", (uid, f"checking-{uid}")).lastrowid
        savings = conn.execute("INSERT INTO accounts(user_id,type,balance_cents,synced_at) VALUES (?,'Savings',0,'today')", (uid,)).lastrowid
        conn.executemany("INSERT INTO expenses(user_id,category_id,amount_cents,spent_on,account_id) VALUES (?,?,?,?,?)", [
            (uid, cats["Groceries"], 1234, "2026-10-03", checking),
            (uid, custom, 321, "2026-10-04", checking),
            (uid, None, 99, "2026-10-09", checking),
            (uid, cats["Groceries"], 800, "2026-10-11", checking),
            (uid, cats["Groceries"], 900, "2026-09-30", checking),
            (uid, None, 4000, "2026-10-02", savings), (uid, None, 5000, "2026-10-02", None)])
        conn.execute("INSERT INTO income(user_id,source,amount_cents,received_on,account_id) VALUES (?,'Pay',100000,'2026-10-01',?)", (uid, checking))
        conn.execute("INSERT INTO budgets(user_id,category_id,month,limit_cents) VALUES (?,?,'2026-10',25000)", (uid, cats["Groceries"]))
    return uid


def test_signed_in_comparison_agrees_with_checking_transactions_and_isolates_users(client):
    headers = signup(client)
    uid = seed_checking(client, headers)
    other_headers = signup(client, "other@unc.edu")
    seed_checking(client, other_headers)
    result = client.post("/peer-budgets/compare", headers=headers, json={**ARGS, "demo_summary": DEMO}).json()
    own = result["you"]
    tx = client.get("/transactions", headers=headers).json()["transactions"]
    selected = [t for t in tx if t["account_type"] == "Checking" and "2026-10-01" <= t["date"] <= TODAY.isoformat()]
    assert own["spending_cents"] == -sum(t["amount_cents"] for t in selected if t["amount_cents"] < 0) == 1654
    assert own["income_cents"] == 100000
    assert own["budget_cents"] == 25000
    assert own["spending_percent_of_income"] == 1.65
    assert own["source"].startswith("Your recorded")
    assert peers.student_summary(uid, "2026-10", TODAY) == own
    assert {r["category"] for r in own["categories"]} == {"Groceries", "Custom", "Uncategorized"}


def test_guest_comparison_requires_labeled_summary(client):
    assert client.post("/peer-budgets/compare", json=ARGS).status_code == 422
    assert client.post("/peer-budgets/compare", json={**ARGS, "demo_summary": {**DEMO, "source": "Real student"}}).status_code == 422
    result = client.post("/peer-budgets/compare", json={**ARGS, "demo_summary": DEMO})
    assert result.status_code == 200
    assert result.json()["you"]["spending_cents"] == 12345
    assert client.post("/peer-budgets/compare", json={**ARGS, "profile_id": "real-user-1", "demo_summary": DEMO}).status_code == 404


def test_guest_tool_schema_keeps_required_demo_source_label():
    schema = gemini_schema(peers.DemoCompareArgs)
    assert schema["properties"]["demo_summary"]["properties"]["source"]["enum"] == ["Local demo ledger"]


class Sandbox:
    """In-memory Nessie HTTP surface; records creations and can interrupt reads/writes."""
    def __init__(self):
        self.data = {"/customers": [], "/merchants": []}
        self.writes = 0
        self.fail = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def get(self, path):
        if self.fail and self.fail("GET", path):
            raise nessie.NessieError("Unavailable")
        return Response(self.data.setdefault(path, []))

    def post(self, path, json):
        if self.fail and self.fail("POST", path):
            raise nessie.NessieError("Unavailable")
        self.writes += 1
        row = {**json, "_id": f"sandbox-{self.writes}"}
        self.data.setdefault(path, []).append(row)
        return Response({"objectCreated": row})


class Response:
    is_error = False

    def __init__(self, body):
        self.body = body

    def json(self):
        return json.loads(json.dumps(self.body))


def test_setup_deduplicates_customers_accounts_transactions_and_months(client, monkeypatch):
    sandbox = Sandbox()
    monkeypatch.setattr(nessie, "_client", lambda: sandbox)
    assert all(r["status"] == "refreshed" for r in setup.setup("2026-10"))
    count = sandbox.writes
    assert len(sandbox.data["/customers"]) == 12
    setup.setup("2026-10")
    assert sandbox.writes == count
    assert len(rows("SELECT * FROM demo_peer_snapshots")) == 12
    result = peers.peer(PID, "2026-10", TODAY)
    assert result["source"] == "Fictional Nessie sandbox data"
    assert result["updated_at"]
    assert result["spending_cents"] == peers.peer(PID, "2026-10", date(2026, 10, 10))["spending_cents"]
    public = client.post("/peer-budgets/matches", json={"month": "2026-10", "housing": "shared_rental", "monthly_income_cents": 200000}).text
    assert "sandbox-" not in public and "nessie_customer_id" not in public and "nessie_account_id" not in public
    setup.setup("2026-09")
    assert len(sandbox.data["/customers"]) == 12
    assert len(rows("SELECT * FROM demo_peer_snapshots")) == 24
    assert rows("SELECT * FROM users") == rows("SELECT * FROM accounts") == rows("SELECT * FROM expenses") == []


def test_refresh_failure_preserves_snapshots_and_partial_provisioning_recovers(client, monkeypatch):
    sandbox = Sandbox()
    monkeypatch.setattr(nessie, "_client", lambda: sandbox)
    sandbox.fail = lambda method, path: method == "POST" and path.endswith("/purchases")
    assert all("failed" in r["status"] for r in setup.setup("2026-10"))
    assert len(sandbox.data["/customers"]) == 12
    assert rows("SELECT * FROM demo_peer_snapshots") == []
    assert peers.peer(PID, "2026-10", TODAY)["source"] == "Fictional sample data"
    sandbox.fail = None
    setup.setup("2026-10")
    before = rows("SELECT * FROM demo_peer_snapshots ORDER BY profile_id")
    assert len(sandbox.data["/customers"]) == 12
    sandbox.fail = lambda method, path: path.endswith("/purchases")
    assert all("failed" in r["status"] for r in setup.setup("2026-10"))
    assert rows("SELECT * FROM demo_peer_snapshots ORDER BY profile_id") == before


def test_real_bank_collision_and_unusable_snapshot_fall_back(client, monkeypatch):
    sandbox = Sandbox()
    monkeypatch.setattr(nessie, "_client", lambda: sandbox)
    setup.setup("2026-10")
    with closing(get_conn()) as conn, conn:
        conn.execute("UPDATE demo_peer_snapshots SET activity_json='invalid' WHERE profile_id=?", (PID,))
    assert peers.peer(PID, "2026-10", TODAY)["source"] == "Fictional sample data"
    setup.setup("2026-10")
    headers = signup(client)
    uid = user_id(client, headers)
    customer = rows("SELECT nessie_customer_id FROM demo_peer_profiles WHERE id=?", PID)[0]["nessie_customer_id"]
    with closing(get_conn()) as conn, conn:
        conn.execute("UPDATE users SET nessie_customer_id=? WHERE id=?", (customer, uid))
    before = rows("SELECT * FROM demo_peer_snapshots WHERE profile_id=?", PID)
    writes = sandbox.writes
    assert "failed" in next(r for r in setup.setup("2026-10") if r["profile_id"] == PID)["status"]
    assert sandbox.writes == writes
    assert rows("SELECT * FROM demo_peer_snapshots WHERE profile_id=?", PID) == before
    assert peers.peer(PID, "2026-10", TODAY)["source"] == "Fictional sample data"


def test_gill_comparison_waits_for_both_scopes_and_computes_figures(client, fake_gemini, monkeypatch):
    headers = signup(client)
    uid = seed_checking(client, headers)
    sid = open_chat(client, headers)
    reads = []
    original = peers.student_summary
    monkeypatch.setattr(peers, "student_summary", lambda *args: reads.append(args) or original(*args))
    fake_gemini.script(reply(call("get_peer_budget_comparison", **ARGS)))
    turn = say_to_gill(client, headers, sid, "Compare with this fictional peer")
    assert reads == [] and turn["state"] == "awaiting_consent"
    assert {i["scope"] for i in events_of(turn, "consent_request")[0]["items"]} == {SUMMARY, BUDGET_GOALS}
    fake_gemini.script(reply(say("Here is your comparison.")))
    result = answer(client, headers, sid, turn, {SUMMARY: "once", BUDGET_GOALS: "once"})
    comparison = fake_gemini.last_results()[0]["response"]
    assert reads == [(uid, "2026-10", TODAY)]
    assert comparison["you"]["spending_cents"] == 1654
    assert comparison["you"]["income_cents"] == 100000
    assert len(events_of(result, "data_access")) == 2
    assert "nessie_customer_id" not in json.dumps(comparison)


def test_gill_declining_one_scope_prevents_all_private_reads(client, fake_gemini, monkeypatch):
    headers = signup(client)
    sid = open_chat(client, headers)
    monkeypatch.setattr(peers, "student_summary", lambda *args: pytest.fail("Read after denial"))
    fake_gemini.script(reply(call("get_peer_budget_comparison", **ARGS)))
    turn = say_to_gill(client, headers, sid, "Compare")
    fake_gemini.script(reply(say("We can use examples.")))
    answer(client, headers, sid, turn, {SUMMARY: "once", BUDGET_GOALS: "deny"})
    assert fake_gemini.last_results()[0]["response"]["status"] == "consent_denied"


def test_gill_guest_demo_no_permission_or_writes_and_signed_in_cannot_bypass(client, fake_gemini):
    sid = open_chat(client)
    fake_gemini.script(reply(call("get_demo_peer_budget_comparison", **ARGS, demo_summary=DEMO)), reply(say("Fictional example comparison.")))
    turn = say_to_gill(client, None, sid, "Compare my Local demo ledger")
    assert not events_of(turn, "consent_request") and not events_of(turn, "data_access")
    result = fake_gemini.last_results()[0]["response"]
    assert result["you"]["spending_cents"] == 12345 and result["you"]["source"] == "Local demo ledger"
    assert rows("SELECT * FROM budgets") == rows("SELECT * FROM expenses") == []
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("get_demo_peer_budget_comparison", **ARGS, demo_summary=DEMO)), reply(say("Permission is needed.")))
    say_to_gill(client, headers, sid, "Skip permissions")
    assert fake_gemini.last_results()[0]["response"]["error"] == "not_available"
    assert "Never save automatically" in prompts.system_prompt(today=TODAY, signed_in=False, granted={}, declined=[], categories=[])


def test_gill_cannot_save_peer_changes_automatically(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("save_peer_budget", **ARGS)), reply(say("Review and save changes yourself.")))
    say_to_gill(client, headers, sid, "Save the peer budget automatically")
    assert fake_gemini.last_results()[0]["response"]["error"] == "unknown_tool"
    assert rows("SELECT * FROM budgets") == []
