"""Tool-level checks: argument validation, server-side math, and the schema Gemini receives."""
import json
from datetime import date

import pytest
from pydantic import ValidationError

from app.assistant import periods
from app.assistant.scopes import BUDGET_GOALS, SUMMARY
from app.assistant.tools import TOOLS, ToolContext, ToolError, declarations
from tests.conftest import TODAY


def run(client, name: str, signed_in: bool = True, **args):
    spec = TOOLS[name]
    ctx = ToolContext(user_id=None, session_id="as_test", today=TODAY)
    if signed_in:
        ctx = ToolContext(user_id=_make_user(client), session_id="as_test", today=TODAY)
    return spec.run(ctx, spec.args.model_validate(args))


def _make_user(client) -> int:
    response = client.post("/auth/register", json={"email": "tools@unc.edu", "password": "test-password-1"})
    if response.status_code == 409:
        response = client.post("/auth/login", json={"email": "tools@unc.edu", "password": "test-password-1"})
    return response.json()["user"]["id"]


def test_savings_calculator_math(client):
    outcome = run(
        client, "show_savings_calculator",
        goal_name="Spring break", target_amount=600, already_saved=150, monthly_contribution=100, target_date="2027-03-07",
    )
    props = outcome.props
    assert props["remaining"] == 450.0
    assert (props["months_needed"], props["projected_completion"]) == (5, "2027-03")
    assert (props["months_until_target_date"], props["required_monthly_for_target_date"]) == (5, 90.0)
    assert outcome.result["status"] == "displayed"


def test_savings_calculator_rounds_required_amount_up(client):
    outcome = run(client, "show_savings_calculator", goal_name="Laptop", target_amount=1000, target_date="2027-05-01")
    assert outcome.props["months_until_target_date"] == 7
    assert outcome.props["required_monthly_for_target_date"] == 142.86  # 1000 / 7 = 142.857... rounded up


def test_savings_calculator_rejects_past_dates(client):
    with pytest.raises(ToolError) as exc:
        run(client, "show_savings_calculator", goal_name="Trip", target_amount=500, target_date="2026-01-01")
    assert exc.value.result["error"] == "invalid_arguments"


def test_budget_plan_resolves_names_and_does_the_math(client):
    outcome = run(
        client, "show_budget_plan", month="next_month", total=500,
        allocations=[{"category": "eating OUT", "amount": 120.56}, {"category": "Groceries", "amount": 400}],
    )
    props = outcome.props
    assert (props["month"], props["month_label"]) == ("2026-11", "November 2026")
    assert [r["category"] for r in props["rows"]] == ["Eating out", "Groceries"]
    assert (props["allocated"], props["unallocated"], props["over_allocated"]) == (520.56, -20.56, True)


def test_budget_plan_rejects_unknown_and_duplicate_categories(client):
    with pytest.raises(ToolError) as exc:
        run(client, "show_budget_plan", allocations=[{"category": "Yachts", "amount": 10}])
    assert exc.value.result["unknown"] == ["Yachts"]
    assert "Groceries" in exc.value.result["valid_categories"]
    with pytest.raises(ToolError):
        run(client, "show_budget_plan", allocations=[{"category": "Travel", "amount": 1}, {"category": "travel", "amount": 2}])


def test_guest_cards_cannot_save(client):
    outcome = run(client, "show_expense_draft", signed_in=False, amount=12, description="Lunch", category="eating out")
    assert outcome.props["can_save"] is False
    assert outcome.props["category"] == "Eating out"
    assert outcome.props["date"] == "2026-10-10"


def test_quick_add_can_open_blank(client):
    outcome = run(client, "show_expense_draft", signed_in=False)
    assert (outcome.props["amount"], outcome.props["description"], outcome.props["category"]) == (None, "", None)
    assert outcome.props["date"] == "2026-10-10"
    assert "demo ledger" in outcome.result["message"]

    signed_in = run(client, "show_expense_draft", amount=4.5, description="Coffee")
    assert (signed_in.props["amount"], signed_in.props["description"]) == (4.5, "Coffee")
    assert "demo ledger" not in signed_in.result["message"]


def test_expense_draft_rejects_future_dates(client):
    with pytest.raises(ToolError):
        run(client, "show_expense_draft", amount=12, description="Lunch", spent_on="2026-12-25")


def test_scenario_comparison(client):
    outcome = run(
        client, "show_scenario_comparison", monthly_income=1200,
        scenarios=[
            {"name": "Now", "allocations": [{"category": "Eating out", "amount": 200}, {"category": "Rent", "amount": 600}]},
            {"name": "Leaner", "allocations": [{"category": "eating out", "amount": 120}, {"category": "Rent", "amount": 600}]},
        ],
    )
    props = outcome.props
    assert props["scenarios"] == [{"name": "Now", "total": 800.0, "leftover": 400.0}, {"name": "Leaner", "total": 720.0, "leftover": 480.0}]
    assert props["rows"][0] == {"category": "Eating out", "amounts": [200.0, 120.0], "diff_vs_first": [0.0, -80.0]}


