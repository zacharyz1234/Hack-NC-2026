# Gill Gates — Frontend Contract

> **For:** the frontend team building the app in Lovable.
> **Backend:** FastAPI in `backend/` (run `uvicorn app.main:app --reload`, interactive API docs at `http://localhost:8000/docs`).
> **Companion docs:** `GILL_GATES_AGENT_SPEC.md` (product rules), `GILL_GATES_DESIGN.md` (how the backend decides things).

This document is everything the frontend needs to render Gill Gates: which endpoints to call, what comes back, how to draw each piece, and what to send when the student clicks something. You can paste the TypeScript types in section 3 straight into the Lovable project.

## 1. Ground rules

1. **The app works without Gill.** Dashboard, transactions, budgets and goals never depend on the assistant. Closing or never opening Gill changes nothing else.
2. **The frontend never talks to Gemini or ElevenLabs.** No API keys in the Lovable project, no Supabase edge functions calling them. Everything goes through our backend.
3. **Use our backend for accounts.** Log in with `POST /auth/login` / `POST /auth/register` and send `Authorization: Bearer <token>` on every request. Don't add Supabase auth for app accounts. Guests (no token) can still chat with Gill.
4. **Render only what's in this document.** The backend sends structured events. Draw the 8 allowlisted components in section 7 and nothing else. Never render HTML from a message; show message text as plain text (light markdown such as `**bold**` and bullet lists is fine).
5. **Gill can't save anything.** Cards that save (budget plan, savings goal, expense draft) call our normal app API **only when the student clicks the button**. Never auto-save, never save on Gill's behalf.
6. **Consent text comes from the backend.** Show the consent card exactly as sent. Don't write your own descriptions of what data is shared.
7. **Opening Gill reads no data.** On open, create a session and show the greeting. Don't fetch balances or transactions for Gill.

## 2. Setup

- **Base URL:** read it from `VITE_API_BASE_URL` (for example `http://localhost:8000`).
- **CORS:** the backend accepts `http://localhost:<any port>`, `https://*.lovable.app` and `https://*.lovableproject.com`. Other origins can be added with the backend's `CORS_ORIGIN_REGEX` env var.
- **Reaching a laptop backend from the hosted Lovable preview:** the preview runs on the internet and can't see `localhost` reliably. Either run a tunnel on the backend machine (for example `cloudflared tunnel --url http://localhost:8000`) and set `VITE_API_BASE_URL` to the tunnel URL, or export the Lovable project to GitHub and run it locally with `npm run dev`.
- **Mocking before the backend is up:** the example payloads in section 12 are real responses. Return them from a fake API layer to build the UI first.
- **Money:** everything in assistant events and component props is in **dollars** (numbers with up to 2 decimals). The app's save APIs take **cents** (integers). Convert with `Math.round(dollars * 100)` when saving.

## 3. TypeScript types

