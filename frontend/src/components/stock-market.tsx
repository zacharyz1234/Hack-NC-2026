import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  Search,
  Star,
  Plus,
  BookOpen,
  Fish,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { XPWindow } from "./xp-window";
import { StockHistoryChart } from "./stock-history-chart";
import { stocks, money } from "@/lib/finance";
import {
  MARKET_REFRESH_MS,
  getStockQuotes,
  searchStocks,
  quoteChange,
  type StockInstrument,
} from "@/lib/market";

// Use only company metadata from the demo catalog; displayed prices come from the API.
const suggestions: StockInstrument[] = stocks.map(({ symbol, name }) => ({
  symbol,
  name,
  exchange: "US",
  currency: "USD",
}));

const polling = {
  refetchInterval: MARKET_REFRESH_MS,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

export function StockMarket({
  onReturn,
  onAsk,
  onEducation,
}: {
  onReturn: () => void;
  onAsk: (q: string) => void;
  onEducation: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<StockInstrument>(suggestions[0]!);
  const [period, setPeriod] = useState("1M");
  const [watchlist, setWatchlist] = useState(["AAPL", "MSFT", "VOO"]);
  const [holdings, setHoldings] = useState<Record<string, number>>({
    VOO: 2,
    AAPL: 3,
  });
  const [cash, setCash] = useState(2500);
  const [notice, setNotice] = useState("");
  const [shares, setShares] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const symbols = [
    ...new Set([
      selected.symbol,
      ...watchlist,
      ...Object.keys(holdings).filter((symbol) => (holdings[symbol] ?? 0) > 0),
    ]),
  ].sort();
  const quotesQuery = useQuery({
    queryKey: ["stock-quotes", symbols.join(",")],
    queryFn: ({ signal }) => getStockQuotes(symbols, signal),
    placeholderData: keepPreviousData,
    ...polling,
  });
  const searchQuery = useQuery({
    queryKey: ["stock-search", searchTerm],
    queryFn: ({ signal }) => searchStocks(searchTerm, signal),
    enabled: searchTerm.length > 0,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const searching =
    query.trim() !== searchTerm ||
    (searchTerm.length > 0 && searchQuery.isFetching);
  const found = query.trim()
    ? query.trim() === searchTerm
      ? (searchQuery.data?.results ?? [])
      : []
    : suggestions;
  const quotes = Object.fromEntries(
    (quotesQuery.data?.quotes ?? []).map((quote) => [quote.symbol, quote]),
  );
  const quote = quotes[selected.symbol];
  const featuredSymbols = [...watchlist]
    .sort(
      (a, b) =>
        (quotes[b]?.price ?? -1) - (quotes[a]?.price ?? -1) ||
        a.localeCompare(b),
    )
    .slice(0, 3);
  const quoteError =
    quotesQuery.error?.message ?? quotesQuery.data?.errors[selected.symbol];
  const description = stocks.find(
    (stock) => stock.symbol === selected.symbol,
  )?.description;
  const hasPortfolioPrices = Object.entries(holdings).every(
    ([symbol, count]) => count <= 0 || quotes[symbol],
  );
  const canTrade =
    !!quote &&
    !quoteError &&
    !quotesQuery.isPlaceholderData &&
    Number.isFinite(shares) &&
    shares >= 1;
  const chooseStock = (stock: StockInstrument) => {
    setSelected(stock);
    setNotice("");
  };
  return (
    <div className="stock-view">
      <div className="stock-header">
        <h2>Welcome to Bowl Street.</h2>
        <Button variant="soft" onClick={onReturn}>
          <ArrowLeft />
          Return to Dashboard
        </Button>
      </div>
      <div className="market-ranking-heading">
        <h3>Featured stocks</h3>
        <span>Price per share • Refreshes every hour</span>
      </div>
      <div
        className="index-strip"
        aria-label="Featured stocks from your watchlist"
        aria-busy={quotesQuery.isFetching}
      >
        {[0, 1, 2].map((index) => {
          const symbol = featuredSymbols[index];
          const stock = symbol ? quotes[symbol] : undefined;
          return (
            <button
              type="button"
              className="index-item market-leader"
              key={index}
              disabled={!stock}
              onClick={() => stock && chooseStock(stock)}
            >
              <strong>
                {symbol ?? "Add a stock"}
              </strong>
              <small>
                {stock?.name ??
                  (!symbol
                    ? "Add a stock to your watchlist to feature it here"
                    : quotesQuery.isFetching
                      ? "Loading price…"
                      : "Price unavailable")}
              </small>
              <p>{stock ? money(stock.price) : "—"}</p>
              {stock && (
                <small
                  className={
                    stock.change !== null && stock.change < 0
                      ? "negative"
                      : "positive"
                  }
                >
                  {quoteChange(stock.change)}
                </small>
              )}
              {stock &&
                (quotesQuery.isError ||
                  quotesQuery.data?.errors[stock.symbol]) && (
                  <small>Update unavailable • Last received price</small>
                )}
            </button>
          );
        })}
      </div>
      <p className="market-ranking-status" role="status">
        Your three highest-priced watchlist stocks appear here, ordered by
        price per share using the latest loaded quotes. Stocks awaiting prices
        appear after those with available quotes.
      </p>
      <div className="stock-layout">
        <XPWindow
          title="Bowl Street Exchange — Company research"
          icon={<TrendingUp size={15} />}
          footer={
            <>
              <a href="https://twelvedata.com" target="_blank" rel="noreferrer">
                Market data by Twelve Data
              </a>
              <span>
                {quotesQuery.isFetching
                  ? "Updating prices…"
                  : "Prices refresh every hour"}
              </span>
            </>
          }
        >
          <div className="stock-search">
            <Search />
            <input
              className="xp-input"
              placeholder="Search companies or tickers…"
              aria-label="Stock ticker search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="stock-results">
            {found.map((s) => (
              <Button
                key={s.symbol}
                size="sm"
                variant={s.symbol === selected.symbol ? "aero" : "soft"}
                title={`${s.name} • ${s.exchange}`}
                onClick={() => chooseStock(s)}
              >
                {s.symbol}
                {query.trim() && ` · ${s.name}`}
              </Button>
            ))}
            {searching && <p role="status">Searching US stocks…</p>}
            {!!query.trim() && !searching && searchQuery.isError && (
              <p role="alert">{searchQuery.error.message}</p>
            )}
            {found.length === 0 && !searching && !searchQuery.isError && (
              <p>No matching US stocks or ETFs.</p>
            )}
          </div>
          {quoteError && (
            <p className="market-data-notice" role="alert">
              {quoteError} {quote && "Showing the last received price."}
            </p>
          )}
          <div className="stock-company">
            <div>
              <h3>{quote?.name ?? selected.name}</h3>
              <p>
                {selected.symbol} • {quote?.exchange ?? selected.exchange}
              </p>
            </div>
            <div>
              <div className="stock-price">
                {quote ? money(quote.price) : "—"}
              </div>
              {quote ? (
                <>
                  <p
                    className={
                      quote.change !== null && quote.change < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    {quoteChange(quote.change)} today
                  </p>
                  <p className="quote-timestamp">
                    {quote.market_open ? "Market open" : "Market closed"} •
                    Quote as of {new Date(quote.as_of * 1000).toLocaleString()}
                  </p>
                </>
              ) : (
                <p>
                  {quotesQuery.isFetching
                    ? "Loading price…"
                    : "Price unavailable"}
                </p>
              )}
            </div>
          </div>
          <div className="periods">
            {["1D", "1W", "1M", "3M", "1Y"].map((p) => (
              <Button
                size="sm"
                variant={period === p ? "aero" : "soft"}
                key={p}
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="soft"
              size="sm"
              className="ml-auto"
              onClick={() =>
                setWatchlist((prev) =>
                  prev.includes(selected.symbol)
                    ? prev.filter((x) => x !== selected.symbol)
                    : [...prev, selected.symbol],
                )
              }
            >
              <Star />
              {watchlist.includes(selected.symbol) ? "Watching" : "Watch"}
            </Button>
          </div>
          <StockHistoryChart symbol={selected.symbol} period={period} />
          <p className="stock-research">
            {description} Quotes show the latest available price; markets may be
            closed. A company’s past performance does not guarantee future
            returns.
          </p>
          <Button
            variant="green"
            className="mt-4"
            onClick={() =>
              onAsk(
                `I’m researching ${selected.name} (${selected.symbol}). Explain its business, investment risks, and what a beginner should consider.${quote ? ` The latest displayed Twelve Data price is ${money(quote.price)}, as of ${new Date(quote.as_of * 1000).toISOString()}.` : " A current quote is unavailable."}`,
              )
            }
          >
            <Fish />
            Ask Gill about {selected.symbol}
          </Button>
        </XPWindow>
        <aside className="stock-sidebar">
          <XPWindow title="My watchlist" icon={<Star size={14} />}>
            {watchlist.length === 0 ? (
              <p>No watched stocks yet.</p>
            ) : (
              watchlist.map((symbol) => {
                const stock = quotes[symbol];
                return (
                  <Button
                    variant="ghost"
                    className="market-row w-full h-auto rounded-none"
                    key={symbol}
                    onClick={() =>
                      chooseStock(
                        stock ?? {
                          symbol,
                          name: symbol,
                          exchange: "US",
                          currency: "USD",
                        },
                      )
                    }
                  >
                    <div>
                      <strong>{symbol}</strong>
                      <p>{stock?.name ?? "Waiting for quote"}</p>
                    </div>
                    <div>
                      <strong>{stock ? money(stock.price) : "—"}</strong>
                      {stock && (
                        <p
                          className={
                            stock.change !== null && stock.change < 0
                              ? "negative"
                              : "positive"
                          }
                        >
                          {quoteChange(stock.change)}
                        </p>
                      )}
                      {quotesQuery.data?.errors[symbol] && (
                        <p>Price unavailable</p>
                      )}
                    </div>
                  </Button>
                );
              })
            )}
          </XPWindow>
          <XPWindow
            title="Practice portfolio"
            icon={<TrendingUp size={14} />}
            className="mt-5"
          >
            <span className="badge-demo">SIMULATED • NO REAL MONEY</span>
            <p
              id="practice-portfolio-value-label"
              className="text-sm font-semibold mt-4"
            >
              Total practice portfolio value
            </p>
            <div
              className="money-summary text-2xl"
              aria-labelledby="practice-portfolio-value-label"
            >
              {hasPortfolioPrices
                ? money(
                    cash +
                      Object.entries(holdings).reduce(
                        (sum, [symbol, quantity]) =>
                          sum + (quotes[symbol]?.price ?? 0) * quantity,
                        0,
                      ),
                  )
                : "Waiting for prices…"}
            </div>
            <p className="text-muted-foreground text-xs">
              Available cash + current value of your practice shares
            </p>
            <p className="text-muted-foreground text-xs">
              Available cash: {money(cash)}
            </p>
            <div className="portfolio-list">
              {Object.entries(holdings)
                .filter(([, quantity]) => quantity > 0)
                .map(([symbol, quantity]) => (
                  <div key={symbol} className="flex justify-between">
                    <strong>{symbol}</strong>
                    <span>{quantity} shares</span>
                  </div>
                ))}
            </div>
            <label className="field-label" htmlFor="shares">
              Shares of {selected.symbol}
            </label>
            <input
              id="shares"
              className="xp-input"
              type="number"
              min="1"
              step="1"
              value={shares}
              onChange={(e) => {
                const value = Number(e.target.value);
                setShares(
                  Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1,
                );
              }}
            />
            <div className="flex gap-2 mt-3">
              <Button
                variant="green"
                size="sm"
                disabled={!canTrade}
                onClick={() => {
                  if (!quote || !canTrade) return;
                  const cost = shares * quote.price;
                  if (cost > cash) {
                    setNotice("Not enough practice cash.");
                    return;
                  }
                  setCash((c) => c - cost);
                  setHoldings((h) => ({
                    ...h,
                    [selected.symbol]: (h[selected.symbol] ?? 0) + shares,
                  }));
                  setNotice(
                    `Bought ${shares} ${selected.symbol} shares in your practice portfolio.`,
                  );
                }}
              >
                <Plus />
                Buy
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={!canTrade}
                onClick={() => {
                  if (!quote || !canTrade) return;
                  if ((holdings[selected.symbol] ?? 0) < shares) {
                    setNotice("You do not own that many shares.");
                    return;
                  }
                  setCash((c) => c + shares * quote.price);
                  setHoldings((h) => ({
                    ...h,
                    [selected.symbol]: (h[selected.symbol] ?? 0) - shares,
                  }));
                  setNotice(
                    `Sold ${shares} ${selected.symbol} practice shares.`,
                  );
                }}
              >
                Sell
              </Button>
            </div>
            {notice && (
              <p className="text-xs mt-3" role="status">
                {notice}
              </p>
            )}
          </XPWindow>
          <Button variant="soft" className="w-full mt-4" onClick={onEducation}>
            <BookOpen />
            Investing for beginners
          </Button>
        </aside>
      </div>
    </div>
  );
}
