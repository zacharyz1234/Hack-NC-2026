import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockMarket } from "@/components/stock-market";
import {
  getMarketRanking,
  getStockQuotes,
  searchStocks,
  type StockQuote,
} from "@/lib/market";

vi.mock("@/components/stock-history-chart", () => ({ StockHistoryChart: () => null }));
vi.mock("@/lib/market", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market")>()),
  getMarketRanking: vi.fn(),
  getStockQuotes: vi.fn(),
  searchStocks: vi.fn(),
}));

const quote = (symbol: string, price: number): StockQuote => ({
  symbol,
  name: symbol === "TSLA" ? "Tesla Inc" : symbol,
  exchange: "NASDAQ",
  currency: "USD",
  price,
  change: -1.5,
  as_of: 1700000000,
  market_open: false,
  updated_at: "2026-10-10T14:00:00Z",
});
let client: QueryClient;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.mocked(getStockQuotes).mockImplementation(async (symbols) => ({
    quotes: symbols.map((symbol) =>
      quote(symbol, symbol === "TSLA" ? 250 : 200),
    ),
    errors: {},
  }));
  vi.mocked(searchStocks).mockResolvedValue({ results: [quote("TSLA", 250)] });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

function openMarket() {
  return render(
    <QueryClientProvider client={client}>
      <StockMarket onAsk={vi.fn()} onReturn={vi.fn()} onEducation={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("Bowl Street market data", () => {
  it("refreshes prices and featured watchlist cards every hour and stops after leaving", async () => {
    const view = openMarket();
    await advance(10);
    const leaders = screen.getByLabelText("Featured stocks from your watchlist");
    expect(within(leaders).getAllByRole("button")[0]).toHaveTextContent(
      "AAPL",
    );
    expect(within(leaders).getAllByRole("button")[0]).toHaveTextContent(
      "$200.00",
    );
    expect(getStockQuotes).toHaveBeenCalledTimes(1);
    vi.mocked(getStockQuotes).mockImplementation(async (symbols) => ({
      quotes: symbols.map((symbol) => quote(symbol, 210)),
      errors: {},
    }));
    await advance(3_599_000);
    expect(getStockQuotes).toHaveBeenCalledTimes(1);
    expect(getMarketRanking).not.toHaveBeenCalled();
    await advance(1_020);
    expect(getStockQuotes).toHaveBeenCalledTimes(2);
    expect(getMarketRanking).not.toHaveBeenCalled();
    expect(within(leaders).getAllByRole("button")[1]).toHaveTextContent("MSFT");
    expect(within(leaders).getAllByRole("button")[1]).toHaveTextContent("$210.00");
    view.unmount();
    await advance(7_200_000);
    expect(getStockQuotes).toHaveBeenCalledTimes(2);
    expect(getMarketRanking).not.toHaveBeenCalled();
  });

  it("debounces company searches and loads a selected result's quote", async () => {
    openMarket();
    await advance(10);
    fireEvent.change(screen.getByLabelText("Stock ticker search"), {
      target: { value: "Tes" },
    });
    await advance(200);
    fireEvent.change(screen.getByLabelText("Stock ticker search"), {
      target: { value: "Tesla" },
    });
    await advance(300);
    expect(searchStocks).not.toHaveBeenCalled();
    await advance(60);
    expect(searchStocks).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchStocks).mock.calls[0]?.[0]).toBe("Tesla");
    await advance(10); // Flush the query notification after the debounced render.
    fireEvent.click(screen.getByRole("button", { name: "TSLA · Tesla Inc" }));
    await advance(20);
    expect(
      screen.getByRole("heading", { name: "Tesla Inc" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$250.00")).toBeInTheDocument();
  });

  it("retains a failed refresh's last price and prevents practice trades with it", async () => {
    openMarket();
    await advance(10);
    expect(screen.getByRole("button", { name: "Buy" })).toBeEnabled();
    vi.mocked(getStockQuotes).mockRejectedValue(
      new Error("Price update unavailable"),
    );
    await advance(3_600_020);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Showing the last received price",
    );
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });
});
