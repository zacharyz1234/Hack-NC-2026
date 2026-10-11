# Hack-NC-2026 — Bowl Street Journal

A student budgeting app with **Gill Gates**, a goldfish AI assistant that can only read your money data with your permission and can never change it.

- `backend/`: Python + FastAPI + SQLite. Accounts, budgets, transactions, the Capital One Nessie bank sync, and Gill (Gemini + ElevenLabs).
- `frontend/`: React (TanStack Start, built in Lovable). The Windows-XP/Frutiger Aero desktop and Gill's chat window.
- `docs/`: how Gill works (`GILL_GATES_DESIGN.md`), the API the frontend uses (`GILL_GATES_FRONTEND_CONTRACT.md`), and the database (`tables.md`).

## Run it locally

You need **Python 3.11+** and **Node 20+**. Follow the complete set of instructions for your operating system. Start the backend and frontend in separate terminals, leaving both running.

### Windows (PowerShell)

From the repository root, set up and start the backend in terminal 1:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env and fill in GEMINI_API_KEY (and ELEVENLABS_API_KEY / NESSIE_API_KEY if you have them)
.\.venv\Scripts\python.exe -m scripts.seed_demo --offline  # optional: add demo student and sample bank data
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

If `py` isn't available, use `python` in its place. Keep this terminal running; the backend is at http://localhost:8000 and its interactive API docs are at http://localhost:8000/docs. Run uvicorn through `.venv\Scripts\python.exe -m uvicorn` so it uses the installed dependencies.

