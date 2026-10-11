"""Public market data for both guests and signed-in students; keys stay here."""

import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.twelve_data import MarketDataError, market_data

router = APIRouter(prefix="/stocks", tags=["stocks"])
SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,23}$")


@router.get("/search")
async def search(q: str = Query(min_length=1, max_length=80)):
    try:
        return {"results": await market_data.search(q.strip())} if q.strip() else {"results": []}
    except MarketDataError as error:
        raise HTTPException(error.status, str(error)) from None


@router.get("/quotes")
async def quotes(symbols: str = Query(min_length=1, max_length=1000)):
    names = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",")))
    if len(names) > 25 or any(not SYMBOL.fullmatch(s) for s in names):
        raise HTTPException(400, "Request between 1 and 25 valid US stock symbols.")
    try:
        return await market_data.quotes(names)
    except MarketDataError as error:
        raise HTTPException(error.status, str(error)) from None


@router.get("/top")
async def top():
    return await market_data.market()


@router.get("/history")
async def history(symbol: str = Query(min_length=1, max_length=24),
                  interval: Literal["1day", "5min"] = "1day"):
    symbol = symbol.strip().upper()
    if not SYMBOL.fullmatch(symbol):
        raise HTTPException(400, "Request a valid US stock symbol.")
    try:
        return await market_data.history(symbol, interval)
    except MarketDataError as error:
        raise HTTPException(error.status, str(error)) from None
