import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceProvider } from "@/components/finance-provider";
import { GillNavigationProvider } from "@/components/gill-navigation";
import { Taskbar } from "@/components/taskbar";
import { SAMPLE_QUOTES } from "@/lib/sample-quotes";
import { TICKER_SYMBOLS, getStockQuotes, type StockQuote } from "@/lib/market";

vi.mock("@/lib/market", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market")>()),
  getStockQuotes: vi.fn(),
}));

function quote(
  symbol: string,
  price: number,
  change: number | null,
): StockQuote {
  return {
    symbol,
    name: symbol,
    exchange: "NASDAQ",
    currency: "USD",
    price,
    change,
    as_of: 1791600000,
    market_open: true,
    updated_at: "2026-10-10T15:00:00Z",
  };
}

function mount() {
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceProvider>
          <GillNavigationProvider>
            <Taskbar />
          </GillNavigationProvider>
        </FinanceProvider>
      </QueryClientProvider>
    ),
  });
  const page = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => null });
  const router = createRouter({
    routeTree: root.addChildren(
      ["/", "accounts", "spending", "quick-add"].map(page),
    ),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(getStockQuotes).mockReset();
});

describe("Taskbar ticker", () => {
  it("scrolls live quotes, coloured by direction, next to the student's money", async () => {
    vi.mocked(getStockQuotes).mockResolvedValue({
      quotes: [quote("AAPL", 227.55, 1.24), quote("MSFT", 410.1, -0.5)],
      errors: {},
    });
    mount();
    const ticker = await screen.findByRole("marquee", {
      name: "Market and money ticker",
    });
    const apple = await within(ticker).findAllByText("AAPL");
    const row = apple[0]!.closest(".ticker-item")!;
    expect(row).toHaveTextContent("$227.55");
    expect(within(row as HTMLElement).getByText(/\+1\.24%/)).toHaveClass(
      "ticker-up",
    );
    expect(within(ticker).getAllByText(/-0\.50%/)[0]).toHaveClass(
      "ticker-down",
    );
    expect(getStockQuotes).toHaveBeenCalledWith(
      TICKER_SYMBOLS,
      expect.anything(),
    );
    // The guest demo ledger's money items link to their pages.
    expect(
      within(ticker).getAllByRole("link", { name: /CHECKING/ })[0],
    ).toHaveAttribute("href", "/accounts");
    expect(
      screen.getByRole("img", { name: "US market open" }),
    ).toBeInTheDocument();
  });

  it("falls back to 20 clearly labelled sample prices when live data can't load", async () => {
    vi.mocked(getStockQuotes).mockRejectedValue(new Error("not connected"));
    mount();
    const ticker = await screen.findByRole("marquee", {
      name: "Market and money ticker",
    });
    expect(await within(ticker).findByText("DEMO")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Sample prices (live data offline)" }),
    ).toBeInTheDocument();
    const firstRun = ticker.querySelector(".ticker-run:not([aria-hidden])")!;
    const labels = [...firstRun.querySelectorAll(".ticker-item strong")].map(
      (el) => el.textContent,
    );
    expect(
      labels.filter((l) => SAMPLE_QUOTES.some((q) => q.symbol === l)),
    ).toHaveLength(20);
    // The student's own numbers are spread through the stocks, not bunched at the end.
    const checking = labels.indexOf("CHECKING");
    expect(checking).toBeGreaterThan(0);
    expect(checking).toBeLessThan(10);
    expect(labels.some((l) => l?.startsWith("SPENT"))).toBe(true);
  });

  it("has Quick Launch shortcuts", async () => {
    vi.mocked(getStockQuotes).mockResolvedValue({ quotes: [], errors: {} });
    mount();
    const quick = await screen.findByRole("navigation", {
      name: "Quick launch",
    });
    expect(
      within(quick).getByRole("link", { name: "Quick add a purchase" }),
    ).toHaveAttribute("href", "/quick-add");
    expect(
      within(quick).getByRole("button", { name: "Ask Gill" }),
    ).toBeEnabled();
    expect(
      within(quick).getByRole("link", { name: "Spending analysis" }),
    ).toHaveAttribute("href", "/spending");
  });
});
