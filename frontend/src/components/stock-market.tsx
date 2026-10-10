import { useState } from "react";
import { ArrowLeft, TrendingUp, Search, Star, Plus, BookOpen, Fish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XPWindow } from "./xp-window";
import { MoneyChart } from "./money-chart";
import { stocks, money } from "@/lib/finance";
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
  const [selected, setSelected] = useState(
    stocks[0] ?? {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 227.55,
      change: 1.24,
      sector: "Technology",
      description: "Apple designs consumer electronics.",
    },
  );
  const [period, setPeriod] = useState("1M");
  const [watchlist, setWatchlist] = useState(["AAPL", "MSFT", "VOO"]);
  const [holdings, setHoldings] = useState<Record<string, number>>({ VOO: 2, AAPL: 3 });
  const [cash, setCash] = useState(2500);
  const [notice, setNotice] = useState("");
  const [shares, setShares] = useState(1);
  const found = stocks.filter((s) =>
    `${s.symbol} ${s.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="stock-view">
      <div className="stock-header">
        <h2>Welcome to Bowl Street.</h2>
        <Button variant="soft" onClick={onReturn}>
          <ArrowLeft />
          Return to Dashboard
        </Button>
      </div>
      <div className="index-strip">
        {[
          ["S&P 500", "5,815.03", "+0.63%"],
          ["NASDAQ", "18,342.94", "+0.91%"],
          ["DOW JONES", "42,863.86", "+0.47%"],
        ].map(([name, value, change]) => (
          <div className="index-item" key={name}>
            <strong>{name}</strong>
            <p>{value}</p>
            <small className="positive">↗ {change}</small>
          </div>
        ))}
      </div>
      <div className="stock-layout">
        <XPWindow
          title="Bowl Street Exchange — Company research"
          icon={<TrendingUp size={15} />}
          footer={
            <>
              <span>Demonstration prices • Oct 10, 2026</span>
              <span>Not real-time market data</span>
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
                onClick={() => {
                  setSelected(s);
                  setNotice("");
                }}
              >
                {s.symbol}
              </Button>
            ))}
            {found.length === 0 && <p>No matching demonstration stocks.</p>}
          </div>
          <div className="stock-company">
            <div>
              <h3>{selected.name}</h3>
              <p>
                {selected.symbol} • {selected.sector}
              </p>
            </div>
            <div>
              <div className="stock-price">{money(selected.price)}</div>
              <p className={selected.change >= 0 ? "positive" : "negative"}>
                {selected.change >= 0 ? "+" : ""}
                {selected.change}% today
              </p>
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
          <MoneyChart stock period={period} price={selected.price} />
          <p className="stock-research">
            {selected.description} Prices and charts are illustrative, not market forecasts. A
            company’s past performance does not guarantee future returns.
          </p>
          <Button
            variant="green"
            className="mt-4"
            onClick={() =>
              onAsk(
                `I’m researching ${selected.name} (${selected.symbol}). Explain its business, investment risks, and what a beginner should consider. The displayed prices are demo data.`,
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
                const stock = stocks.find((s) => s.symbol === symbol);
                return stock ? (
                  <Button
                    variant="ghost"
                    className="market-row w-full h-auto rounded-none"
                    key={symbol}
                    onClick={() => setSelected(stock)}
                  >
                    <div>
                      <strong>{symbol}</strong>
                      <p>{stock.name}</p>
                    </div>
                    <div>
                      <strong>{money(stock.price)}</strong>
                      <p className="positive">+{stock.change}%</p>
                    </div>
                  </Button>
                ) : null;
              })
            )}
          </XPWindow>
          <XPWindow title="Practice portfolio" icon={<TrendingUp size={14} />} className="mt-5">
            <span className="badge-demo">SIMULATED • NO REAL MONEY</span>
            <div className="money-summary text-2xl">
              {money(
                cash +
                  Object.entries(holdings).reduce(
                    (sum, [symbol, quantity]) =>
                      sum + (stocks.find((s) => s.symbol === symbol)?.price ?? 0) * quantity,
                    0,
                  ),
              )}
            </div>
            <p className="text-muted-foreground text-xs">Available cash: {money(cash)}</p>
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
              onChange={(e) => setShares(Math.max(1, Math.floor(Number(e.target.value))))}
            />
            <div className="flex gap-2 mt-3">
              <Button
                variant="green"
                size="sm"
                onClick={() => {
                  const cost = shares * selected.price;
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
                onClick={() => {
                  if ((holdings[selected.symbol] ?? 0) < shares) {
                    setNotice("You do not own that many shares.");
                    return;
                  }
                  setCash((c) => c + shares * selected.price);
                  setHoldings((h) => ({
                    ...h,
                    [selected.symbol]: (h[selected.symbol] ?? 0) - shares,
                  }));
                  setNotice(`Sold ${shares} ${selected.symbol} practice shares.`);
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
