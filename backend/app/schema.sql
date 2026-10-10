--- Created by Bryce and Garrett

--- Table for users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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


--- income
CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'once'
        CHECK (frequency IN ('once', 'weekly', 'biweekly', 'monthly')),
    received_on TEXT NOT NULL
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
    nessie_id TEXT UNIQUE
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

