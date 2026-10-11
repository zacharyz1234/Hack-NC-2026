import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  localDemoSummary,
  PeerBudgetComparison,
  type Peer,
  type Comparison,
} from "@/components/peer-budget-comparison";
import { monthlyAnalysis } from "@/lib/finance-analysis";
import type { Transaction } from "@/lib/finance";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  openGill: vi.fn(),
  loadBudget: vi.fn(),
  finance: {
    user: null as null | { id: number },
    transactions: [] as Transaction[],
  },
}));
vi.mock("@/lib/api", () => ({
  api: mocks.api,
  cents: (value: number) => Math.round(value * 100),
}));
vi.mock("@/lib/finance-context", () => ({
  useFinance: () => ({ ...mocks.finance, loadBudget: mocks.loadBudget }),
}));
vi.mock("@/lib/gill-navigation-context", () => ({
  useGillNavigation: () => ({ openGill: mocks.openGill }),
}));

function profile(income: number, month: string): Peer {
  return {
    id: `peer-shared_rental-${income}`,
    name: `Fictional student ${income}`,
    housing_label: "Shared rental",
    monthly_income_cents: income * 100,
    month,
    period_label: "Month-to-date",
    as_of: `${month}-10`,
    updated_at: null,
    match_explanation: "Same housing: Shared rental. Closest income.",
    source: "Fictional sample data",
    income_cents: income * 100,
    budget_cents: 20000,
    spending_cents: 10000,
    net_cash_flow_cents: income * 100 - 10000,
    spending_percent_of_income: (100 / income) * 100,
    categories: [
      { category: "Groceries", budget_cents: 20000, spending_cents: 10000 },
    ],
  };
}
function comparison(id: string, month: string): Comparison {
  const peer = profile(Number(id.split("-").at(-1)), month);
  return {
    peer,
    you: {
      source: mocks.finance.user
        ? "Your recorded checking activity and saved budget"
        : "Local demo ledger",
      income_cents: 0,
      budget_cents: null,
      spending_cents: 1234,
      net_cash_flow_cents: -1234,
      spending_percent_of_income: null,
      categories: [
        { category: "Custom", budget_cents: null, spending_cents: 1234 },
      ],
    },
    categories: [
      {
        category: "Custom",
        your_budget_cents: null,
        your_spending_cents: 1234,
        their_budget_cents: null,
        their_spending_cents: 0,
        spending_difference_cents: 1234,
      },
      {
        category: "Groceries",
        your_budget_cents: null,
        your_spending_cents: 0,
        their_budget_cents: 20000,
        their_spending_cents: 10000,
        spending_difference_cents: -10000,
      },
    ],
    note: "Lower spending alone does not mean a better budget.",
  };
}
function find() {
  fireEvent.click(
    screen.getByRole("button", { name: "Find similar students" }),
  );
}
const entry = (
  id: string,
  amount: number,
  category: string,
  date = "2026-10-04",
  account: Transaction["account"] = "checking",
): Transaction => ({ id, amount, category, date, account, merchant: id });

