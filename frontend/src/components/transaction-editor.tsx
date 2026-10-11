import { useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useFinance } from "@/lib/finance-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money, type Transaction } from "@/lib/finance";

export function ActivityTable({
  rows,
  onEdit,
}: {
  rows: Transaction[];
  onEdit: (t: Transaction) => void;
}) {
  const { accounts } = useFinance();
  if (!rows.length)
    return <p className="finance-empty">No matching transactions.</p>;
  return (
    <div className="activity-scroll">
      <table className="transaction-table">
        <caption className="sr-only">Account activity</caption>
        <thead>
          <tr>
            <th>Merchant / description</th>
            <th>Date</th>
            <th>Account</th>
            <th>Category</th>
            <th>Amount</th>
            <th>
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.merchant}</td>
              <td>
                {new Date(`${t.date}T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className="capitalize">
                {accounts.find((a) => a.id === t.accountId)?.nickname ||
                  t.account}
              </td>
              <td>
                <span className="category-tag">{t.category}</span>
              </td>
              <td className={t.amount > 0 ? "positive" : ""}>
                {t.amount > 0 ? "+" : "−"}
                {money(Math.abs(t.amount))}
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${t.merchant}`}
                  onClick={() => onEdit(t)}
                >
                  <Pencil />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AddTransactionButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="aero" size="sm" onClick={onClick}>
      <Plus />
      Add transaction
    </Button>
  );
}
export function TransactionEditor({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const { user, accounts, categories, saveTransaction, deleteTransaction } =
    useFinance();
  const [draft, setDraft] = useState(transaction);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  async function submit(remove = false) {
    if (busy) return;
    if (
      !remove &&
      (!draft.merchant.trim() ||
        !Number.isFinite(draft.amount) ||
        Math.round(draft.amount * 100) === 0)
    ) {
      setError("Enter a description and a non-zero amount.");
      return;
    }
    if (
      !remove &&
      user &&
      transaction.id &&
      draft.amount < 0 !== transaction.amount < 0
    ) {
      setError(
        "Keep the same purchase or income sign. To change it, delete and add a new transaction.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (remove) await deleteTransaction(draft.id);
      else await saveTransaction(draft);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't save the transaction.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="finance-dialog"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
          else
            document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
        }}
      >
        <DialogTitle>
          {draft.id ? "Edit transaction" : "Add transaction"}
        </DialogTitle>
        <DialogDescription>
          Record money in or out. This does not move money at your bank.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="finance-fields">
            <label>
              Merchant / description
              <input
                className="xp-input"
                required
                maxLength={120}
                value={draft.merchant}
                onChange={(e) =>
                  setDraft({ ...draft, merchant: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Amount (negative for a purchase)
                <input
                  className="xp-input"
                  type="number"
                  required
                  step="0.01"
                  min="-1000000"
                  max="1000000"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: e.target.valueAsNumber })
                  }
                />
              </label>
              <label>
                Date
                <input
                  className="xp-input"
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Category
                <select
                  className="xp-input"
                  disabled={draft.amount > 0}
                  value={draft.amount > 0 ? "Income" : draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  {[
                    ...new Set([
                      "Uncategorized",
                      "Income",
                      ...categories,
                      draft.category,
                    ]),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Account
                <select
                  className="xp-input"
                  value={user ? (draft.accountId ?? "") : draft.account}
                  onChange={(e) => {
                    if (!user) {
                      setDraft({
                        ...draft,
                        account: e.target.value as Transaction["account"],
                      });
                      return;
                    }
                    const acc = accounts.find(
                      (a) => a.id === Number(e.target.value),
                    );
                    const type = acc?.type.toLowerCase();
                    setDraft({
                      ...draft,
                      accountId: acc?.id ?? null,
                      account:
                        type === "checking" || type === "savings"
                          ? type
                          : acc
                            ? "other"
                            : "unassigned",
                    });
                  }}
                >
                  {user ? (
                    <>
                      <option value="">Unassigned</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nickname || a.type} · #{a.id}
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
              <p role="alert" className="negative">
                {error}
              </p>
            )}
            <div className="form-actions">
              {draft.id && (
                <Button
                  variant="destructive"
                  type="button"
                  onClick={() => void submit(true)}
                >
                  Delete
                </Button>
              )}
              <Button variant="soft" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="aero" type="submit">
                {busy ? "Saving…" : "Save transaction"}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