```ts
// ===== Shared =====
export type Scope =
  | "transactions.summary.read"
  | "transactions.history.read"
  | "balances.read"
  | "budget_goals.read";

export type ConsentChoice = "once" | "chat" | "always" | "deny";
export type TurnState = "ready" | "awaiting_input" | "awaiting_consent";

export interface AssistantTurn {
  session_id: string;
  state: TurnState;
  events: AssistantEvent[];
}

export interface SessionCreated extends AssistantTurn {
  signed_in: boolean;
  voice_available: boolean;
  suggestions: string[];
}

// ===== Events =====
export type AssistantEvent =
  | MessageEvent
  | ComponentEvent
  | ConsentRequestEvent
  | DataAccessEvent
  | NoticeEvent;

export interface MessageEvent {
  type: "message";
  message_id: string; // use for the speech endpoint
  text: string;
}

export interface DataAccessEvent {
  type: "data_access";
  scope: Scope;
  label: string; // e.g. "Gill looked at your spending totals (last 30 days)"
}

export interface NoticeEvent {
  type: "notice";
  text: string; // app-generated, not from Gill
}

export interface ConsentItem {
  scope: Scope;
  title: string;
  details: string;
  period_label: string | null; // e.g. "Sep 11 – Oct 10, 2026"
}

export interface ConsentRequestEvent {
  type: "consent_request";
  request_id: string;
  purpose: string;      // e.g. 'To answer: “Where could I cut spending?”'
  shared_with: string;  // "Google Gemini (the AI behind Gill)"
  footer: string;       // read-only + revocation note
  items: ConsentItem[]; // one row per data type; each gets its own choice
  options: ConsentChoice[];
}

export type ComponentEvent =
  | ComponentOf<"budget_slider", BudgetSliderProps, true>
  | ComponentOf<"category_picker", CategoryPickerProps, true>
  | ComponentOf<"amount_form", AmountFormProps, true>
  | ComponentOf<"budget_plan", BudgetPlanProps, false>
  | ComponentOf<"savings_calculator", SavingsCalculatorProps, false>
  | ComponentOf<"expense_draft", ExpenseDraftProps, false>
  | ComponentOf<"scenario_comparison", ScenarioComparisonProps, false>
  | ComponentOf<"spending_chart", SpendingChartProps, false>;

interface ComponentOf<N extends string, P, A extends boolean> {
  type: "component";
  call_id: string;
  component: N;
  awaits_input: A;
  props: P;
}

// ===== Component props =====
export interface CategoryOption {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface BudgetSliderProps {
  label: string;
  currency: "USD";
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface CategoryPickerProps {
  label: string;
  options: CategoryOption[];
  preselected_ids: number[];
  max_choices: number;
}

export interface AmountFormProps {
  label: string;
  period: "monthly" | "weekly" | "one_time";
  currency: "USD";
  fields: { key: string; label: string }[];
}

export interface BudgetPlanProps {
  month: string;        // "2026-10"
  month_label: string;  // "October 2026"
  currency: "USD";
  total: number | null; // the student's target, if known
  rows: { category_id: number; category: string; amount: number }[];
  allocated: number;
  unallocated: number | null;
  over_allocated: boolean;
  note: string;
  can_save: boolean;    // false for guests
}

export interface SavingsCalculatorProps {
  goal_name: string;
  currency: "USD";
  target: number;
  already_saved: number;
  remaining: number;
  monthly_contribution: number | null;
  months_needed: number | null;
  projected_completion: string | null;      // "2027-03"
  target_date: string | null;               // "2027-03-07"
  months_until_target_date: number | null;
  required_monthly_for_target_date: number | null;
  can_save: boolean;
}

export interface ExpenseDraftProps {
  amount: number;
  description: string;
  category_id: number | null;
  category: string | null;
  date: string; // "2026-10-10"
  category_options: CategoryOption[];
  can_save: boolean;
}

export interface ScenarioComparisonProps {
  currency: "USD";
  monthly_income: number | null;
  scenarios: { name: string; total: number; leftover: number | null }[];
  rows: { category: string; amounts: number[]; diff_vs_first: number[] }[];
}

export interface SpendingChartProps {
  chart: "spending_by_category" | "budget_vs_actual" | "manual_breakdown";
  title: string;
  currency: "USD";
  period_label: string | null;
  series: { label: string; value: number; limit?: number }[];
}

// ===== Request bodies =====
export interface SendMessageBody { text: string } // 1–2000 chars
export interface ConsentBody {
  request_id: string;
  decisions: Partial<Record<Scope, ConsentChoice>>; // one entry per item in the card
}
export interface SubmitBody {
  call_id: string;
  value?: BudgetSliderValue | CategoryPickerValue | AmountFormValue;
  dismissed?: boolean;
}
export interface BudgetSliderValue { amount: number }
export interface CategoryPickerValue { category_ids: number[] }
export interface AmountFormValue { values: Record<string, number> }
export interface AppEventBody {
  type: "user_saved";
  target: "budget" | "savings_goal" | "expense";
}

// ===== Settings =====
export interface ConsentStatus {
  scope: Scope;
  title: string;
  details: string;
  status: "always" | "chat" | "off"; // "chat" = allowed only inside an open chat
  granted_at: string | null;
}
```

