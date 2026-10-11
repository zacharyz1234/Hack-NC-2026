import { API_BASE, ApiError } from "./api";

export const MARKET_REFRESH_MS = 60 * 60 * 1000;
// The taskbar ticker. Includes the stock page's default watchlist, so both share the backend's
// hourly quote cache: at most 5 Twelve Data credits an hour.
export const TICKER_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "VOO"];

export type StockInstrument = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
};

export type StockQuote = StockInstrument & {
  price: number;
  change: number | null;
  as_of: number;
  market_open: boolean;
  updated_at: string;
};

export type StockQuotes = {
  quotes: StockQuote[];
  errors: Record<string, string>;
};
export type StockHistory = {
  symbol: string;
  interval: "1day" | "5min";
  timezone: string;
  values: { datetime: string; close: number }[];
  updated_at: string;
};

export const getStockHistory = (
  symbol: string,
  interval: StockHistory["interval"],
  signal: AbortSignal,
) =>
  marketRequest<StockHistory>(
    `/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
    signal,
  );
export type MarketRanking = {
  stocks: StockQuote[];
  updated_at: string | null;
  universe_size: number;
  quoted_count: number;
  stale: boolean;
  error: string | null;
};

async function marketRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}/stocks${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      typeof body.detail === "string"
        ? body.detail
        : "Stock data is temporarily unavailable.",
    );
  }
  return response.json() as Promise<T>;
}

export async function getStockQuotes(
  symbols: string[],
  signal: AbortSignal,
): Promise<StockQuotes> {
  // The backend bounds each request; larger practice portfolios can still refresh.
  const batches: Promise<StockQuotes>[] = [];
  for (let i = 0; i < symbols.length; i += 25) {
    batches.push(
      marketRequest(
        `/quotes?symbols=${encodeURIComponent(symbols.slice(i, i + 25).join(","))}`,
        signal,
      ),
    );
  }
  const results = await Promise.all(batches);
  return {
    quotes: results.flatMap((result) => result.quotes),
    errors: Object.assign({}, ...results.map((result) => result.errors)),
  };
}

export const getMarketRanking = (signal: AbortSignal) =>
  marketRequest<MarketRanking>("/top", signal);
export const searchStocks = (query: string, signal: AbortSignal) =>
  marketRequest<{ results: StockInstrument[] }>(
    `/search?q=${encodeURIComponent(query)}`,
    signal,
  );

export function quoteChange(change: number | null) {
  return change === null
    ? "Change unavailable"
    : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
