"""Twelve Data proxy. One shared snapshot per hourly window, per API worker.

The leaderboard scans the US equity catalog; it never substitutes a watchlist
or percentage gainers for the highest share prices. Incomplete scans preserve
the previous complete ranking and explicitly mark it stale.
"""

import asyncio
import math
import time
from datetime import datetime, timezone

import httpx

from app import config

REFRESH_SECONDS = 60 * 60
BATCH_SIZE = 100
STOCK_TYPES = {
    "Common Stock", "Preferred Stock", "American Depositary Receipt",
    "Depositary Receipt", "REIT", "Limited Partnership",
}


class MarketDataError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def provider_error(code: int) -> MarketDataError:
    if code == 429:
        return MarketDataError(429, "Twelve Data's request limit was reached. Prices will retry on the next refresh.")
    if code in (401, 403):
        return MarketDataError(503, "Twelve Data access is unavailable. Check the API key and the plan's market coverage.")
    return MarketDataError(502, "Twelve Data could not supply the requested market data.")


def finite_number(value) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


class TwelveData:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._search_lock = asyncio.Lock()
        self._history_lock = asyncio.Lock()
        self._history: dict[tuple, tuple[float, dict]] = {}
        self._history_errors: dict[tuple, tuple[float, MarketDataError]] = {}
        self._catalog: dict[str, dict] = {}
        self._catalog_at = 0.0
        self._searches: dict[str, tuple[float, list]] = {}
        self._quotes: dict[str, tuple[int, dict]] = {}
        self._quote_errors: dict[str, tuple[int, str]] = {}
        self._market_cycle = -1
        self._market = {"stocks": [], "updated_at": None, "universe_size": 0,
                        "quoted_count": 0, "stale": False, "error": None}

    async def _get(self, client: httpx.AsyncClient, endpoint: str, **params) -> dict:
        if not config.TWELVE_DATA_API_KEY:
            raise MarketDataError(503, "Stock data is not connected yet. Add the Twelve Data API key to the backend configuration.")
        try:
            response = await client.get(
                f"https://api.twelvedata.com/{endpoint}",
                params={**params, "apikey": config.TWELVE_DATA_API_KEY},
            )
            if not response.is_success:
                raise provider_error(response.status_code)
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            # Never expose an upstream URL containing the API key.
            raise MarketDataError(502, "Twelve Data is temporarily unavailable. Prices will retry on the next refresh.") from None
        if not isinstance(payload, dict):
            raise MarketDataError(502, "Twelve Data returned an unexpected response.")
        if payload.get("status") == "error":
            raise provider_error(int(payload.get("code", 502)))
        return payload

    async def search(self, query: str) -> list:
        key = query.casefold()
        async with self._search_lock:
            cached = self._searches.get(key)
            if cached and time.monotonic() - cached[0] < 3600:
                return cached[1]
            async with httpx.AsyncClient(timeout=12) as client:
                data = await self._get(client, "symbol_search", symbol=query, outputsize=120)
            results = {}
            for item in data.get("data", []):
                if (item.get("country") in ("United States", "US", "USA")
                        and item.get("currency") == "USD"
                        and item.get("instrument_type") in STOCK_TYPES | {"ETF"}):
                    symbol = item.get("symbol")
                    if symbol and symbol not in results:
                        results[symbol] = {"symbol": symbol, "name": item.get("instrument_name", symbol),
                                           "exchange": item.get("exchange", ""), "currency": "USD"}
            if len(self._searches) >= 500:
                self._searches.pop(next(iter(self._searches)))
            found = list(results.values())[:15]
            self._searches[key] = (time.monotonic(), found)
            return found

    async def _load_catalog(self, client: httpx.AsyncClient) -> None:
        if self._catalog and time.monotonic() - self._catalog_at < 10800:
            return
        payload = await self._get(client, "stocks", country="United States", include_delisted="false")
        rows = payload.get("data", [])
        # No outputsize is specified: the documented response contains the full catalog.
        if not isinstance(rows, list) or (payload.get("count") and int(payload["count"]) > len(rows)):
            raise MarketDataError(502, "The US stock catalog is incomplete; a market-wide ranking is unavailable.")
        catalog = {
            row["symbol"]: row for row in rows
            if row.get("symbol") and row.get("currency") == "USD" and row.get("type") in STOCK_TYPES
        }
        if len(catalog) < 3:
            raise MarketDataError(502, "The US stock catalog is unavailable.")
        self._catalog, self._catalog_at = catalog, time.monotonic()

    async def _fetch_quotes(self, client: httpx.AsyncClient, symbols: list[str], cycle: int) -> tuple[dict, dict]:
        limiter = asyncio.Semaphore(4)

        async def batch(names: list[str]) -> tuple[dict, dict]:
            async with limiter:
                payload = await self._get(client, "quote", symbol=",".join(names), country="United States")
            valid, errors = {}, {}
            for symbol in names:
                row = payload if len(names) == 1 and "symbol" in payload else payload.get(symbol, {})
                if not isinstance(row, dict):
                    row = {}
                if row.get("status") == "error" and row.get("code") in (401, 403, 429):
                    raise provider_error(int(row["code"]))
                price = finite_number(row.get("close"))
                timestamp = finite_number(row.get("last_quote_at")) or finite_number(row.get("timestamp"))
                if (price is None or price <= 0 or timestamp is None or timestamp <= 0
                        or row.get("currency") != "USD" or row.get("symbol") != symbol):
                    errors[symbol] = f"No current USD quote is available for {symbol}."
                    continue
                valid[symbol] = {
                    "symbol": symbol, "name": row.get("name") or symbol,
                    "exchange": row.get("exchange", ""), "currency": "USD",
                    "price": price, "change": finite_number(row.get("percent_change")),
                    "change_amount": finite_number(row.get("change")),
                    "previous_close": finite_number(row.get("previous_close")),
                    "as_of": int(timestamp), "market_open": row.get("is_market_open") is True,
                    "updated_at": utc_now(),
                }
            return valid, errors

        tasks = [asyncio.create_task(batch(symbols[i:i + BATCH_SIZE]))
                 for i in range(0, len(symbols), BATCH_SIZE)]
        try:
            responses = await asyncio.wait_for(asyncio.gather(*tasks), timeout=25)
        except BaseException:
            # Stop queued batches on quota errors or timeout instead of spending more credits.
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        valid, errors = {}, {}
        for quotes, failures in responses:
            valid.update(quotes)
            errors.update(failures)
        self._quotes.update({symbol: (cycle, quote) for symbol, quote in valid.items()})
        self._quote_errors.update({symbol: (cycle, message) for symbol, message in errors.items()})
        return valid, errors

    async def quotes(self, symbols: list[str]) -> dict:
        async with self._lock:
            cycle = int(time.time() // REFRESH_SECONDS)
            needed = [symbol for symbol in symbols
                      if self._quotes.get(symbol, (-1,))[0] != cycle
                      and self._quote_errors.get(symbol, (-1,))[0] != cycle]
            if needed:
                try:
                    async with httpx.AsyncClient(timeout=12) as client:
                        await self._fetch_quotes(client, needed, cycle)
                except TimeoutError:
                    raise MarketDataError(504, "The price update timed out. Retrying on the next refresh.") from None
            return {
                "quotes": [self._quotes[s][1] for s in symbols if self._quotes.get(s, (-1,))[0] == cycle],
                "errors": {s: self._quote_errors[s][1] for s in symbols
                           if self._quote_errors.get(s, (-1,))[0] == cycle and self._quotes.get(s, (-1,))[0] != cycle},
            }

    async def history(self, symbol: str, interval: str, start_date: str | None = None,
                      end_date: str | None = None) -> dict:
        key = (symbol, interval, start_date, end_date) if start_date else (symbol, interval)
        ttl = 86400 if interval == "1day" else 3600
        async with self._history_lock:
            # Gill's date comparisons can reuse daily chart history when it covers the range.
            recent = self._history.get((symbol, "1day")) if start_date and interval == "1day" else None
            if recent and time.monotonic() - recent[0] < ttl:
                values = recent[1]["values"]
                if values and values[0]["datetime"] <= start_date and values[-1]["datetime"] >= end_date:
                    return recent[1]
            cached = self._history.get(key)
            if cached and time.monotonic() - cached[0] < ttl:
                return cached[1]
            failed = self._history_errors.get(key)
            if failed and time.monotonic() - failed[0] < 60:
                raise failed[1]
            try:
                async with httpx.AsyncClient(timeout=12) as client:
                    bounds = ({"start_date": start_date, "end_date": end_date}
                              if start_date else {"outputsize": 370 if interval == "1day" else 100})
                    payload = await self._get(
                        client, "time_series", symbol=symbol, interval=interval,
                        **bounds,
                        country="United States", timezone="America/New_York",
                        order="ASC", prepost="false",
                    )
                meta = payload.get("meta", {})
                if (not isinstance(meta, dict) or meta.get("symbol") != symbol
                        or meta.get("currency") != "USD"):
                    raise MarketDataError(502, "USD price history is unavailable for this stock.")
                rows = payload.get("values")
                if not isinstance(rows, list) or not rows:
                    raise MarketDataError(502, "No price history is available for this stock.")
                points = {}
                for row in rows:
                    if not isinstance(row, dict):
                        raise MarketDataError(502, "Price history is incomplete.")
                    price = finite_number(row.get("close"))
                    stamp = row.get("datetime")
                    try:
                        datetime.strptime(stamp, "%Y-%m-%d" if interval == "1day" else "%Y-%m-%d %H:%M:%S")
                    except (ValueError, TypeError):
                        raise MarketDataError(502, "Price history contains an invalid date.") from None
                    if price is None or price <= 0:
                        raise MarketDataError(502, "Price history contains an invalid price.")
                    points[stamp] = {"datetime": stamp, "close": price}
                values = [points[stamp] for stamp in sorted(points)]
                if interval == "5min":
                    session = values[-1]["datetime"][:10]
                    values = [point for point in values if point["datetime"][:10] == session]
                result = {"symbol": symbol, "interval": interval, "timezone": "America/New_York",
                          "values": values, "updated_at": utc_now()}
            except MarketDataError as error:
                if len(self._history_errors) >= 500:
                    self._history_errors.pop(next(iter(self._history_errors)))
                self._history_errors[key] = (time.monotonic(), error)
                raise
            if len(self._history) >= 500:
                self._history.pop(next(iter(self._history)))
            self._history[key] = (time.monotonic(), result)
            self._history_errors.pop(key, None)
            return result

    async def market(self) -> dict:
        async with self._lock:
            cycle = int(time.time() // REFRESH_SECONDS)
            if self._market_cycle == cycle:
                return self._market
            self._market_cycle = cycle
            size = len(self._catalog)
            quoted_count = 0
            try:
                async with httpx.AsyncClient(timeout=12) as client:
                    await self._load_catalog(client)
                    size = len(self._catalog)
                    # A scan is fetched in a single burst, even when refreshes
                    # are an hour apart. The plan must cover that whole burst.
                    required = max(size, math.ceil(size * 60 / REFRESH_SECONDS)) + 60
                    if config.TWELVE_DATA_CREDITS_PER_MINUTE < required:
                        raise MarketDataError(503, f"Each hourly ranking update fetches {size:,} US stocks and needs at least "
                                              f"{required:,} Twelve Data credits per minute during the scan. The configured plan allowance is too low.")
                    quotes, errors = await self._fetch_quotes(client, sorted(self._catalog), cycle)
                quoted_count = len(quotes)
                if errors:
                    raise MarketDataError(502, f"The market update is incomplete ({quoted_count:,} of {size:,} stocks quoted). "
                                          "A complete update is required to rank the entire US market.")
                self._market = {
                    "stocks": sorted(quotes.values(), key=lambda q: (-q["price"], q["symbol"]))[:3],
                    "updated_at": utc_now(), "universe_size": size, "quoted_count": quoted_count,
                    "stale": False, "error": None,
                }
            except (MarketDataError, TimeoutError) as error:
                self._market = {**self._market, "stale": True, "universe_size": size,
                                "quoted_count": quoted_count,
                                "error": str(error) if isinstance(error, MarketDataError) else
                                "The full-market update timed out. Retrying on the next refresh."}
            return self._market


market_data = TwelveData()
