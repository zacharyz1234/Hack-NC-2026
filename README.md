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

- **As a guest:** the dashboard shows the built-in demo ledger, and Gill chats without reading any data.
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
| Savings goal | `GET/POST /savings-goals`, `PATCH /savings-goals/{id}` |
| Connect demo bank / Refresh bank data | `POST /nessie/connect-demo`, `POST /nessie/sync` |
| Gill chat, permission cards, Gill's cards | `/assistant/sessions/...` (see the contract doc) |
| Gill's voice (Play button) | `POST /assistant/sessions/{id}/messages/{message_id}/speech` |
| Settings → What Gill may read | `GET /consents`, `DELETE /consents/{scope}` |

Guests don't call the data endpoints. Their numbers come from `frontend/src/lib/finance.ts` and reset on refresh.

## Notes for the team

- **Lovable sync:** `frontend/` is a copy of the Lovable project. Lovable only syncs with the GitHub repo it's connected to, so edits here don't flow back to Lovable automatically (and vice versa). Pick one place to keep editing.
- **No Supabase / Lovable AI:** sign-in, Gill's chat and Gill's voice all go through `backend/`. The Lovable-generated Supabase auth, its chat-history table, the `/api/chat` route (Lovable AI gateway) and the `/api/voice` route (ElevenLabs called from the frontend server) were removed. If Lovable offers to "reconnect Supabase", say no.
- **Lockfiles:** the dependency cleanup was done with npm, so `bun.lock` still lists the removed packages. Run `bun install` once if you use bun or Lovable.
- **Secrets:** API keys live only in `backend/.env`. Never put them in the frontend.