## 4. Endpoints

All paths are relative to `VITE_API_BASE_URL`. "Optional login" means: send the bearer token if the student is logged in, send nothing for guests.

### Assistant (optional login)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/assistant/sessions` | — | `SessionCreated` |
| POST | `/assistant/sessions/{session_id}/messages` | `SendMessageBody` | `AssistantTurn` |
| POST | `/assistant/sessions/{session_id}/consent` | `ConsentBody` | `AssistantTurn` |
| POST | `/assistant/sessions/{session_id}/submit` | `SubmitBody` | `AssistantTurn` |
| POST | `/assistant/sessions/{session_id}/events` | `AppEventBody` | 204 |
| POST | `/assistant/sessions/{session_id}/messages/{message_id}/speech` | — | `audio/mpeg` bytes |
| DELETE | `/assistant/sessions/{session_id}` | — | 204 |

A session belongs to whoever created it (a logged-in student or a guest). If the student logs in or out, start a new session.

### Privacy settings (login required)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/consents` | `{ consents: ConsentStatus[] }` |
| DELETE | `/consents/{scope}` | 204 |

### App APIs the save cards use (login required)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/categories` | — | `{ categories: (CategoryOption & { custom: boolean })[] }` (login optional) |
| GET | `/budgets/{month}` | — | `{ month, limits: { category_id, category, limit_cents }[] }` |
| PUT | `/budgets/{month}` | `{ limits: { category_id, limit_cents }[] }` | same as GET |
| GET | `/savings-goals` | — | `{ goals: { id, name, target_cents, saved_cents, target_date }[] }` |
| POST | `/savings-goals` | `{ name, target_cents, saved_cents?, target_date? }` | the created goal (201) |
| POST | `/expenses` | `{ amount_cents, description?, category_id?, spent_on }` | the created expense (201) |
| POST | `/nessie/connect-demo` | — | `{ accounts, expenses_added, income_added, synced_at, warnings: string[] }` |
| POST | `/nessie/sync` | — | same as connect-demo (409 if no bank is linked yet) |

`PUT /budgets/{month}` only updates the categories you send; other categories keep their limits.

### Errors

| Status | When | What to show |
| --- | --- | --- |
| 401 | Login required (settings, save buttons) | Ask the student to log in |
| 404 | Session expired (24h idle), cleared, or belongs to someone else | Start a new session quietly |
| 409 | The card was already answered or is no longer pending | Disable the card |
| 422 | Invalid body (for example slider value out of range) | Fix the input; show `detail` |
| 502 | The Nessie bank sandbox is unreachable (`/nessie/*`) | "Couldn't reach the bank right now." |
| 503 | Gemini/ElevenLabs unreachable | "Gill can't reach the AI service right now. Everything else still works." Keep the student's typed text so they can retry. |

## 5. Chat lifecycle

1. The student clicks the fish → `POST /assistant/sessions` → show the greeting message and `suggestions` as quick-reply chips.
2. The student types (or taps a chip) → `POST …/messages` → render the returned `events` in order.
3. If an event is a `component` with `awaits_input: true`, show it as the active card. When the student submits → `POST …/submit` with that `call_id` → render the new events.
4. If an event is a `consent_request`, show the consent card. When the student decides → `POST …/consent` → render the new events.
5. The student can always type instead of answering a card. Sending a message cancels any pending cards: disable them.
6. Close/minimize hides the panel; the session stays usable for 24 hours of inactivity. "Clear chat" → `DELETE /assistant/sessions/{id}` and start a new one.

`state` tells you whether something is waiting (`awaiting_input`, `awaiting_consent`) or not (`ready`). Keep the text box enabled in every state.

## 6. Rendering events

