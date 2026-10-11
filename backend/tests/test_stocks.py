"""Offline checks for full-market coverage, shared refreshes, and provider failures."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config
from app.routes import stocks
from app.services import twelve_data


@pytest.fixture
def client(provider):
    # These public routes do not use the ledger or its database startup hooks.
    app = FastAPI()
    app.include_router(stocks.router)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr(config, "TWELVE_DATA_API_KEY", "private-test-key")
    monkeypatch.setattr(config, "TWELVE_DATA_CREDITS_PER_MINUTE", 10000)
    state = {"prices": {"AAPL": 200, "BRK.A": 900000, "NVR": 8000, "SEB": 4500, "AUTO": 4200},
             "missing": set(), "rate_limit": False, "calls": [], "now": 3600}
    monkeypatch.setattr(twelve_data.time, "time", lambda: state["now"])

    def respond(request):
        state["calls"].append(request)
        assert request.url.params["apikey"] == "private-test-key"
        if request.url.path == "/stocks":
            rows = [{"symbol": s, "name": s, "type": "Common Stock", "currency": "USD"}
                    for s in state["prices"]]
            rows += [{"symbol": "ETF", "type": "ETF", "currency": "USD"},
                     {"symbol": "CAD", "type": "Common Stock", "currency": "CAD"}]
            return httpx.Response(200, json={"data": rows, "count": len(rows), "status": "ok"})
        if request.url.path == "/symbol_search":
            return httpx.Response(200, json={"data": [
                {"symbol": "AAPL", "instrument_name": "Apple Inc", "instrument_type": "Common Stock",
                 "country": "United States", "exchange": "NASDAQ", "currency": "USD"},
                {"symbol": "AAPL", "instrument_name": "Apple Canada", "instrument_type": "Common Stock",
                 "country": "Canada", "exchange": "TSX", "currency": "CAD"},
            ]})
        assert request.url.path == "/quote"
        if state["rate_limit"]:
            return httpx.Response(200, json={"status": "error", "code": 429, "message": "secret upstream details"})
        names = request.url.params["symbol"].split(",")
        rows = {s: {"symbol": s, "name": s, "currency": "USD", "close": str(state["prices"][s]),
                    "percent_change": "-1.5", "timestamp": 1700000000,
                    "last_quote_at": 1700000030, "is_market_open": False}
                for s in names if s not in state["missing"]}
        return httpx.Response(200, json=rows.get(names[0], {}) if len(names) == 1 else rows)

    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(respond)
    monkeypatch.setattr(twelve_data.httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))
    monkeypatch.setattr(stocks, "market_data", twelve_data.TwelveData())
    return state


def test_ranks_all_stocks_by_price_and_refreshes_in_next_window(client, provider):
    first = client.get("/stocks/top").json()
    assert [s["symbol"] for s in first["stocks"]] == ["BRK.A", "NVR", "SEB"]
    assert first["universe_size"] == first["quoted_count"] == 5
    assert first["stale"] is False
    assert first["stocks"][0]["as_of"] == 1700000030
    calls = len(provider["calls"])
    assert client.get("/stocks/top").json() == first
    client.get("/stocks/quotes?symbols=AAPL,NVR")
    assert len(provider["calls"]) == calls  # all visitors and quote views reuse the scan
    provider["prices"]["AUTO"] = 10000
    provider["now"] += 3599
    assert client.get("/stocks/top").json() == first
    client.get("/stocks/quotes?symbols=AAPL,NVR")
    assert len(provider["calls"]) == calls  # reuse quotes until the hourly window ends
    provider["now"] += 1
    second = client.get("/stocks/top").json()
    assert [s["symbol"] for s in second["stocks"]] == ["BRK.A", "AUTO", "NVR"]


def test_incomplete_scan_retains_last_complete_ranking(client, provider):
    first = client.get("/stocks/top").json()
    provider["missing"].add("BRK.A")
    provider["now"] += 3600
    second = client.get("/stocks/top").json()
    assert second["stale"] is True
    assert second["stocks"] == first["stocks"]
    assert second["updated_at"] == first["updated_at"]
    assert second["quoted_count"] == 4
    assert "incomplete" in second["error"]


def test_insufficient_plan_never_starts_expensive_scan(client, provider, monkeypatch):
    monkeypatch.setattr(config, "TWELVE_DATA_CREDITS_PER_MINUTE", 8)
    result = client.get("/stocks/top").json()
    assert result["stocks"] == []
    assert "65 Twelve Data credits" in result["error"]
    assert [r.url.path for r in provider["calls"]] == ["/stocks"]


def test_missing_key_and_rate_limit_are_explicit_and_do_not_leak_secrets(client, provider, monkeypatch):
    monkeypatch.setattr(config, "TWELVE_DATA_API_KEY", "")
    result = client.get("/stocks/quotes?symbols=AAPL")
    assert result.status_code == 503
    assert provider["calls"] == []
    monkeypatch.setattr(config, "TWELVE_DATA_API_KEY", "private-test-key")
    provider["rate_limit"] = True
    result = client.get("/stocks/quotes?symbols=AAPL")
    assert result.status_code == 429
    assert "secret" not in result.text and "private-test-key" not in result.text


def test_search_filters_us_listings_and_caches(client, provider):
    result = client.get("/stocks/search?q=Apple").json()
    assert result["results"] == [{"symbol": "AAPL", "name": "Apple Inc", "exchange": "NASDAQ", "currency": "USD"}]
    assert client.get("/stocks/search?q=apple").json() == result
    assert len(provider["calls"]) == 1


@pytest.mark.parametrize("price", ["NaN", "inf", "0", "-5", None])
def test_invalid_prices_cannot_enter_ranking(client, provider, price):
    provider["prices"]["BRK.A"] = price
    result = client.get("/stocks/top").json()
    assert result["stocks"] == []
    assert result["stale"] is True


def test_rejects_unbounded_or_invalid_symbol_requests(client, provider):
    assert client.get("/stocks/quotes?symbols=AAPL%26apikey=evil").status_code == 400
    assert client.get("/stocks/quotes", params={"symbols": ",".join(f"S{i}" for i in range(26))}).status_code == 400
    assert provider["calls"] == []
