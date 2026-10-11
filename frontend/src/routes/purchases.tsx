import { newTransaction } from "@/lib/finance-data";
import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useState } from "react";
import { ShoppingBasket, Search } from "lucide-react";
import { FinanceLayout } from "@/components/finance-layout";
import { useFinance } from "@/lib/finance-context";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";
import {
  ActivityTable,
  AddTransactionButton,
  TransactionEditor,
} from "@/components/transaction-editor";
import { filterActivity } from "@/lib/finance-analysis";
import { money, type Transaction } from "@/lib/finance";

export const Route = createFileRoute("/purchases")({
  validateSearch: (
    search: SearchSchemaInput & { kind?: string; account?: string },
  ) => ({
    kind: ["all", "income"].includes(search.kind ?? "")
      ? search.kind!
      : "purchases",
    account:
      ["checking", "savings", "unassigned", "other"].includes(
        search.account ?? "",
      ) || /^id:\d+$/.test(search.account ?? "")
        ? search.account!
        : "",
  }),
  head: () => ({ meta: [{ title: "Recent Purchases — Bowl Street Journal" }] }),
  component: PurchasesPage,
});
function PurchasesPage() {
  const search = Route.useSearch();
  return (
    <FinanceLayout
      path="/purchases"
      title="The little things add up."
      description="Find a purchase, follow your deposits, or tidy up your recent activity."
    >
      <PurchasesContent
        key={`${search.kind}:${search.account}`}
        initialKind={search.kind}
        initialAccount={search.account}
      />
    </FinanceLayout>
  );
}
function PurchasesContent({
  initialKind,
  initialAccount,
}: {
  initialKind: string;
  initialAccount: string;
}) {
  const { user, accounts, categories, transactions } = useFinance();
  const [kind, setKind] = useState(initialKind);
  const [account, setAccount] = useState(initialAccount);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [edit, setEdit] = useState<Transaction | null>(null);
  const invalidRange = !!from && !!to && from > to;
  const rows = invalidRange
    ? []
    : filterActivity(transactions, {
        kind,
        account,
        search,
        category,
        from,
        to,
      });
  const total =
    rows.reduce((sum, t) => sum + Math.round(t.amount * 100), 0) / 100;
  return (
    <XPWindow title="Your activity ledger" icon={<ShoppingBasket size={15} />}>
      <div className="finance-section-bar">
        <div className="activity-tabs" role="group" aria-label="Activity type">
          {[
            ["purchases", "Purchases"],
            ["income", "Income"],
            ["all", "All activity"],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={kind === value ? "aero" : "soft"}
              aria-pressed={kind === value}
              onClick={() => setKind(value!)}
            >
              {label}
            </Button>
          ))}
        </div>
        <AddTransactionButton
          onClick={() =>
            setEdit(
              newTransaction(
                accounts,
                !!user,
                account === "savings" ? "savings" : "checking",
              ),
            )
          }
        />
      </div>
      <div className="activity-filters">
        <label className="merchant-search">
          <span>
            <Search size={14} />
            Merchant / description
          </span>
          <input
            className="xp-input"
            type="search"
            placeholder="Find a transaction…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            className="xp-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[
              ...new Set([
                ...categories,
                ...transactions.map((t) => t.category),
              ]),
            ]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
        </label>
        <label>
          Account
          <select
            className="xp-input"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">All accounts</option>
            <option value="checking">All checking</option>
            <option value="savings">All savings</option>
            {user && (
              <>
                <option value="unassigned">Unassigned</option>
                <option value="other">Other accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={`id:${a.id}`}>
                    {a.nickname || a.type} · #{a.id}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <label>
          From
          <input
            className="xp-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            className="xp-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button
          variant="soft"
          onClick={() => {
            setSearch("");
            setCategory("");
            setAccount("");
            setFrom("");
            setTo("");
          }}
        >
          Clear filters
        </Button>
      </div>
      {invalidRange && (
        <p role="alert" className="negative">
          Choose an end date on or after the start date.
        </p>
      )}
      <div className="activity-summary" role="status">
        <span>
          {rows.length} {rows.length === 1 ? "transaction" : "transactions"} ·
          newest first
        </span>
        <strong>
          {kind === "purchases"
            ? "Total spent"
            : kind === "income"
              ? "Total income"
              : "Net activity"}
          : {money(kind === "purchases" ? -total : total)}
        </strong>
      </div>
      <ActivityTable rows={rows} onEdit={setEdit} />
      {edit && (
        <TransactionEditor transaction={edit} onClose={() => setEdit(null)} />
      )}
    </XPWindow>
  );
}