Render `events` top to bottom. Ignore any `type` you don't recognise.

| Event | Render as |
| --- | --- |
| `message` | A Gill chat bubble with plain text (light markdown OK). Add a speaker button if voice is available. |
| `component` | The matching component from section 7, inside the chat flow. |
| `consent_request` | The consent card from section 8. |
| `data_access` | A small, quiet chip under the conversation: 🐟 *{label}*. It tells the student what Gill just read. |
| `notice` | A centered system line (not a Gill bubble), e.g. "Access was turned off, so Gill cleared this chat." |

## 7. Components (the allowlist)

Validate props with zod before rendering. If validation fails, don't render the component (log it). Every component uses only the props listed here.

### 7.1 `budget_slider` — input

The monthly spending target.

- **Show:** `label`, a slider from `min` to `max` in steps of `step`, starting at `default`, plus a number field bound to the same value. Format as dollars.
- **Submit:** `POST …/submit { call_id, value: { amount } }`.
- **Dismiss (×):** `POST …/submit { call_id, dismissed: true }`.

### 7.2 `category_picker` — input

- **Show:** `label` and a checkbox/chip per option (use `icon`/`color` if present). Pre-check `preselected_ids`. Allow at most `max_choices`.
- **Submit:** `{ call_id, value: { category_ids: [...] } }` (at least one). Dismiss as above.

### 7.3 `amount_form` — input

Used when Gill needs numbers the student hasn't shared (often right after they decline data access).

- **Show:** `label`, then one dollar input per `fields[i]` (label = `fields[i].label`). Show the `period` ("per month", "per week", "one time").
- **Submit:** `{ call_id, value: { values: { [key]: number } } }`. Leave blank fields out; send at least one.

### 7.4 `budget_plan` — display + Save

A proposed monthly budget the student can edit and save.

- **Show:** title "Budget for {month_label}", one editable dollar row per `rows[i]` (`category`, `amount`), the `allocated` total, `unallocated` (if not null; label it "Left unassigned"), and a warning if `over_allocated`. Show `note` under the title.
- **Optional:** fetch `GET /budgets/{month}` yourself and show the current limit next to each row. That data stays in the UI; never send it to the chat.
- **Save button** (only if `can_save`; otherwise "Log in to save"):
  1. `PUT /budgets/{month}` with `{ limits: rows.map(r => ({ category_id: r.category_id, limit_cents: Math.round(edited_amount * 100) })) }`.
  2. On success, show an app toast "Budget saved" and call `POST …/events { type: "user_saved", target: "budget" }`.

### 7.5 `savings_calculator` — display + Create goal

- **Show:** `goal_name`, `target`, `already_saved`, `remaining`, and either "About `months_needed` months at $`monthly_contribution`/month (done by `projected_completion`)" or "$`required_monthly_for_target_date`/month to reach it by `target_date`" (show both if both are present).
- **Interactive (optional):** let the student drag the monthly amount and recompute in the browser with the same math as the backend (work in cents to avoid rounding drift):
  - `remainingCents = max(round(target × 100) − round(already_saved × 100), 0)`
  - `months_needed = ceil(remainingCents / round(monthly × 100))` (0 when nothing remains)
  - `projected_completion` = current month + `months_needed` months, as `YYYY-MM`
  - `months_until_target_date = max(1, (targetYear − thisYear) × 12 + (targetMonth − thisMonth))`
  - `required_monthly = ceil(remainingCents / months_until_target_date) / 100` (rounded **up** to the cent)
- **Create goal button** (only if `can_save`): `POST /savings-goals { name: goal_name, target_cents, saved_cents, target_date }`, then toast "Goal created" and `POST …/events { type: "user_saved", target: "savings_goal" }`.

### 7.6 `expense_draft` — display + Add

A pre-filled expense, e.g. after "I just spent $12 on lunch".

