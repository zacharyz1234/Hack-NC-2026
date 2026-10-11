"""Offline public-stock tool integration, date math, provider errors and policy."""
import httpx
import pytest

from app import config
from app.assistant import prompts, stock_facts
from app.assistant.tools import TOOLS
from app.routes import stocks
from app.services import twelve_data
from tests.conftest import call, open_chat, reply, say, say_to_gill, signup


@pytest.fixture
def market(monkeypatch):
    state = {"calls": [], "first": "100", "last": "125", "limited": False, "rows": None}
    monkeypatch.setattr(config, "TWELVE_DATA_API_KEY", "offline-secret")

    def respond(request):
        state["calls"].append(request)
        assert request.url.params["apikey"] == "offline-secret"
        if state["limited"]:
            return httpx.Response(200, json={"status": "error", "code": 429, "message": "offline-secret"})
        if request.url.path == "/symbol_search":
            return httpx.Response(200, json={"data": [{"symbol": "NVDA", "instrument_name": "NVIDIA",
                "instrument_type": "Common Stock", "country": "United States", "currency": "USD", "exchange": "NASDAQ"}]})
        if request.url.path == "/quote":
            return httpx.Response(200, json={"symbol": "NVDA", "name": "NVIDIA", "currency": "USD",
                "close": "125", "change": "5", "percent_change": "4.16667", "previous_close": "120",
                "timestamp": 1791576000, "is_market_open": False})
        assert request.url.path == "/time_series"
        return httpx.Response(200, json={"meta": {"symbol": "NVDA", "currency": "USD"}, "values": state["rows"] or [
            {"datetime": "2026-06-10", "close": state["last"]},
            {"datetime": "2026-05-08", "close": state["first"]}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(twelve_data.httpx, "AsyncClient",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    service = twelve_data.TwelveData()
    monkeypatch.setattr(stock_facts, "market_data", service)
    monkeypatch.setattr(stocks, "market_data", service)
    return state


def ask(client, fake_gemini, name, **args):
    if "Authorization" not in client.headers:  # Gill needs a login; stock facts still need no data consent
        client.headers.update(signup(client))
    sid = open_chat(client)
    fake_gemini.script(reply(call(name, **args)), reply(say("Here are the stock facts.")))
    turn = say_to_gill(client, None, sid, "Tell me the stock facts.")
    assert turn["state"] == "ready"
    assert not any(event["type"] in ("consent_request", "data_access") for event in turn["events"])
    result = fake_gemini.last_results()[0]["response"]
    message = [event for event in turn["events"] if event["type"] == "message"][-1]
    if result.get("status") == "ok" and name in ("get_stock_quote", "get_stock_price_comparison"):
        assert message["stock_numbers"]
        direction = result.get("direction", "increased")
        assert all(number["direction"] == direction for number in message["stock_numbers"])
    else:
        assert "stock_numbers" not in message
    return result


def test_student_resolves_company_and_gets_current_quote_without_consent(client, fake_gemini, market):
    result = ask(client, fake_gemini, "get_stock_search", query="Nvidia")
    assert result["results"][0]["symbol"] == "NVDA"
    quote = ask(client, fake_gemini, "get_stock_quote", symbol="nvda")
    assert quote["price"] == 125
    assert quote["change_amount"] == 5
    assert quote["change_percent"] == 4.16667
    assert quote["previous_close"] == 120
    assert quote["market_open"] is False
    assert quote["source"] == "Twelve Data" and quote["as_of"] == 1791576000
    # The public webpage reuses the exact same provider quote.
    assert client.get("/stocks/quotes?symbols=NVDA").json()["quotes"][0]["price"] == 125
    assert len(market["calls"]) == 2


@pytest.mark.parametrize("last,direction,amount,percent", [
    ("125", "increased", 25, 25), ("80", "decreased", -20, -20), ("100", "unchanged", 0, 0)])
def test_comparison_math_and_weekend_substitution(client, fake_gemini, market, last, direction, amount, percent):
    market["last"] = last
    result = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA",
                 start_date="2026-05-10", end_date="2026-06-10")
    assert result["start"] == {"requested_date": "2026-05-10", "trading_date": "2026-05-08",
                               "price": 100, "used_previous_session": True}
    assert result["end"]["trading_date"] == "2026-06-10"
    assert (result["direction"], result["change_amount"], result["change_percent"]) == (direction, amount, percent)
    params = market["calls"][0].url.params
    assert params["start_date"] == "2026-05-03" and params["end_date"] == "2026-06-11"
    assert "outputsize" not in params
    again = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA",
                start_date="2026-05-10", end_date="2026-06-10")
    assert again == result and len(market["calls"]) == 1


@pytest.mark.parametrize("start,end", [("2026-06-10", "2026-05-10"),
    ("2026-05-10", "2027-06-10"), ("2000-05-10", "2026-06-10"), ("May 10", "2026-06-10")])
def test_invalid_or_future_dates_do_not_spend_credits(client, fake_gemini, market, start, end):
    result = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA", start_date=start, end_date=end)
    assert result["error"] == "invalid_arguments"
    assert market["calls"] == []


def test_unavailable_date_does_not_invent_price(client, fake_gemini, market):
    result = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA",
                 start_date="2025-05-10", end_date="2026-06-10")
    assert result["error"] == "date_unavailable"
    assert "change_amount" not in result


def test_comparison_reuses_webpage_daily_history(client, fake_gemini, market):
    market["rows"] = [{"datetime": stamp, "close": price} for stamp, price in [
        ("2026-04-01", "90"), ("2026-05-08", "100"),
        ("2026-06-10", "125"), ("2026-06-12", "130")]]
    assert client.get("/stocks/history?symbol=NVDA").status_code == 200
    result = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA",
                 start_date="2026-05-10", end_date="2026-06-10")
    assert result["change_amount"] == 25
    assert len(market["calls"]) == 1


def test_invalid_history_prices_do_not_reach_gill(client, fake_gemini, market):
    market["first"] = "NaN"
    result = ask(client, fake_gemini, "get_stock_price_comparison", symbol="NVDA",
                 start_date="2026-05-10", end_date="2026-06-10")
    assert result["error"] == "stock_data_unavailable"
    assert "change_amount" not in result


def test_rate_limit_is_safe_and_not_presented_as_a_price(client, fake_gemini, market):
    market["limited"] = True
    result = ask(client, fake_gemini, "get_stock_quote", symbol="NVDA")
    assert result["error"] == "stock_data_unavailable" and result["provider_status"] == 429
    assert "offline-secret" not in str(result)


def test_stock_policy_and_public_schema_are_exposed_to_model(client, fake_gemini, market):
    ask(client, fake_gemini, "get_stock_quote", symbol="NVDA")
    prompt = fake_gemini.calls[0].system
    assert "Never advise buying, selling or holding" in prompt
    assert "Ask one short question for missing years" in prompt
    assert "Never use model memory" in prompt
    assert "get_stock_price_comparison" in fake_gemini.calls[0].tools
    spec = TOOLS["get_stock_price_comparison"]
    assert spec.scopes(None) == []
    assert spec.declaration().parameters_json_schema["required"] == ["symbol", "start_date", "end_date"]
    assert prompts.PROMPT_VERSION == "gill-v7"
