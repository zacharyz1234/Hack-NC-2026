// The XP taskbar: Start, Quick Launch, a scrolling market + money ticker, and the system tray.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fish, Home, PieChart, PlusCircle, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_MONTH } from "@/components/finance-provider";
import { thisMonth } from "@/lib/api";
import { money, spending } from "@/lib/finance";
import { useFinance } from "@/lib/finance-context";
import { safeReturn, useGillNavigation } from "@/lib/gill-navigation-context";
import {
  MARKET_REFRESH_MS,
  TICKER_SYMBOLS,
  getStockQuotes,
  quoteChange,
} from "@/lib/market";
import { SAMPLE_QUOTES } from "@/lib/sample-quotes";

const SECONDS_PER_ITEM = 5;

type TickerItem = {
  key: string;
  label: string;
  value: string;
  change?: number | null;
  to?: "/accounts" | "/spending";
};

type MarketState = "open" | "closed" | "sample" | "loading";

function useTickerItems(): { items: TickerItem[]; market: MarketState } {
  const { user, transactions, accountBalance, goal } = useFinance();
  const quotes = useQuery({
    queryKey: ["ticker-quotes"],
    queryFn: ({ signal }) => getStockQuotes(TICKER_SYMBOLS, signal),
    refetchInterval: MARKET_REFRESH_MS,
    refetchOnWindowFocus: false,
    staleTime: MARKET_REFRESH_MS,
    retry: false,
  });
  const live = quotes.data?.quotes ?? [];
  // No live prices (e.g. no API key): fall back to clearly labelled sample prices for now.
  const market: MarketState = live.length
    ? live.some((q) => q.market_open)
      ? "open"
      : "closed"
    : quotes.isPending
      ? "loading"
      : "sample";
  const shown = market === "sample" ? SAMPLE_QUOTES : live;
  const month = user ? thisMonth() : DEMO_MONTH;
  const monthName = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "short" },
  );
  const stocks: TickerItem[] = shown.length
    ? shown.map((q) => ({
        key: q.symbol,
        label: q.symbol,
        value: money(q.price),
        change: q.change,
      }))
    : [{ key: "loading", label: "MARKET", value: "Fetching prices…" }];
  const mine: TickerItem[] = [
    {
      key: "checking",
      label: "CHECKING",
      value: money(accountBalance("checking")),
      to: "/accounts",
    },
    {
      key: "spent",
      label: `SPENT ${monthName.toUpperCase()}`,
      value: money(
        spending(transactions.filter((t) => t.date.startsWith(month))),
      ),
      to: "/spending",
    },
  ];
  if (goal && goal.target_cents > 0)
    mine.push({
      key: "goal",
      label: goal.name.toUpperCase(),
      value: `${Math.min(100, Math.round((goal.saved_cents / goal.target_cents) * 100))}% saved`,
      to: "/accounts",
    });
  // Spread the student's own numbers through the stocks instead of bunching them at the end.
  const every = Math.max(1, Math.ceil(stocks.length / mine.length));
  const items = stocks.flatMap((stock, i) =>
    (i + 1) % every === 0 || i === stocks.length - 1
      ? [stock, ...mine.splice(0, 1)]
      : [stock],
  );
  return { items: [...items, ...mine], market };
}

function TickerEntry({ item, hidden }: { item: TickerItem; hidden?: boolean }) {
  const body = (
    <>
      <strong>{item.label}</strong>
      <span>{item.value}</span>
      {item.change !== undefined && (
        <span
          className={
            item.change === null
              ? ""
              : item.change >= 0
                ? "ticker-up"
                : "ticker-down"
          }
        >
          {item.change === null ? "" : item.change >= 0 ? "▲" : "▼"}{" "}
          {quoteChange(item.change)}
        </span>
      )}
    </>
  );
  return item.to ? (
    <Link
      to={item.to}
      className="ticker-item"
      tabIndex={hidden ? -1 : undefined}
    >
      {body}
    </Link>
  ) : (
    <span className="ticker-item">{body}</span>
  );
}

export function Taskbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { openGill, transitioning } = useGillNavigation();
  const { items, market } = useTickerItems();
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, []);
  const marketLabel = {
    open: "US market open",
    closed: "US market closed",
    sample: "Sample prices (live data offline)",
    loading: "Loading market data",
  }[market];
  return (
    <footer className="taskbar">
      <Button asChild className="start-button">
        <Link to="/">
          <Home size={21} />
          <span className="start-label">Home</span>
        </Link>
      </Button>
      <nav className="taskbar-quick" aria-label="Quick launch">
        <Link
          to="/quick-add"
          title="Quick add a purchase"
          aria-label="Quick add a purchase"
        >
          <PlusCircle size={17} />
        </Link>
        <button
          type="button"
          title="Ask Gill"
          aria-label="Ask Gill"
          disabled={pathname === "/gill" || transitioning}
          onClick={() => openGill(safeReturn(pathname))}
        >
          <Fish size={17} />
        </button>
        <Link
          to="/spending"
          title="Spending analysis"
          aria-label="Spending analysis"
        >
          <PieChart size={17} />
        </Link>
      </nav>
      <div
        className="ticker"
        role="marquee"
        aria-label="Market and money ticker"
      >
        <span
          className="ticker-badge"
          data-sample={market === "sample"}
          title={market === "sample" ? marketLabel : undefined}
        >
          BSJ
        </span>
        <div className="ticker-window">
          <div
            className="ticker-track"
            style={{
              animationDuration: `${Math.max(20, items.length * SECONDS_PER_ITEM)}s`,
            }}
          >
            <div className="ticker-run">
              {items.map((item) => (
                <TickerEntry key={item.key} item={item} />
              ))}
            </div>
            {/* A second copy makes the loop seamless; screen readers get the first only. */}
            <div className="ticker-run" aria-hidden="true">
              {items.map((item) => (
                <TickerEntry key={item.key} item={item} hidden />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="taskbar-status">
        <span
          className="market-light"
          data-state={market}
          title={marketLabel}
          role="img"
          aria-label={marketLabel}
        />
        <span className="market-label">
          {market === "sample" ? "Market watch" : marketLabel}
        </span>
        <Wifi size={14} aria-hidden="true" />
        <span>{clock}</span>
      </div>
    </footer>
  );
}