- **Show:** editable amount, description, category (dropdown of `category_options`, preselect `category_id`), and date.
- **Add button** (only if `can_save`): `POST /expenses { amount_cents, description, category_id, spent_on: date }`, then toast "Expense added" and `POST …/events { type: "user_saved", target: "expense" }`.

### 7.7 `scenario_comparison` — display

- **Show:** a table with one column per `scenarios[i].name`. One row per `rows[i]` showing `amounts[j]` (and `diff_vs_first[j]` as "+$x / −$x" for j > 0). Footer rows: `total`, and `leftover` if `monthly_income` is set.

### 7.8 `spending_chart` — display

- **`spending_by_category` / `manual_breakdown`:** a bar or donut chart of `series[i].value` by `series[i].label`.
- **`budget_vs_actual`:** grouped bars or progress bars showing `value` (spent) against `limit`.
- Show `title` and `period_label` (if not null). Format values as dollars.

## 8. Consent card

Shown when Gill needs private data. One card can list several data types; each gets its own choice.

```
┌──────────────────────────────────────────────────────┐
│ 🐟 Gill would like to look at:                        │
│                                                      │
│ Spending totals by category  · Sep 11 – Oct 10, 2026 │
│ Totals and counts per category, plus total income…   │
│   ( Allow once ) ( For this chat ) ( Always ) ( No ) │
│                                                      │
│ To answer: “Where could I cut spending?”             │
│ Shared with: Google Gemini (the AI behind Gill)      │
│ Gill can only read this, never change it. …          │
│                                       [ Continue ]   │
└──────────────────────────────────────────────────────┘
```

- Text comes from the event: `items[i].title`, `items[i].details`, `items[i].period_label`, `purpose`, `shared_with`, `footer`.
- Button labels: `once` → "Allow once", `chat` → "Allow for this chat", `always` → "Always allow", `deny` → "No thanks".
- No option is pre-selected. Don't nag, don't use scary or pushy wording, and make "No thanks" as easy to click as "Allow".
- Submit once every item has a choice: `POST …/consent { request_id, decisions: { [scope]: choice } }`.
- After a "No thanks", Gill offers a manual route (usually an `amount_form`). That's expected.

## 9. Settings: "Gill Gates & privacy"

- **Data access:** list `GET /consents`. For each scope show `title`, `details` and the status ("Always allowed", "Allowed in an open chat", "Off"). A "Turn off" button calls `DELETE /consents/{scope}`. Explain: "Turning this off stops Gill from reading it again. It can't recall what was already sent to Google Gemini." Turning access off also clears any chat that used that data (Gill forgets that conversation). The chat keeps working; its next reply starts with a `notice` event saying so. You may want to clear the old bubbles from the panel at that point.
- **Voice:** "Read Gill's replies aloud" toggle, **off by default**. Store it in localStorage.
- **Clear chat:** `DELETE /assistant/sessions/{id}`.
- **Hide Gill:** a toggle that hides the fish launcher entirely.

## 10. Voice (optional)

- Only offer voice if `voice_available` is true in `SessionCreated`.
- Each Gill message gets a speaker button → `POST …/messages/{message_id}/speech` → play the returned audio. The greeting's id is `greeting`.
- If "Read replies aloud" is on, play each new message automatically, one at a time.
- Always show a stop/mute control while audio plays. Text stays visible; voice is never the only way to read a reply.

## 11. Look and feel

- A small goldfish button on the **left** side of the main screen opens Gill; the chat panel slides in from the side without covering the core budgeting controls.
- Frutiger Aero first (glossy glass panels, aqua/sky gradients, soft highlights, bubbles), with solarpunk accents (leafy greens, warm sunlight). Keep text contrast high on glass.
- Accessibility: the panel is keyboard reachable and closable with Esc, new messages are announced with `aria-live="polite"`, cards are real form controls with labels, and focus moves to a newly shown input card.
- Show a typing/bubbles indicator while a request is in flight (Gemini can take a few seconds).

## 12. Example payloads (use these for mocking)

**Create session**

