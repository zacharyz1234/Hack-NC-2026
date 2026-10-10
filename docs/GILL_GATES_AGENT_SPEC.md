# Gill Gates — AI Assistant Specification

> **Audience:** Human developers and coding agents contributing to the college student budgeting application.  
> **Status:** Product behavior is based on team decisions discussed so far. Technical interfaces and schemas in this document are **proposals**, not existing repository contracts.  
> **Scope:** The optional in-app AI assistant, its permissions, UI interactions, and experimentation workflow.

## 1. Product context

The application helps college students track income and expenses, plan monthly budgets, understand spending patterns, and make better-informed financial decisions. The intended visual direction is primarily **Frutiger Aero**, with **solarpunk** influences.

**Gill Gates** is the optional fish-themed AI assistant. It is powered by **Gemini** for conversation and tool-selection, with **ElevenLabs** for optional text-to-speech. The student must be able to use the budgeting application without activating Gill Gates.

### Confirmed product decisions

1. Gill Gates is **optional**; normal budgeting workflows must not depend on it.
2. Gill Gates may offer financial education, budgeting help, and recommendations, but access to sensitive user financial data requires **explicit, informed permission**.
3. Sensitive data includes at minimum **transaction history** and **account balances**. Consent must be separately controllable for each category.
4. Gill Gates has **read-only** access to authorized information. It may **never** create, update, delete, or overwrite financial records.
5. Gill Gates can ask conversational questions and invoke predefined tools that cause interactive components to appear in the React frontend (for example, “How much would you like to spend this month?” with a budget selector).
6. The team's chosen use of **Project Nessie** is experimentation with the analytical data supplied to Gemini, to compare AI financial recommendations.
7. The current proposed application stack includes **Python, SQLite (`sqlite3`), React, HTML/CSS/JavaScript, Gemini, ElevenLabs**, and Nessie. **FastAPI and Apache Iceberg** have been recommended but should be confirmed against the actual repo.
8. **Photon** is on the backlog, but its intended role has not yet been defined.

### Non-goals

- Gill Gates is **not** a bank account operator or autonomous financial manager.
- It cannot transfer funds, transact, submit purchases, or modify budgets or transactions.
- It does not automatically ingest or inspect all user financial data merely because a chat was opened.
- Nessie is not the live application's SQLite replacement, an authorization service, or a way to version each user's individual transactions.
- Do not position generated responses as guaranteed financial, tax, legal, or investment advice.

## 2. User experience

### Assistant activation

- Display a visible but unobtrusive fish assistant entry point.
- The user can open, minimize, or dismiss it and continue using all core features.
- No transaction/balance data should be loaded for the assistant when the widget opens.
- Speech must be opt-in or explicitly enabled; provide mute/stop controls and a text alternative.
- Use the site's Frutiger Aero design language without making the chat difficult to read or navigate.

### Consent model

Consent should be **granular, purpose-limited, revocable, and default-denied**.

Recommended permission scopes:

| Scope | Example authorized operation | Default |
| --- | --- | --- |
| `budget_goals.read` | Read budget goals already recorded by the user | Denied |
| `transactions.summary.read` | Read categorized monthly expense totals | Denied |
| `transactions.history.read` | Read individual transactions in an approved time window | Denied |
| `balances.read` | Read the user's available account balance(s) | Denied |

These names are **proposed**. Prefer the narrowest scope necessary; a monthly summary should not require raw merchant-level transaction access if the backend can safely compute the summary. Ask consent in context before an unauthorized read, describing **what data**, **why**, and, where appropriate, **which period/accounts** will be accessed. Explain whether information will be sent to Gemini as an external model provider. A denied request must have an alternative using values the user enters manually.

Revocation must prevent **future** access immediately. Make the scope, duration (one-time/session/persistent), expiry, and deletion/retention policy explicit before implementing persistence. Do not assume revocation can erase data already transmitted to an external provider; minimize transmissions and communicate those limits accurately.

**Crucial:** The backend, not the prompt or React UI, must enforce authorization on *every* protected tool call. The model never gets database credentials, unrestricted SQL access, or a generic query executor.

