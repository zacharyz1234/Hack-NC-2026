// Gill Gates chat protocol (backend /assistant). Spec: docs/GILL_GATES_FRONTEND_CONTRACT.md.
// Card props are validated here before anything renders; invalid props are dropped.
import { z } from "zod";

export type ConsentChoice = "once" | "chat" | "always" | "deny";
export type ConsentItem = {
  scope: string;
  title: string;
  details: string;
  period_label: string | null;
};

export type MessageEvent = {
  type: "message";
  message_id: string;
  text: string;
  stock_numbers?: {
    value: number;
    unit: "price" | "percent";
    direction: "increased" | "decreased" | "unchanged";
  }[];
};
export type ComponentEvent = {
  type: "component";
  call_id: string;
  component: string;
  props: unknown;
  awaits_input: boolean;
};
export type ConsentRequestEvent = {
  type: "consent_request";
  request_id: string;
  purpose: string;
  shared_with: string;
  footer: string;
  items: ConsentItem[];
  options: ConsentChoice[];
};
export type DataAccessEvent = {
  type: "data_access";
  scope: string;
  label: string;
};
export type NoticeEvent = { type: "notice"; text: string };
export type GillEvent =
  | MessageEvent
  | ComponentEvent
  | ConsentRequestEvent
  | DataAccessEvent
  | NoticeEvent;

export type Turn = {
  session_id: string;
  state: "ready" | "awaiting_input" | "awaiting_consent";
  events: GillEvent[];
};
export type SessionCreated = Turn & {
  signed_in: boolean;
  voice_available: boolean;
  suggestions: string[];
};

export type SaveTarget = "budget" | "savings_goal" | "expense";

const money = z.number().finite();
const categoryOption = z.object({
  id: z.number().int(),
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
});

export const cardSchemas = {
  budget_slider: z.object({
    label: z.string(),
    min: money,
    max: money,
    step: money.positive(),
    default: money,
  }),
  category_picker: z.object({
    label: z.string(),
    options: z.array(categoryOption),
    preselected_ids: z.array(z.number().int()),
    max_choices: z.number().int().min(1),
  }),
  amount_form: z.object({
    label: z.string(),
    period: z.enum(["monthly", "weekly", "one_time"]),
    fields: z
      .array(z.object({ key: z.string(), label: z.string() }))
      .min(1)
      .max(6),
  }),
  budget_plan: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    month_label: z.string(),
    total: money.nullable(),
    rows: z.array(
      z.object({
        category_id: z.number().int(),
        category: z.string(),
        amount: money,
      }),
    ),
    allocated: money,
    unallocated: money.nullable(),
    over_allocated: z.boolean(),
    note: z.string(),
    can_save: z.boolean(),
  }),
  savings_calculator: z.object({
    goal_name: z.string(),
    target: money,
    already_saved: money,
    remaining: money,
    monthly_contribution: money.nullable(),
    months_needed: z.number().int().nullable(),
    projected_completion: z.string().nullable(),
    target_date: z.string().nullable(),
    required_monthly_for_target_date: money.nullable(),
    can_save: z.boolean(),
  }),
  expense_draft: z.object({
    amount: money.nullable(),
    description: z.string(),
    category_id: z.number().int().nullable(),
    category: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category_options: z.array(categoryOption),
    can_save: z.boolean(),
  }),
  scenario_comparison: z.object({
    monthly_income: money.nullable(),
    scenarios: z.array(
      z.object({ name: z.string(), total: money, leftover: money.nullable() }),
    ),
    rows: z.array(
      z.object({
        category: z.string(),
        amounts: z.array(money),
        diff_vs_first: z.array(money),
      }),
    ),
  }),
  spending_chart: z.object({
    chart: z.enum([
      "spending_by_category",
      "budget_vs_actual",
      "manual_breakdown",
    ]),
    title: z.string(),
    period_label: z.string().nullable(),
    series: z.array(
      z.object({ label: z.string(), value: money, limit: money.optional() }),
    ),
  }),
};

export type CardName = keyof typeof cardSchemas;
export type CardProps<N extends CardName> = z.infer<(typeof cardSchemas)[N]>;