```json
{
  "session_id": "as_4fQ2m9xLr0KpZ1d8sV3eTw",
  "state": "ready",
  "signed_in": true,
  "voice_available": true,
  "suggestions": [
    "Help me build this month's budget",
    "Where can I reduce my spending?",
    "How much can I safely set aside?",
    "How large should my emergency fund be?"
  ],
  "events": [
    {
      "type": "message",
      "message_id": "greeting",
      "text": "Good day. I'm Gill Gates, and I've spent thirty years on Bowl Street. I can help you build a budget, find room to save, and work through your financial questions. I review your financial records only with your permission."
    }
  ]
}
```

**Budget planning — Gill asks for a target**

```json
{
  "session_id": "as_4fQ2m9xLr0KpZ1d8sV3eTw",
  "state": "awaiting_input",
  "events": [
    { "type": "message", "message_id": "m1", "text": "Let's build it! First, how much do you want to spend in total this month?" },
    {
      "type": "component",
      "call_id": "c_Jx81Qa",
      "component": "budget_slider",
      "awaits_input": true,
      "props": { "label": "How much would you like to spend this month?", "currency": "USD", "min": 0, "max": 5000, "step": 25, "default": 800 }
    }
  ]
}
```

Submit: `POST /assistant/sessions/as_4fQ2…/submit` with `{ "call_id": "c_Jx81Qa", "value": { "amount": 800 } }`.

**Budget planning — the plan card**

```json
{
  "session_id": "as_4fQ2m9xLr0KpZ1d8sV3eTw",
  "state": "ready",
  "events": [
    {
      "type": "component",
      "call_id": "c_Pq20Lm",
      "component": "budget_plan",
      "awaits_input": false,
      "props": {
        "month": "2026-10",
        "month_label": "October 2026",
        "currency": "USD",
        "total": 800.0,
        "rows": [
          { "category_id": 3, "category": "Rent/Home", "amount": 450.0 },
          { "category_id": 2, "category": "Groceries", "amount": 160.0 },
          { "category_id": 10, "category": "Eating out", "amount": 80.0 },
          { "category_id": 6, "category": "Subscriptions", "amount": 30.0 },
          { "category_id": 9, "category": "Travel", "amount": 50.0 }
        ],
        "allocated": 770.0,
        "unallocated": 30.0,
        "over_allocated": false,
        "note": "Leaves a $30 cushion for surprises.",
        "can_save": true
      }
    },
    { "type": "message", "message_id": "m5", "text": "Here's a starting plan with a $30 cushion. Tweak any row and hit **Save budget** when it looks right — I can't save it for you, but the button will." }
  ]
}
```

**Spending question — consent needed**

```json
{
  "session_id": "as_4fQ2m9xLr0KpZ1d8sV3eTw",
  "state": "awaiting_consent",
  "events": [
    { "type": "message", "message_id": "m7", "text": "I can find specific spots to trim if I can see your spending totals." },
    {
      "type": "consent_request",
      "request_id": "cr_9a7Ux2",
      "purpose": "To answer: “Where could I cut spending?”",
      "shared_with": "Google Gemini (the AI behind Gill)",
      "footer": "Gill can only read this, never change it. You can turn access off anytime in Settings; that stops future reads but can't recall what was already sent.",
      "items": [
        {
          "scope": "transactions.summary.read",
          "title": "Spending totals by category",
          "details": "Totals and counts per category, plus total income, for the period. No individual purchases or merchant names.",
          "period_label": "Sep 11 – Oct 10, 2026"
        }
      ],
      "options": ["once", "chat", "always", "deny"]
    }
  ]
}
```

Answer: `POST /assistant/sessions/as_4fQ2…/consent` with `{ "request_id": "cr_9a7Ux2", "decisions": { "transactions.summary.read": "chat" } }`.

**After allowing**

