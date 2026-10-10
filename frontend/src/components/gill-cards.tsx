// Cards Gill can show in chat. Only these render, and only with props that pass cardSchemas.
// Save buttons call the normal app API with the student's own click; Gill itself can't save.
import { useState, type ReactNode } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, cents, type Goal } from "@/lib/api";
import { money } from "@/lib/finance";
import {
  cardSchemas,
  type CardName,
  type CardProps,
  type ComponentEvent,
  type ConsentChoice,
  type ConsentRequestEvent,
  type SaveTarget,
} from "@/lib/gill-protocol";

type Handlers = {
  active: boolean; // input cards: still waiting for an answer
  onSubmit: (value: Record<string, unknown>) => void;
  onDismiss: () => void;
  onSaved: (target: SaveTarget) => void;
};

export function GillCard({
  event,
  ...handlers
}: { event: ComponentEvent } & Handlers) {
  if (!(event.component in cardSchemas)) return null;
  const name = event.component as CardName;
  const parsed = cardSchemas[name].safeParse(event.props);
  if (!parsed.success) {
    console.warn(`Gill card ${name} had invalid props`, parsed.error.issues);
    return null;
  }
  const p = parsed.data;
  switch (name) {
    case "budget_slider":
      return <BudgetSlider p={p as CardProps<"budget_slider">} {...handlers} />;
    case "category_picker":
      return (
        <CategoryPicker p={p as CardProps<"category_picker">} {...handlers} />
      );
    case "amount_form":
      return <AmountForm p={p as CardProps<"amount_form">} {...handlers} />;
    case "budget_plan":
      return <BudgetPlan p={p as CardProps<"budget_plan">} {...handlers} />;
    case "savings_calculator":
      return (
        <SavingsCalculator
          p={p as CardProps<"savings_calculator">}
          {...handlers}
        />
      );
    case "expense_draft":
      return <ExpenseDraft p={p as CardProps<"expense_draft">} {...handlers} />;
    case "scenario_comparison":
      return <ScenarioComparison p={p as CardProps<"scenario_comparison">} />;
    case "spending_chart":
      return <SpendingChart p={p as CardProps<"spending_chart">} />;
  }
}

