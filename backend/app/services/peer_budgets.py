"""Read-only fictional peers, checking summaries and server-computed comparisons.

Sample activity is deterministic and dated. Only the explicit setup command writes
peer snapshots; none of this module writes to Nessie or to a student's records.
"""
import calendar
import json
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db import readonly_conn

Housing = Literal["family_home", "campus_housing", "shared_rental", "living_alone"]
HOUSING = {"family_home": "Family home", "campus_housing": "Campus housing",
           "shared_rental": "Shared rental", "living_alone": "Living alone"}
CATEGORIES = ["Auto", "Groceries", "Rent/Home", "Education", "Insurance",
              "Subscriptions", "Bills", "Shopping", "Travel", "Eating out", "Debt payments"]


class Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MonthArgs(Args):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @field_validator("month")
    @classmethod
    def valid_month(cls, value):
        date.fromisoformat(value + "-01")
        return value


class MatchArgs(MonthArgs):
    monthly_income_cents: int = Field(ge=0, le=100_000_000)
    housing: Housing


class PeerArgs(MonthArgs):
    profile_id: str = Field(min_length=1, max_length=60)


class Category(Args):
    category: str = Field(min_length=1, max_length=80)
    budget_cents: int | None = Field(None, ge=0, le=100_000_000)
    spending_cents: int = Field(ge=0, le=100_000_000)


class DemoSummary(Args):
    source: Literal["Local demo ledger"]
    income_cents: int = Field(ge=0, le=100_000_000)
    categories: list[Category] = Field(max_length=60)

    @model_validator(mode="after")
    def unique_categories(self):
        if len({r.category for r in self.categories}) != len(self.categories):
            raise ValueError("Category names must be unique")
        return self


class DemoCompareArgs(PeerArgs):
    demo_summary: DemoSummary


def bounds(month: str, on: date):
    start = date.fromisoformat(month + "-01")
    end = start.replace(day=calendar.monthrange(start.year, start.month)[1])
    return start, min(end, on)