### Read-only rule

Gill Gates can request `get_*` and `show_*` operations within authorized bounds. No model-callable `save_*`, `update_*`, `delete_*`, `transfer_*`, or equivalent mutation tools are allowed. The frontend may separately offer a user-operated “Save budget” feature through the application's ordinary authenticated API, but this must be a **direct user action**, not an autonomous action by the assistant. This distinction must be preserved even if the chatbot recommends a specific change.

## 3. Example interactions

### A. Budget planning without accessing private data

1. Student opens Gill Gates.
2. Gill Gates: “How much would you like to spend this month?”
3. Assistant requests the predefined UI tool `show_budget_slider`.
4. React renders a controlled monthly-target slider/input.
5. Student enters **$800** and submits that value to the current chat session.
6. Gill Gates asks which categories matter (groceries, rent, transport, entertainment, etc.) and may request `show_category_picker`.
7. Gill Gates suggests an allocation. **Nothing is saved automatically.**
8. A user-facing save control, if present, is handled outside the agent's permissions.

### B. Personalized suggestion with transaction-history consent

1. Student: “Where could I cut spending?”
2. Assistant determines that a categorized spending summary would help and that the user has not granted access.
3. UI requests permission for `transactions.summary.read` for, e.g., the last 30 days; explain use by Gemini.
4. If approved, backend validates the student's identity, ownership, scope, and allowed time window, then calculates a minimal summary.
5. The authorized summary (not necessarily raw transactions) is sent as contextual data to Gemini.
6. Gill Gates provides transparent, specific ideas with grounded amounts and avoids inventing financial facts.
7. If denied, Gill Gates asks the student for manually entered amounts instead.

### C. Balance access

1. Student: “How much can I safely set aside?”
2. Assistant requests `balances.read` only if the answer truly needs current balances.
3. After explicit consent, the backend provides authorized balance information.
4. Gill Gates explains its assumptions and uncertainty, including unrecorded bills, timing, and future obligations.
5. The assistant may recommend an amount but cannot move funds or change account balances.

## 4. Suggested architecture

```text
React web app
  ├── Budget dashboard, transactions, goals (works without AI)
  ├── Gill Gates chat UI / optional speech UI
  ├── Consent dialog and permission management
  └── Whitelisted interactive components
              │
              ▼
Python backend (FastAPI is a proposal)
  ├── Authentication + user ownership verification
  ├── Consent/authorization service (deny by default)
  ├── Read-only financial query services
  ├── Agent orchestration + allowed tool dispatcher
  ├── Gemini integration (secrets held server-side)
  ├── ElevenLabs proxy / voice service (optional)
  └── Financial analytics pipeline
              │
       ┌──────┴─────────────────┐
       ▼                        ▼
SQLite application DB     Iceberg analytical tables
(users, expenses,         + Nessie versioned catalog
balances, budgets)        (main, experiment branches)
```

**Data flow requirement:** A protected read flows through authentication, consent verification, bounded read-only service, data minimization, and only then to the model. Do not expose database connections to the LLM.

For initial development, use synthetic accounts/transactions. If the app ever uses actual banking integrations, additional requirements (provider terms, credential handling, data retention, financial privacy, security review) must be designed explicitly.

## 5. Proposed agent tool interface

Tools should have strictly defined input/output schemas, validated server-side. The tool dispatcher must reject unknown names or unexpected arguments. Tool-call responses for UI rendering should be **structured data**, not arbitrary executable frontend code.

| Tool | Purpose | Permission | Side effects |
| --- | --- | --- | --- |
| `show_budget_slider` | Display monthly budget target input | None | UI only |
| `show_category_picker` | Display spending category choices | None | UI only |
| `show_savings_calculator` | Display calculation inputs/results | None when manual values used | UI only |
| `compare_budget_scenarios` | Compare hypothetical allocations | None when manual values used | UI only |
| `get_spending_summary` | Fetch summarized expenses for a specified period | `transactions.summary.read` | Read-only |
| `get_transaction_history` | Fetch narrowly scoped history when necessary | `transactions.history.read` | Read-only |
| `get_account_balances` | Fetch account balances | `balances.read` | Read-only |
| `get_budget_goals` | Fetch recorded goals | `budget_goals.read` | Read-only |
| `show_spending_chart` | Request chart display using authorized data | Depends on source | UI only |