function Card({
  title,
  children,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="gill-card">
      <div className="gill-card-title">
        <strong>{title}</strong>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close card"
            onClick={onDismiss}
          >
            <X />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------- input cards ----------

function BudgetSlider({
  p,
  active,
  onSubmit,
  onDismiss,
}: { p: CardProps<"budget_slider"> } & Handlers) {
  const [value, setValue] = useState(p.default);
  return (
    <Card title={p.label} {...(active ? { onDismiss } : {})}>
      <div className="gill-slider">
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          value={value}
          disabled={!active}
          aria-label={p.label}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <input
          className="xp-input"
          type="number"
          min={p.min}
          max={p.max}
          step={p.step}
          value={value}
          disabled={!active}
          aria-label="Amount in dollars"
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </div>
      {active && (
        <Button
          variant="aero"
          size="sm"
          onClick={() => onSubmit({ amount: value })}
        >
          Use {money(value)}
        </Button>
      )}
    </Card>
  );
}

function CategoryPicker({
  p,
  active,
  onSubmit,
  onDismiss,
}: { p: CardProps<"category_picker"> } & Handlers) {
  const [picked, setPicked] = useState<number[]>(p.preselected_ids);
  const toggle = (id: number) =>
    setPicked((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : [...now, id].slice(-p.max_choices),
    );
  return (
    <Card title={p.label} {...(active ? { onDismiss } : {})}>
      <div className="gill-choices">
        {p.options.map((o) => (
          <label key={o.id} className={picked.includes(o.id) ? "picked" : ""}>
            <input
              type="checkbox"
              checked={picked.includes(o.id)}
              disabled={!active}
              onChange={() => toggle(o.id)}
            />
            {o.icon ? `${o.icon} ` : ""}
            {o.name}
          </label>
        ))}
      </div>
      {active && (
        <Button
          variant="aero"
          size="sm"
          disabled={!picked.length}
          onClick={() => onSubmit({ category_ids: picked })}
        >
          Done ({picked.length}/{p.max_choices})
        </Button>
      )}
    </Card>
  );
}

const PERIOD = {
  monthly: "per month",
  weekly: "per week",
  one_time: "one time",
} as const;

function AmountForm({
  p,
  active,
  onSubmit,
  onDismiss,
}: { p: CardProps<"amount_form"> } & Handlers) {
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v)))
      .map(([k, v]) => [k, Number(v)]),
  );
  return (
    <Card
      title={`${p.label} (${PERIOD[p.period]})`}
      {...(active ? { onDismiss } : {})}
    >
      <div className="form-grid">
        {p.fields.map((f) => (
          <div key={f.key}>
            <label className="field-label" htmlFor={`amount-${f.key}`}>
              {f.label}
            </label>
            <input
              className="xp-input"
              id={`amount-${f.key}`}
              type="number"
              min="0"
              step="0.01"
              disabled={!active}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      {active && (
        <Button
          variant="aero"
          size="sm"
          className="mt-3"
          disabled={!Object.keys(filled).length}
          onClick={() => onSubmit({ values: filled })}
        >
          Send to Gill
        </Button>
      )}
    </Card>
  );
}

// ---------- cards the student can save ----------

function useSave(onSaved: (target: SaveTarget) => void, target: SaveTarget) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  async function save(call: () => Promise<unknown>) {
    setState("saving");
    setError("");
    try {
      await call();
      setState("saved");
      onSaved(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setState("idle");
    }
  }
  return { state, error, save };
}

function SaveButton({
  label,
  canSave,
  state,
  onClick,
}: {
  label: string;
  canSave: boolean;
  state: string;
  onClick: () => void;
}) {
  if (!canSave)
    return (
      <small className="text-muted-foreground">Sign in to save this.</small>
    );
  if (state === "saved")
    return (
      <span className="positive text-xs">
        <Check size={12} className="inline" /> Saved by you
      </span>
    );
  return (
    <Button
      variant="green"
      size="sm"
      disabled={state === "saving"}
      onClick={onClick}
    >
      {state === "saving" ? "Saving…" : label}
    </Button>
  );
}

function BudgetPlan({
  p,
  onSaved,
}: { p: CardProps<"budget_plan"> } & Handlers) {
  const [rows, setRows] = useState(p.rows);
  const { state, error, save } = useSave(onSaved, "budget");
  const allocated = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <Card title={`Budget for ${p.month_label}`}>
      {p.note && <p className="text-xs text-muted-foreground mb-2">{p.note}</p>}
      {rows.map((r, i) => (
        <div className="market-row" key={r.category_id}>
          <strong>{r.category}</strong>
          <input
            className="xp-input gill-money-input"
            type="number"
            min="0"
            step="5"
            aria-label={`${r.category} limit`}
            value={r.amount}
            disabled={state === "saved"}
            onChange={(e) =>
              setRows((now) =>
                now.map((row, j) =>
                  j === i
                    ? { ...row, amount: Math.max(0, Number(e.target.value)) }
                    : row,
                ),
              )
            }
          />
        </div>
      ))}
      <div className="market-row">
        <strong>Total</strong>
        <span
          className={p.total !== null && allocated > p.total ? "negative" : ""}
        >
          {money(allocated)}
          {p.total !== null && ` of ${money(p.total)}`}
        </span>
      </div>
      {error && <p className="chat-error">{error}</p>}
      <SaveButton
        label="Save budget"
        canSave={p.can_save}
        state={state}
        onClick={() =>
          save(() =>
            api(`/budgets/${p.month}`, "PUT", {
              limits: rows.map((r) => ({
                category_id: r.category_id,
                limit_cents: cents(r.amount),
              })),
            }),
          )
        }
      />
    </Card>
  );
}

function SavingsCalculator({
  p,
  onSaved,
}: { p: CardProps<"savings_calculator"> } & Handlers) {
  const { state, error, save } = useSave(onSaved, "savings_goal");
  return (
    <Card title={`Savings goal: ${p.goal_name}`}>
      <div className="market-row">
        <strong>Still to save</strong>
        <span>
          {money(p.remaining)} of {money(p.target)}
        </span>
      </div>
      {p.months_needed !== null && p.monthly_contribution !== null && (
        <div className="market-row">
          <strong>At {money(p.monthly_contribution)}/month</strong>
          <span>
            {p.months_needed} months (done {p.projected_completion})
          </span>
        </div>
      )}
      {p.required_monthly_for_target_date !== null && (
        <div className="market-row">
          <strong>To finish by {p.target_date}</strong>
          <span>{money(p.required_monthly_for_target_date)}/month</span>
        </div>
      )}
      {error && <p className="chat-error">{error}</p>}
      <SaveButton
        label="Create goal"
        canSave={p.can_save}
        state={state}
        onClick={() =>
          save(() =>
            api<Goal>("/savings-goals", "POST", {
              name: p.goal_name,
              target_cents: cents(p.target),
              saved_cents: cents(p.already_saved),
              target_date: p.target_date,
            }),
          )
        }
      />
    </Card>
  );
}

function ExpenseDraft({
  p,
  onSaved,
}: { p: CardProps<"expense_draft"> } & Handlers) {
  const [draft, setDraft] = useState({
    amount: p.amount,
    description: p.description,
    category_id: p.category_id,
    date: p.date,
  });
  const { state, error, save } = useSave(onSaved, "expense");
  const locked = state === "saved";
  return (
    <Card title="New expense">
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="draft-desc">
            Description
          </label>
          <input
            className="xp-input"
            id="draft-desc"
            disabled={locked}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label" htmlFor="draft-amount">
            Amount
          </label>
          <input
            className="xp-input"
            id="draft-amount"
            type="number"
            min="0.01"
            step="0.01"
            disabled={locked}
            value={draft.amount}
            onChange={(e) =>
              setDraft({ ...draft, amount: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <label className="field-label" htmlFor="draft-category">
            Category
          </label>
          <select
            className="xp-input"
            id="draft-category"
            disabled={locked}
            value={draft.category_id ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                category_id: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">No category</option>
            {p.category_options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="draft-date">
            Date
          </label>
          <input
            className="xp-input"
            id="draft-date"
            type="date"
            disabled={locked}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </div>
      </div>
      {error && <p className="chat-error">{error}</p>}
      <div className="mt-3">
        <SaveButton
          label="Add expense"
          canSave={p.can_save}
          state={state}
          onClick={() =>
            save(() =>
              api("/expenses", "POST", {
                amount_cents: cents(draft.amount),
                description: draft.description,
                category_id: draft.category_id,
                spent_on: draft.date,
              }),
            )
          }
        />
      </div>
    </Card>
  );
}

// ---------- display-only cards ----------

function ScenarioComparison({ p }: { p: CardProps<"scenario_comparison"> }) {
  return (
    <Card title="Comparing budgets">
      <table className="transaction-table">
        <thead>
          <tr>
            <th />
            {p.scenarios.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.category}>
              <td>{r.category}</td>
              {r.amounts.map((a, j) => (
                <td key={j}>
                  {money(a)}
                  {j > 0 && (r.diff_vs_first[j] ?? 0) !== 0 && (
                    <small
                      className={
                        (r.diff_vs_first[j] ?? 0) < 0 ? "positive" : "negative"
                      }
                    >
                      {" "}
                      ({(r.diff_vs_first[j] ?? 0) > 0 ? "+" : "−"}
                      {money(Math.abs(r.diff_vs_first[j] ?? 0))})
                    </small>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            {p.scenarios.map((s) => (
              <td key={s.name}>
                <strong>{money(s.total)}</strong>
              </td>
            ))}
          </tr>
          {p.monthly_income !== null && (
            <tr>
              <td>Left over</td>
              {p.scenarios.map((s) => (
                <td
                  key={s.name}
                  className={(s.leftover ?? 0) < 0 ? "negative" : "positive"}
                >
                  {money(s.leftover ?? 0)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function SpendingChart({ p }: { p: CardProps<"spending_chart"> }) {
  const top = Math.max(
    1,
    ...p.series.map((s) => Math.max(s.value, s.limit ?? 0)),
  );
  return (
    <Card title={p.title}>
      {p.period_label && (
        <p className="text-xs text-muted-foreground mb-2">{p.period_label}</p>
      )}
      {p.series.map((s) => (
        <div className="budget-item" key={s.label}>
          <div>
            <strong>{s.label}</strong>
            <span>
              {money(s.value)}
              {s.limit !== undefined && ` / ${money(s.limit)}`}
            </span>
          </div>
          <div className="card-progress">
            <span
              className={
                s.limit !== undefined && s.value > s.limit ? "over" : ""
              }
              style={{
                width: `${Math.min(100, (s.value / (s.limit ?? top)) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}

// ---------- consent ----------

const CHOICE_LABELS: Record<ConsentChoice, string> = {
  once: "Allow once",
  chat: "For this chat",
  always: "Always allow",
  deny: "No thanks",
};

export function ConsentCard({
  event,
  active,
  onAnswer,
}: {
  event: ConsentRequestEvent;
  active: boolean;
  onAnswer: (decisions: Record<string, ConsentChoice>) => void;
}) {
  const [choices, setChoices] = useState<Record<string, ConsentChoice>>({});
  const ready = event.items.every((item) => choices[item.scope]);
  return (
    <div
      className="gill-card gill-consent"
      role="group"
      aria-label="Gill is asking to read your data"
    >
      <div className="gill-card-title">
        <strong>
          <ShieldCheck size={13} className="inline mr-1" />
          Gill would like to look at:
        </strong>
      </div>
      {event.items.map((item) => (
        <div className="gill-consent-item" key={item.scope}>
          <strong>{item.title}</strong>
          {item.period_label && (
            <span className="text-muted-foreground">
              {" "}
              · {item.period_label}
            </span>
          )}
          <p>{item.details}</p>
          <div className="gill-consent-options">
            {event.options.map((option) => (
              <Button
                key={option}
                size="xs"
                variant={choices[item.scope] === option ? "aero" : "soft"}
                aria-pressed={choices[item.scope] === option}
                disabled={!active}
                onClick={() =>
                  setChoices((c) => ({ ...c, [item.scope]: option }))
                }
              >
                {CHOICE_LABELS[option]}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <p className="gill-consent-fine">
        {event.purpose}
        <br />
        Shared with: {event.shared_with}
        <br />
        {event.footer}
      </p>
      {active && (
        <Button
          variant="aero"
          size="sm"
          disabled={!ready}
          onClick={() => onAnswer(choices)}
        >
          Continue
        </Button>
      )}
    </div>
  );
}
