import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/lib/finance-context";
import { api, cents } from "@/lib/api";
import { money } from "@/lib/finance";
import { monthlyAnalysis } from "@/lib/finance-analysis";
import { useGillNavigation } from "@/lib/gill-navigation-context";
import type { Budget } from "@/components/finance-provider";

const housingOptions = {
  family_home: "Family home",
  campus_housing: "Campus housing",
  shared_rental: "Shared rental",
  living_alone: "Living alone",
};
type Housing = keyof typeof housingOptions;
type Category = {
  category: string;
  budget_cents: number | null;
  spending_cents: number;
};
type Summary = {
  source: string;
  income_cents: number;
  budget_cents: number | null;
  spending_cents: number;
  net_cash_flow_cents: number;
  spending_percent_of_income: number | null;
  categories: Category[];
};
export type Peer = Summary & {
  id: string;
  name: string;
  housing_label: string;
  monthly_income_cents: number;
  month: string;
  period_label: string;
  as_of: string;
  updated_at: string | null;
  match_explanation: string;
};
export type Comparison = {
  peer: Peer;
  you: Summary;
  categories: {
    category: string;
    your_budget_cents: number | null;
    your_spending_cents: number;
    their_budget_cents: number | null;
    their_spending_cents: number;
    spending_difference_cents: number;
  }[];
  note: string;
};
export type DemoSummary = {
  source: "Local demo ledger";
  income_cents: number;
  categories: Category[];
};

export function localDemoSummary(
  analysis: ReturnType<typeof monthlyAnalysis>,
  budget: Budget,
): DemoSummary {
  // Only the guest ledger uses these aliases. Custom signed-in names are preserved on the server.
  const aliases = new Map([
    ["Food & Drink", "Eating out"],
    ["Housing", "Rent/Home"],
    ["Transport", "Auto"],
  ]);
  const rows = new Map<string, Category>();
  for (const [name, value] of Object.entries(budget)) {
    const category = aliases.get(name) ?? name;
    const row = rows.get(category) ?? {
      category,
      budget_cents: null,
      spending_cents: 0,
    };
    row.budget_cents = (row.budget_cents ?? 0) + cents(value);
    rows.set(category, row);
  }
  for (const { name, value } of analysis.categories) {
    const category = aliases.get(name) ?? name;
    const row = rows.get(category) ?? {
      category,
      budget_cents: null,
      spending_cents: 0,
    };
    row.spending_cents += cents(value);
    rows.set(category, row);
  }
  return {
    source: "Local demo ledger",
    income_cents: cents(analysis.income),
    categories: [...rows.values()],
  };
}

const amount = (value: number) => money(value / 100);
const limit = (value: number | null) => (value ? amount(value) : "Not set");
const percent = (value: number | null) =>
  value === null ? "— (no income)" : `${value.toFixed(1)}%`;

