"""Gill Gates' tools: the complete list of things the model can ask the backend to do.

Each tool is one of:
- "data":    a read-only query (get_*); private student data is consent-gated;
- "input":   a card that asks the student for a value and pauses the turn (show_*);
- "display": a card the backend fills in (show_*). Some have a button the *student* can press to
             save through the normal app API; the model itself can never save anything.

There are no tools that write financial records, and this module refuses to load a tool whose
name doesn't start with get_ or show_. Arguments are validated (unknown fields rejected) before
anything runs, and every number shown on a card is computed here, not by the model.
"""
import math
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import cached_property
from typing import Annotated, Any, Literal

from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.assistant import data, lore, stock_facts
from app.assistant.periods import Period, add_months, month_key, month_label, months_between, resolve
from app.assistant.scopes import BALANCES, BUDGET_GOALS, HISTORY, SCOPES, SUMMARY
from app.db import readonly_conn
from app.services.twelve_data import MarketDataError
from app.services import peer_budgets


@dataclass
class ToolContext:
    """Who is asking. user_id always comes from the authenticated session, never from the model."""

    user_id: int | None
    session_id: str
    today: date

    @property
    def signed_in(self) -> bool:
        return self.user_id is not None

    @cached_property
    def categories(self) -> list[dict]:
        with readonly_conn() as conn:
            return data.visible_categories(conn, self.user_id)

    @property
    def built_in_names(self) -> list[str]:
        return [c["name"] for c in self.categories if not c["custom"]]

    def find_category(self, name: str) -> dict | None:
        wanted = name.strip().lower()
        matches = [c for c in self.categories if c["name"].lower() == wanted]
        return max(matches, key=lambda c: c["custom"]) if matches else None  # the student's own wins


