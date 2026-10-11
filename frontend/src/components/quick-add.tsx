// Quick add: log something you just bought in a few taps. Used by the Quick Add tab and by
// Gill's quick-add card in chat. Saving goes through the app's own saveTransaction, so it only
// ever happens on the student's click, lands in the ledger right away, and works in demo mode.
import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/api";
import { money, type Transaction } from "@/lib/finance";
import { useFinance } from "@/lib/finance-context";
import { newTransaction } from "@/lib/finance-data";
import { parseAmount, yesterday } from "@/lib/quick-add";

export type QuickAddDraft = {
  amount?: number | null;
  description?: string;
  category?: string | null;
  date?: string;
};

const NOT_PURCHASES = new Set(["Income", "Savings"]);

export function QuickAddForm({
  initial = {},
  keepOpen = true,
  onAdded,
}: {
  initial?: QuickAddDraft;
  keepOpen?: boolean; // reset for another purchase after saving (the tab) or lock (Gill's card)
  onAdded?: (t: Transaction) => void;
}) {
  const { user, accounts, categories, saveTransaction } = useFinance();
  const idPrefix = useId();
  const blank = newTransaction(accounts, !!user, "checking");
  const [amount, setAmount] = useState(
    initial.amount ? String(initial.amount) : "",
  );
  const [description, setDescription] = useState(initial.description ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [date, setDate] = useState(initial.date ?? today());
  const [account, setAccount] = useState(
    user ? String(blank.accountId ?? "") : blank.account,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Transaction | null>(null);

  const choices = [
    ...new Set([
      ...categories.filter((c) => !NOT_PURCHASES.has(c)),
      ...(initial.category ? [initial.category] : []),
    ]),
  ];
  const dateChoice =
    date === today() ? "today" : date === yesterday() ? "yesterday" : "other";
  const [pickDate, setPickDate] = useState(dateChoice === "other");
  const locked = busy || (!keepOpen && !!added);

  async function submit() {
    const dollars = parseAmount(amount);
    if (!(dollars > 0))
      return setError("Enter how much you spent, like 12.50.");
    if (!description.trim()) return setError("Say what you bought.");
    if (!date || date > today())
      return setError("Pick today or an earlier date.");
    const chosen = user ? accounts.find((a) => String(a.id) === account) : null;
    const type = chosen?.type.toLowerCase();
    const t: Transaction = {
      ...blank,
      merchant: description.trim(),
      amount: -dollars,
      date,
      category: category || "Uncategorized",
      ...(user
        ? {
            accountId: chosen?.id ?? null,
            account:
              type === "checking" || type === "savings"
                ? type
                : chosen
                  ? "other"
                  : "unassigned",
          }
        : { account: account as Transaction["account"] }),
    };
    setBusy(true);
    setError("");
    try {
      await saveTransaction(t);
      setAdded(t);
      onAdded?.(t);
      if (keepOpen) {
        setAmount("");
        setDescription("");
        setCategory("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that purchase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="quick-add"
      aria-label="Quick add a purchase"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={locked} className="quick-add-fields">
        <div className="quick-add-group">
          <label htmlFor={`${idPrefix}-amount`}>How much?</label>
          <span className="quick-add-money">
            <span aria-hidden="true">$</span>
            <input
              id={`${idPrefix}-amount`}
              className="xp-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAdded(null);
              }}
            />
          </span>
        </div>
        <label htmlFor={`${idPrefix}-what`}>
          <span>What did you buy?</span>
          <input
            id={`${idPrefix}-what`}
            className="xp-input"
            maxLength={120}
            autoComplete="off"
            placeholder="Coffee at Cosmic Cantina"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setAdded(null);
            }}
          />
        </label>
        <div role="group" aria-label="Category" className="quick-add-group">
          <span>Category</span>
          <div className="quick-add-chips">
            {choices.map((c) => (
              <button
                type="button"
                key={c}
                className="quick-add-chip"
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="quick-add-row">
          <div role="group" aria-label="When" className="quick-add-group">
            <span>When</span>
            <div className="quick-add-chips">
              {(
                [
                  ["today", "Today"],
                  ["yesterday", "Yesterday"],
                  ["other", "Other day"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className="quick-add-chip"
                  aria-pressed={
                    pickDate ? value === "other" : dateChoice === value
                  }
                  onClick={() => {
                    setPickDate(value === "other");
                    if (value === "today") setDate(today());
                    if (value === "yesterday") setDate(yesterday());
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {pickDate && (
              <input
                className="xp-input"
                type="date"
                aria-label="Purchase date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </div>
          <label htmlFor={`${idPrefix}-account`}>
            <span>Paid from</span>
            <select
              id={`${idPrefix}-account`}
              className="xp-input"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              {user ? (
                <>
                  <option value="">Unassigned</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nickname || a.type}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </>
              )}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="negative quick-add-note">
            {error}
          </p>
        )}
        {!(added && !keepOpen) && (
          <Button variant="green" type="submit" className="quick-add-submit">
            <Plus />
            {busy ? "Adding…" : "Add purchase"}
          </Button>
        )}
      </fieldset>
      <p role="status" className="quick-add-note positive">
        {added && (
          <>
            <Check size={14} className="inline" /> Added {money(-added.amount)}{" "}
            · {added.merchant}
          </>
        )}
      </p>
    </form>
  );
}