```json
{
  "session_id": "as_4fQ2m9xLr0KpZ1d8sV3eTw",
  "state": "ready",
  "events": [
    { "type": "data_access", "scope": "transactions.summary.read", "label": "Gill looked at your spending totals (last 30 days)" },
    {
      "type": "message",
      "message_id": "m9",
      "text": "In the last 30 days you spent $642.18. The biggest flexible chunk was **Eating out: $212.40** over 9 purchases (33%).\n\n- Cap eating out around $120 → saves about $90/month\n- Subscriptions are $31.97 — worth checking which ones you still use\n\nThese only count what's recorded in the app."
    }
  ]
}
```

## 13. Frontend checklist

- [ ] API client with `VITE_API_BASE_URL` and bearer token from `/auth/login` / `/auth/register`.
- [ ] No Gemini/ElevenLabs calls or keys anywhere in the frontend.
- [ ] Goldfish launcher on the left; side chat panel with open / minimize / close; whole app works with it closed or hidden.
- [ ] On open: `POST /assistant/sessions`; greeting + suggestion chips; no data fetched for Gill.
- [ ] Message list (plain text / light markdown, never raw HTML) + typing indicator + text box always enabled.
- [ ] Event renderer for `message`, `component`, `consent_request`, `data_access`, `notice`; unknown types ignored.
- [ ] zod schemas for all 8 component props; invalid props are not rendered.
- [ ] Input cards: `budget_slider`, `category_picker`, `amount_form` → `/submit`; dismiss sends `dismissed: true`; cards disable after answering or when the student types.
- [ ] Display cards: `scenario_comparison`, `spending_chart`.
- [ ] Save cards: `budget_plan` → `PUT /budgets/{month}`, `savings_calculator` → `POST /savings-goals`, `expense_draft` → `POST /expenses`; then `POST …/events`; app toast; "Log in to save" for guests.
- [ ] Consent card with one choice per item, backend text only, equal-weight "No thanks".
- [ ] "Gill looked at…" chips.
- [ ] Settings → Gill Gates & privacy: consents list with "Turn off", voice toggle (off by default), clear chat, hide Gill.
- [ ] Bank data buttons (outside Gill): "Connect demo bank" → `POST /nessie/connect-demo`, "Refresh bank data" → `POST /nessie/sync`.
- [ ] Voice: speaker button per message, autoplay only when the toggle is on, stop/mute control.
- [ ] Error states for 401/404/409/422/503 as in section 4.
- [ ] Accessibility: keyboard, Esc to close, `aria-live`, labelled inputs, focus management, readable contrast on glass.

## Finance page navigation and the Gill view

The finance UI now lives at `/accounts`, `/spending`, and `/purchases`. Shared data,
mutation handlers, mute state, and chatter preferences are exposed by `useFinance()`
from `frontend/src/lib/finance-context.ts`; the provider stays mounted
above the routes. Demo edits persist during navigation and reset on refresh.

The conversation-view integration slot is `frontend/src/routes/gill.tsx`.
Replace `GillDestination` with the conversation view when ready. Read validated
`returnTo` and `initialQuestion` from `Route.useSearch()`. Use `useFinance()` for
`user`, `muted`, `setMuted`, and `reload` when wiring the existing chat contract.
The shared shell already supplies wallpaper, account settings, and the taskbar.
This placeholder does not mount `GillChat` or start an assistant session.

Call `useGillNavigation().openGill(returnTo, initialQuestion?)` from
`frontend/src/lib/gill-navigation-context.ts` to navigate through
the bubble transition. Allowed return destinations are `/`, `/accounts`,
`/spending`, and `/purchases`; other values fall back to `/`. Navigation context
never contains financial records. Consent and assistant data access rules above
still apply when the conversation view is connected.

`GET /transactions` also accepts optional `offset` (default 0, non-negative).
The response shape and default 200-row limit are unchanged. The finance provider
reads successive pages until a short page is returned, and displays totals only
after all pages load successfully. Signed-in balances remain bank snapshots;
manual transaction edits update the ledger, not the bank account balance.
