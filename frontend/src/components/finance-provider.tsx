import { FinanceContext } from "@/lib/finance-context";
import { fromApiTransaction, loadAllTransactions } from "@/lib/finance-data";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  cents,
  dollars,
  getToken,
  onAuthChange,
  type Account,
  type ApiTransaction,
  type BudgetLimit,
  type Category,
  type Goal,
  type SyncResult,
  type User,
} from "@/lib/api";
import {
  balance,
  categories as demoCategories,
  demoTransactions,
  type Transaction,
} from "@/lib/finance";
import { loadQuipsEnabled, saveQuipsEnabled } from "@/lib/gill-quips";

export const DEMO_MONTH = "2026-10";
const demoGoal: Goal = {
  id: 0,
  name: "Summer adventure fund",
  target_cents: 200000,
  saved_cents: 125000,
  target_date: null,
};
const demoBudget = {
  "Food & Drink": 200,
  Groceries: 200,
  Housing: 700,
  Education: 100,
  Transport: 100,
  Subscriptions: 50,
};
export type Budget = Record<string, number>;
export type GoalDraft = Pick<Goal, "name" | "target_cents" | "saved_cents">;

function useFinanceState() {
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] =
    useState<Transaction[]>(demoTransactions);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apiCategories, setApiCategories] = useState<Category[]>([]);
  const [goal, setGoal] = useState<Goal | null>(demoGoal);
  const [budgets, setBudgets] = useState<Record<string, Budget>>({
    [DEMO_MONTH]: demoBudget,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bankNotice, setBankNotice] = useState("");
  const [muted, setMuted] = useState(false);
  const [quipsOn, setQuipsOn] = useState(true);
  const generation = useRef(0);
  const resetDemo = useCallback(() => {
    setTransactions(demoTransactions);
    setAccounts([]);
    setApiCategories([]);
    setGoal(demoGoal);
    setBudgets({ [DEMO_MONTH]: demoBudget });
    setError("");
    setBankNotice("");
  }, []);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    const token = getToken();
    const active = () => request === generation.current && token === getToken();
    setLoading(true);
    setError("");
    try {
      // A failed authenticated request must not silently show demo data.
      const me = token ? await api<User>("/auth/me") : null;
      if (!active()) return;
      setUser(me);
      if (!me) {
        resetDemo();
        return;
      }
      const [acc, tx, cats, goals] = await Promise.all([
        api<{ accounts: Account[] }>("/accounts"),
        loadAllTransactions(),
        api<{ categories: Category[] }>("/categories"),
        api<{ goals: Goal[] }>("/savings-goals"),
      ]);
      if (!active()) return;
      setAccounts(acc.accounts);
      setTransactions(tx);
      setApiCategories(cats.categories);
      setGoal(goals.goals[0] ?? null);
      setBudgets({});
    } catch (e) {
      if (active())
        setError(
          e instanceof Error ? e.message : "Couldn't load your money data.",
        );
    } finally {
      if (active()) setLoading(false);
    }
  }, [resetDemo]);
  useEffect(() => {
    setQuipsOn(loadQuipsEnabled());
    void reload();
    const unsubscribe = onAuthChange(() => {
      setUser(null);
      setAccounts([]);
      setTransactions([]);
      setGoal(null);
      setBudgets({});
      setBankNotice("");
      void reload();
    });
    return () => {
      unsubscribe();
      generation.current++;
    };
  }, [reload]);
  function toggleQuips() {
    setQuipsOn((value) => {
      saveQuipsEnabled(!value);
      return !value;
    });
  }
  const categories = user ? apiCategories.map((c) => c.name) : demoCategories;
  function accountBalance(type: "checking" | "savings") {
    return user
      ? dollars(
          accounts
            .filter((a) => a.type.toLowerCase() === type)
            .reduce((sum, a) => sum + a.balance_cents, 0),
        )
      : balance(transactions, type);
  }
  async function saveTransaction(t: Transaction) {
    if (!user) {
      t = { ...t, category: t.amount > 0 ? "Income" : t.category };
      setTransactions((rows) =>
        t.id
          ? rows.map((row) => (row.id === t.id ? t : row))
          : [{ ...t, id: crypto.randomUUID() }, ...rows],
      );
      return;
    }
    const version = generation.current;
    const result = await api<ApiTransaction>(
      t.id ? `/transactions/${t.id}` : "/transactions",
      t.id ? "PATCH" : "POST",
      {
        description: t.merchant.trim(),
        amount_cents: cents(t.amount),
        date: t.date,
        category_id:
          t.amount < 0
            ? (apiCategories.find((c) => c.name === t.category)?.id ?? null)
            : null,
        account_id: t.accountId ?? null,
      },
    );
    if (version === generation.current)
      setTransactions((rows) =>
        t.id
          ? rows.map((row) =>
              row.id === t.id ? fromApiTransaction(result) : row,
            )
          : [fromApiTransaction(result), ...rows],
      );
  }
  async function deleteTransaction(id: string) {
    const version = generation.current;
    if (user) await api(`/transactions/${id}`, "DELETE");
    if (version === generation.current)
      setTransactions((rows) => rows.filter((t) => t.id !== id));
  }
  async function saveGoal(draft: GoalDraft) {
    const version = generation.current;
    const result = user
      ? await api<Goal>(
          goal?.id ? `/savings-goals/${goal.id}` : "/savings-goals",
          goal?.id ? "PATCH" : "POST",
          draft,
        )
      : { ...draft, id: 0, target_date: null };
    if (version === generation.current) setGoal(result);
  }
  const loadBudget = useCallback(
    async (month: string): Promise<Budget> => {
      if (!user) return budgets[month] ?? {};
      const result = await api<{ limits: BudgetLimit[] }>(`/budgets/${month}`);
      return Object.fromEntries(
        result.limits.map((l) => [l.category, dollars(l.limit_cents)]),
      );
    },
    [user, budgets],
  );
  async function saveBudget(month: string, draft: Budget) {
    const version = generation.current;
    if (user)
      await api(`/budgets/${month}`, "PUT", {
        limits: apiCategories.map((c) => ({
          category_id: c.id,
          limit_cents: cents(draft[c.name] ?? 0),
        })),
      });
    if (version === generation.current)
      setBudgets((values) => ({ ...values, [month]: draft }));
  }
  async function syncBank() {
    const version = generation.current;
    const result = await api<SyncResult>(
      accounts.length ? "/nessie/sync" : "/nessie/connect-demo",
      "POST",
    );
    if (version !== generation.current) return "";
    setBankNotice(
      `Synced ${result.accounts} accounts and ${result.expenses_added} new purchases.${result.warnings.length ? ` ${result.warnings.join("; ")}` : ""}`,
    );
    await reload();
    return `Synced ${result.accounts} accounts and ${result.expenses_added} new purchases.${result.warnings.length ? ` ${result.warnings.join("; ")}` : ""}`;
  }
  return {
    user,
    transactions,
    accounts,
    categories,
    goal,
    loading,
    error,
    bankNotice,
    muted,
    setMuted,
    quipsOn,
    toggleQuips,
    resetDemo,
    reload,
    accountBalance,
    saveTransaction,
    deleteTransaction,
    saveGoal,
    loadBudget,
    saveBudget,
    syncBank,
  };
}
export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceState();
  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export type FinanceState = ReturnType<typeof useFinanceState>;