beforeEach(() => {
  mocks.api.mockReset();
  mocks.openGill.mockReset();
  mocks.loadBudget.mockReset();
  mocks.finance.user = null;
  mocks.finance.transactions = [
    entry("Food", -12.34, "Food & Drink"),
    entry("Savings", -99, "Food & Drink", "2026-10-04", "savings"),
  ];
  mocks.loadBudget.mockResolvedValue({ "Food & Drink": 100 });
  mocks.api.mockImplementation(
    async (
      path: string,
      _method: string,
      body: { profile_id: string; month: string },
    ) =>
      path.endsWith("/matches")
        ? {
            profiles: [
              profile(2000, body.month),
              profile(1000, body.month),
              profile(3000, body.month),
            ],
          }
        : comparison(body.profile_id, body.month),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("fictional peer comparison", () => {
  it("keeps matching local until explicit submit, displays source and selectable profiles", async () => {
    render(<PeerBudgetComparison month="2026-10" />);
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Monthly income ($)"), {
      target: { value: "1500" },
    });
    fireEvent.change(screen.getByLabelText("Living arrangement"), {
      target: { value: "family_home" },
    });
    find();
    await screen.findByRole("table");
    expect(mocks.api).toHaveBeenCalledWith("/peer-budgets/matches", "POST", {
      month: "2026-10",
      monthly_income_cents: 150000,
      housing: "family_home",
    });
    const first = screen.getByRole("button", {
      name: /Fictional student 2000/,
    });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Fictional sample data").length).toBe(3);
    fireEvent.click(
      screen.getByRole("button", { name: /Fictional student 1000/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Fictional student 1000" }),
      ).toBeInTheDocument(),
    );
  });

  it("renders missing budgets, zero income, custom categories, differences and a scrollable table", async () => {
    render(<PeerBudgetComparison month="2026-10" />);
    find();
    const table = await screen.findByRole("table");
    const custom = within(table).getByRole("row", { name: /Custom/ });
    expect(within(custom).getAllByText("Not set")).toHaveLength(2);
    expect(within(custom).getByText("+$12.34")).toBeInTheDocument();
    expect(within(table).getByText("— (no income)")).toBeInTheDocument();
    expect(within(table).getByText("-$100.00")).toBeInTheDocument();
    const region = screen.getByRole("region", {
      name: "Student budget comparison",
    });
    expect(region).toHaveClass("peer-table-scroll");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByText(/Month-to-date through 2026-10-10/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lower spending alone/)).toBeInTheDocument();
  });

  it("sends only explicitly labeled guest checking data to Gill on button action", async () => {
    render(<PeerBudgetComparison month="2026-10" />);
    find();
    fireEvent.click(
      await screen.findByRole("button", { name: "Ask Gill to compare" }),
    );
    const [destination, question] = mocks.openGill.mock.calls[0]!;
    expect(destination).toBe("/spending");
    expect(question).toContain("get_demo_peer_budget_comparison");
    expect(question).toContain('"source":"Local demo ledger"');
    expect(question).toContain('"category":"Eating out"');
    expect(question).toContain('"spending_cents":1234');
    expect(question).not.toContain('"spending_cents":9900');
    expect(question).toContain("peer-shared_rental-2000");
    expect(question).toContain("2026-10");
    expect(question).toContain("not my personal finances");
  });

  it("keeps signed-in financial values out of Gill navigation and asks for permissions", async () => {
    mocks.finance.user = { id: 1 };
    render(<PeerBudgetComparison month="2026-10" />);
    find();
    fireEvent.click(
      await screen.findByRole("button", { name: "Ask Gill to compare" }),
    );
    const question: string = mocks.openGill.mock.calls[0]![1];
    expect(question).toContain("get_peer_budget_comparison");
    expect(question).toContain("request the existing permissions");
    expect(question).not.toContain("1234");
    expect(question).not.toContain("demo_summary");
    expect(mocks.api).toHaveBeenCalledWith("/peer-budgets/compare", "POST", {
      profile_id: "peer-shared_rental-2000",
      month: "2026-10",
    });
    expect(mocks.loadBudget).not.toHaveBeenCalled();
  });

  it("reuses form criteria for month changes and hides the previous comparison while loading", async () => {
    const { rerender } = render(<PeerBudgetComparison month="2026-10" />);
    find();
    await screen.findByRole("table");
    let finish: ((value: { profiles: Peer[] }) => void) | undefined;
    mocks.api.mockImplementation(
      (
        path: string,
        _method: string,
        body: { profile_id: string; month: string },
      ) =>
        path.endsWith("/matches")
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(comparison(body.profile_id, body.month)),
    );
    rerender(<PeerBudgetComparison month="2026-09" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask Gill to compare" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Monthly income ($)")).toHaveValue(2000);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/peer-budgets/matches", "POST", {
        month: "2026-09",
        housing: "shared_rental",
        monthly_income_cents: 200000,
      }),
    );
    finish!({ profiles: [profile(3000, "2026-09")] });
    await screen.findByRole("heading", { name: "Fictional student 3000" });
    fireEvent.click(
      screen.getByRole("button", { name: "Ask Gill to compare" }),
    );
    expect(mocks.openGill.mock.calls[0]![1]).toContain("2026-09");
  });

  it("refreshes a signed-in comparison after budget saves", async () => {
    mocks.finance.user = { id: 1 };
    const { rerender } = render(
      <PeerBudgetComparison month="2026-10" budgetRevision={0} />,
    );
    find();
    await screen.findByRole("table");
    const before = mocks.api.mock.calls.filter(([path]) =>
      path.endsWith("/compare"),
    ).length;
    rerender(<PeerBudgetComparison month="2026-10" budgetRevision={1} />);
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.filter(([path]) => path.endsWith("/compare"))
          .length,
      ).toBe(before + 1),
    );
    await screen.findByRole("table");
  });

  it("hides old matches when new matching inputs are submitted", async () => {
    render(<PeerBudgetComparison month="2026-10" />);
    find();
    await screen.findByRole("table");
    let finish: ((value: { profiles: Peer[] }) => void) | undefined;
    mocks.api.mockImplementation(
      (
        path: string,
        _method: string,
        body: { profile_id: string; month: string },
      ) =>
        path.endsWith("/matches")
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(comparison(body.profile_id, body.month)),
    );
    fireEvent.change(screen.getByLabelText("Monthly income ($)"), {
      target: { value: "1000" },
    });
    find();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask Gill to compare" }),
    ).not.toBeInTheDocument();
    finish!({ profiles: [profile(1000, "2026-10")] });
    await screen.findByRole("heading", { name: "Fictional student 1000" });
  });

  it("shows errors and supports explicit retry", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Service unavailable"));
    render(<PeerBudgetComparison month="2026-10" />);
    find();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry comparison" }));
    await screen.findByRole("table");
  });
});

it("normalizes only guest categories and uses month-to-date checking totals", () => {
  const result = monthlyAnalysis(
    [
      entry("meal", -10, "Food & Drink"),
      entry("custom", -3.45, "Custom"),
      entry("unknown", -1, "Uncategorized"),
      entry("future", -99, "Food & Drink", "2026-10-11"),
      entry("savings", 400, "Income", "2026-10-01", "savings"),
      entry("pay", 100, "Income"),
    ],
    "2026-10",
    new Date(2026, 9, 10),
  );
  const demo = localDemoSummary(result, {
    "Food & Drink": 20,
    Housing: 700,
    Transport: 0,
  });
  expect(demo.income_cents).toBe(10000);
  expect(demo.categories).toContainEqual({
    category: "Eating out",
    spending_cents: 1000,
    budget_cents: 2000,
  });
  expect(demo.categories).toContainEqual({
    category: "Custom",
    spending_cents: 345,
    budget_cents: null,
  });
  expect(demo.categories).toContainEqual({
    category: "Uncategorized",
    spending_cents: 100,
    budget_cents: null,
  });
  expect(demo.categories.map((c) => c.category)).toContain("Rent/Home");
  expect(demo.categories.reduce((sum, c) => sum + c.spending_cents, 0)).toBe(
    1445,
  );
});
