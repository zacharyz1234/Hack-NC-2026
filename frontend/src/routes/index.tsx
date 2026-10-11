import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Home,
  Wallet,
  PieChart,
  PiggyBank,
  TrendingUp,
  BookOpen,
  Globe,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Coffee,
  Music,
  ShoppingBasket,
  GraduationCap,
  Briefcase,
  Target,
  Fish,
  Volume2,
  VolumeX,
  MessageCircle,
  MessageCircleOff,
  Settings as SettingsIcon,
  Lightbulb,
  Wifi,
  Search,
  Check,
  Leaf,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { XPWindow } from "@/components/xp-window";
import { MoneyChart } from "@/components/money-chart";
import { StockMarket } from "@/components/stock-market";
import { GillChat } from "@/components/gill-chat";
import { AuthPanel } from "@/components/auth-panel";
import {
  demoTransactions,
  balance,
  spending,
  money,
  categories as demoCategories,
  type Transaction,
} from "@/lib/finance";
import {
  api,
  cents,
  currentUser,
  dollars,
  logout,
  onAuthChange,
  thisMonth,
  today,
  type Account,
  type ApiTransaction,
  type BudgetLimit,
  type Category,
  type ConsentStatus,
  type Goal,
  type SyncResult,
  type User,
} from "@/lib/api";
import { GillSpeaker } from "@/components/gill-speaker";
import { GillQuipBubble } from "@/components/gill-quip-bubble";
import { loadQuipsEnabled, saveQuipsEnabled } from "@/lib/gill-quips";
import landscape from "@/assets/new-york-aero.jpg";
import bowl from "@/assets/gill-bowl.png";
import emptyBowl from "@/assets/gill-computer-bowl.png";
import gillFish from "@/assets/gill-fuller-fish.png";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bowl Street Journal — Making Sense of Your Money" },
      {
        name: "description",
        content:
          "Your student money desktop. Explore demo accounts, build a budget, practice investing, and meet Gill Gates.",
      },
      { property: "og:title", content: "Bowl Street Journal — Your student money desktop" },
      {
        property: "og:description",
        content:
          "Budgeting, savings, and investing with Gill Gates in a nostalgic Windows XP world.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});
const merchantIcons: Record<string, typeof Coffee> = {
  "Food & Drink": Coffee,
  Subscriptions: Music,
  Groceries: ShoppingBasket,
  Education: GraduationCap,
  Income: Briefcase,
};
function Index() {
  const [transactions, setTransactions] = useState(demoTransactions);
  const [modal, setModal] = useState<string | null>(null);
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
    <main className={`aero-app ${!stockView && !moneyOpen ? "scene-collapsed" : ""}`}>
      <img
        className="wallpaper"
        src={landscape}
        alt="Blue sky and green hills overlooking New York"
        width={1920}
        height={1024}
      />
      <div className="wallpaper-wash" />
      <header className="desktop-header">
        <div className="brand">
          <div className="brand-mark">
            <Globe size={29} />
          </div>
          <div>
            <h1>Bowl Street Journal</h1>
          </div>
        </div>
        <div className="header-right">
          <span>
            <span className="status-dot" />
            Your money. A little clearer.
          </span>
          {!userId && (
            <Button variant="soft" size="sm" onClick={() => setModal("Settings")}>
              <SettingsIcon />
              Settings
            </Button>
          )}
          <Button
            variant="soft"
            size="sm"
            onClick={() => setModal(userId ? "Settings" : "Sign in")}
          >
            <ShieldCheck />
            {userId ? "My account" : "Sign in"}
          </Button>
        </div>
      </header>
      {stockView ? (
        <motion.div
          key="stock-view"
          initial={{ opacity: reducedMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.9 }}
        >
          <StockMarket
          onReturn={() => {
            setStockView(false);
          }}
          onAsk={ask}
          onEducation={() => setModal("Financial Education")}
          />
        </motion.div>
      ) : (
        <div className="desktop-grid">
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
              onClick={enterStocks}
              aria-label="Enter Bowl Street stock market"
            >
              <div className="city-overlay">
                <strong>Take a trip to Bowl Street</strong>
              </div>
            </Button>
          </aside>
          <aside className="gill-side">
            <GillQuipBubble enabled={quipsOn} paused={chat} />
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
            <Button
              variant="ghost"
              className="bowl-control"
              onClick={() => ask()}
              aria-label="Talk to Gill Gates"
            >
              <img
                className="bowl-glass"
                src={emptyBowl}
                width={1024}
                height={1024}
                alt="Gill Gates, a realistic goldfish in a glass bowl"
              />
              <span className="swimming-gill"><img src={gillFish} width={1024} height={1024} alt="" /></span>
              <span className="bowl-bubble" />
              <span className="bowl-bubble" />
            </Button>
            <h2 className="side-label">Meet Gill Gates</h2>
            <div className="gill-plaque">
              Senoir Bowl Street Broker
            </div>
            <div className="gill-actions">
              <Button variant="green" className="gill-chat-button" onClick={() => ask()}>
                <span>Chat with Gill</span>
              </Button>
              <Button
                variant="ghost"
                className="gill-sound-button"
                size="icon"
                aria-label={muted ? "Enable Gill’s voice" : "Mute Gill’s voice"}
                title={muted ? "Enable Gill’s voice" : "Mute Gill’s voice"}
                aria-pressed={!muted}
                onClick={() => setMuted(!muted)}
              >
                <GillSpeaker muted={muted} />
              </Button>
            </div>
            <div className="gill-tip-wrap">
              <span className="gill-tip-solid" aria-hidden />
              <aside className="gill-tip-bubble" aria-label="Gill’s tip of the day">
                <strong>Gill’s tip of the day</strong>
                <p>
                  “I, Gill Gates, recommend setting aside a little from each paycheck before the
                  coffee shops get their fins on it.”
                </p>
              </aside>
            </div>
          </aside>
        </div>
      )}
      <p className="bottom-note">
        A brighter financial future starts with a little curiosity. And a very qualified goldfish.
      </p>
      <footer className="taskbar">
        <Button className="start-button" onClick={() => navigate("Home")}>
          <Home size={21} />
          Home
        </Button>
        <div className="taskbar-app">
          <Wallet size={14} />
          Bowl Street Journal
        </div>
        {chat && (
          <Button variant="aero" className="ml-2 h-7 text-[10px]" onClick={() => setChat(false)}>
            <Fish />
            Gill Gates
          </Button>
        )}
        <div className="taskbar-status">
          <ShieldCheck size={14} />
          <Volume2 size={14} />
          <Wifi size={14} />
          <span>{clock}</span>
        </div>
      </footer>
      <Button
        className="floating-gill"
        variant="aero"
        onClick={() => ask()}
        aria-label="Chat with Gill Gates"
      >
        <img src={bowl} alt="Gill Gates" />
      </Button>
      <AnimatePresence>
        {transitioning && (
          <motion.div
            key="bowl-street-bubbles"
            className="bubble-transition"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.01 }}
          >
            {(["out", "in"] as const).map((phase) => (
              <Fragment key={phase}>
                {phase === "in" && (
                  <motion.div
                    className="bubble-transition-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: reducedMotion ? 0 : [0, 1, 1, 0] }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 2.0, delay: 0.4, times: [0, 0.33, 0.6, 1], ease: "easeInOut" }
                    }
                  />
                )}
                {transitionBubbles.map((b, i) => {
                  if (b.phase !== phase) return null;
                  const isOut = phase === "out";
                  const delay = reducedMotion ? 0 : b.delay;
                  return (
                    <motion.span
                      key={i}
                      className="transition-bubble"
                      style={{
                        left: `${b.left}%`,
                        width: `${b.size}vw`,
                        bottom: `${b.bottom}vh`,
                      }}
                      initial={{
                        y: reducedMotion ? "-200vh" : "0vh",
                        opacity: 0,
                      }}
                      animate={
                        reducedMotion
                          ? { y: "-200vh", opacity: 0 }
                          : { y: isOut ? "-130vh" : "-120vh", opacity: [0, 1, 1, 0] }
                      }
                      transition={{
                        duration: reducedMotion ? 0 : b.duration,
                        delay,
                        ease: "easeOut",
                        opacity: reducedMotion
                          ? { duration: 0 }
                          : isOut
                            ? { duration: b.duration, delay, times: [0, 0.15, 0.7, 1] }
                            : { duration: b.duration, delay, times: [0, 0.1, 0.65, 1] },
                      }}
                    />
                  );
                })}
              </Fragment>
            ))}
          </motion.div>
        )}
        {chat && (
          <motion.div
            initial={{ x: -35, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -35, opacity: 0 }}
          >
            <GillChat
              key={userId ?? "guest"}
              userId={userId}
              onClose={() => setChat(false)}
              onSignIn={() => setModal("Sign in")}
              onDataChanged={loadData}
              initialQuestion={question}
              muted={muted}
              onMute={() => setMuted(!muted)}
            />
          </motion.div>
        )}
        {modal && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setModal(null);
            }}
          >
            <div role="dialog" aria-modal="true" aria-label={modal}>
              <XPWindow
                title={modal}
                icon={<Wallet size={15} />}
                className="modal-window"
                onClose={() => setModal(null)}
              >
                {modal === "Sign in" ? (
                  <AuthPanel onSuccess={signedIn} />
                ) : modal === "Add transaction" || modal === "Edit transaction" ? (
                  edit && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!Number.isFinite(edit.amount) || edit.amount === 0) return;
                        try {
                          await saveTransaction(edit);
                          setModal("Recent Purchases");
                          setEdit(null);
                        } catch (err) {
                          setNotice(err instanceof Error ? err.message : "Couldn't save the transaction.");
                        }
                      }}
                    >
                      <div className="form-grid">
                        <div>
                          <label className="field-label" htmlFor="merchant">
                            Merchant / description
                          </label>
                          <input
                            className="xp-input"
                            id="merchant"
                            required
                            value={edit.merchant}
                            onChange={(e) => setEdit({ ...edit, merchant: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="amount">
                            Amount (negative for a purchase)
                          </label>
                          <input
                            className="xp-input"
                            id="amount"
                            required
                            type="number"
                            step="0.01"
                            value={edit.amount}
                            onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="date">
                            Date
                          </label>
                          <input
                            className="xp-input"
                            id="date"
                            required
                            type="date"
                            value={edit.date}
                            onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="field-label" htmlFor="category">
                            Category
                          </label>
                          <select
                            className="xp-input"
                            id="category"
                            value={edit.category}
                            onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                          >
                            {categories.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="field-label" htmlFor="account">
                            Account
                          </label>
                          <select
                            className="xp-input"
                            id="account"
                            value={edit.account}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                account: e.target.value as "checking" | "savings",
                              })
                            }
                          >
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-actions">
                        {edit.id && (
                          <Button
                            variant="destructive"
                            type="button"
                            onClick={async () => {
                              await deleteTransaction(edit.id).catch((err: Error) => setNotice(err.message));
                              setModal("Recent Purchases");
                            }}
                          >
                            <Trash2 />
                            Delete
                          </Button>
                        )}
                        <Button variant="aero" type="submit">
                          <Check />
                          Save transaction
                        </Button>
                      </div>
                    </form>
                  )
                ) : modal === "Savings" ? (
                  <>
                    <span className="badge-demo">{user ? "SAVINGS ACCOUNT" : "DEMO SAVINGS ACCOUNT"}</span>
                    <div className="money-summary">{money(savings)}</div>
                    <div className="flex gap-2">
                      <Button variant="green" onClick={() => newTransaction("savings")}>
                        <Plus />
                        Deposit / withdrawal
                      </Button>
                    </div>
                    <label className="field-label" htmlFor="goal-name">
                      Goal name
                    </label>
                    <input
                      className="xp-input"
                      id="goal-name"
                      value={goalName}
                      onChange={(e) => setGoalName(e.target.value)}
                    />
                    <div className="form-grid">
                      <div>
                        <label className="field-label" htmlFor="goal-target">
                          Target amount
                        </label>
                        <input
                          className="xp-input"
                          id="goal-target"
                          type="number"
                          min="1"
                          value={goal}
                          onChange={(e) => setGoal(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="goal-saved">
                          Saved toward goal
                        </label>
                        <input
                          className="xp-input"
                          id="goal-saved"
                          type="number"
                          min="0"
                          value={saved}
                          onChange={(e) => setSaved(Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <div className="card-progress mt-5">
                      <span style={{ width: `${Math.min(100, (saved / goal) * 100)}%` }} />
                    </div>
                    <p className="text-xs mt-2">
                      {money(Math.max(0, goal - saved))} to go. You’ve got this.
                    </p>
                    {user && (
                      <Button variant="aero" size="sm" className="mt-3" onClick={saveGoal}>
                        <Check />
                        {goalId ? "Save goal" : "Create goal"}
                      </Button>
                    )}
                    <h3 className="mt-5 mb-3 font-bold">Savings activity</h3>
                    {table(
                      transactions.filter((t) => t.account === "savings"),
                      true,
                    )}
                  </>
                ) : modal === "Budgeting" ? (
                  <>
                    <h3 className="text-lg font-bold mb-2">Give every dollar a destination.</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      {user
                        ? `${new Date().toLocaleString("en-US", { month: "long" })} budget • changes save when you leave a field`
                        : "October budget • Demo data"}
                    </p>
                    {(user
                      ? // every category with a limit or with spending this month (0 = no limit yet)
                        categories
                          .filter((c) => c in budget || monthTransactions.some((t) => t.category === c && t.amount < 0))
                          .map((c) => [c, budget[c] ?? 0] as const)
                      : Object.entries(budget)
                    ).map(([name, limit]) => {
                      const total = (user ? monthTransactions : transactions)
                        .filter((t) => t.category === name && t.amount < 0)
                        .reduce((s, t) => s - t.amount, 0);
                      return (
                        <div className="budget-item" key={name}>
                          <div>
                            <strong>{name}</strong>
                            <span>
                              {money(total)} /{" "}
                              <input
                                aria-label={`${name} budget`}
                                className="xp-input"
                                type="number"
                                min={user ? 0 : 1}
                                value={limit}
                                onChange={(e) =>
                                  setBudget((b) => ({
                                    ...b,
                                    [name]: Math.max(user ? 0 : 1, Number(e.target.value)),
                                  }))
                                }
                                onBlur={() => saveBudget(name, limit)}
                              />
                            </span>
                          </div>
                          <div className="card-progress">
                            <span style={{ width: `${limit ? Math.min(100, (total / limit) * 100) : 0}%` }} />
                          </div>
                          <small className={limit && total > limit ? "negative" : "positive"}>
                            {!limit
                              ? "No limit set yet"
                              : total > limit
                              ? `${money(total - limit)} over budget`
                              : `${money(limit - total)} remaining`}
                          </small>
                        </div>
                      );
                    })}
                    <Button
                      variant="green"
                      className="mt-4"
                      onClick={() => {
                        setModal(null);
                        ask("How can I make a realistic college student budget?");
                      }}
                    >
                      <Fish />
                      Ask Gill for budgeting advice
                    </Button>
                  </>
                ) : modal === "Spending" ? (
                  <>
                    <div className="section-heading">
                      <h2>{user ? new Date().toLocaleString("en-US", { month: "long" }) : "October"} spending</h2>
                      <span className="badge-demo">{user ? "THIS MONTH" : "DEMO"}</span>
                    </div>
                    <div className="money-summary">{money(spent)}</div>
                    <MoneyChart />
                    <div className="flex justify-between text-xs mb-4">
                      <span>
                        Income:{" "}
                        <strong className="positive">
                          {money(
                            (user ? monthTransactions : transactions)
                              .filter((t) => t.account === "checking" && t.amount > 0)
                              .reduce((s, t) => s + t.amount, 0),
                          )}
                        </strong>
                      </span>
                      <span>
                        Expenses: <strong>{money(spent)}</strong>
                      </span>
                    </div>
                    {[...categories, "Uncategorized"]
                      .filter((c) => (user ? monthTransactions : transactions).some((t) => t.category === c && t.amount < 0))
                      .map((c) => (
                        <div className="market-row" key={c}>
                          <strong>{c}</strong>
                          <span>
                            {money(
                              (user ? monthTransactions : transactions)
                                .filter((t) => t.category === c && t.amount < 0)
                                .reduce((s, t) => s - t.amount, 0),
                            )}
                          </span>
                        </div>
                      ))}
                  </>
                ) : modal === "Financial Education" ? (
                  <>
                    <h2 className="text-xl font-bold">Money knowledge, without the jargon.</h2>
                    {[
                      [
                        "The student budget",
                        "Start with take-home income. Set aside essentials like rent, groceries, and transport. Give flexible spending a limit, and make room for saving—even a small amount.",
                      ],
                      [
                        "Build an emergency fund",
                        "Save a small cushion for unexpected costs before investing money you might need soon. Start with a reachable goal, then grow toward several months of essential expenses.",
                      ],
                      [
                        "Credit is a tool, not free money",
                        "Pay your statement balance in full and on time when possible. Interest and fees add up. Borrow only what you can afford to repay.",
                      ],
                      [
                        "Investing & diversification",
                        "Buying a stock means owning a small part of a business. A diversified fund spreads exposure across many companies. Both stocks and funds can lose value. Past returns do not guarantee future results.",
                      ],
                      [
                        "Student loans, one step at a time",
                        "Understand the interest rate, repayment schedule, and whether the loan is federal or private. Explore official repayment options and avoid anyone promising instant forgiveness.",
                      ],
                    ].map(([title, text]) => (
                      <article className="education-item" key={title}>
                        <h3>{title}</h3>
                        <p>{text}</p>
                        <Button
                          variant="link"
                          className="tiny-link mt-2"
                          onClick={() => {
                            setModal(null);
                            ask(`Please explain: ${title}, for a college student.`);
                          }}
                        >
                          Discuss with Gill <ChevronRight />
                        </Button>
                      </article>
                    ))}
                  </>
                ) : modal === "Settings" ? (
                  <>
                    <h2 className="text-xl font-bold mb-3">Your little corner of Bowl Street.</h2>
                    <div className="settings-row">
                      <span>Gill’s voice</span>
                      <Button variant="soft" onClick={() => setMuted(!muted)}>
                        {muted ? <VolumeX /> : <Volume2 />}
                        {muted ? "Text only" : "Voice enabled"}
                      </Button>
                    </div>
                    <div className="settings-row">
                      <span>Gill’s chatter bubbles</span>
                      <Button
                        variant="soft"
                        onClick={toggleQuips}
                        aria-pressed={quipsOn}
                      >
                        {quipsOn ? <MessageCircle /> : <MessageCircleOff />}
                        {quipsOn ? "On" : "Off"}
                      </Button>
                    </div>
                    <div className="settings-row">
                      <span>Account & private chat history</span>
                      <Button
                        variant="aero"
                        onClick={async () => {
                          if (userId) {
                            await logout();
                            setModal(null);
                          } else setModal("Sign in");
                        }}
                      >
                        {userId ? "Sign out" : "Sign in"}
                      </Button>
                    </div>
                    {user ? (
                      <>
                        <div className="settings-row">
                          <span>Bank data (Capital One Nessie sandbox)</span>
                          <Button
                            variant="soft"
                            onClick={() => bankAction(accounts.length ? "/nessie/sync" : "/nessie/connect-demo")}
                          >
                            {accounts.length ? "Refresh bank data" : "Connect demo bank"}
                          </Button>
                        </div>
                        <h3 className="mt-4 font-bold">What Gill may read</h3>
                        {consents.map((c) => (
                          <div className="settings-row" key={c.scope}>
                            <span>
                              <strong>{c.title}</strong>
                              <br />
                              <small className="text-muted-foreground">
                                {c.status === "always"
                                  ? "Always allowed"
                                  : c.status === "chat"
                                    ? "Allowed in an open chat"
                                    : "Off — Gill asks first"}
                              </small>
                            </span>
                            {c.status !== "off" && (
                              <Button variant="soft" size="sm" onClick={() => revokeConsent(c.scope)}>
                                Turn off
                              </Button>
                            )}
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground mt-4">
                          Turning access off stops Gill from reading it again and clears chats that used it. It
                          can’t recall what was already sent to Google Gemini.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="settings-row">
                          <span>Demo financial data</span>
                          <Button variant="soft" onClick={resetDemo}>
                            Reset demo
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                          You’re browsing the demo: numbers are fictional and edits reset on refresh. Sign in to
                          use your own budget, goals and sandbox bank.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="badge-demo">{user ? "SANDBOX BANK • NOT A REAL BANK" : "DEMO ACCOUNT • NOT A REAL BANK"}</span>
                      <Button variant="aero" size="sm" onClick={() => newTransaction()}>
                        <Plus />
                        Add transaction
                      </Button>
                    </div>
                    {modal === "Checking Account" || modal === "My Accounts" ? (
                      <>
                        <div className="money-summary">{money(checking)}</div>
                        <p className="text-muted-foreground text-xs">
                          Checking •••• 2048 • Available funds
                        </p>
                        {modal === "My Accounts" && (
                          <p className="mt-3">
                            Savings balance: <strong>{money(savings)}</strong>
                          </p>
                        )}
                      </>
                    ) : null}
                    <div className="filter-row">
                      <Search size={17} />
                      <input
                        className="xp-input"
                        aria-label="Filter transactions"
                        placeholder="Search transactions…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <select
                        className="xp-input max-w-40"
                        aria-label="Filter category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option>All</option>
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    {table(
                      filtered.filter((t) =>
                        modal === "Checking Account" ? t.account === "checking" : true,
                      ),
                      true,
                    )}
                    {!filtered.length && (
                      <p className="mt-4 text-center">No matching transactions.</p>
                    )}
                  </>
                )}
              </XPWindow>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