An example **illustrative** UI-tool result:

```json
{
  "type": "render_component",
  "component": "budget_slider",
  "request_id": "example-request-id",
  "props": {
    "label": "How much would you like to spend this month?",
    "currency": "USD",
    "min": 0,
    "max": 5000,
    "step": 25
  }
}
```

React must render components only from a **trusted allowlist** and validate props and ranges. User input is returned to the chat flow as a user-submitted result, never treated as an instruction granting permissions or authorizing writes.

### Tool enforcement pseudocode

```python
# Illustrative pseudocode; adapt to the actual framework and auth model.
def execute_tool(authenticated_user, tool_name, args):
    spec = ALLOWED_TOOLS.get(tool_name)
    if spec is None or spec.mutates_financial_data:
        raise Forbidden("Tool not available")

    validated = spec.validate(args)
    if spec.permission:
        consent_service.require_active_scope(
            user_id=authenticated_user.id,
            scope=spec.permission,
            requested_resource=validated.resource,
            requested_period=validated.period,
        )

    return spec.run_as_user(authenticated_user.id, validated)
```

Recommended backend protections: authenticated user identity from the session/token (never agent-supplied `user_id`), strict row-level ownership filters, limited date ranges, pagination/result-size limits, audit logs that avoid raw financial payloads, timeouts, and rate limits. Treat transaction descriptions, model outputs, and chat content as untrusted input; protect against prompt injection.

## 6. How Nessie is used

**Chosen use case:** **AI financial recommendation experiments.** Nessie supports branches/tags/commits for the *metadata references to Iceberg analytical tables*; it does not itself train Gemini or store the live SQLite database.

Suggested evaluation workflow:

1. Create a synthetic or appropriately de-identified analytical dataset from SQLite transactions.
2. Generate the **main** summary dataset (e.g., income, total expenses, category totals).
3. Create an **experiment** branch and generate an enhanced version (e.g., category trends, recurring expense indicators).
4. Ask the same test questions against both datasets using controlled Gemini prompts/model settings.
5. Measure accuracy of amounts, personalization, actionable suggestions, harmful/unsupported assertions, latency, and cost.
6. Record the Nessie commit/branch, dataset version, prompt version (in Git), model version, and evaluation results.
7. After review, merge approved analytical dataset changes if appropriate. Deploy prompt/model logic independently; a Nessie merge does **not** deploy application code.

**Example test question:** “I have $250 left after expenses. What are three realistic ways to save more this month?” The basic dataset may only contain total expenses; the experimental dataset could contain food/subscription trends. Compare recommendations against the same ground-truth test fixtures.

The Nessie analytics path **never bypasses consent**. If any real student-derived data is involved, enforce consent/authorization before supplying individual-level results to the assistant, and avoid exposing identifiable analytics datasets to experiments by default. Prefer synthetic data during development and evaluation.

## 7. Financial-response behavior

- Give budgeting guidance and educational explanations in accessible, student-friendly language.
- Explain the figures and assumptions used; distinguish known values from estimates.
- Ask follow-up questions when material information is missing instead of inventing balances, bills, or earnings.
- Offer a non-personalized, manual-input route whenever access is declined.
- Never claim to have changed, saved, deleted, or transferred anything.
- Avoid guaranteed outcomes and overconfident claims about debt, investments, taxes, or credit; suggest professional assistance for consequential personalized decisions.
- Do not present the AI as a licensed financial adviser.
- The assistant should be friendly and on-theme, but not pressure students to grant access or make choices.

## 8. Security and privacy implementation requirements

