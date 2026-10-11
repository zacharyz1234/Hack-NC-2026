# Fictional student budget comparisons

The Spending page reuses its analysis month. Matching inputs stay in page state,
with no permanent student profile. Submit monthly income and housing, then select
one of three fictional profiles with the same housing. Matches sort by absolute
income difference, then profile ID. Twelve deterministic scenarios cover four
housing arrangements and monthly income of $1,000, $2,000 and $3,000.

## Data and calculations

Profiles are **fictional examples**, never real students. Without a usable
snapshot, responses say **Fictional sample data** and generate deterministic
dated example activity. Successful refreshes say **Fictional Nessie sandbox data**
and include the snapshot update time. Budget limits are application-owned plans;
Nessie provides checking purchases and deposits.

Both sides use checking accounts only, excluding savings and unassigned records.
Current-month activity is month-to-date, with future-dated activity excluded.
Past months include the whole month. Budgets always show monthly limits rather
than prorated limits. Zero/missing limits display “Not set.” Spending percentages
use actual income recorded in the period, not the matching income estimate;
zero recorded income returns `null`. Net cash flow is actual income minus actual
spending. Category differences are **your spending minus their spending**.
Custom/unclassified categories remain in the union of comparison categories.
Guest demo category aliases align Housing, Food & Drink and Transport with the
built-in Rent/Home, Eating out and Auto categories; signed-in custom names remain
unchanged. Smaller spending by itself does not indicate a better budget.

## Explicit Nessie setup/refresh

Set `NESSIE_API_KEY` in `backend/.env`, then run from `backend` using its virtual
environment:

```powershell
.\.venv\Scripts\python.exe -m app.services.peer_budget_setup --month 2026-10
```

The command creates/reuses twelve reserved sandbox customers, one checking
account each and a shared fictional merchant. It creates deterministic dated
purchases and deposits for the chosen month, then reads them back into SQLite.
Running again for the same month reuses deterministic customer names, account
nicknames and transaction descriptions. Interrupted provisioning recovers on
the next run. Do not rename these reserved remote objects. Setup processes are
serialized with a SQLite write transaction; run one setup at a time.

`demo_peer_profiles` and `demo_peer_snapshots` are initialized through the normal
SQLite schema mechanism. They never reference a student user. Setup rejects
customers/accounts already linked to real app users; public reads also exclude
such collisions. A failed or incomplete refresh preserves that profile's prior
snapshot. If there is no usable snapshot, reads use labeled samples. Partial
provisioning may leave reusable sandbox objects, but never replaces an existing
snapshot with partial data. The command exits nonzero when any profile fails.
No bank identifiers, URLs or API keys appear in command reports or public peer
responses. Setup never modifies student accounts, transactions, budgets or goals.

Page loads, API reads and Gill tools perform **no remote reads or writes**. Only
this explicit command calls Nessie. Samples work immediately after backend startup;
no setup command or provider key is required for the sample experience.

## API

`POST /peer-budgets/matches` is public:

```json
{"month":"2026-10","monthly_income_cents":200000,"housing":"shared_rental"}
```

Housing values: `family_home`, `campus_housing`, `shared_rental`, `living_alone`.
Response: `{month, profiles}`. Each profile includes its fictional label, housing,
planned monthly income, actual income/spending, category budgets and spending,
totals, percentage, period/as-of label, source, update time and match explanation.
Public responses contain no Nessie customer/account identifiers.

`POST /peer-budgets/compare` accepts `{profile_id, month}`. Signed-in requests
compare only the authenticated user's saved budgets and checking records. Guest
requests must explicitly add `demo_summary`:

```json
{
  "profile_id":"peer-shared_rental-2000",
  "month":"2026-10",
  "demo_summary":{
    "source":"Local demo ledger",
    "income_cents":45000,
    "categories":[{"category":"Groceries","budget_cents":20000,"spending_cents":4280}]
  }
}
```

The response includes both summaries, category comparisons, the three largest
absolute spending differences (category-name tie break), and descriptive notes.
The server calculates all differences and totals. Unknown profile IDs return 404;
invalid months, amounts, housing, extra fields and unlabeled guest data return 422.

## Gill

The button opens the existing Gill route with the selected ID and month. Signed-in
navigation includes no financial figures. `get_peer_budget_comparison` asks for
both `transactions.summary.read` and `budget_goals.read`, using the selected
month's lookback, before reading anything private. Either denial prevents the
comparison read. `get_peer_budget` reads fictional public information only.

Guests intentionally supply their **Local demo ledger** summary via the explicit
button action. `get_demo_peer_budget_comparison` accepts only that labeled manual
summary and is unavailable to signed-in sessions, so it cannot bypass consent.
The guest navigation question contains only demo figures; it can appear in browser
history. Gill message/navigation limits are 16,000 characters to accommodate a
bounded category summary. No personal figures are automatically sent to Gemini.

Gill explains server-computed differences, income/housing context and optional
changes with tradeoffs. It must preserve demo labels and never claim fictional
profiles are real students. The existing editable budget card and student Save
button remain the only Gill-assisted budget-saving flow. No tools save changes.

## Validation

`backend/tests/test_peer_budgets.py` covers matching/filtering/ties, validation,
month-to-date calculations, checking-total agreement, missing limits, zero income,
custom categories, deduplication, interrupted/failed refreshes, fallback labels,
real-user isolation, public identifier exclusion, Gill consent and no autosave.
`frontend/src/test/peer-budget-comparison.test.tsx` covers local matching inputs,
profile selection, month changes, labels/totals, the keyboard-accessible scrolling
table, guest/signed-in Gill handoff, retries and refresh after budget saves.
Providers are mocked in tests; no Nessie/Gemini calls occur during validation.