def test_chart_scopes_depend_on_the_chart():
    spec = TOOLS["show_spending_chart"]
    scopes = {chart: spec.scopes(spec.args.model_validate({"chart": chart})) for chart in
              ("spending_by_category", "budget_vs_actual", "manual_breakdown")}
    assert scopes == {"spending_by_category": [SUMMARY], "budget_vs_actual": [BUDGET_GOALS, SUMMARY], "manual_breakdown": []}


def test_manual_chart_needs_values(client):
    with pytest.raises(ToolError):
        run(client, "show_spending_chart", chart="manual_breakdown")
    outcome = run(client, "show_spending_chart", chart="manual_breakdown", values=[{"label": "Food", "amount": 300}])
    assert outcome.props["series"] == [{"label": "Food", "value": 300.0}]


@pytest.mark.parametrize(
    "name, value, ok",
    [
        ("show_budget_slider", {"amount": 812}, True),
        ("show_budget_slider", {"amount": -5}, False),
        ("show_budget_slider", {"amount": True}, False),
        ("show_budget_slider", {}, False),
        ("show_amount_form", {"values": {"rent": 650}}, True),
        ("show_amount_form", {"values": {"rent": -1}}, False),
        ("show_amount_form", {"values": {"yacht": 5}}, False),
        ("show_amount_form", {"values": {}}, False),
    ],
)
def test_card_submissions_are_validated(name, value, ok):
    props = {
        "show_budget_slider": {"label": "x", "currency": "USD", "min": 0, "max": 5000, "step": 25, "default": 500},
        "show_amount_form": {"label": "x", "period": "monthly", "currency": "USD", "fields": [{"key": "rent", "label": "Rent"}]},
    }[name]
    if ok:
        result = TOOLS[name].submit(props, value)
        assert result["status"] == "submitted"
    else:
        with pytest.raises(ValueError):
            TOOLS[name].submit(props, value)


def test_slider_snaps_to_step():
    props = {"label": "x", "currency": "USD", "min": 0, "max": 5000, "step": 25, "default": 500}
    assert TOOLS["show_budget_slider"].submit(props, {"amount": 812})["monthly_spending_target"] == 800.0


def test_category_picker_submission(client):
    outcome = run(client, "show_category_picker", prompt="Which matter?", preselected=["Groceries", "Nope"], max_choices=2)
    props = outcome.props
    assert props["preselected_ids"] == [2]
    picker = TOOLS["show_category_picker"]
    assert picker.submit(props, {"category_ids": [2, 3]}) == {"status": "submitted", "selected_categories": ["Groceries", "Rent/Home"]}
    for bad in ({"category_ids": [2, 3, 4]}, {"category_ids": []}, {"category_ids": [2, 2]}, {"category_ids": [999]}):
        with pytest.raises(ValueError):
            picker.submit(props, bad)


def test_args_reject_unknown_fields():
    with pytest.raises(ValidationError):
        TOOLS["get_spending_summary"].args.model_validate({"period": "last_30_days", "user_id": 7})
    with pytest.raises(ValidationError):
        TOOLS["get_transaction_history"].args.model_validate({"period": "last_90_days"})  # history is capped at ~31 days


def test_gemini_schemas_use_only_plain_keywords():
    allowed = {
        "type", "description", "properties", "required", "items", "enum",
        "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength",
    }

    def check(node: dict, where: str) -> None:
        assert set(node) <= allowed, (where, set(node) - allowed)
        for name, prop in node.get("properties", {}).items():
            check(prop, f"{where}.{name}")
        if "items" in node:
            check(node["items"], f"{where}[]")

    for declaration in declarations():
        if declaration.parameters_json_schema is not None:
            check(declaration.parameters_json_schema, declaration.name)
    assert "$ref" not in json.dumps([d.parameters_json_schema for d in declarations()])
    assert TOOLS["get_account_balances"].declaration().parameters_json_schema is None


def test_gill_background_facts(client):
    spec = TOOLS["get_gill_background"]
    assert spec.kind == "data" and spec.scopes(spec.args.model_validate({})) == []

    everything = run(client, "get_gill_background", signed_in=False).result
    assert everything["topic"] == "all" and everything["status"] == "ok"
    text = " ".join(everything["facts"])
    for lore in ("thirty years", "Jordan Bellfish", "tie", "fish", "human"):
        assert lore in text
    assert "—" not in text

    style = run(client, "get_gill_background", topic="style").result
    assert len(style["facts"]) == 1 and "tie" in style["facts"][0]


def test_gill_background_rejects_bad_input():
    spec = TOOLS["get_gill_background"]
    with pytest.raises(ValidationError):
        spec.args.model_validate({"topic": "bank_passwords"})
    with pytest.raises(ValidationError):
        spec.args.model_validate({"topic": "all", "user_id": 7})


def test_periods():
    on = date(2026, 1, 15)
    last_month = periods.resolve("last_month", on)
    assert (last_month.start, last_month.end, last_month.lookback_days) == (date(2025, 12, 1), date(2025, 12, 31), 46)
    assert last_month.label == "Dec 1 – Dec 31, 2025"
    assert periods.resolve("last_30_days", on).label == "Dec 17, 2025 – Jan 15, 2026"
    assert periods.month_key("next_month", date(2026, 12, 31)) == "2027-01"
    assert periods.month_key("last_month", date(2026, 3, 31)) == "2026-02"