export function PeerBudgetComparison({
  month,
  budgetRevision = 0,
}: {
  month: string;
  budgetRevision?: number;
}) {
  const { user, transactions, loadBudget } = useFinance();
  const { openGill } = useGillNavigation();
  const [income, setIncome] = useState("2000");
  const [housing, setHousing] = useState<Housing>("shared_rental");
  const [criteria, setCriteria] = useState<{
    monthly_income_cents: number;
    housing: Housing;
  } | null>(null);
  const [profiles, setProfiles] = useState<Peer[]>([]);
  const [selected, setSelected] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetError, setBudgetError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [matchedKey, setMatchedKey] = useState("");
  const [resultContext, setResultContext] = useState("");
  const analysis = useMemo(
    () => monthlyAnalysis(transactions, month),
    [transactions, month],
  );
  const demo = useMemo(
    () => (budget === null ? null : localDemoSummary(analysis, budget)),
    [analysis, budget],
  );
  // Associate responses with matching inputs and the ledger so stale figures cannot be handed to Gill.
  const matchKey = `${month}:${user?.id ?? "guest"}:${criteria?.housing}:${criteria?.monthly_income_cents}`;
  const context = `${matchKey}:${budgetRevision}:${JSON.stringify({ income: analysis.income, categories: analysis.categories, demo })}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  useEffect(() => {
    let active = true;
    setBudget(null);
    setBudgetError("");
    if (!user)
      loadBudget(month)
        .then((value) => {
          if (active) setBudget(value);
        })
        .catch(() => {
          if (active)
            setBudgetError(
              "Couldn't load the local demo budget. Retry to compare.",
            );
        });
    return () => {
      active = false;
    };
  }, [month, user, loadBudget, budgetRevision, retry]);
  useEffect(() => {
    let active = true;
    setProfiles([]);
    setSelected("");
    setComparison(null);
    setMatchedKey("");
    setError("");
    if (!criteria) return;
    setBusy(true);
    api<{ profiles: Peer[] }>("/peer-budgets/matches", "POST", {
      month,
      ...criteria,
    })
      .then((value) => {
        if (active) {
          setProfiles(value.profiles);
          setSelected(value.profiles[0]?.id ?? "");
          setMatchedKey(matchKey);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [month, criteria, user, retry, matchKey]);
  useEffect(() => {
    let active = true;
    setComparison(null);
    setResultContext("");
    setComparing(false);
    if (
      !selected ||
      matchedKey !== matchKey ||
      !profiles.some((p) => p.id === selected && p.month === month) ||
      (!user && !demo)
    )
      return;
    setComparing(true);
    setError("");
    api<Comparison>("/peer-budgets/compare", "POST", {
      profile_id: selected,
      month,
      ...(!user ? { demo_summary: demo } : {}),
    })
      .then((value) => {
        if (active) {
          setComparison(value);
          setResultContext(context);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setComparing(false);
      });
    return () => {
      active = false;
    };
  }, [
    selected,
    month,
    user,
    demo,
    budgetRevision,
    context,
    retry,
    transactions,
    profiles,
    matchedKey,
    matchKey,
  ]);
  const ready =
    comparison &&
    matchedKey === matchKey &&
    resultContext === context &&
    comparison.peer.id === selected;
  return (
    <XPWindow
      title="Students in a similar situation"
      icon={<Users size={15} />}
      className="peer-budget-window"
    >
      <h2>Explore fictional student budgets</h2>
      <p className="finance-fine">
        Compare examples with the same housing arrangement and the closest
        monthly income. These profiles are fictional, not real students.
      </p>
      <form
        className="peer-match-form"
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(income);
          if (Number.isFinite(value) && value >= 0 && value <= 1000000)
            setCriteria({ monthly_income_cents: cents(value), housing });
        }}
      >
        <label>
          Monthly income ($)
          <input
            className="xp-input"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </label>
        <label>
          Living arrangement
          <select
            className="xp-input"
            value={housing}
            onChange={(e) => setHousing(e.target.value as Housing)}
          >
            {Object.entries(housingOptions).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="aero" type="submit" disabled={busy}>
          Find similar students
        </Button>
      </form>
      <p className="finance-fine">
        Matching inputs stay on this page.{" "}
        {user
          ? "Your side uses saved budgets and recorded checking activity."
          : "Your side uses the Local demo ledger."}{" "}
        Selected month: {month}.
      </p>
      {busy && <p role="status">Finding fictional matches…</p>}
      {(error || budgetError) && (
        <div>
          <p role="alert">{error || budgetError}</p>
          <Button variant="soft" onClick={() => setRetry((n) => n + 1)}>
            Retry comparison
          </Button>
        </div>
      )}
      <div className="peer-profile-grid">
        {profiles.map((profile) => (
          <button
            type="button"
            key={profile.id}
            className={`peer-profile xp-input ${selected === profile.id ? "selected" : ""}`}
            aria-pressed={selected === profile.id}
            onClick={() => setSelected(profile.id)}
          >
            <strong>{profile.name}</strong>
            <span>{profile.match_explanation}</span>
            <small>{profile.source}</small>
          </button>
        ))}
      </div>
      {comparing && selected && <p role="status">Loading comparison…</p>}
      {ready && (
        <>
          <h3>{comparison.peer.name}</h3>
          <p className="finance-fine">
            {comparison.peer.source} · {comparison.peer.period_label} through{" "}
            {comparison.peer.as_of}.
            {comparison.peer.updated_at
              ? ` Snapshot refreshed ${new Date(comparison.peer.updated_at).toLocaleString()}.`
              : " Deterministic example activity."}
            {` Planned monthly income: ${amount(comparison.peer.monthly_income_cents)}. Actual income below means deposits recorded in this period.`}
          </p>
          <div
            className="peer-table-scroll"
            role="region"
            aria-label="Student budget comparison"
            tabIndex={0}
          >
            <table className="peer-comparison-table">
              <caption>
                {comparison.peer.period_label} checking spending. Difference =
                your spending minus their spending.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Your budget</th>
                  <th scope="col">Your spending</th>
                  <th scope="col">Their budget</th>
                  <th scope="col">Their spending</th>
                  <th scope="col">Spending difference</th>
                </tr>
              </thead>
              <tbody>
                {comparison.categories.map((row) => (
                  <tr key={row.category}>
                    <th scope="row">{row.category}</th>
                    <td>{limit(row.your_budget_cents)}</td>
                    <td>{amount(row.your_spending_cents)}</td>
                    <td>{limit(row.their_budget_cents)}</td>
                    <td>{amount(row.their_spending_cents)}</td>
                    <td>
                      {row.spending_difference_cents > 0 ? "+" : ""}
                      {amount(row.spending_difference_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>{limit(comparison.you.budget_cents)}</td>
                  <td>{amount(comparison.you.spending_cents)}</td>
                  <td>{limit(comparison.peer.budget_cents)}</td>
                  <td>{amount(comparison.peer.spending_cents)}</td>
                  <td>
                    {amount(
                      comparison.you.spending_cents -
                        comparison.peer.spending_cents,
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Actual income</th>
                  <td>—</td>
                  <td>{amount(comparison.you.income_cents)}</td>
                  <td>—</td>
                  <td>{amount(comparison.peer.income_cents)}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Net cash flow</th>
                  <td>—</td>
                  <td>{amount(comparison.you.net_cash_flow_cents)}</td>
                  <td>—</td>
                  <td>{amount(comparison.peer.net_cash_flow_cents)}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row">Spending / actual income</th>
                  <td>—</td>
                  <td>{percent(comparison.you.spending_percent_of_income)}</td>
                  <td>—</td>
                  <td>{percent(comparison.peer.spending_percent_of_income)}</td>
                  <td>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="finance-fine">
            Your source: {comparison.you.source}. {comparison.note}
          </p>
          <Button
            variant="aero"
            onClick={() => {
              if (currentContext.current !== resultContext) return;
              const question = `Compare my budget with fictional peer ${selected} for ${month}, with ${housingOptions[criteria?.housing ?? housing]} housing. Explain the largest differences and optional adjustments with tradeoffs. `;
              openGill(
                "/spending",
                user
                  ? question +
                      "Use get_peer_budget_comparison and request the existing permissions."
                  : question +
                      `Use get_demo_peer_budget_comparison with this explicitly supplied Local demo ledger summary: ${JSON.stringify(demo)}. These figures are demo data, not my personal finances.`,
              );
            }}
          >
            Ask Gill to compare
          </Button>
          {user && (
            <p className="finance-fine">
              Gill asks for spending-summary and budget/goals permissions before
              reading your financial figures. Changes need your review and Save
              action.
            </p>
          )}
        </>
      )}
    </XPWindow>
  );
}