class ToolError(Exception):
    """A problem the model can fix (bad date, unknown category). Sent back to it as the tool result."""

    def __init__(self, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.result = {"error": code, "message": message, **extra}


@dataclass
class Outcome:
    result: dict | None = None  # what the model gets back (input tools: filled in when the student submits)
    component: str | None = None  # card for the frontend
    props: dict | None = None
    reads: list[tuple[str, str]] = field(default_factory=list)  # (scope, "Gill looked at ..." label)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    kind: Literal["data", "input", "display"]
    description: str
    args: type[BaseModel]
    run: Callable[[ToolContext, Any], Outcome]
    scopes: Callable[[Any], list[str]] = lambda args: []
    period: Callable[[Any, date], Period | None] = lambda args, on: None
    submit: Callable[[dict, dict], dict] | None = None  # input tools: (props, student's value) -> model result

    def declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(
            name=self.name, description=self.description, parameters_json_schema=gemini_schema(self.args)
        )


# ---------- shared bits ----------


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


Name = Annotated[str, Field(min_length=1, max_length=40)]
Prompt = Annotated[str, Field(min_length=1, max_length=100, description="Short question shown on the card.")]
SummaryPeriod = Literal["this_month", "last_month", "last_30_days", "last_90_days"]


class Allocation(_Args):
    category: Name
    amount: float = Field(ge=0, le=100_000, description="Dollars per month.")


def _cents(dollars: float) -> int:
    return round(dollars * 100)


def _money(dollars: float) -> float:
    return _cents(dollars) / 100


def _number(value: Any, what: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{what} must be a number")
    return float(value)


def _parse_date(text: str, what: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ToolError("invalid_arguments", f"{what} must be a date like 2026-10-10") from None


def _read(scope: str, detail: str | None) -> tuple[str, str]:
    label = f"Gill looked at {SCOPES[scope].noun}"
    return scope, f"{label} ({detail})" if detail else label


def _category_options(ctx: ToolContext) -> list[dict]:
    return [{k: c[k] for k in ("id", "name", "icon", "color")} for c in ctx.categories]


# ---------- input cards ----------


class BudgetSliderArgs(_Args):
    prompt: Prompt
    suggested_amount: float | None = Field(None, ge=0, le=10_000, description="Starting value in dollars, if you have a sensible guess.")
    max_amount: float = Field(5000, ge=100, le=10_000, description="Slider maximum in dollars.")


SLIDER_STEP = 25


def _run_budget_slider(ctx: ToolContext, args: BudgetSliderArgs) -> Outcome:
    top = round(args.max_amount / SLIDER_STEP) * SLIDER_STEP
    start = args.suggested_amount if args.suggested_amount is not None else min(500, top)
    start = min(max(round(start / SLIDER_STEP) * SLIDER_STEP, 0), top)
    props = {"label": args.prompt, "currency": "USD", "min": 0, "max": top, "step": SLIDER_STEP, "default": start}
    return Outcome(component="budget_slider", props=props)


def _submit_budget_slider(props: dict, value: dict) -> dict:
    amount = _number(value.get("amount"), "amount")
    if not props["min"] <= amount <= props["max"]:
        raise ValueError(f"amount must be between {props['min']} and {props['max']}")
    amount = round(amount / props["step"]) * props["step"]
    return {"status": "submitted", "monthly_spending_target": float(amount)}


class CategoryPickerArgs(_Args):
    prompt: Prompt
    preselected: list[Name] = Field(default_factory=list, max_length=15, description="Category names to pre-check.")
    max_choices: int = Field(6, ge=1, le=15)


def _run_category_picker(ctx: ToolContext, args: CategoryPickerArgs) -> Outcome:
    preselected = [c["id"] for name in args.preselected if (c := ctx.find_category(name))]
    props = {
        "label": args.prompt,
        "options": _category_options(ctx),
        "preselected_ids": list(dict.fromkeys(preselected))[: args.max_choices],
        "max_choices": args.max_choices,
    }
    return Outcome(component="category_picker", props=props)


def _submit_category_picker(props: dict, value: dict) -> dict:
    ids = value.get("category_ids")
    if not isinstance(ids, list) or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
        raise ValueError("category_ids must be a list of category ids")
    if not 1 <= len(set(ids)) == len(ids) <= props["max_choices"]:
        raise ValueError(f"Pick between 1 and {props['max_choices']} different categories")
    names = {option["id"]: option["name"] for option in props["options"]}
    if any(i not in names for i in ids):
        raise ValueError("Unknown category id")
    return {"status": "submitted", "selected_categories": [names[i] for i in ids]}


class AmountField(_Args):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,23}$", description="snake_case id, e.g. 'rent'.")
    label: Name


class AmountFormArgs(_Args):
    prompt: Prompt
    period: Literal["monthly", "weekly", "one_time"] = "monthly"
    fields: list[AmountField] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def _unique_keys(self) -> "AmountFormArgs":
        if len({f.key for f in self.fields}) != len(self.fields):
            raise ValueError("field keys must be unique")
        return self


def _run_amount_form(ctx: ToolContext, args: AmountFormArgs) -> Outcome:
    props = {
        "label": args.prompt,
        "period": args.period,
        "currency": "USD",
        "fields": [{"key": f.key, "label": f.label} for f in args.fields],
    }
    return Outcome(component="amount_form", props=props)


def _submit_amount_form(props: dict, value: dict) -> dict:
    values = value.get("values")
    if not isinstance(values, dict) or not values:
        raise ValueError("values must include at least one amount")
    unknown = set(values) - {f["key"] for f in props["fields"]}
    if unknown:
        raise ValueError(f"Unknown fields: {', '.join(sorted(unknown))}")
    cleaned = {}
    for key, amount in values.items():
        amount = _number(amount, key)
        if not 0 <= amount <= 100_000:
            raise ValueError(f"{key} must be between 0 and 100000")
        cleaned[key] = _money(amount)
    return {"status": "submitted", "period": props["period"], "values": cleaned, "source": "student_estimates"}


# ---------- display cards ----------


class BudgetPlanArgs(_Args):
    month: Literal["this_month", "next_month"] = "this_month"
    total: float | None = Field(None, ge=0, le=100_000, description="The student's total monthly target, if they gave one.")
    allocations: list[Allocation] = Field(min_length=1, max_length=15)
    note: str = Field("", max_length=140, description="One short line shown on the card.")


def _resolve_allocations(ctx: ToolContext, allocations: list[Allocation]) -> list[dict]:
    rows, unknown, seen = [], [], set()
    for allocation in allocations:
        category = ctx.find_category(allocation.category)
        if category is None:
            unknown.append(allocation.category)
        elif category["id"] in seen:
            raise ToolError("duplicate_category", f"{category['name']} appears more than once.")
        else:
            seen.add(category["id"])
            rows.append({"category_id": category["id"], "category": category["name"], "amount": _money(allocation.amount)})
    if unknown:
        raise ToolError(
            "unknown_category", "Use the app's category names.", unknown=unknown, valid_categories=ctx.built_in_names
        )
    return rows


def _run_budget_plan(ctx: ToolContext, args: BudgetPlanArgs) -> Outcome:
    rows = _resolve_allocations(ctx, args.allocations)
    month = month_key(args.month, ctx.today)
    allocated_c = sum(_cents(row["amount"]) for row in rows)
    total_c = _cents(args.total) if args.total is not None else None
    numbers = {
        "month": month,
        "total": total_c / 100 if total_c is not None else None,
        "allocated": allocated_c / 100,
        "unallocated": (total_c - allocated_c) / 100 if total_c is not None else None,
        "over_allocated": total_c is not None and allocated_c > total_c,
    }
    message = (
        "Shown as an editable card. Only the student can save it, with the card's Save button."
        if ctx.signed_in
        else "Shown as a card. The student is a guest, so they'd need to log in to save it."
    )
    props = {**numbers, "month_label": month_label(month), "currency": "USD", "rows": rows, "note": args.note, "can_save": ctx.signed_in}
    return Outcome(
        result={"status": "displayed", **numbers, "can_save": ctx.signed_in, "message": message},
        component="budget_plan",
        props=props,
    )


class SavingsCalculatorArgs(_Args):
    goal_name: Name
    target_amount: float = Field(gt=0, le=1_000_000)
    already_saved: float = Field(0, ge=0, le=1_000_000)
    monthly_contribution: float | None = Field(None, ge=1, le=100_000, description="Dollars saved per month, if known.")
    target_date: str | None = Field(None, description="Goal date as YYYY-MM-DD, in the future.")


def _run_savings_calculator(ctx: ToolContext, args: SavingsCalculatorArgs) -> Outcome:
    target_date = None
    if args.target_date:
        target_date = _parse_date(args.target_date, "target_date")
        if not ctx.today < target_date <= ctx.today + timedelta(days=3660):
            raise ToolError("invalid_arguments", "target_date must be in the future (within 10 years).")
    remaining_c = max(_cents(args.target_amount) - _cents(args.already_saved), 0)
    months_needed = projected = months_until = required = None
    if args.monthly_contribution:
        months_needed = -(-remaining_c // _cents(args.monthly_contribution))  # ceiling division
        projected = add_months(ctx.today, months_needed)
    if target_date:
        months_until = months_between(ctx.today, target_date)
        required = -(-remaining_c // months_until) / 100
    numbers = {
        "goal_name": args.goal_name,
        "currency": "USD",
        "target": _money(args.target_amount),
        "already_saved": _money(args.already_saved),
        "remaining": remaining_c / 100,
        "monthly_contribution": _money(args.monthly_contribution) if args.monthly_contribution else None,
        "months_needed": months_needed,
        "projected_completion": projected,
        "target_date": target_date.isoformat() if target_date else None,
        "months_until_target_date": months_until,
        "required_monthly_for_target_date": required,
        "can_save": ctx.signed_in,
    }
    return Outcome(
        result={**numbers, "status": "displayed", "message": "Quote these numbers. Creating the goal is the student's choice, with the card's button."},
        component="savings_calculator",
        props=numbers,
    )


class ExpenseDraftArgs(_Args):
    amount: float | None = Field(None, gt=0, le=10_000, description="Dollars, if the student said. Leave out if unknown.")
    description: str = Field("", max_length=60, description="What they bought, e.g. 'Coffee at Cosmic Cantina'.")
    category: Name | None = Field(None, description="An app category name, if one fits.")
    spent_on: str | None = Field(None, description="YYYY-MM-DD. Defaults to today; can't be in the future.")


def _run_expense_draft(ctx: ToolContext, args: ExpenseDraftArgs) -> Outcome:
    spent_on = _parse_date(args.spent_on, "spent_on") if args.spent_on else ctx.today
    if not ctx.today - timedelta(days=365) <= spent_on <= ctx.today:
        raise ToolError("invalid_arguments", "spent_on must be within the last year and not in the future.")
    category = ctx.find_category(args.category) if args.category else None
    props = {
        "amount": _money(args.amount) if args.amount is not None else None,
        "description": data.clean_text(args.description, 60),
        "category_id": category["id"] if category else None,
        "category": category["name"] if category else None,
        "date": spent_on.isoformat(),
        "category_options": _category_options(ctx),
        "can_save": ctx.signed_in,
    }
    result = {
        "status": "displayed",
        "resolved_category": props["category"],
        "date": props["date"],
        "can_save": ctx.signed_in,
        "message": "Only the student can add it, with the card's Add purchase button. They can fill in or "
        "change anything first."
        + ("" if ctx.signed_in else " As a guest, it goes into their demo ledger, not a real account."),
    }
    return Outcome(result=result, component="expense_draft", props=props)


class Scenario(_Args):
    name: str = Field(min_length=1, max_length=30)
    allocations: list[Allocation] = Field(min_length=1, max_length=15)


class ScenarioComparisonArgs(_Args):
    scenarios: list[Scenario] = Field(min_length=2, max_length=3)
    monthly_income: float | None = Field(None, ge=0, le=100_000)


def _run_scenario_comparison(ctx: ToolContext, args: ScenarioComparisonArgs) -> Outcome:
    labels: dict[str, str] = {}
    buckets: list[dict[str, int]] = []
    for scenario in args.scenarios:
        bucket: dict[str, int] = {}
        for allocation in scenario.allocations:
            key = allocation.category.strip().lower()
            labels.setdefault(key, allocation.category.strip())
            bucket[key] = bucket.get(key, 0) + _cents(allocation.amount)
        buckets.append(bucket)
    income_c = _cents(args.monthly_income) if args.monthly_income is not None else None
    totals = [sum(bucket.values()) for bucket in buckets]
    numbers = {
        "monthly_income": income_c / 100 if income_c is not None else None,
        "scenarios": [
            {"name": s.name, "total": t / 100, "leftover": (income_c - t) / 100 if income_c is not None else None}
            for s, t in zip(args.scenarios, totals)
        ],
        "rows": [
            {
                "category": label,
                "amounts": [b.get(key, 0) / 100 for b in buckets],
                "diff_vs_first": [(b.get(key, 0) - buckets[0].get(key, 0)) / 100 for b in buckets],
            }
            for key, label in labels.items()
        ],
    }
    return Outcome(
        result={"status": "displayed", **numbers}, component="scenario_comparison", props={"currency": "USD", **numbers}
    )


class ChartValue(_Args):
    label: str = Field(min_length=1, max_length=30)
    amount: float = Field(ge=0, le=1_000_000)


class SpendingChartArgs(_Args):
    chart: Literal["spending_by_category", "budget_vs_actual", "manual_breakdown"]
    period: SummaryPeriod = Field("last_30_days", description="Window for spending_by_category.")
    month: Literal["this_month", "last_month"] = Field("this_month", description="Month for budget_vs_actual.")
    title: str = Field("", max_length=60)
    values: list[ChartValue] = Field(default_factory=list, max_length=12, description="manual_breakdown only: numbers the student gave you.")


def _chart_scopes(args: SpendingChartArgs) -> list[str]:
    return {"spending_by_category": [SUMMARY], "budget_vs_actual": [BUDGET_GOALS, SUMMARY]}.get(args.chart, [])


def _chart_period(args: SpendingChartArgs, on: date) -> Period | None:
    if args.chart == "spending_by_category":
        return resolve(args.period, on)
    if args.chart == "budget_vs_actual":
        return resolve(args.month, on)
    return None


def _run_spending_chart(ctx: ToolContext, args: SpendingChartArgs) -> Outcome:
    period = _chart_period(args, ctx.today)
    if args.chart == "spending_by_category":
        summary = data.spending_summary(ctx.user_id, period)
        series = [{"label": c["category"], "value": c["total"]} for c in summary["by_category"]]
        title = args.title or "Spending by category"
        reads = [_read(SUMMARY, period.phrase)]
    elif args.chart == "budget_vs_actual":
        progress = data.budget_progress(ctx.user_id, period, ctx.today)
        series = [{"label": c["category"], "value": c["spent"], "limit": c["limit"]} for c in progress["categories"]]
        title = args.title or f"Budget vs. spending, {progress['month_label']}"
        reads = [_read(BUDGET_GOALS, progress["month_label"]), _read(SUMMARY, period.phrase)]
    else:
        if not args.values:
            raise ToolError("invalid_arguments", "manual_breakdown needs at least one value.")
        series = [{"label": v.label, "value": _money(v.amount)} for v in args.values]
        title = args.title or "Breakdown"
        reads = []
    if not series:
        return Outcome(result={"status": "no_data", "message": "There's nothing to chart for that period."}, reads=reads)
    props = {"chart": args.chart, "title": title, "currency": "USD", "period_label": period.label if period else None, "series": series}
    return Outcome(result={"status": "displayed", **props}, component="spending_chart", props=props, reads=reads)


# ---------- protected reads ----------


class SpendingSummaryArgs(_Args):
    period: SummaryPeriod = "last_30_days"


def _run_spending_summary(ctx: ToolContext, args: SpendingSummaryArgs) -> Outcome:
    period = resolve(args.period, ctx.today)
    return Outcome(result=data.spending_summary(ctx.user_id, period), reads=[_read(SUMMARY, period.phrase)])


class TransactionHistoryArgs(_Args):
    period: Literal["last_7_days", "last_30_days", "this_month", "last_month"] = "last_30_days"
    category: Name | None = None
    search: str | None = Field(None, min_length=1, max_length=30, description="Text to look for in descriptions, like a merchant name.")
    limit: int = Field(15, ge=1, le=25)


def _run_transaction_history(ctx: ToolContext, args: TransactionHistoryArgs) -> Outcome:
    period = resolve(args.period, ctx.today)
    result = data.transaction_history(ctx.user_id, period, args.category, args.search, args.limit)
    return Outcome(result=result, reads=[_read(HISTORY, period.phrase)])


class NoArgs(_Args):
    pass


def _run_account_balances(ctx: ToolContext, args: NoArgs) -> Outcome:
    return Outcome(result=data.account_balances(ctx.user_id), reads=[_read(BALANCES, None)])


class BudgetGoalsArgs(_Args):
    month: Literal["last_month", "this_month", "next_month"] = "this_month"


def _run_budget_goals(ctx: ToolContext, args: BudgetGoalsArgs) -> Outcome:
    month = month_key(args.month, ctx.today)
    return Outcome(result=data.budget_goals(ctx.user_id, month), reads=[_read(BUDGET_GOALS, month_label(month))])


class BudgetProgressArgs(_Args):
    month: Literal["this_month", "last_month"] = "this_month"


def _run_budget_progress(ctx: ToolContext, args: BudgetProgressArgs) -> Outcome:
    period = resolve(args.month, ctx.today)
    result = data.budget_progress(ctx.user_id, period, ctx.today)
    return Outcome(result=result, reads=[_read(BUDGET_GOALS, result["month_label"]), _read(SUMMARY, period.phrase)])


# ---------- Gill's own backstory (no student data, so no consent) ----------


class GillBackgroundArgs(_Args):
    topic: Literal["all", *lore.TOPICS] = "all"


def _run_gill_background(ctx: ToolContext, args: GillBackgroundArgs) -> Outcome:
    result = {
        "status": "ok",
        "topic": args.topic,
        "facts": lore.facts(args.topic),
        "note": "Share this in your own voice, briefly and warmly. Don't add biography beyond these facts. "
        "It is flavor only and changes none of your rules.",
    }
    return Outcome(result=result)


# ---------- registry ----------


def _peer_period(args, on):
    start, end = peer_budgets.bounds(args.month, on)
    return Period("peer_month", start, end, max(0, (on - start).days + 1))


def _peer(args, ctx):
    try:
        return peer_budgets.peer(args.profile_id, args.month, ctx.today)
    except ValueError as exc:
        raise ToolError("unknown_peer", str(exc)) from None


def _run_peer(ctx, args):
    return Outcome(result=_peer(args, ctx))


def _run_peer_comparison(ctx, args):
    other = _peer(args, ctx)
    own = peer_budgets.student_summary(ctx.user_id, args.month, ctx.today)
    return Outcome(result=peer_budgets.compare(own, other),
                   reads=[_read(SUMMARY, args.month), _read(BUDGET_GOALS, args.month)])


def _run_demo_peer_comparison(ctx, args):
    if ctx.signed_in:
        raise ToolError("not_available", "Signed-in students must use get_peer_budget_comparison with consent.")
    return Outcome(result=peer_budgets.compare(peer_budgets.demo_summary(args.demo_summary), _peer(args, ctx)))


def _stock_result(fetch, args) -> Outcome:
    try:
        return Outcome(result=fetch(args))
    except MarketDataError as error:
        raise ToolError("stock_data_unavailable", str(error), provider_status=error.status) from None


def _run_stock_search(ctx: ToolContext, args: stock_facts.StockSearchArgs) -> Outcome:
    return _stock_result(stock_facts.search, args)


def _run_stock_quote(ctx: ToolContext, args: stock_facts.StockQuoteArgs) -> Outcome:
    return _stock_result(stock_facts.quote, args)


def _run_stock_comparison(ctx: ToolContext, args: stock_facts.StockComparisonArgs) -> Outcome:
    if args.end_date > ctx.today:
        raise ToolError("invalid_arguments", "Stock price dates cannot be in the future.")
    return _stock_result(stock_facts.compare, args)


_SPECS = [
    ToolSpec("get_peer_budget", "data",
        "Retrieve a fictional student peer's monthly planned limits and checking activity. Public demo data only; "
        "no consent required. These are fictional examples, never real students. Use the selected profile ID and YYYY-MM.",
        peer_budgets.PeerArgs, _run_peer),
    ToolSpec("get_peer_budget_comparison", "data",
        "Compare a fictional peer to the signed-in student's saved budget and checking activity for YYYY-MM. "
        "The app requests both spending-summary and budget/goals permissions before reading. Server computes all "
        "differences and totals. Explain income/housing context; lower spending does not establish a better budget. "
        "No writes. Optional changes must go through show_budget_plan and the student's review/Save button.",
        peer_budgets.PeerArgs, _run_peer_comparison,
        scopes=lambda args: [SUMMARY, BUDGET_GOALS], period=_peer_period),
    ToolSpec("get_demo_peer_budget_comparison", "data",
        "Guests only: compare a fictional peer with the labeled Local demo ledger summary explicitly supplied "
        "by the Ask Gill button. Never invent or fetch guest figures. Server computes differences. No private "
        "data or consent needed. Preserve fictional/demo labels; explain context and optional tradeoffs, never save.",
        peer_budgets.DemoCompareArgs, _run_demo_peer_comparison),
    ToolSpec(
        "get_stock_search", "data",
        "Resolve a company name or ticker to US stocks and ETFs using Twelve Data. Public information, "
        "no student-data consent needed. Ask which listing if results are ambiguous. Facts only, never investment advice.",
        stock_facts.StockSearchArgs, _run_stock_search,
    ),
    ToolSpec(
        "get_stock_quote", "data",
        "Get a verified US ticker's latest available USD price, dollar/percentage change from previous close, "
        "market-open status and quote timestamp from Twelve Data. Public data; no consent needed. "
        "Cached hourly, so disclose the quote time. Never recommend buying, selling or holding.",
        stock_facts.StockQuoteArgs, _run_stock_quote,
    ),
    ToolSpec(
        "get_stock_price_comparison", "data",
        "Compare a US stock's daily closing prices on two explicit dates, up to ten years apart. "
        "Returns both requested and actual session dates, dollar change, percentage change and direction. "
        "Non-trading dates use the preceding available session within seven days; disclose substitutions. "
        "Ask for missing years before calling. Public data; no consent needed. Facts only, never investment advice.",
        stock_facts.StockComparisonArgs, _run_stock_comparison,
    ),
    ToolSpec(
        "show_budget_slider", "input",
        "Show a slider so the student can pick their total spending target for the month. "
        "Pauses until they answer.",
        BudgetSliderArgs, _run_budget_slider, submit=_submit_budget_slider,
    ),
    ToolSpec(
        "show_category_picker", "input",
        "Show the app's spending categories as checkboxes so the student can choose which ones matter to them. "
        "Pauses until they answer.",
        CategoryPickerArgs, _run_category_picker, submit=_submit_category_picker,
    ),
    ToolSpec(
        "show_amount_form", "input",
        "Show a small form where the student types dollar amounts you need (rent, food, income...). Use it when "
        "they haven't given numbers, especially after they decline data access. Pauses until they answer.",
        AmountFormArgs, _run_amount_form, submit=_submit_amount_form,
    ),
    ToolSpec(
        "show_budget_plan", "display",
        "Show a proposed monthly budget (a dollar limit per category) as an editable card with a Save button the "
        "STUDENT can press. You cannot save it yourself. Use the app's category names.",
        BudgetPlanArgs, _run_budget_plan,
    ),
    ToolSpec(
        "show_savings_calculator", "display",
        "Show a savings-goal calculator. The server works out the months needed and/or the monthly amount required; "
        "quote its numbers. The card has a Create goal button the student can press.",
        SavingsCalculatorArgs, _run_savings_calculator,
    ),
    ToolSpec(
        "show_expense_draft", "display",
        "Quick add: show a small purchase form, pre-filled with whatever the student told you, that they can "
        "add to their ledger with one tap. Use it whenever they mention something they just bought or want to "
        "log a purchase (e.g. 'I just spent $12 on lunch'), even if you don't know the amount yet. "
        "You cannot add it yourself.",
        ExpenseDraftArgs, _run_expense_draft,
    ),
    ToolSpec(
        "show_scenario_comparison", "display",
        "Show 2-3 hypothetical monthly budgets side by side. The server computes totals, money left over and "
        "differences from the numbers you pass in.",
        ScenarioComparisonArgs, _run_scenario_comparison,
    ),
    ToolSpec(
        "show_spending_chart", "display",
        "Show a chart. 'spending_by_category' and 'budget_vs_actual' use the student's data and need the same "
        "permission as get_spending_summary / get_budget_progress (the app asks them). 'manual_breakdown' charts "
        "numbers the student gave you.",
        SpendingChartArgs, _run_spending_chart, scopes=_chart_scopes, period=_chart_period,
    ),
    ToolSpec(
        "get_spending_summary", "data",
        "Read the student's total income, total spending and spending per category for a period. Needs their "
        "permission, which the app asks for. Prefer this over get_transaction_history.",
        SpendingSummaryArgs, _run_spending_summary,
        scopes=lambda args: [SUMMARY], period=lambda args, on: resolve(args.period, on),
    ),
    ToolSpec(
        "get_transaction_history", "data",
        "Read individual purchases (date, description, category, amount) from up to the last month. Needs its own "
        "permission. Only use it when the student asks about specific purchases or merchants.",
        TransactionHistoryArgs, _run_transaction_history,
        scopes=lambda args: [HISTORY], period=lambda args, on: resolve(args.period, on),
    ),
    ToolSpec(
        "get_account_balances", "data",
        "Read the student's current account balances. Needs permission. Only use it when the answer really "
        "depends on balances, like how much they can safely set aside.",
        NoArgs, _run_account_balances, scopes=lambda args: [BALANCES],
    ),
    ToolSpec(
        "get_budget_goals", "data",
        "Read the student's saved monthly budget limits and savings goals. Needs permission.",
        BudgetGoalsArgs, _run_budget_goals, scopes=lambda args: [BUDGET_GOALS],
    ),
    ToolSpec(
        "get_budget_progress", "data",
        "Read budget limits vs. actual spending per category for a month, computed by the server. Use it for "
        "'am I on track?'. Needs permission for both budgets and spending totals.",
        BudgetProgressArgs, _run_budget_progress,
        scopes=lambda args: [BUDGET_GOALS, SUMMARY], period=lambda args, on: resolve(args.month, on),
    ),
    ToolSpec(
        "get_gill_background", "data",
        "Look up Gill's own backstory (his career, marriage to the job, best friend, wardrobe, past clients). "
        "Call it when the student asks about Gill's personal life, history, friends or work experience. "
        "Reads none of the student's data and needs no permission. Not for financial questions.",
        GillBackgroundArgs, _run_gill_background,
    ),
]

TOOLS: dict[str, ToolSpec] = {spec.name: spec for spec in _SPECS}

for _spec in _SPECS:
    # Read-only by construction: the model can only look things up (get_*) or show cards (show_*).
    if not re.fullmatch(r"(get|show)_[a-z_]+", _spec.name) or (_spec.kind == "data") != _spec.name.startswith("get_"):
        raise RuntimeError(f"Tool {_spec.name!r} breaks the get_/show_ rule")


def declarations() -> list[types.FunctionDeclaration]:
    return [spec.declaration() for spec in _SPECS]


# ---------- JSON schema for Gemini ----------

_SCHEMA_KEYS = {
    "type", "description", "properties", "required", "items", "enum",
    "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength",
}


def gemini_schema(model: type[BaseModel]) -> dict | None:
    """The pydantic model's JSON schema, flattened to the plain subset Gemini handles well.

    $refs are inlined, Optional[X] becomes X (the field just isn't required), and keywords the server
    checks anyway (pattern, additionalProperties, ...) are dropped. Defaults move into the description.
    """
    raw = model.model_json_schema()
    defs = raw.get("$defs", {})

    def clean(node: dict) -> dict:
        if "$ref" in node:
            node = {**defs[node["$ref"].rsplit("/", 1)[-1]], **{k: v for k, v in node.items() if k != "$ref"}}
        if "anyOf" in node:
            options = [o for o in node["anyOf"] if o.get("type") != "null"]
            node = {**options[0], **{k: v for k, v in node.items() if k != "anyOf"}}
        out: dict = {}
        for key, value in node.items():
            if key == "const":
                out["enum"] = [value]
            elif key == "exclusiveMinimum":
                out.setdefault("minimum", value)
            elif key == "properties":
                out[key] = {name: clean(prop) for name, prop in value.items()}
            elif key == "items":
                out[key] = clean(value)
            elif key in _SCHEMA_KEYS:
                out[key] = value
        default = node.get("default")
        if default not in (None, [], ""):
            out["description"] = f"{out.get('description', '')} Default: {default}.".strip()
        return out

    schema = clean(raw)
    return schema if schema.get("properties") else None