def scenarios():
    profiles = []
    for housing_index, housing in enumerate(HOUSING):
        for income in (1000, 2000, 3000):
            # Each scenario has its own fixed costs and discretionary limits.
            rent = (100, 450, 650, 900)[housing_index] + (income - 1000) // 10
            limits = dict(zip(CATEGORIES, [70, 160 + income // 20, rent, 80,
                30, 25, (25, 35, 80, 120)[housing_index], income // 15,
                25, income // 12, 40]))
            profiles.append({"id": f"peer-{housing}-{income}",
                "name": f"Fictional student · {HOUSING[housing]} · ${income:,}/month",
                "housing": housing, "monthly_income_cents": income * 100,
                "budgets": {k: v * 100 for k, v in limits.items()}})
    return profiles


PROFILES = {p["id"]: p for p in scenarios()}


def sample_activity(profile: dict, month: str):
    activity = [{"date": month + "-01", "income_cents": profile["monthly_income_cents"]}]
    for i, (category, limit) in enumerate(profile["budgets"].items()):
        actual = limit * (78 + (i * 7 + profile["monthly_income_cents"] // 1000) % 35) // 100
        # Rent and bills are paid early; other purchases occur across the month.
        days = [2] if category in ("Rent/Home", "Bills", "Insurance") else [4, 12, 22]
        for j, day in enumerate(days):
            amount = actual // len(days) + (actual % len(days) if j == 0 else 0)
            activity.append({"date": f"{month}-{day:02d}", "category": category, "spending_cents": amount})
    return activity


def summary(budgets: dict, spending: dict, income: int, source: str):
    rows = [{"category": name, "budget_cents": budgets.get(name) or None,
             "spending_cents": spending.get(name, 0)} for name in sorted(budgets.keys() | spending.keys())]
    spent = sum(spending.values())
    return {"source": source, "currency": "USD", "money_unit": "cents", "categories": rows, "income_cents": income,
            "budget_cents": sum(budgets.values()) if any(budgets.values()) else None,
            "spending_cents": spent, "net_cash_flow_cents": income - spent,
            "spending_percent_of_income": round(spent / income * 100, 2) if income else None}


def peer(profile_id: str, month: str, on: date):
    profile = PROFILES.get(profile_id)
    if profile is None:
        raise ValueError("Unknown fictional profile")
    with readonly_conn() as conn:
        row = conn.execute("SELECT s.budgets_json, s.activity_json, s.updated_at FROM demo_peer_snapshots s"
                           " JOIN demo_peer_profiles p ON p.id=s.profile_id WHERE s.profile_id=? AND s.month=?"
                           " AND NOT EXISTS (SELECT 1 FROM users u WHERE u.nessie_customer_id=p.nessie_customer_id)"
                           " AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.nessie_id=p.nessie_account_id)",
                           (profile_id, month)).fetchone()
    # No remote requests or writes on read paths. A missing snapshot is a labeled sample.
    try:
        budgets = json.loads(row["budgets_json"]) if row else profile["budgets"]
        activity = json.loads(row["activity_json"]) if row else sample_activity(profile, month)
        if not isinstance(budgets, dict) or not isinstance(activity, list) or not activity:
            raise ValueError("Unusable snapshot")
        for name, value in budgets.items():
            if not isinstance(name, str) or type(value) is not int or value < 0:
                raise ValueError("Invalid limits")
        for item in activity:
            date.fromisoformat(item["date"])
            for key in ("spending_cents", "income_cents"):
                if key in item and (type(item[key]) is not int or item[key] < 0):
                    raise ValueError("Invalid activity")
    except (ValueError, TypeError, KeyError):
        row = None
        budgets, activity = profile["budgets"], sample_activity(profile, month)
    start, end = bounds(month, on)
    spending, income = {}, 0
    for item in activity:
        if start.isoformat() <= item["date"] <= end.isoformat():
            income += item.get("income_cents", 0)
            if "spending_cents" in item:
                name = item.get("category") or "Uncategorized"
                spending[name] = spending.get(name, 0) + item["spending_cents"]
    return {"id": profile_id, "name": profile["name"], "fictional": True,
            "housing": profile["housing"], "housing_label": HOUSING[profile["housing"]],
            "monthly_income_cents": profile["monthly_income_cents"], "month": month,
            "period_label": "Month-to-date" if month == on.strftime("%Y-%m") else "Selected month",
            "as_of": end.isoformat(), "updated_at": row["updated_at"] if row else None,
            **summary(budgets, spending, income, "Fictional Nessie sandbox data" if row else "Fictional sample data")}


def matches(args: MatchArgs, on: date):
    profiles = sorted((p for p in PROFILES.values() if p["housing"] == args.housing),
                      key=lambda p: (abs(p["monthly_income_cents"] - args.monthly_income_cents), p["id"]))[:3]
    results = []
    for p in profiles:
        result = peer(p["id"], args.month, on)
        difference = p["monthly_income_cents"] - args.monthly_income_cents
        result["match_explanation"] = (f"Same housing: {HOUSING[args.housing]}. "
            f"Monthly income is ${abs(difference) / 100:,.2f} {'higher' if difference > 0 else 'lower'} than your entry."
            if difference else f"Same housing: {HOUSING[args.housing]}. Same monthly income as your entry.")
        results.append(result)
    return {"month": args.month, "profiles": results}


def student_summary(user_id: int, month: str, on: date):
    start, end = bounds(month, on)
    with readonly_conn() as conn:
        # Match monthlyAnalysis: checking only, including all the student's checking accounts.
        spending = {r["category"]: r["amount"] for r in conn.execute(
            "SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(e.amount_cents) AS amount"
            " FROM expenses e JOIN accounts a ON a.id=e.account_id AND a.user_id=e.user_id"
            " LEFT JOIN categories c ON c.id=e.category_id WHERE e.user_id=? AND LOWER(a.type)='checking'"
            " AND e.spent_on BETWEEN ? AND ? GROUP BY COALESCE(c.name, 'Uncategorized')",
            (user_id, start.isoformat(), end.isoformat()))}
        income = conn.execute("SELECT COALESCE(SUM(i.amount_cents),0) FROM income i"
            " JOIN accounts a ON a.id=i.account_id AND a.user_id=i.user_id"
            " WHERE i.user_id=? AND LOWER(a.type)='checking' AND i.received_on BETWEEN ? AND ?",
            (user_id, start.isoformat(), end.isoformat())).fetchone()[0]
        budgets = {}
        for r in conn.execute("SELECT c.name, b.limit_cents FROM budgets b JOIN categories c ON c.id=b.category_id"
                              " WHERE b.user_id=? AND b.month=?", (user_id, month)):
            budgets[r["name"]] = budgets.get(r["name"], 0) + r["limit_cents"]
    return summary(budgets, spending, income, "Your recorded checking activity and saved budget")


def demo_summary(args: DemoSummary):
    return summary({r.category: r.budget_cents or 0 for r in args.categories},
                   {r.category: r.spending_cents for r in args.categories}, args.income_cents, args.source)


def compare(own: dict, other: dict):
    your_rows = {r["category"]: r for r in own["categories"]}
    their_rows = {r["category"]: r for r in other["categories"]}
    rows = []
    for name in sorted(your_rows.keys() | their_rows.keys()):
        yours, theirs = your_rows.get(name, {}), their_rows.get(name, {})
        rows.append({"category": name, "your_budget_cents": yours.get("budget_cents"),
                     "your_spending_cents": yours.get("spending_cents", 0),
                     "their_budget_cents": theirs.get("budget_cents"),
                     "their_spending_cents": theirs.get("spending_cents", 0),
                     "spending_difference_cents": yours.get("spending_cents", 0) - theirs.get("spending_cents", 0)})
    return {"month": other["month"], "peer": other, "you": own, "categories": rows,
            "largest_differences": sorted(rows, key=lambda r: (-abs(r["spending_difference_cents"]), r["category"]))[:3],
            "difference_convention": "Your spending minus their spending; positive means you spent more.",
            "note": "Fictional profiles are examples, not real students. Lower spending alone does not mean a better budget. "
                    "Income, housing, obligations and individual needs matter. Budget changes require review and saving by the student."}
