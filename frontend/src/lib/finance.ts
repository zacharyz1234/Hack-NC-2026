export type Transaction = {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  date: string;
  account: "checking" | "savings" | "unassigned" | "other";
  // set for signed-in students (data from the backend); absent in the guest demo ledger
  categoryId?: number | null;
  accountId?: number | null;
};
export const demoTransactions: Transaction[] = [
  {
    id: "1",
    merchant: "Campus Coffee",
    category: "Food & Drink",
    amount: -6.5,
    date: "2026-10-10",
    account: "checking",
  },
  {
    id: "2",
    merchant: "Spotify Premium",
    category: "Subscriptions",
    amount: -5.99,
    date: "2026-10-09",
    account: "checking",
  },
  {
    id: "3",
    merchant: "Trader Joe’s",
    category: "Groceries",
    amount: -42.8,
    date: "2026-10-09",
    account: "checking",
  },
  {
    id: "4",
    merchant: "Campus Bookstore",
    category: "Education",
    amount: -34.95,
    date: "2026-10-08",
    account: "checking",
  },
  {
    id: "5",
    merchant: "Part-time Paycheck",
    category: "Income",
    amount: 450,
    date: "2026-10-07",
    account: "checking",
  },
  {
    id: "6",
    merchant: "October Rent",
    category: "Housing",
    amount: -650,
    date: "2026-10-01",
    account: "checking",
  },
  {
    id: "7",
    merchant: "MetroCard",
    category: "Transport",
    amount: -34,
    date: "2026-10-02",
    account: "checking",
  },
  {
    id: "8",
    merchant: "Savings Deposit",
    category: "Savings",
    amount: 250,
    date: "2026-10-03",
    account: "savings",
  },
];
export const openingBalances = { checking: 2604.74, savings: 3000 };
export function balance(
  transactions: Transaction[],
  account: "checking" | "savings",
) {
  return (
    Math.round(
      (openingBalances[account] +
        transactions
          .filter((t) => t.account === account)
          .reduce((a, t) => a + t.amount, 0)) *
        100,
    ) / 100
  );
}
export function spending(transactions: Transaction[]) {
  return (
    Math.round(
      transactions
        .filter((t) => t.amount < 0 && t.account === "checking")
        .reduce((a, t) => a - t.amount, 0) * 100,
    ) / 100
  );
}
export function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
export const categories = [
  "Food & Drink",
  "Groceries",
  "Housing",
  "Education",
  "Transport",
  "Subscriptions",
  "Entertainment",
  "Income",
  "Savings",
];
export const stocks = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 227.55,
    change: 1.24,
    sector: "Technology",
    description:
      "Apple designs consumer electronics and services. Its revenue depends on device demand, services growth, and a global supply chain.",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    price: 416.32,
    change: 0.87,
    sector: "Technology",
    description:
      "Microsoft develops software and cloud services. Cloud demand, competition, and enterprise spending influence its business.",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    price: 132.65,
    change: 2.18,
    sector: "Semiconductors",
    description:
      "NVIDIA develops graphics processors and AI computing platforms. Growth expectations are high, and the stock can be volatile.",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    price: 165.27,
    change: -0.42,
    sector: "Communication",
    description:
      "Alphabet operates Google Search, advertising, and cloud services. Competition, regulation, and advertising demand are important risks.",
  },
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    price: 525.34,
    change: 0.63,
    sector: "Diversified ETF",
    description:
      "VOO holds large U.S. companies in the S&P 500. It offers broader diversification than a single stock, but can still lose value.",
  },
];
