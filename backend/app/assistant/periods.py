"""Named time windows. Gill's tools take these names, never raw dates, so every read is bounded."""
from dataclasses import dataclass
from datetime import date, timedelta

PHRASES = {
    "last_7_days": "last 7 days",
    "last_30_days": "last 30 days",
    "last_90_days": "last 90 days",
    "this_month": "this month",
    "last_month": "last month",
}


def today() -> date:
    return date.today()


@dataclass(frozen=True)
class Period:
    name: str
    start: date
    end: date
    lookback_days: int  # how far back from today the window reaches; consent grants are checked against it

    @property
    def label(self) -> str:
        return range_label(self.start, self.end)

    @property
    def phrase(self) -> str:
        return PHRASES[self.name]

    def as_json(self) -> dict:
        return {"name": self.name, "start": self.start.isoformat(), "end": self.end.isoformat(), "label": self.label}


def resolve(name: str, on: date) -> Period:
    if name == "last_7_days":
        start, end = on - timedelta(days=6), on
    elif name == "last_30_days":
        start, end = on - timedelta(days=29), on
    elif name == "last_90_days":
        start, end = on - timedelta(days=89), on
    elif name == "this_month":
        start, end = on.replace(day=1), on
    elif name == "last_month":
        end = on.replace(day=1) - timedelta(days=1)
        start = end.replace(day=1)
    else:
        raise ValueError(f"Unknown period {name!r}")
    return Period(name, start, end, (on - start).days + 1)


def month_key(name: str, on: date) -> str:
    """'last_month' / 'this_month' / 'next_month' -> 'YYYY-MM'."""
    first = on.replace(day=1)
    if name == "last_month":
        first = (first - timedelta(days=1)).replace(day=1)
    elif name == "next_month":
        first = (first + timedelta(days=32)).replace(day=1)
    elif name != "this_month":
        raise ValueError(f"Unknown month {name!r}")
    return first.strftime("%Y-%m")


def month_label(key: str) -> str:
    return date.fromisoformat(f"{key}-01").strftime("%B %Y")


def add_months(on: date, months: int) -> str:
    """The 'YYYY-MM' that is `months` after on's month."""
    years, month0 = divmod(on.month - 1 + months, 12)
    return f"{on.year + years:04d}-{month0 + 1:02d}"


def months_between(start: date, end: date) -> int:
    """Whole calendar months from start's month to end's month, at least 1."""
    return max(1, (end.year - start.year) * 12 + (end.month - start.month))


def range_label(start: date, end: date) -> str:
    if start.year == end.year:
        return f"{start:%b} {start.day} – {end:%b} {end.day}, {end.year}"
    return f"{start:%b} {start.day}, {start.year} – {end:%b} {end.day}, {end.year}"
