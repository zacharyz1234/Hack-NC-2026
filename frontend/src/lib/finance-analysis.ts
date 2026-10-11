import type { Transaction } from "./finance";

export function newestFirst(rows: Transaction[]) {
  return [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
}
export function monthlyAnalysis(
  rows: Transaction[],
  month: string,
  on = new Date(),
) {
  const cutoff = `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}-${String(on.getDate()).padStart(2, "0")}`;
  const selected = rows.filter(
    (t) =>
      t.account === "checking" &&
      t.date.startsWith(`${month}-`) &&
      t.date <= cutoff,
  );
  const categoryCents: Record<string, number> = Object.create(null);
  const dailyCents: Record<string, number> = Object.create(null);
  let incomeCents = 0;
  let spentCents = 0;
  for (const t of selected) {
    const amount = Math.round(t.amount * 100);
    if (amount > 0) incomeCents += amount;
    else {
      spentCents -= amount;
      categoryCents[t.category] = (categoryCents[t.category] ?? 0) - amount;
      dailyCents[t.date] = (dailyCents[t.date] ?? 0) - amount;
    }
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year!, monthNumber!, 0).getDate();
  return {
    income: incomeCents / 100,
    spent: spentCents / 100,
    net: (incomeCents - spentCents) / 100,
    categories: Object.entries(categoryCents)
      .map(([name, value]) => ({ name, value: value / 100 }))
      .sort((a, b) => b.value - a.value),
    daily: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      value:
        (dailyCents[`${month}-${String(i + 1).padStart(2, "0")}`] ?? 0) / 100,
    })),
    count: selected.length,
  };
}
export type ActivityFilters = {
  kind: string;
  search: string;
  category: string;
  account: string;
  from: string;
  to: string;
};
export function filterActivity(rows: Transaction[], filter: ActivityFilters) {
  return newestFirst(
    rows.filter(
      (t) =>
        (filter.kind === "all" ||
          (filter.kind === "purchases" ? t.amount < 0 : t.amount > 0)) &&
        t.merchant.toLowerCase().includes(filter.search.trim().toLowerCase()) &&
        (!filter.category || t.category === filter.category) &&
        (!filter.account ||
          (filter.account.startsWith("id:")
            ? t.accountId === Number(filter.account.slice(3))
            : t.account === filter.account)) &&
        (!filter.from || t.date >= filter.from) &&
        (!filter.to || t.date <= filter.to),
    ),
  );
}
