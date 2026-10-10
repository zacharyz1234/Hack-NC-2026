"""Gill Gates' privacy and safety rules, checked end to end through the HTTP API.

Each test maps to an acceptance criterion in docs/GILL_GATES_AGENT_SPEC.md §10 (or a consent rule
from the design doc). Gemini is replaced by a scripted fake, so these run offline.
"""
import re
import sqlite3

import pytest

from app.assistant import data
from app.assistant.scopes import BALANCES, BUDGET_GOALS, HISTORY, SUMMARY
from app.assistant.tools import TOOLS
from app.db import readonly_conn
from app.services import elevenlabs
from tests.conftest import (
    answer,
    call,
    dumps,
    events_of,
    open_chat,
    reply,
    rows,
    say,
    say_to_gill,
    seed_finances,
    signup,
    user_id,
)

QUESTION = "Where could I cut spending?"


def _summary_turn(client, fake_gemini, headers, sid, *, period="last_30_days"):
    fake_gemini.script(reply(say("Let me check your spending totals."), call("get_spending_summary", period=period)))
    return say_to_gill(client, headers, sid, QUESTION)


# ---------- opening Gill ----------


def test_opening_gill_reads_no_data(client, fake_gemini, monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("financial data was read")

    for name in ("spending_summary", "transaction_history", "account_balances", "budget_goals", "budget_progress"):
        monkeypatch.setattr(data, name, boom)
    headers = signup(client)
    seed_finances(user_id(client, headers))

    body = client.post("/assistant/sessions", headers=headers).json()

    assert [e["message_id"] for e in body["events"]] == ["greeting"]
    assert body["signed_in"] is True and body["suggestions"]
    assert fake_gemini.calls == []
    assert [r["event"] for r in rows("SELECT event FROM assistant_audit_log")] == ["session_created"]


# ---------- consent is enforced by the backend ----------


def test_protected_read_waits_for_consent(client, fake_gemini, monkeypatch):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    reads = []
    monkeypatch.setattr(data, "spending_summary", lambda *a: reads.append(a) or {})

    turn = _summary_turn(client, fake_gemini, headers, sid)

    assert turn["state"] == "awaiting_consent"
    assert reads == []  # nothing was read
    assert len(fake_gemini.calls) == 1  # and nothing was sent back to Gemini
    card = events_of(turn, "consent_request")[0]
    assert [i["scope"] for i in card["items"]] == [SUMMARY]
    assert card["items"][0]["period_label"] == "Sep 11 – Oct 10, 2026"
    assert card["purpose"] == f"To answer: “{QUESTION}”"
    assert card["options"] == ["once", "chat", "always", "deny"]
    assert "Google Gemini" in card["shared_with"]


def test_allowing_sends_only_the_minimal_summary(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)

    fake_gemini.script(reply(say("Eating out was $37.15 over 3 purchases.")))
    turn = answer(client, headers, sid, turn, {SUMMARY: "chat"})

    assert turn["state"] == "ready"
    assert events_of(turn, "data_access")[0]["label"] == "Gill looked at your spending totals (last 30 days)"
    assert events_of(turn, "message")[0]["text"].startswith("Eating out")
    [result] = fake_gemini.last_results()
    summary = result["response"]
    assert summary["expense_total"] == 107.24
    assert summary["income_total"] == 2000.0
    assert [(c["category"], c["total"], c["count"]) for c in summary["by_category"]] == [
        ("Groceries", 54.1, 1),
        ("Eating out", 37.15, 3),
        ("Subscriptions", 15.99, 1),
    ]
    sent = dumps(summary)
    assert "Campus Coffee" not in sent and "IGNORE" not in sent  # no merchants or descriptions
    assert rows("SELECT scope, duration, session_id FROM assistant_consents") == [
        {"scope": SUMMARY, "duration": "chat", "session_id": sid}
    ]


def test_summary_consent_does_not_unlock_history_or_balances(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Got it.")))
    answer(client, headers, sid, turn, {SUMMARY: "always"})

    fake_gemini.script(reply(call("get_transaction_history", period="last_7_days")))
    turn = say_to_gill(client, headers, sid, "What did I buy this week?")
    assert turn["state"] == "awaiting_consent"
    assert [i["scope"] for i in events_of(turn, "consent_request")[0]["items"]] == [HISTORY]

    fake_gemini.script(reply(call("get_account_balances")))
    turn = say_to_gill(client, headers, sid, "What's my balance?")
    assert [i["scope"] for i in events_of(turn, "consent_request")[0]["items"]] == [BALANCES]


def test_allow_once_reads_one_time_and_stores_no_grant(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Here's what I see.")))

    turn = answer(client, headers, sid, turn, {SUMMARY: "once"})

    assert events_of(turn, "data_access")
    assert rows("SELECT * FROM assistant_consents") == []
    turn = _summary_turn(client, fake_gemini, headers, sid)
    assert turn["state"] == "awaiting_consent"  # asked again next time


def test_declining_leads_to_the_manual_route(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(
        reply(
            say("No problem! Roughly how much do you spend each month?"),
            call(
                "show_amount_form",
                prompt="Your rough monthly spending",
                fields=[{"key": "food", "label": "Food"}, {"key": "fun", "label": "Fun"}],
            ),
        )
    )

    turn = answer(client, headers, sid, turn, {SUMMARY: "deny"})

    [result] = fake_gemini.last_results()
    assert result["response"]["status"] == "consent_denied"
    assert turn["state"] == "awaiting_input"
    form = events_of(turn, "component")[0]
    assert form["component"] == "amount_form" and form["awaits_input"] is True
    assert rows("SELECT * FROM assistant_consents") == []

    fake_gemini.script(reply(say("Try trimming fun spending by $20.")))
    response = client.post(
        f"/assistant/sessions/{sid}/submit",
        json={"call_id": form["call_id"], "value": {"values": {"food": 300, "fun": 120}}},
        headers=headers,
    )
    assert response.status_code == 200
    [result] = fake_gemini.last_results()
    assert result["response"] == {
        "status": "submitted",
        "period": "monthly",
        "values": {"food": 300.0, "fun": 120.0},
        "source": "student_estimates",
    }
    assert "declined: Spending totals by category" in fake_gemini.calls[-1].system


def test_declined_scope_is_not_asked_again_in_the_same_turn(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(call("get_spending_summary", period="this_month")), reply(say("Okay, tell me instead.")))

    turn = answer(client, headers, sid, turn, {SUMMARY: "deny"})

    assert turn["state"] == "ready"
    assert not events_of(turn, "consent_request")
    assert fake_gemini.last_results()[0]["response"]["status"] == "consent_denied"


def test_two_kinds_of_data_are_decided_separately(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("get_account_balances"), call("get_spending_summary", period="last_30_days")))
    turn = say_to_gill(client, headers, sid, "How much can I safely set aside?")
    assert [i["scope"] for i in events_of(turn, "consent_request")[0]["items"]] == [BALANCES, SUMMARY]

    fake_gemini.script(reply(say("You have $1,342.55 in checking.")))
    turn = answer(client, headers, sid, turn, {BALANCES: "chat", SUMMARY: "deny"})

    balances, summary = fake_gemini.last_results()
    assert balances["name"] == "get_account_balances"
    assert balances["response"]["accounts"] == [
        {"type": "Checking", "nickname": "Everyday", "balance": 1342.55},
        {"type": "Savings", "nickname": "Rainy Day", "balance": 5000.0},
    ]
    assert "acct-" not in dumps(balances)  # no account ids
    assert summary["response"]["status"] == "consent_denied"
    assert [e["scope"] for e in events_of(turn, "data_access")] == [BALANCES]


def test_wider_window_than_granted_asks_again(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid, period="last_30_days")
    fake_gemini.script(reply(say("Done.")))
    answer(client, headers, sid, turn, {SUMMARY: "always"})

    turn = _summary_turn(client, fake_gemini, headers, sid, period="last_90_days")

    assert turn["state"] == "awaiting_consent"


def test_budget_grant_is_not_limited_by_a_time_window(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("get_budget_goals")))
    turn = say_to_gill(client, headers, sid, "What are my budgets?")
    assert events_of(turn, "consent_request")[0]["items"][0]["period_label"] is None
    fake_gemini.script(reply(say("Here they are.")))
    answer(client, headers, sid, turn, {BUDGET_GOALS: "always"})

    fake_gemini.script(reply(call("get_budget_progress")))
    turn = say_to_gill(client, headers, sid, "Am I on track?")

    items = events_of(turn, "consent_request")[0]["items"]
    assert [(i["scope"], i["period_label"]) for i in items] == [(SUMMARY, "Oct 1 – Oct 10, 2026")]  # budgets already allowed


def test_always_grant_reads_without_asking_in_a_new_chat(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Done.")))
    answer(client, headers, sid, turn, {SUMMARY: "always"})

    new_sid = open_chat(client, headers)
    fake_gemini.script(reply(call("get_spending_summary", period="this_month")), reply(say("Here you go.")))
    turn = say_to_gill(client, headers, new_sid, QUESTION)

    assert turn["state"] == "ready"
    assert not events_of(turn, "consent_request")
    assert events_of(turn, "data_access")[0]["label"] == "Gill looked at your spending totals (this month)"
    assert fake_gemini.last_results()[0]["response"]["expense_total"] == 79.25  # Oct 1-10 only
    assert "Spending totals by category (always)" in fake_gemini.calls[-1].system


def test_chat_grant_does_not_carry_to_a_new_chat(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Done.")))
    answer(client, headers, sid, turn, {SUMMARY: "chat"})

    turn = _summary_turn(client, fake_gemini, headers, open_chat(client, headers))

    assert turn["state"] == "awaiting_consent"


def test_revoking_stops_reads_and_clears_chats_that_used_the_data(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Groceries were $54.10.")))
    answer(client, headers, sid, turn, {SUMMARY: "always"})
    assert [c["status"] for c in client.get("/consents", headers=headers).json()["consents"]][0] == "always"

    assert client.delete(f"/consents/{SUMMARY}", headers=headers).status_code == 204

    assert client.get("/consents", headers=headers).json()["consents"][0]["status"] == "off"
    assert rows("SELECT transcript FROM assistant_sessions WHERE id = ?", sid) == [{"transcript": "[]"}]
    turn = _summary_turn(client, fake_gemini, headers, sid)
    assert turn["events"][0]["type"] == "notice"
    assert turn["state"] == "awaiting_consent"
    sent = dumps(fake_gemini.calls[-1].contents)
    assert "54.1" not in sent and "Groceries were" not in sent  # earlier data isn't re-sent to Gemini
    assert "Spending totals by category (always)" not in fake_gemini.calls[-1].system


def test_typing_instead_of_answering_closes_the_pending_request(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    request_id = events_of(turn, "consent_request")[0]["request_id"]

    fake_gemini.script(reply(say("Sure, let's talk about something else.")))
    turn = say_to_gill(client, headers, sid, "Actually, what's a Roth IRA?")

    assert turn["state"] == "ready"
    sent_parts = fake_gemini.calls[-1].contents[-1]["parts"]
    assert sent_parts[0]["function_response"]["response"]["status"] == "consent_not_given"
    assert sent_parts[-1]["text"] == "Actually, what's a Roth IRA?"
    stale = client.post(
        f"/assistant/sessions/{sid}/consent", json={"request_id": request_id, "decisions": {SUMMARY: "chat"}}, headers=headers
    )
    assert stale.status_code == 409
    assert rows("SELECT * FROM assistant_consents") == []


def test_consent_answer_must_cover_every_item(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("get_budget_progress")))
    turn = say_to_gill(client, headers, sid, "Am I on track?")
    request_id = events_of(turn, "consent_request")[0]["request_id"]

    response = client.post(
        f"/assistant/sessions/{sid}/consent", json={"request_id": request_id, "decisions": {SUMMARY: "chat"}}, headers=headers
    )

    assert response.status_code == 422
    assert {i["scope"] for i in events_of(turn, "consent_request")[0]["items"]} == {BUDGET_GOALS, SUMMARY}


# ---------- guests ----------


def test_guests_get_not_available_and_no_consent_card(client, fake_gemini):
    sid = open_chat(client)
    fake_gemini.script(
        reply(call("get_spending_summary", period="last_30_days")),
        reply(say("As a guest I don't have your data. What do you spend on food?")),
    )

    turn = say_to_gill(client, None, sid, QUESTION)

    assert turn["state"] == "ready"
    assert not events_of(turn, "consent_request")
    assert fake_gemini.last_results()[0]["response"]["status"] == "not_available"
    assert "browsing as a guest" in fake_gemini.calls[0].system


# ---------- read-only ----------


def test_tools_are_read_only_by_name():
    for name, spec in TOOLS.items():
        assert re.fullmatch(r"(get|show)_[a-z_]+", name)
        assert not re.search(r"save|update|delete|create|transfer|remove|write|edit|add_|set_", name)
        assert (spec.kind == "data") == name.startswith("get_")
        if spec.kind == "data":
            assert spec.scopes(spec.args.model_validate({})), f"{name} must need consent"


def test_readonly_connection_cannot_write(client):
    with readonly_conn() as conn, pytest.raises(sqlite3.OperationalError):
        conn.execute("INSERT INTO categories (name) VALUES ('Sneaky')")


def test_unknown_tools_are_refused(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(call("delete_expense", id=1)), reply(say("I can't delete anything.")))

    turn = say_to_gill(client, headers, sid, "Delete my last expense")

    assert fake_gemini.last_results()[0]["response"]["error"] == "unknown_tool"
    assert [e["type"] for e in turn["events"]] == ["message"]


def test_out_of_range_card_arguments_are_rejected(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(
        reply(call("show_budget_slider", prompt="Budget?", max_amount=1_000_000_000)),
        reply(say("How much would you like to spend?")),
    )

    turn = say_to_gill(client, headers, sid, "Plan my budget")

    assert not events_of(turn, "component")
    result = fake_gemini.last_results()[0]["response"]
    assert result["error"] == "invalid_arguments"
    assert result["details"][0]["field"] == "max_amount"


def test_budget_is_only_saved_when_the_student_presses_save(client, fake_gemini):
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(say("How much do you want to spend?"), call("show_budget_slider", prompt="Monthly total?")))
    turn = say_to_gill(client, headers, sid, "Help me plan October")
    slider = events_of(turn, "component")[0]
    assert slider["props"] == {"label": "Monthly total?", "currency": "USD", "min": 0, "max": 5000, "step": 25, "default": 500}

    bad = client.post(f"/assistant/sessions/{sid}/submit", json={"call_id": slider["call_id"], "value": {"amount": 9000}}, headers=headers)
    assert bad.status_code == 422

    fake_gemini.script(
        reply(
            call(
                "show_budget_plan",
                total=800,
                allocations=[{"category": "groceries", "amount": 160}, {"category": "Rent/Home", "amount": 450}],
                note="Leaves room for fun.",
            )
        ),
        reply(say("Tweak it and hit Save when it looks right.")),
    )
    turn = client.post(
        f"/assistant/sessions/{sid}/submit", json={"call_id": slider["call_id"], "value": {"amount": 800}}, headers=headers
    ).json()

    plan = events_of(turn, "component")[0]
    assert plan["component"] == "budget_plan" and plan["awaits_input"] is False
    assert plan["props"]["rows"][0]["category"] == "Groceries"
    assert (plan["props"]["allocated"], plan["props"]["unallocated"], plan["props"]["can_save"]) == (610.0, 190.0, True)
    assert rows("SELECT * FROM budgets") == []  # nothing saved by Gill

    limits = [{"category_id": r["category_id"], "limit_cents": round(r["amount"] * 100)} for r in plan["props"]["rows"]]
    assert client.put("/budgets/2026-10", json={"limits": limits}, headers=headers).status_code == 200
    assert client.post(
        f"/assistant/sessions/{sid}/events", json={"type": "user_saved", "target": "budget"}, headers=headers
    ).status_code == 204
    assert len(rows("SELECT * FROM budgets")) == 2

    fake_gemini.script(reply(say("Nice work!")))
    say_to_gill(client, headers, sid, "Done!")
    parts = fake_gemini.calls[-1].contents[-1]["parts"]
    assert parts[0]["text"].startswith("[App notice] The student saved the budget")
    assert "450" not in dumps(parts)  # the notice carries no amounts


# ---------- ownership ----------


def test_chats_only_answer_to_their_owner(client, fake_gemini):
    owner = signup(client, "owner@unc.edu")
    other = signup(client, "other@unc.edu")
    sid = open_chat(client, owner)

    for method, path, body in [
        ("post", f"/assistant/sessions/{sid}/messages", {"text": "hi"}),
        ("post", f"/assistant/sessions/{sid}/consent", {"request_id": "x", "decisions": {}}),
        ("post", f"/assistant/sessions/{sid}/submit", {"call_id": "x"}),
        ("post", f"/assistant/sessions/{sid}/events", {"type": "user_saved", "target": "budget"}),
        ("post", f"/assistant/sessions/{sid}/messages/greeting/speech", None),
        ("delete", f"/assistant/sessions/{sid}", None),
    ]:
        for headers in (other, {}):
            response = client.request(method.upper(), path, json=body, headers=headers)
            assert response.status_code == 404, (path, response.status_code)
    assert fake_gemini.calls == []


def test_tools_always_use_the_session_user(client, fake_gemini):
    owner = signup(client, "owner@unc.edu")
    seed_finances(user_id(client, owner))
    intruder = signup(client, "intruder@unc.edu")
    sid = open_chat(client, intruder)
    fake_gemini.script(reply(call("get_account_balances", user_id=1)), reply(say("Hmm.")))

    say_to_gill(client, intruder, sid, "Show me balances")

    assert fake_gemini.last_results()[0]["response"]["error"] == "invalid_arguments"  # no user_id argument exists


# ---------- what goes to Gemini ----------


def test_system_prompt_never_contains_financial_data(client, fake_gemini):
    headers = signup(client)
    seed_finances(user_id(client, headers))
    sid = open_chat(client, headers)
    turn = _summary_turn(client, fake_gemini, headers, sid)
    fake_gemini.script(reply(say("Okay.")))
    answer(client, headers, sid, turn, {SUMMARY: "always"})

    for request in fake_gemini.calls:
        for leaked in ("107.24", "54.1", "Campus Coffee", "1342", "Spring break", "Rainy Day"):
            assert leaked not in request.system


def test_speech_only_reads_gills_own_messages(client, fake_gemini, monkeypatch):
    monkeypatch.setattr(elevenlabs, "is_configured", lambda: True)
    spoken = []
    monkeypatch.setattr(elevenlabs, "text_to_speech", lambda text: spoken.append(text) or b"ID3audio")
    headers = signup(client)
    sid = open_chat(client, headers)
    fake_gemini.script(reply(say("**Nice!** You're on track 🐟")))
    turn = say_to_gill(client, headers, sid, "Am I doing okay?")
    message_id = events_of(turn, "message")[0]["message_id"]

    response = client.post(f"/assistant/sessions/{sid}/messages/{message_id}/speech", headers=headers)

    assert response.status_code == 200 and response.headers["content-type"] == "audio/mpeg"
    assert spoken == ["Nice! You're on track"]
    assert client.post(f"/assistant/sessions/{sid}/messages/m1/speech", headers=headers).status_code == 404  # student's turn
    assert client.post(f"/assistant/sessions/{sid}/messages/nope/speech", headers=headers).status_code == 404


def test_gemini_outage_returns_503_and_keeps_the_chat(client, monkeypatch):
    from app.services import gemini

    def down(*args):
        raise gemini.GeminiUnavailable("timeout")

    monkeypatch.setattr(gemini, "chat_step", down)
    headers = signup(client)
    sid = open_chat(client, headers)

    response = client.post(f"/assistant/sessions/{sid}/messages", json={"text": "hi"}, headers=headers)

    assert response.status_code == 503
    assert rows("SELECT transcript FROM assistant_sessions WHERE id = ?", sid) == [{"transcript": "[]"}]