In terminal 2, from the repository root, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:8080. The frontend calls the backend at `http://localhost:8000`. To use a different backend (such as a teammate's machine or a tunnel), copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

To run tests, from the repository root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest  # offline (Gemini/ElevenLabs/Nessie are faked)
cd ..\frontend
npm test
```

### macOS / Linux (Bash)

From the repository root, set up and start the backend in terminal 1:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
# Edit .env and fill in GEMINI_API_KEY (and ELEVENLABS_API_KEY / NESSIE_API_KEY if you have them)
.venv/bin/python -m scripts.seed_demo --offline  # optional: add demo student and sample bank data
.venv/bin/python -m uvicorn app.main:app --reload
```

Keep this terminal running; the backend is at http://localhost:8000 and its interactive API docs are at http://localhost:8000/docs. Run uvicorn through `.venv/bin/python -m uvicorn` so it uses the installed dependencies.

In terminal 2, from the repository root, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:8080. The frontend calls the backend at `http://localhost:8000`. To use a different backend (such as a teammate's machine or a tunnel), copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

To run tests, from the repository root:

```bash
cd backend && .venv/bin/python -m pytest  # offline (Gemini/ElevenLabs/Nessie are faked)
cd ../frontend && npm test
```

### Try it

- **As a guest:** the dashboard shows the built-in demo ledger. Gill needs an account, so opening him asks you to sign in first (the backend rejects every `/assistant` call without a login).
- **Signed in:** click **Sign in** and use the demo student from step 1. The email and password are in `backend/scripts/seed_demo.py`. Or create your own account and click **Connect demo bank** to get a Nessie sandbox bank (needs `NESSIE_API_KEY`).
- Ask Gill **"Where could I cut spending?"**. A permission card appears; allow it and Gill answers from your real totals.
- **My account** → **What Gill may read** lists each permission and lets you turn it off.

## What talks to what

| Frontend | Backend endpoint |
| --- | --- |
| Sign in / create account / sign out | `POST /auth/login`, `/auth/register`, `/auth/logout`, `GET /auth/me` |
| Checking & savings balances | `GET /accounts` |
| Recent purchases, add / edit / delete a transaction | `GET/POST /transactions`, `PATCH/DELETE /transactions/{id}` |
| Spending analysis, budget planner | `GET /transactions`, `GET/PUT /budgets/{month}`, `GET /categories` |
| Fictional student budget comparisons | `POST /peer-budgets/matches`, `POST /peer-budgets/compare` |
| Savings goal | `GET/POST /savings-goals`, `PATCH /savings-goals/{id}` |
| Connect demo bank / Refresh bank data | `POST /nessie/connect-demo`, `POST /nessie/sync` |
| Gill chat, permission cards, Gill's cards | `/assistant/sessions/...` (see the contract doc) |
| Gill's voice (Play button) | `POST /assistant/sessions/{id}/messages/{message_id}/speech` |
| Settings → What Gill may read | `GET /consents`, `DELETE /consents/{scope}` |
| Bowl Street stock search / quotes / history / featured watchlist cards | `GET /stocks/search`, `/stocks/quotes`, `/stocks/history` |

Guests don't call the personal finance endpoints. Their ledger comes from `frontend/src/lib/finance.ts` and resets on refresh. Stock market data uses the public backend endpoints for both guests and signed-in users.

## Twelve Data setup

Add `TWELVE_DATA_API_KEY` to `backend/.env` and restart the backend. The frontend sends searches and quote requests to FastAPI; the provider key stays on the server.

Bowl Street refreshes quotes and its three featured watchlist cards every hour while the market page is open. Search accepts US company names and tickers. Selecting a stock requests its quote immediately, reusing a quote already fetched in the current hourly cache window when available. Watchlist prices and practice portfolio valuations use the same quotes.

The stock chart uses Twelve Data `/time_series` history for the selected stock only. One daily request supplies the 1W, 1M, 3M, and 1Y views, filtered locally by calendar range ending at the latest available trading date. Daily history is cached for 24 hours. Selecting 1D fetches five-minute prices for the latest available regular trading session, cached for one hour; its date and New York timezone are displayed explicitly, including on weekends and holidays. The current session may be incomplete. Both datasets together cost two history credits per stock on an uncached load, separate from quote/search usage; switching cached ranges does not make additional provider requests. History caches are shared in backend memory and reset on restart. Missing history displays an unavailable message; a failed refresh keeps any previously loaded chart with a warning.

The **Featured stocks** cards show the three highest-priced watchlist entries, including ETFs, sorted by price per share using quotes already loaded for the watchlist. The order updates when quotes or watchlist membership change; equal prices sort by ticker, and entries without quotes appear last. The cards add no API requests or credit usage. Empty slots prompt the user to add a watched stock. The practice portfolio total is labeled explicitly and equals available cash plus the current quoted value of practice shares.

The page no longer calls `/stocks/top` or scans the US market. That legacy backend endpoint remains available with its plan-capacity guard. Keep `TWELVE_DATA_CREDITS_PER_MINUTE` set to your actual plan allowance; increasing this setting does not upgrade the provider plan. Twelve Data charges one credit per quoted symbol, including symbols within a batch. The three default watched/held symbols use about three quote credits per hourly refresh; searches and additional symbols can consume more.

Refreshes and caches are shared within one backend process. Run one API worker for this setup; multiple workers or server instances require a shared cache/refresh worker to avoid multiplying credit usage. Quote polling stops when the market page is closed. Check [Twelve Data's batch credit rules](https://support.twelvedata.com/en/articles/5203360-batch-api-requests) and obtain the [appropriate display rights](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) for a public site.

## Gill's stock information tools

Gill resolves US company names/tickers (`get_stock_search`), reports the latest available USD quote and daily dollar/percentage change (`get_stock_quote`), and compares explicitly dated daily prices (`get_stock_price_comparison`). These public tools need no data-access consent and read no personal financial data. Like all of Gill, they require a signed-in user. The API key stays in the backend.

Ask, for example, "What was NVIDIA's price between May 10, 2026 and June 10, 2026?" Gill reports both requested and actual trading dates, both prices, the direction, and server-computed dollar and percentage changes. Missing years prompt clarification. Non-trading dates use the most recent available session within the preceding seven days, with its date disclosed. Future dates and ranges longer than ten years are rejected. Daily prices are split-adjusted and exclude dividends/total return; the current session may be incomplete.

Stock quotes and searches share the webpage's caches. Historical comparisons reuse cached daily chart data when it covers the requested dates; otherwise one bounded daily-history request is cached for 24 hours. Current quotes include their timestamp and hourly cache notice. Missing data or quota errors are reported without invented prices. Gill's prompt and tool descriptions restrict stock answers to facts and explicitly prohibit buy/sell/hold recommendations, allocations, price targets, and predictions.

## Notes for the team

### Students in a similar situation

Spending now matches twelve fictional student scenarios by housing and monthly income.
Select a profile to compare saved budgets and checking activity for the page's month,
including month-to-date figures, totals and cash flow. Guest comparisons on the page use the labeled
local demo ledger. **Ask Gill to compare** asks guests to sign in first, then uses existing consent gates for
financial figures and offers optional changes through the existing review/Save flow.
Fictional sample data works immediately. To provision/refresh Nessie sandbox snapshots,
run from `backend`: `.\.venv\Scripts\python.exe -m app.services.peer_budget_setup --month 2026-10`.
See [peer comparison setup and API](docs/PEER_BUDGETS.md) for source labels and recovery behavior.

- **Lovable sync:** `frontend/` is a copy of the Lovable project. Lovable only syncs with the GitHub repo it's connected to, so edits here don't flow back to Lovable automatically (and vice versa). Pick one place to keep editing.
- **No Supabase / Lovable AI:** sign-in, Gill's chat and Gill's voice all go through `backend/`. The Lovable-generated Supabase auth, its chat-history table, the `/api/chat` route (Lovable AI gateway) and the `/api/voice` route (ElevenLabs called from the frontend server) were removed. If Lovable offers to "reconnect Supabase", say no.
- **Lockfiles:** the dependency cleanup was done with npm, so `bun.lock` still lists the removed packages. Run `bun install` once if you use bun or Lovable.
- **Secrets:** API keys live only in `backend/.env`. Never put them in the frontend.


## CREDITS

APIS: Google Gemini, Nessie, ElevenLabs, Twelve Data
LLMS: ChatGPT Codex, Claude Code, Loveable
ONLINE RESOURCES: frutigeraeroarchive.org, Canva
