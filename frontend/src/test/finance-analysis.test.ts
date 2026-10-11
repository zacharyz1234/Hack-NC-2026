import { describe, expect, it } from "vitest";
import { monthlyAnalysis, filterActivity } from "@/lib/finance-analysis";
import { demoTransactions, type Transaction } from "@/lib/finance";
const entry = (
  id: string,
  amount: number,
  date: string,
  category = "Food",
): Transaction => ({
  id,
  merchant: id,
  amount,
  date,
  category,
  account: "checking",
});
describe("monthly checking analysis", () => {
  it("reconciles daily and category totals while excluding savings and other months", () => {
    const result = monthlyAnalysis(
      [
        ...demoTransactions,
        entry("old", -100, "2026-09-30"),
        entry("future", -100, "2026-11-01"),
        { ...entry("savings", -99, "2026-10-10"), account: "savings" },
        { ...entry("unassigned", -80, "2026-10-10"), account: "unassigned" },
      ],
      "2026-10",
    );
    expect(result.income).toBe(450);
    expect(result.spent).toBe(774.24);
    expect(result.net).toBe(-324.24);
    expect(
      result.categories.reduce((s, c) => s + Math.round(c.value * 100), 0),
    ).toBe(77424);
    expect(
      result.daily.reduce((s, c) => s + Math.round(c.value * 100), 0),
    ).toBe(77424);
  });
  it("handles cents, uncategorized purchases, and month boundaries", () => {
    const result = monthlyAnalysis(
      [
        entry("a", -0.1, "2028-02-01", "Uncategorized"),
        entry("b", -0.2, "2028-02-29", "Uncategorized"),
        entry("c", -1, "2028-03-01"),
      ],
      "2028-02",
    );
    expect(result.spent).toBe(0.3);
    expect(result.daily).toHaveLength(29);
    expect(result.categories).toEqual([{ name: "Uncategorized", value: 0.3 }]);
  });
  it("returns zeros and a complete daily series for an empty month", () => {
    const result = monthlyAnalysis([], "2026-02");
    expect(result.daily).toHaveLength(28);
    expect(result.spent).toBe(0);
    expect(result.categories).toEqual([]);
  });
});
describe("activity filters", () => {
  it("combines merchant, account ID, category, date range, and purchase filters", () => {
    const rows = [
      { ...entry("Coffee", -10, "2026-10-01"), accountId: 2 },
      { ...entry("Coffee elsewhere", -20, "2026-10-02"), accountId: 1 },
      { ...entry("Coffee refund", 5, "2026-10-02"), accountId: 2 },
    ];
    expect(
      filterActivity(rows, {
        kind: "purchases",
        search: " coffee ",
        category: "Food",
        account: "id:2",
        from: "2026-10-01",
        to: "2026-10-02",
      }).map((t) => t.id),
    ).toEqual(["Coffee"]);
  });
  it("sorts all activity newest first and includes savings income when requested", () => {
    const rows = filterActivity(demoTransactions, {
      kind: "income",
      search: "",
      category: "",
      account: "",
      from: "",
      to: "",
    });
    expect(rows.map((t) => t.id)).toEqual(["5", "8"]);
  });
});
