"""Public market facts for Gill, using the same event loop and caches as the webpage."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from anyio import from_thread
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.twelve_data import market_data


class StockSearchArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=80, description="Company name or US ticker to resolve.")

    @field_validator("query")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Enter a company name or ticker.")
        return value.strip()


class StockQuoteArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str = Field(min_length=1, max_length=24, pattern=r"^[A-Z0-9][A-Z0-9.\-]{0,23}$",
                        description="Verified US ticker, e.g. NVDA. Use get_stock_search if unsure.")

    @field_validator("symbol", mode="before")
    @classmethod
    def normalize(cls, value):
        return value.strip().upper() if isinstance(value, str) else value


class StockComparisonArgs(StockQuoteArgs):
    start_date: date = Field(description="First requested date, YYYY-MM-DD; ask the user if the year is missing.")
    end_date: date = Field(description="Second requested date, YYYY-MM-DD; must not precede start_date.")

    @model_validator(mode="after")
    def bounded(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date.")
        if (self.end_date - self.start_date).days > 3653:
            raise ValueError("Compare dates no more than ten years apart.")
        if self.start_date < date(1900, 1, 8):
            raise ValueError("Dates must be on or after 1900-01-08.")
        return self


def _round(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


async def _quote(symbol: str) -> dict:
    response = await market_data.quotes([symbol])
    if not response["quotes"]:
        return {"error": "stock_unavailable", "message": response["errors"].get(symbol, "Quote unavailable.")}
    quote = response["quotes"][0]
    return {"status": "ok", "source": "Twelve Data", **quote,
            "change_percent": quote["change"],
            "price_basis": "Latest available regular-session USD price; change is versus the previous close.",
            "cache_note": "Quotes are shared with BowlStreet and cached until the next hourly refresh window."}


async def _compare(args: StockComparisonArgs) -> dict:
    # Fetch one bounded dataset, including a week before the first requested date.
    start = (args.start_date - timedelta(days=7)).isoformat()
    end = (args.end_date + timedelta(days=1)).isoformat()
    history = await market_data.history(args.symbol, "1day", start, end)
    endpoints = []
    for requested in (args.start_date, args.end_date):
        eligible = [point for point in history["values"]
                    if (requested - timedelta(days=7)).isoformat() <= point["datetime"] <= requested.isoformat()]
        if not eligible:
            return {"error": "date_unavailable", "message": "No closing price was found on or within seven days before a requested date.",
                    "symbol": args.symbol, "requested_date": requested.isoformat()}
        point = max(eligible, key=lambda value: value["datetime"])
        endpoints.append({"requested_date": requested.isoformat(), "trading_date": point["datetime"],
                          "price": point["close"], "used_previous_session": point["datetime"] != requested.isoformat()})
    first, last = (Decimal(str(point["price"])) for point in endpoints)
    difference = last - first
    return {"status": "ok", "source": "Twelve Data", "symbol": args.symbol, "currency": "USD",
            "start": endpoints[0], "end": endpoints[1], "change_amount": _round(difference),
            "change_percent": _round(difference / first * 100),
            "direction": "increased" if difference > 0 else "decreased" if difference < 0 else "unchanged",
            "price_basis": "Daily closing prices, adjusted for splits by Twelve Data; excludes dividends and total return. The current trading day may be incomplete.",
            "date_policy": "When a requested date has no session, use the latest available session within the preceding seven days and disclose its date.",
            "updated_at": history["updated_at"]}


def search(args: StockSearchArgs) -> dict:
    return {"status": "ok", "source": "Twelve Data", "results": from_thread.run(market_data.search, args.query)}


def quote(args: StockQuoteArgs) -> dict:
    return from_thread.run(_quote, args.symbol)


def compare(args: StockComparisonArgs) -> dict:
    return from_thread.run(_compare, args)
