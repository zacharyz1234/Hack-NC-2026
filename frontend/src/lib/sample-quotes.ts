// TEMPORARY: made-up prices the taskbar ticker shows when live quotes can't load (for example,
// no TWELVE_DATA_API_KEY on the backend). Not real market data; the ticker labels them DEMO.
// Delete this file and its use in components/taskbar.tsx once a key is always configured.
import type { StockQuote } from "@/lib/market";

const sample = (
  symbol: string,
  name: string,
  exchange: string,
  price: number,
  change: number,
): StockQuote => ({
  symbol,
  name,
  exchange,
  currency: "USD",
  price,
  change,
  as_of: 0,
  market_open: false,
  updated_at: "",
});

export const SAMPLE_QUOTES: StockQuote[] = [
  sample("AAPL", "Apple Inc.", "NASDAQ", 227.55, 1.24),
  sample("MSFT", "Microsoft Corporation", "NASDAQ", 418.32, 0.62),
  sample("NVDA", "NVIDIA Corporation", "NASDAQ", 131.4, 2.87),
  sample("GOOGL", "Alphabet Inc.", "NASDAQ", 164.18, -0.41),
  sample("AMZN", "Amazon.com, Inc.", "NASDAQ", 186.51, 1.05),
  sample("META", "Meta Platforms, Inc.", "NASDAQ", 589.95, -1.12),
  sample("TSLA", "Tesla, Inc.", "NASDAQ", 238.77, 3.46),
  sample("VOO", "Vanguard S&P 500 ETF", "NYSE ARCA", 527.14, 0.38),
  sample("SPY", "SPDR S&P 500 ETF Trust", "NYSE ARCA", 573.17, 0.37),
  sample("QQQ", "Invesco QQQ Trust", "NASDAQ", 492.59, 0.71),
  sample("NFLX", "Netflix, Inc.", "NASDAQ", 721.08, -0.86),
  sample("AMD", "Advanced Micro Devices, Inc.", "NASDAQ", 167.89, 1.93),
  sample("DIS", "The Walt Disney Company", "NYSE", 94.66, -0.27),
  sample("NKE", "NIKE, Inc.", "NYSE", 81.35, -1.58),
  sample("SBUX", "Starbucks Corporation", "NASDAQ", 97.42, 0.54),
  sample("KO", "The Coca-Cola Company", "NYSE", 70.11, -0.19),
  sample("JPM", "JPMorgan Chase & Co.", "NYSE", 212.83, 0.88),
  sample("V", "Visa Inc.", "NYSE", 279.6, 0.15),
  sample("COST", "Costco Wholesale Corporation", "NASDAQ", 893.25, -0.33),
  sample("WMT", "Walmart Inc.", "NYSE", 80.94, 0.47),
];
