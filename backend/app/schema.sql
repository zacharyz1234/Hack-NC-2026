--- Created by Bryce and Garrett

--- Table for users. nessie_customer_id links the user to a Capital One Nessie sandbox customer
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nessie_customer_id TEXT
);


--- table for session
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);


--- Money is stored in cents (1999 = $19.99). Dates are ISO text. See docs/tables.md for more info

--- categories: user_id NULL = built-in default, otherwise a users custom category
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_default_name ON categories(name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name ON categories(user_id, name) WHERE user_id IS NOT NULL;

INSERT OR IGNORE INTO categories (name) VALUES
    ('Auto'),
    ('Groceries'),
    ('Rent/Home'),
    ('Education'),
    ('Insurance'),
    ('Subscriptions'),
    ('Bills'),
    ('Shopping'),
    ('Travel'),
    ('Eating out'),
    ('Debt payments');


--- income: nessie_id is set for deposits imported from Nessie. account_id (both tables) = the bank account, if known
CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'once'
        CHECK (frequency IN ('once', 'weekly', 'biweekly', 'monthly')),
    received_on TEXT NOT NULL,
    nessie_id TEXT UNIQUE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
);


--- expenses: nessie_id is set for purchases imported from Nessie
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    description TEXT,
    spent_on TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'nessie')),
    nessie_id TEXT UNIQUE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
);


--- budgets: one limit per user, category and month (YYYY-MM)
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    limit_cents INTEGER NOT NULL,
    UNIQUE (user_id, category_id, month)
);


--- savings goals
CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_cents INTEGER NOT NULL,
    saved_cents INTEGER NOT NULL DEFAULT 0,
    target_date TEXT
);


--- bank accounts copied from the Capital One Nessie sandbox (see app/services/nessie_sync.py)
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nessie_id TEXT UNIQUE,
    type TEXT NOT NULL,
    nickname TEXT,
    balance_cents INTEGER NOT NULL,
    synced_at TEXT NOT NULL
);


--- Gill Gates chats. transcript, pending and meta are JSON (see app/assistant/orchestrator.py).
--- user_id is always set now (Gill requires a login); NULL rows are old guest chats nobody can open. Rows are deleted after ASSISTANT_SESSION_TTL_HOURS without activity.
CREATE TABLE IF NOT EXISTS assistant_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'ready'
        CHECK (state IN ('ready', 'awaiting_input', 'awaiting_consent')),
    transcript TEXT NOT NULL DEFAULT '[]',
    pending TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);


--- Gill Gates consent grants. No row = denied. "Allow once" is only audited, never stored here.
--- duration 'chat' is tied to one session and disappears with it; 'always' lasts until revoked.
CREATE TABLE IF NOT EXISTS assistant_consents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN (
        'budget_goals.read', 'transactions.summary.read', 'transactions.history.read', 'balances.read'
    )),
    duration TEXT NOT NULL CHECK (duration IN ('chat', 'always')),
    session_id TEXT REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    max_lookback_days INTEGER NOT NULL DEFAULT 0,
    granted_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS assistant_consents_user_scope ON assistant_consents(user_id, scope);

--- Fictional peers only: never link these rows to users or their banking records.
CREATE TABLE IF NOT EXISTS demo_peer_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    housing TEXT NOT NULL,
    monthly_income_cents INTEGER NOT NULL,
    nessie_customer_id TEXT,
    nessie_account_id TEXT
);
CREATE TABLE IF NOT EXISTS demo_peer_snapshots (
    profile_id TEXT NOT NULL REFERENCES demo_peer_profiles(id),
    month TEXT NOT NULL,
    budgets_json TEXT NOT NULL,
    activity_json TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source = 'nessie'),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, month)
);


--- Gill Gates audit log: what happened and when. Never amounts, balances or descriptions.
CREATE TABLE IF NOT EXISTS assistant_audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT,
    event TEXT NOT NULL,
    tool TEXT,
    scope TEXT,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
