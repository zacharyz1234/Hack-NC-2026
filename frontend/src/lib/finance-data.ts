import {
  api,
  dollars,
  today,
  type Account,
  type ApiTransaction,
} from "@/lib/api";
import type { Transaction } from "@/lib/finance";

export function fromApiTransaction(t: ApiTransaction): Transaction {
  const type = t.account_type?.toLowerCase();
  return {
    id: t.id,
    merchant: t.description ?? "(no description)",
    category: t.category ?? "Uncategorized",
    amount: dollars(t.amount_cents),
    date: t.date.slice(0, 10),
    account:
      type === "checking" || type === "savings"
        ? type
        : t.account_id === null
          ? "unassigned"
          : "other",
    accountId: t.account_id,
    categoryId: t.category_id,
  };
}
export async function loadAllTransactions(): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await api<{ transactions: ApiTransaction[] }>(
      `/transactions?limit=200&offset=${offset}`,
    );
    rows.push(...page.transactions.map(fromApiTransaction));
    if (page.transactions.length < 200) return rows;
  }
}
export function newTransaction(
  accounts: Account[],
  signedIn: boolean,
  kind: "checking" | "savings" = "checking",
): Transaction {
  const account = accounts.find((a) => a.type.toLowerCase() === kind);
  return {
    id: "",
    merchant: "",
    amount: 0,
    date: today(),
    category: "Uncategorized",
    account: signedIn && !account ? "unassigned" : kind,
    accountId: account?.id ?? null,
  };
}
