import { useFinance } from "@/lib/finance-context";
import { focusPageHeading } from "@/lib/page-focus";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wallet,
  PieChart,
  ShoppingBasket,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { XPWindow } from "@/components/xp-window";
import { StockMarket } from "@/components/stock-market";
import { GillCompanion } from "@/components/gill-companion";
import { useGillNavigation } from "@/lib/gill-navigation-context";
import { DEMO_MONTH } from "@/components/finance-provider";
import { FinanceDataBoundary } from "@/components/finance-layout";
import { money, spending } from "@/lib/finance";
import { thisMonth } from "@/lib/api";
import { lessons } from "@/lib/education";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Bowl Street Journal — Making Sense of Your Money" }],
  }),
  component: Index,
});
function Index() {
  const [stockView, setStockView] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const reducedMotion = useReducedMotion();
  const transitionBubbles = useMemo(() => {
    const rand = (count: number, phase: "out" | "in") =>
      Array.from({ length: count }, () => ({
        left: -10 + Math.random() * 100,
        size: 18 + Math.random() * 26,
        // Out wave rises and fades away first; in wave spawns from mid-screen
        // just as the turquoise cover starts fading back out, drifting slowly
        // upward so it reads as a continuation.
        delay: phase === "out" ? Math.random() * 0.2 : 1.45 + Math.random() * 0.3,
        duration: phase === "out" ? 1.1 + Math.random() * 0.4 : 2.6 + Math.random() * 0.6,
        bottom: phase === "out" ? -60 : 35 + Math.random() * 20,
        phase,
      }));
    return [...rand(9, "out"), ...rand(9, "in")];
  }, []);
  const [chat, setChat] = useState(false);
  const [question, setQuestion] = useState("");
  const [muted, setMuted] = useState(true);
  const [quipsOn, setQuipsOn] = useState(true);
  useEffect(() => setQuipsOn(loadQuipsEnabled()), []); // read after mount so server and client markup match
  function toggleQuips() {
    setQuipsOn(!quipsOn);
    saveQuipsEnabled(!quipsOn);
  }
  const [user, setUser] = useState<User | null>(null);
  const userId = user?.id ?? null;
  const [goalId, setGoalId] = useState<number | null>(null);
  const [goalName, setGoalName] = useState("Summer adventure fund");
  const [goal, setGoal] = useState(2000);
  const [saved, setSaved] = useState(1250);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("All");
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [budget, setBudget] = useState<Record<string, number>>({
    "Food & Drink": 200,
    Groceries: 200,
    Housing: 700,
    Education: 100,
    Transport: 100,
    Subscriptions: 50,
  });
  // Signed in: real data from the backend. Guests keep the demo ledger above.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apiCategories, setApiCategories] = useState<Category[]>([]);
  const [consents, setConsents] = useState<ConsentStatus[]>([]);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState("2:48 PM");
  const categories = user ? apiCategories.map((c) => c.name) : demoCategories;
  const categoryId = (name: string) => apiCategories.find((c) => c.name === name)?.id ?? null;
  async function loadData() {
    try {
      const [acc, tx, cats, limits, goals, perms] = await Promise.all([
        api<{ accounts: Account[] }>("/accounts"),
        api<{ transactions: ApiTransaction[] }>("/transactions"),
        api<{ categories: Category[] }>("/categories"),
        api<{ limits: BudgetLimit[] }>(`/budgets/${thisMonth()}`),
        api<{ goals: Goal[] }>("/savings-goals"),
        api<{ consents: ConsentStatus[] }>("/consents"),
      ]);
      setAccounts(acc.accounts);
      setTransactions(
        tx.transactions.map((t) => ({
          id: t.id,
          merchant: t.description ?? "(no description)",
          category: t.category ?? "Uncategorized",
          amount: dollars(t.amount_cents),
          date: t.date.slice(0, 10),
          account: t.account_type?.toLowerCase() === "savings" ? "savings" : "checking",
          categoryId: t.category_id,
          accountId: t.account_id,
        })),
      );
      setApiCategories(cats.categories);
      setBudget(Object.fromEntries(limits.limits.map((l) => [l.category, dollars(l.limit_cents)])));
      const first = goals.goals[0];
      setGoalId(first?.id ?? null);
      setGoalName(first?.name ?? "");
      setGoal(first ? dollars(first.target_cents) : 0);
      setSaved(first ? dollars(first.saved_cents) : 0);
      setConsents(perms.consents);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't load your money data.");
    }
  }
  function resetDemo() {
    setAccounts([]);
    setTransactions(demoTransactions);
    setGoalId(null);
    setSaved(1250);
    setGoal(2000);
    setGoalName("Summer adventure fund");
  }
  async function refreshUser() {
    const me = await currentUser();
    setUser(me);
    if (me) await loadData();
    else resetDemo();
  }
  useEffect(() => {
    refreshUser();
    const unsubscribe = onAuthChange(refreshUser);
    const timer = setInterval(
      () =>
        setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })),
      60000,
    );
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // permissions change inside the chat, so refresh them whenever Settings opens
    if (modal === "Settings" && user)
      api<{ consents: ConsentStatus[] }>("/consents")
        .then((r) => setConsents(r.consents))
        .catch(() => undefined);
  }, [modal, user]);
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModal(null);
        setChat(false);
      }
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const accountBalance = (type: string) =>
    dollars(accounts.filter((a) => a.type.toLowerCase() === type).reduce((sum, a) => sum + a.balance_cents, 0));
  const checking = user ? accountBalance("checking") : balance(transactions, "checking");
  const savings = user ? accountBalance("savings") : balance(transactions, "savings");
  const monthTransactions = transactions.filter((t) => t.date.startsWith(thisMonth()));
  const spent = spending(user ? monthTransactions : transactions);
  const filtered = transactions.filter(
    (t) =>
      (category === "All" || t.category === category) &&
      `${t.merchant} ${t.category}`.toLowerCase().includes(filter.toLowerCase()),
  );
  function enterStocks() {
    if (transitioning) return;
    setTransitioning(true);
    // Swap pages while the turquoise cover fully hides the screen (it reaches
    // full opacity ~1.1s in); clear the overlay once the incoming bubbles finish.
    setTimeout(() => {
      setStockView(true);
    }, reducedMotion ? 100 : 1200);
    setTimeout(() => {
      setTransitioning(false);
    }, reducedMotion ? 100 : 5200);
  }
  function ask(q = "") {
    setQuestion(q);
    setChat(true);
  }
  function navigate(name: string) {
    if (name === "Home") {
      setStockView(false);
      setModal(null);
    } else if (name === "Stocks") enterStocks();
    else setModal(name);
  }
  function signedIn() {
    setModal(null); // login() fires onAuthChange, which reloads the data
  }
  function newTransaction(account: "checking" | "savings" = "checking") {
    setEdit({
      id: "",
      merchant: "",
      category: user ? (categories[0] ?? "") : account === "savings" ? "Savings" : "Food & Drink",
      amount: 0,
      date: today(),
      account,
    });
    setModal("Add transaction");
  }
  // Signed in: save through the backend, then reload. Guests: edit the demo ledger in memory.
  async function saveTransaction(t: Transaction) {
    if (!user) {
      setTransactions((prev) =>
        t.id ? prev.map((x) => (x.id === t.id ? t : x)) : [{ ...t, id: crypto.randomUUID() }, ...prev],
      );
      return;
    }
    const accountId = accounts.find((a) => a.type.toLowerCase() === t.account)?.id ?? null;
    const body = {
      description: t.merchant,
      amount_cents: cents(t.amount),
      date: t.date,
      category_id: t.amount < 0 ? categoryId(t.category) : null,
      account_id: accountId,
    };
    await api(t.id ? `/transactions/${t.id}` : "/transactions", t.id ? "PATCH" : "POST", body);
    await loadData();
  }
  async function deleteTransaction(id: string) {
    if (user) {
      await api(`/transactions/${id}`, "DELETE");
      await loadData();
    } else setTransactions((prev) => prev.filter((t) => t.id !== id));
  }
  async function saveBudget(name: string, limit: number) {
    const id = categoryId(name);
    if (!user || id === null) return;
    await api(`/budgets/${thisMonth()}`, "PUT", { limits: [{ category_id: id, limit_cents: cents(limit) }] }).catch(
      (e: Error) => setNotice(e.message),
    );
  }
  async function saveGoal() {
    if (!user || !goalName.trim() || goal <= 0) return;
    const body = { name: goalName, target_cents: cents(goal), saved_cents: cents(saved) };
    try {
      const result = await api<Goal>(goalId ? `/savings-goals/${goalId}` : "/savings-goals", goalId ? "PATCH" : "POST", body);
      setGoalId(result.id);
      setNotice("Goal saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't save the goal.");
    }
  }
  async function bankAction(path: "/nessie/connect-demo" | "/nessie/sync") {
    setNotice("Talking to the bank…");
    try {
      const result = await api<SyncResult>(path, "POST");
      setNotice(
        `Synced ${result.accounts} accounts, ${result.expenses_added} new purchases, ${result.income_added} new deposits.` +
          (result.warnings.length ? ` (${result.warnings.join("; ")})` : ""),
      );
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Bank sync failed.");
    }
  }
  async function revokeConsent(scope: string) {
    await api(`/consents/${scope}`, "DELETE").catch((e: Error) => setNotice(e.message));
    await loadData();
  }
  function table(rows: Transaction[], editable = false) {
    return (
      <table className="transaction-table">
        <thead>
          <tr>
            <th>MERCHANT</th>
            <th>DATE</th>
            <th className="category-col">CATEGORY</th>
            <th>AMOUNT</th>
            {editable && <th>EDIT</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const Icon = merchantIcons[t.category] ?? Wallet;
            return (
              <tr key={t.id}>
                <td>
                  <div className="merchant">
                    <span className="merchant-icon">
                      <Icon />
                    </span>
                    {t.merchant}
                  </div>
                </td>
                <td>
                  {new Date(`${t.date}T12:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="category-col">
                  <span className="category-tag">{t.category}</span>
                </td>
                <td className={t.amount > 0 ? "positive" : ""}>
                  {t.amount > 0 ? "+" : "−"}
                  {money(Math.abs(t.amount))}
                </td>
                {editable && (
                  <td>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${t.merchant}`}
                      onClick={() => {
                        setEdit(t);
                        setModal("Edit transaction");
                      }}
                    >
                      <Pencil />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  const card = (
    title: string,
    value: string,
    icon: ReactNode,
    kind: string,
    detail: ReactNode,
    action: string,
  ) => (
    <Button variant="ghost" className="account-card" onClick={() => setModal(action)}>
      <div className="account-top">
        <span className={`account-icon ${kind}`}>{icon}</span>
        {title}
        <ChevronRight />
      </div>
      <div className="account-value">{value}</div>
      {detail}
    </Button>
  );
  return (
    <>
      {stockView ? (
        <StockMarket
          onReturn={() => setStockView(false)}
          onAsk={(q) => openGill("/", q)}
          onEducation={() => setEducation(true)}
        />
      ) : (
        <div className="desktop-grid home-grid">
          <div className="center-dashboard">
            <XPWindow
              title="My Money — Bowl Street Journal"
              className="money-window"
              icon={<Wallet size={15} />}
              footer={moneyOpen &&
                <>
                  <span>
                    <ShieldCheck size={10} className="inline mr-1" />
                    {user ? "Capital One Nessie sandbox • Not a real bank" : "Demo accounts • Not connected to a bank"}
                  </span>
                  <span>All systems swimming</span>
                </>
              }
            >
              <div className="section-heading">
                <h2>A little clarity. A lot of possibility.</h2>
                <span className="badge-demo">{user ? "SANDBOX BANK" : "DEMO MODE"}</span>
              </div>
              <p className="welcome-note">
                Welcome back, {user?.display_name || "student"}. Here’s how your money is doing.
              </p>
              {notice && (
                <p className="welcome-note" role="status">
                  {notice}
                </p>
              )}
              {user && !accounts.length && (
                <div className="saving-row mb-4">
                  <span className="text-xs">No bank linked yet. Get a sandbox bank with sample accounts and purchases.</span>
                  <Button variant="green" size="sm" onClick={() => bankAction("/nessie/connect-demo")}>
                    Connect demo bank
                  </Button>
                </div>
              )}
              <div className="account-grid">
                {card(
                  "Checking Account",
                  money(checking),
                  <Wallet />,
                  "",
                  <div className="account-bottom">
                    <Check size={11} />
                    Available to spend <span className="ml-auto">•••• 2048</span>
                  </div>,
                  "Checking Account",
                )}
                {card(
                  "Savings Account",
                  money(savings),
                  <PiggyBank />,
                  "green",
                  <div className="account-bottom">
                    <ArrowUpRight size={12} className="positive" />
                    <span className="positive">+{money(250)} this month</span>
                  </div>,
                  "Savings",
                )}
                {card(
                  "Spending Analysis",
                  money(spent),
                  <PieChart />,
                  "",
                  <div className="account-bottom">
                    Spent this October <span className="ml-auto positive">Within budget</span>
                  </div>,
                  "Spending",
                )}
                {card(
                  "Recent Purchases",
                  `${transactions.filter((t) => t.amount < 0).length} purchases`,
                  <ShoppingBasket />,
                  "orange",
                  <div className="account-bottom">
                    Your latest transactions <ChevronRight size={12} className="ml-auto" />
                  </div>,
                  "Recent Purchases",
                )}
              </div>
              <Button variant="soft" className="money-disclosure" aria-expanded={moneyOpen} aria-controls="money-details" onClick={() => setMoneyOpen((open) => !open)}>
                More Info <ChevronDown className={moneyOpen ? "rotate-180" : ""} />
              </Button>
              <div id="money-details" hidden={!moneyOpen}>
              <section className="dashboard-section">
                <div className="subheading">
                  <h3>
                    <Wallet size={15} />
                    Recent transactions
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="link" className="tiny-link" onClick={() => newTransaction()}>
                      <Plus size={12} />
                      Add
                    </Button>
                    <Button
                      variant="link"
                      className="tiny-link"
                      onClick={() => setModal("Recent Purchases")}
                    >
                      View all <ChevronRight />
                    </Button>
                  </div>
                </div>
                {table(transactions.slice(0, 5))}
              </section>
              <section className="dashboard-section">
                <div className="subheading">
                  <h3>
                    <Target size={16} />A little closer to your goals
                  </h3>
                  <Button variant="link" className="tiny-link" onClick={() => setModal("Savings")}>
                    Manage goals <ChevronRight />
                  </Button>
                </div>
                <div className="saving-row">
                  <span className="account-icon green">
                    <PiggyBank />
                  </span>
                  <div className="saving-info">
                    <div className="flex justify-between">
                      <strong>{goalName}</strong>
                      <strong>{Math.min(100, Math.round((saved / goal) * 100))}%</strong>
                    </div>
                    <p>
                      {money(saved)} saved of {money(goal)}
                    </p>
                    <div className="card-progress">
                      <span style={{ width: `${Math.min(100, (saved / goal) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </section>
              <div className="flex items-center justify-between mt-5">
                <span className="text-[10px] text-muted-foreground">
                  Small steps. Bigger possibilities.
                </span>
                <Button variant="aero" size="sm" onClick={() => setModal("Budgeting")}>
                  <PieChart />
                  Plan my budget
                </Button>
              </div>
              </div>
            </XPWindow>
          </div>
          <aside className="market-side">
            <Button
              variant="ghost"
              className="city-destination"
              onClick={() => transition(() => setStockView(true))}
              aria-label="Enter Bowl Street stock market"
            >
              <div className="city-overlay">
                <strong>Take a trip to Bowl Street</strong>
              </div>
            </Button>
          </aside>
          <GillCompanion returnTo="/">
            <XPWindow
              title="A peek at the market"
              icon={<TrendingUp size={12} />}
              className="market-preview market-mini"
            >
              {[
                ["S&P 500", "+0.63%"],
                ["NASDAQ", "+0.91%"],
                ["Dow", "+0.47%"],
              ].map(([name, change]) => (
                <div className="market-mini-row" key={name}>
                  <strong>{name}</strong>
                  <span className="positive">↗ {change}</span>
                </div>
              ))}
            </XPWindow>
            <div className="gill-tip-wrap">
              <span className="gill-tip-solid" aria-hidden />
              <aside
                className="gill-tip-bubble"
                aria-label="Gill’s tip of the day"
              >
                <strong>Gill’s tip of the day</strong>
                <p>
                  “I, Gill Gates, recommend setting aside a little from each
                  paycheck before the coffee shops get their fins on it.”
                </p>
              </aside>
            </div>
          </GillCompanion>
        </div>
      )}
      <Dialog open={education} onOpenChange={setEducation}>
        <DialogContent className="finance-dialog">
          <DialogTitle>Financial Education</DialogTitle>
          <DialogDescription>
            Money knowledge, without the jargon.
          </DialogDescription>
          {lessons.map(([title, text]) => (
            <article className="education-item" key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
              <Button
                variant="link"
                onClick={() => {
                  setEducation(false);
                  openGill(
                    "/",
                    `Please explain: ${title}, for a college student.`,
                  );
                }}
              >
                Discuss with Gill <ChevronRight />
              </Button>
            </article>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
