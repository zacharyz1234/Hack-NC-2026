"""The four kinds of private data Gill can ask to read, and the fixed text the consent card shows.

Card text lives here, not in the model's output, so what the student agrees to is always accurate.
"""
from dataclasses import dataclass

SUMMARY = "transactions.summary.read"
HISTORY = "transactions.history.read"
BALANCES = "balances.read"
BUDGET_GOALS = "budget_goals.read"

# Scopes over transactions are limited to a look-back window; balances and budgets aren't time-based.
WINDOWED = {SUMMARY, HISTORY}


@dataclass(frozen=True)
class ScopeInfo:
    title: str
    details: str
    noun: str  # finishes "Gill looked at ..."


SCOPES: dict[str, ScopeInfo] = {
    SUMMARY: ScopeInfo(
        title="Spending totals by category",
        details="Totals and counts per category, plus total income, for the period. "
        "No individual purchases or merchant names.",
        noun="your spending totals",
    ),
    HISTORY: ScopeInfo(
        title="Individual purchases",
        details="The date, description, category and amount of each purchase in the period, up to 25 at a time.",
        noun="your purchases",
    ),
    BALANCES: ScopeInfo(
        title="Account balances",
        details="The current balance of each linked account, by nickname and type. No account numbers.",
        noun="your account balances",
    ),
    BUDGET_GOALS: ScopeInfo(
        title="Budgets & savings goals",
        details="Your saved monthly category limits and your savings goals' progress.",
        noun="your budgets and goals",
    ),
}

SHARED_WITH = "Google Gemini (the AI behind Gill)"
CONSENT_FOOTER = (
    "Gill can only read this, never change it. You can turn access off anytime in Settings; "
    "that stops future reads but can't recall what was already sent."
)
CONSENT_OPTIONS = ["once", "chat", "always", "deny"]
