// Client for our FastAPI backend (../backend). Endpoint shapes: docs/GILL_GATES_FRONTEND_CONTRACT.md.
// Money from the API is in cents; convert with dollars()/cents() at the edges.

export const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  "http://localhost:8000"
).replace(/\/+$/, "");

const TOKEN_KEY = "bsj-token";
const AUTH_EVENT = "bsj-auth-changed";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the session just won't survive a reload
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function onAuthChange(listener: () => void): () => void {
  window.addEventListener(AUTH_EVENT, listener);
  return () => window.removeEventListener(AUTH_EVENT, listener);
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = first.loc?.slice(1).join(".");
    return field
      ? `${field}: ${first.msg ?? "invalid"}`
      : (first.msg ?? "Invalid request");
  }
  return "Something went wrong";
}

async function request(
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      0,
      `Can't reach the server at ${API_BASE}. Is the backend running?`,
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
    };
    if (response.status === 401 && token) setToken(null); // expired or revoked login
    throw new ApiError(response.status, detailText(data.detail));
  }
  return response;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await request(path, method, body);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export async function apiAudio(path: string): Promise<ArrayBuffer> {
  return (await request(path, "POST")).arrayBuffer();
}

export const dollars = (cents: number) => cents / 100;
export const cents = (dollarAmount: number) => Math.round(dollarAmount * 100);

// ---------- auth ----------

export type User = { id: number; email: string; display_name: string | null };

export async function login(email: string, password: string): Promise<User> {
  const { token, user } = await api<{ token: string; user: User }>(
    "/auth/login",
    "POST",
    { email, password },
  );
  setToken(token);
  return user;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const { token, user } = await api<{ token: string; user: User }>(
    "/auth/register",
    "POST",
    {
      email,
      password,
      display_name: displayName || null,
    },
  );
  setToken(token);
  return user;
}

export async function logout(): Promise<void> {
  await api("/auth/logout", "POST").catch(() => undefined);
  setToken(null);
}

export async function currentUser(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    return await api<User>("/auth/me");
  } catch {
    return null;
  }
}

// ---------- dashboard data ----------

export type Category = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  custom: boolean;
};
export type Account = {
  id: number;
  type: string;
  nickname: string | null;
  balance_cents: number;
  synced_at: string;
};
export type ApiTransaction = {
  id: string;
  kind: "expense" | "income";
  description: string | null;
  category_id: number | null;
  category: string | null;
  amount_cents: number; // negative = money out
  date: string;
  account_id: number | null;
  account_type: string | null;
  source: "manual" | "nessie";
};
export type Goal = {
  id: number;
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
};
export type BudgetLimit = {
  category_id: number;
  category: string;
  limit_cents: number;
};
export type SyncResult = {
  accounts: number;
  expenses_added: number;
  income_added: number;
  synced_at: string;
  warnings: string[];
};
export type ConsentStatus = {
  scope: string;
  title: string;
  details: string;
  status: "always" | "chat" | "off";
  granted_at: string | null;
};

export function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function today(): string {
  const now = new Date();
  return `${thisMonth()}-${String(now.getDate()).padStart(2, "0")}`;
}
