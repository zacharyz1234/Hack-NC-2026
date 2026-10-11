import { useFinance } from "@/lib/finance-context";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PieChart, CalendarDays } from "lucide-react";
import { FinanceLayout } from "@/components/finance-layout";
import { DEMO_MONTH, type Budget } from "@/components/finance-provider";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";
import { monthlyAnalysis } from "@/lib/finance-analysis";
import { thisMonth } from "@/lib/api";
import { money } from "@/lib/finance";

export const Route = createFileRoute("/spending")({
  head: () => ({
    meta: [{ title: "Spending Analysis — Bowl Street Journal" }],
  }),
  component: SpendingPage,
});
function SpendingPage() {
  return (
    <FinanceLayout
      path="/spending"
      title="See where your money swims."
      description="Understand your everyday spending and give each category a little direction."
    >
      <SpendingContent />
    </FinanceLayout>
  );
}
function SpendingContent() {
  const { user, transactions } = useFinance();
  const [month, setMonth] = useState(user ? thisMonth() : DEMO_MONTH);
  const analysis = monthlyAnalysis(transactions, month);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  return (
    <>
      <div className="finance-section-bar month-bar">
        <p>Checking account cash flow · {monthLabel}</p>
        <label>
          <CalendarDays size={16} />
          Month
          <input
            aria-label="Analysis month"
            className="xp-input"
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                setMonth(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="finance-stats">
        <div>
          <span>Money in</span>
          <strong className="positive">{money(analysis.income)}</strong>
          <small>Checking income</small>
        </div>
        <div>
          <span>Money out</span>
          <strong>{money(analysis.spent)}</strong>
          <small>Checking purchases</small>
        </div>
        <div>
          <span>Net cash flow</span>
          <strong className={analysis.net < 0 ? "negative" : "positive"}>
            {money(analysis.net)}
          </strong>
          <small>Income minus spending</small>
        </div>
      </div>
      {!analysis.count && (
        <p className="finance-notice">
          No checking activity in {monthLabel}. Pick another month or add a
          transaction on Accounts.
        </p>
      )}
      <div className="analysis-charts">
        <XPWindow title="Day by day" icon={<CalendarDays size={15} />}>
          <h2>Daily spending</h2>
          <p className="finance-fine">
            Each bar is a day’s checking purchases.
          </p>
          <div
            className="daily-spending-chart"
            role="img"
            aria-label={`Daily checking spending for ${monthLabel}, total ${money(analysis.spent)}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.daily}
                margin={{ left: 0, right: 10, top: 12, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis
                  width={48}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: number) => `$${value}`}
                />
                <Tooltip
                  formatter={(value: number) => [money(value), "Spent"]}
                  labelFormatter={(value) => `${monthLabel}, day ${value}`}
                />
                <Bar
                  dataKey="value"
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-data">
            <summary>View daily amounts</summary>
            <div className="daily-data">
              {analysis.daily.map((day) => (
                <p key={day.day}>
                  Day {day.day}: <strong>{money(day.value)}</strong>
                </p>
              ))}
            </div>
          </details>
        </XPWindow>
        <XPWindow title="The bigger picture" icon={<PieChart size={15} />}>
          <h2>Spending by category</h2>
          <p className="finance-fine">
            A breakdown of the same {money(analysis.spent)} total.
          </p>
          {analysis.categories.length ? (
            <ul className="category-breakdown">
              {analysis.categories.map((c) => (
                <li key={c.name}>
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {money(c.value)} ·{" "}
                      {Math.round((c.value / analysis.spent) * 100)}%
                    </span>
                  </div>
                  <div className="card-progress">
                    <span
                      style={{ width: `${(c.value / analysis.spent) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="finance-empty">No purchases this month.</p>
          )}
        </XPWindow>
      </div>
      <BudgetEditor key={month} month={month} spending={analysis.categories} />
      <p className="finance-fine">
        Savings activity and unassigned transactions are excluded from checking
        cash flow. All charts use your recorded activity.
      </p>
    </>
  );
}
function BudgetEditor({
  month,
  spending,
}: {
  month: string;
  spending: { name: string; value: number }[];
}) {
  const { categories, loadBudget, saveBudget } = useFinance();
  const [draft, setDraft] = useState<Budget>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadBudget(month)
      .then((result) => {
        if (active) setDraft(result);
      })
      .catch((e: Error) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, loadBudget, attempt]);
  return (
    <XPWindow
      title="Give every dollar a destination"
      icon={<PieChart size={15} />}
      className="budget-window"
    >
      <div className="finance-section-bar">
        <div>
          <h2>Your category budgets</h2>
          <p className="finance-fine">
            Monthly limits for checking spending. Zero means no limit set.
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading budgets…</p>
      ) : loadError ? (
        <div>
          <p role="alert">{loadError}</p>
          <Button variant="soft" onClick={() => setAttempt((x) => x + 1)}>
            Retry budgets
          </Button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            setFailed(false);
            try {
              await saveBudget(month, draft);
              setMessage("Budget saved.");
            } catch (err) {
              setFailed(true);
              setMessage(
                err instanceof Error ? err.message : "Couldn't save budget.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="budget-grid" disabled={busy}>
            {categories
              .filter((name) => name !== "Income")
              .map((name) => {
                const spent = spending.find((c) => c.name === name)?.value ?? 0;
                const limit = draft[name] ?? 0;
                return (
                  <div className="budget-item" key={name}>
                    <label className="budget-label">
                      <strong>{name}</strong>
                      <span>
                        Limit{" "}
                        <input
                          aria-label={`${name} budget`}
                          className="xp-input"
                          type="number"
                          min="0"
                          max="1000000"
                          step="0.01"
                          required
                          value={limit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [name]: e.target.valueAsNumber,
                            })
                          }
                        />
                      </span>
                    </label>
                    <div className="card-progress">
                      <span
                        className={limit > 0 && spent > limit ? "over" : ""}
                        style={{
                          width: `${limit > 0 ? Math.min(100, (spent / limit) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <small
                      className={limit > 0 && spent > limit ? "negative" : ""}
                    >
                      {money(spent)} spent ·{" "}
                      {limit > 0
                        ? spent > limit
                          ? `${money(spent - limit)} over budget`
                          : `${money(limit - spent)} remaining`
                        : "No limit set"}
                    </small>
                  </div>
                );
              })}
          </fieldset>
          {!categories.length && <p>No budget categories available yet.</p>}
          <div className="form-actions">
            <Button
              variant="aero"
              type="submit"
              disabled={busy || !categories.length}
            >
              {busy ? "Saving…" : "Save budget"}
            </Button>
          </div>
        </form>
      )}
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </XPWindow>
  );
}