1. **Consent checked on every call:** The model may request a tool; the server determines whether it is allowed.
2. **Least privilege:** Create dedicated read-only data access paths; no database write permissions from the agent runtime.
3. **Identity and isolation:** Each query is scoped to the authenticated student's own records.
4. **Explicit data-sharing notice:** Explain if transaction-derived facts will be sent to Gemini; define retention and disclosure practices before launch.
5. **Opt-out works:** The app remains functional without the assistant, without voice, and without private-data sharing.
6. **Revocation:** Future reads stop promptly after the user revokes a scope.
7. **Separate user actions:** Any actual saving of a budget is a normal frontend/backend action confirmed by the student, not an agent mutation.
8. **Secrets:** Store Gemini/ElevenLabs keys on the server; never embed them in React bundles.
9. **Auditability:** Record non-sensitive permission changes, tool names, outcomes, and time for debugging/security; avoid logging account balances or raw transactions unnecessarily.
10. **Defensive design:** Validate tool schemas, constrain context, handle model/tool failures gracefully, and do not render arbitrary model-generated HTML/JS.

## 9. Proposed implementation phases

### Phase 1 — Assistant experience (no sensitive-data access)
- Floating/dismissible Gill Gates widget.
- Gemini conversation using general financial education and manual input only.
- Whitelisted React components: monthly budget slider and category selector.
- Optional ElevenLabs text-to-speech with clear controls.

### Phase 2 — Consent + protected read tools
- Authentication and record ownership.
- Consent dialog and scope management UI, default denied.
- Backend checks on every read-only tool call.
- Monthly category summary first; raw history and balances only if actually needed.
- Revocation and denial-path tests.

### Phase 3 — Recommendation quality
- Transparent calculations and spending insights.
- Evaluation fixtures and automated tests for math, relevance, and access policy.
- Clear distinction between information, estimates, and suggestions.

### Phase 4 — Nessie experiments
- Iceberg + Nessie proof of concept with synthetic data.
- Main vs experimental data-summary branches.
- Repeatable evaluation runs and reports.
- Approval criteria and promotion workflow for analytical datasets.

## 10. Acceptance criteria for coding agents

- [ ] Students can use all non-AI financial features with Gill Gates disabled.
- [ ] Opening Gill Gates **does not** automatically read transactions or balances.
- [ ] Without consent, any protected read tool is rejected by the **backend**.
- [ ] Consent to summaries **does not imply** consent to raw transaction history or balances.
- [ ] Permission can be revoked, and subsequent protected reads fail.
- [ ] Gill Gates has **zero model-callable mutation tools** for financial records.
- [ ] React shows only allowlisted UI components with validated arguments.
- [ ] Student-entered budget targets are **not saved automatically**.
- [ ] Tool requests cannot bypass authenticated user/record ownership checks.
- [ ] Gemini and ElevenLabs secrets are not present in frontend code.
- [ ] Data sent to Gemini is the minimum needed to answer the user's question.
- [ ] Denied consent still leads to a useful manual-input interaction.
- [ ] Nessie experiments run on synthetic/de-identified analytical data and do not change live SQLite records.
- [ ] Evaluation records identify the dataset version and model/prompt configuration.

## 11. Open decisions requiring team confirmation

- Exact Python web framework (FastAPI was recommended, not confirmed).
- Authentication/account model and whether actual bank connections are in scope.
- Consent lifetimes, storage, revocation mechanics, and privacy/retention policy.
- Whether to store chat history and for how long.
- Whether ElevenLabs voice is on by default, opt-in per response, or configured in settings.
- The exact UI tool message protocol and rendering framework.
- Analytics execution engine (e.g., Spark) and where Iceberg/Nessie will run.
- Ownership of prompt/model evaluation and approval before promotion.
- Meaning and planned integration of **Photon**.

## 12. Guidance for future coding agents

Before implementing or changing Gill Gates, inspect the existing repository architecture and contracts. Treat this document as the **intended behavior and security boundary**, not as evidence that particular code, routes, database tables, or tool names already exist. Reuse existing conventions where possible; propose small, reviewable changes. If an implementation shortcut conflicts with explicit opt-in, per-call authorization, or read-only access, **do not take that shortcut**. Document any assumptions and surface unresolved product decisions to the team.
