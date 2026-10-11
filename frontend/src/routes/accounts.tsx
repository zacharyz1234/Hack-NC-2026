import { newTransaction } from "@/lib/finance-data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, PiggyBank, Target } from "lucide-react";
import { FinanceLayout } from "@/components/finance-layout";
import { useFinance } from "@/lib/finance-context";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";
import {
  ActivityTable,
  AddTransactionButton,
  TransactionEditor,
} from "@/components/transaction-editor";
import { newestFirst } from "@/lib/finance-analysis";
import { cents, dollars } from "@/lib/api";
import { money, type Transaction } from "@/lib/finance";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Bowl Street Journal" }] }),
  component: AccountsPage,
});
function AccountsPage() {
  return (
    <FinanceLayout
      path="/accounts"
      title="A place for today. A little for tomorrow."
      description="Your checking and savings accounts, together in one place."
    >
      <AccountsContent />
    </FinanceLayout>
  );
}
function AccountsContent() {
  const { user, accounts, transactions, accountBalance, syncBank, bankNotice } =
    useFinance();
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="finance-bank-strip">
        <div>
          <strong>
            {user ? "Your sandbox bank" : "Your practice accounts"}
          </strong>
          <p>
            {user
              ? "Balances are bank snapshots. Recording activity does not change your bank balance."
              : "Try it out: demo activity updates your balances. Changes reset on refresh."}
          </p>
        </div>
        {user && (
          <Button
            variant="aero"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNotice("");
              try {
                setNotice(await syncBank());
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Bank sync failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Syncing…"
              : accounts.length
                ? "Refresh bank data"
                : "Connect demo bank"}
          </Button>
        )}
      </div>
      {(notice || bankNotice) && (
        <p className="finance-notice" role="status">
          {notice || bankNotice}
        </p>
      )}
      {user && !accounts.length && (
        <p className="finance-notice">
          No accounts linked yet. Connect the demo bank to get checking,
          savings, and sample activity.
        </p>
      )}
      <div className="account-pages-grid">
        {(["checking", "savings"] as const).map((kind) => {
          const matching = accounts.filter(
            (a) => a.type.toLowerCase() === kind,
          );
          const Icon = kind === "checking" ? Wallet : PiggyBank;
          return (
            <XPWindow
              key={kind}
              title={`${kind === "checking" ? "Checking" : "Savings"} account`}
              icon={<Icon size={15} />}
              className={`finance-account ${kind}`}
            >
              <div className="account-purpose">
                <span
                  className={`account-icon ${kind === "savings" ? "green" : ""}`}
                >
                  <Icon />
                </span>
                <span>
                  {kind === "checking"
                    ? "FOR YOUR EVERYDAY"
                    : "FOR WHAT’S NEXT"}
                </span>
              </div>
              <div className="finance-balance">
                {user && !matching.length
                  ? "Not linked"
                  : money(accountBalance(kind))}
              </div>
              <p className="finance-description">
                {kind === "checking"
                  ? "Keep track of the money you use for everyday purchases, bills, and paychecks."
                  : "Set money aside for a goal and follow your progress, one deposit at a time."}
              </p>
              {user &&
                matching.map((a) => (
                  <p className="finance-fine" key={a.id}>
                    {a.nickname || a.type} · Bank snapshot{" "}
                    {money(dollars(a.balance_cents))}
                    {a.synced_at &&
                      ` · Synced ${new Date(a.synced_at).toLocaleDateString()}`}
                  </p>
                ))}
              <div className="finance-section-bar">
                <h2>Recent activity</h2>
                <AddTransactionButton
                  onClick={() =>
                    setEdit(newTransaction(accounts, !!user, kind))
                  }
                />
              </div>
              <ActivityTable
                rows={newestFirst(
                  transactions.filter((t) => t.account === kind),
                ).slice(0, 5)}
                onEdit={setEdit}
              />
              <Button variant="link" asChild>
                <Link to="/purchases" search={{ account: kind, kind: "all" }}>
                  View all {kind} activity →
                </Link>
              </Button>
              {kind === "savings" && <GoalEditor key={user?.id ?? "demo"} />}
            </XPWindow>
          );
        })}
      </div>
      {edit && (
        <TransactionEditor transaction={edit} onClose={() => setEdit(null)} />
      )}
    </>
  );
}
function GoalEditor() {
  const { goal, saveGoal } = useFinance();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(
    goal ? dollars(goal.target_cents) : 2000,
  );
  const [saved, setSaved] = useState(goal ? dollars(goal.saved_cents) : 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setName(goal?.name ?? "");
    setTarget(goal ? dollars(goal.target_cents) : 2000);
    setSaved(goal ? dollars(goal.saved_cents) : 0);
  }, [goal]);
  const progress = goal
    ? Math.min(100, (goal.saved_cents / goal.target_cents) * 100)
    : 0;
  return (
    <section className="goal-section">
      <h2>
        <Target size={18} />A little closer to your goal
      </h2>
      <p className="finance-fine">
        Track a target independently of your savings balance.
      </p>
      <div className="card-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="finance-fine">
        {goal
          ? `${Math.round(progress)}% saved · ${money(Math.max(0, dollars(goal.target_cents - goal.saved_cents)))} to go`
          : "Give your next goal a name."}
      </p>
      <form
        className="finance-fields"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !name.trim() ||
            !Number.isFinite(target) ||
            target <= 0 ||
            !Number.isFinite(saved) ||
            saved < 0
          )
            return;
          setBusy(true);
          setMessage("");
          setFailed(false);
          try {
            await saveGoal({
              name: name.trim(),
              target_cents: cents(target),
              saved_cents: cents(saved),
            });
            setMessage("Goal saved.");
          } catch (err) {
            setFailed(true);
            setMessage(
              err instanceof Error ? err.message : "Couldn't save goal.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Goal name
            <input
              className="xp-input"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Target amount
              <input
                className="xp-input"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                required
                value={target}
                onChange={(e) => setTarget(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Saved toward goal
              <input
                className="xp-input"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={saved}
                onChange={(e) => setSaved(e.target.valueAsNumber)}
              />
            </label>
          </div>
          <Button variant="green" type="submit">
            {busy ? "Saving…" : "Save goal"}
          </Button>
        </fieldset>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      </form>
    </section>
  );
}
