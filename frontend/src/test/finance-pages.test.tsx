import { loadAllTransactions } from "@/lib/finance-data";
import { safeReturn } from "@/lib/gill-navigation-context";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceProvider } from "@/components/finance-provider";
import { GillNavigationProvider } from "@/components/gill-navigation";
import { Route as Accounts } from "@/routes/accounts";
import { Route as Purchases } from "@/routes/purchases";
import { Route as Gill } from "@/routes/gill";
import { Route as Home } from "@/routes/index";
import { Route as Spending } from "@/routes/spending";
import type { ApiTransaction } from "@/lib/api";

const motionSettings = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionSettings.reduced,
}));
const fetchMock = vi.fn();
const tx: ApiTransaction = {
  id: "e1",
  kind: "expense",
  description: "Second account coffee",
  category_id: 1,
  category: "Food",
  amount_cents: -650,
  date: "2026-10-10",
  account_id: 22,
  account_type: "Checking",
  source: "manual",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function mount(path = "/accounts") {
  const root = createRootRoute({
    component: () => (
      <FinanceProvider>
        <GillNavigationProvider>
          <Outlet />
        </GillNavigationProvider>
      </FinanceProvider>
    ),
  });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: Home.options.component!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "accounts",
      component: Accounts.options.component!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "purchases",
      component: Purchases.options.component!,
      validateSearch: Purchases.options.validateSearch!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "spending",
      component: Spending.options.component!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "gill",
      component: Gill.options.component!,
      validateSearch: Gill.options.validateSearch!,
    }),
  ];
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({ routeTree: root.addChildren(routes), history });
  render(<RouterProvider router={router} />);
  return { router, history };
}
beforeEach(() => {
  motionSettings.reduced = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("finance pages", () => {
  it("keeps guest edits across routes and browser Back, and removes More Info", async () => {
    const { router, history } = mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Campus Coffee" }),
    );
    fireEvent.change(
      screen.getByLabelText("Amount (negative for a purchase)"),
      { target: { value: "-16.50" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await act(() => router.navigate({ to: "/purchases" }));
    expect(await screen.findByText("Total spent: $784.24")).toBeInTheDocument();
    await act(() => {
      history.back();
    });
    expect(await screen.findByText("$2,270.50")).toBeInTheDocument();
    await act(() => router.navigate({ to: "/" }));
    expect(
      await screen.findByRole("link", { name: /Accounts Checking/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("More Info")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("opens savings activity as all activity and filters income on a direct URL", async () => {
    mount("/purchases?kind=all&account=savings");
    expect(await screen.findByText("Savings Deposit")).toBeInTheDocument();
    expect(screen.queryByText("Campus Coffee")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Purchases" }));
    expect(screen.getByText("No matching transactions.")).toBeInTheDocument();
  });
  it("preserves the exact bank account ID, retains failed editors, and updates after success", async () => {
    localStorage.setItem("bsj-token", "test-token");
    let fail = true;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/auth/me")
        return response({
          id: 1,
          email: "student@example.test",
          display_name: "Student",
        });
      if (path === "/accounts")
        return response({
          accounts: [
            {
              id: 11,
              type: "Checking",
              nickname: "First checking",
              balance_cents: 100000,
              synced_at: "2026-10-10",
            },
            {
              id: 22,
              type: "Checking",
              nickname: "Second checking",
              balance_cents: 200000,
              synced_at: "2026-10-10",
            },
          ],
        });
      if (path === "/categories")
        return response({ categories: [{ id: 1, name: "Food" }] });
      if (path === "/savings-goals") return response({ goals: [] });
      if (path === "/transactions") return response({ transactions: [tx] });
      if (path === "/transactions/e1" && init?.method === "PATCH")
        return fail
          ? response({ detail: "Save failed; try again." }, 500)
          : response({ ...tx, description: "Updated coffee" });
      throw new Error(`Unexpected ${path}`);
    });
    mount("/purchases");
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Second account coffee" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Account")).toHaveValue("22");
    fireEvent.change(within(dialog).getByLabelText("Merchant / description"), {
      target: { value: "Updated coffee" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save transaction" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save failed; try again.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(call![1].body).account_id).toBe(22);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(
      await screen.findByRole("button", { name: "Edit Updated coffee" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("navigates to Gill once after the bubble cover, then asks a guest to sign in instead of opening a chat", async () => {
    const { router } = mount();
    const bowl = await screen.findByRole("button", {
      name: "Talk to Gill Gates",
    });
    await screen.findByRole("button", { name: "Edit Campus Coffee" });
    vi.useFakeTimers();
    fireEvent.click(bowl);
    fireEvent.click(bowl);
    expect(router.state.location.pathname).toBe("/accounts");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(router.state.location.pathname).toBe("/gill");
    expect(router.state.location.search).toMatchObject({
      returnTo: "/accounts",
      initialQuestion: "",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(
      screen.getByText(/Gill is for signed-in students/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Question for Gill" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to your money" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(router.state.location.pathname).toBe("/accounts");
  });
});
const student = {
  id: 1,
  email: "student@example.test",
  display_name: "Student",
};
function signedInBackend(holdAuthCheck?: Promise<void>) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/auth/login")
      return response({ token: "new-token", user: student });
    if (path === "/auth/me") {
      await holdAuthCheck;
      return response(student);
    }
    if (path === "/accounts") return response({ accounts: [] });
    if (path === "/categories") return response({ categories: [] });
    if (path === "/savings-goals") return response({ goals: [] });
    if (path === "/transactions") return response({ transactions: [] });
    if (path === "/assistant/sessions")
      return response({
        session_id: "as_1",
        state: "ready",
        signed_in: true,
        voice_available: false,
        suggestions: [],
        events: [{ type: "message", message_id: "m1", text: "Good day." }],
      });
    if (path === "/assistant/sessions/as_1/messages")
      return response({
        session_id: "as_1",
        state: "ready",
        events: [{ type: "message", message_id: "m2", text: "Happy to help." }],
      });
    throw new Error(`Unexpected ${path}`);
  });
}
const paths = () => fetchMock.mock.calls.map(([url]) => new URL(url).pathname);
describe("Gill requires a signed-in student", () => {
  it("opens the chat for a signed-in student, authenticated with their login", async () => {
    motionSettings.reduced = true;
    localStorage.setItem("bsj-token", "test-token");
    signedInBackend();
    mount("/accounts");
    fireEvent.click(
      await screen.findByRole("button", { name: "Talk to Gill Gates" }),
    );
    expect(await screen.findByText("Good day.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Gill is for signed-in students/),
    ).not.toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => new URL(url).pathname === "/assistant/sessions",
    )!;
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });
  it("shows a guest the sign-in desk on a direct visit and never contacts the assistant", async () => {
    mount("/gill?returnTo=%2Fspending");
    expect(
      await screen.findByText(/Gill is for signed-in students/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Question for Gill" }),
    ).not.toBeInTheDocument();
    expect(paths().filter((path) => path.startsWith("/assistant"))).toEqual([]);
  });
  it("does not flash the sign-in desk while a saved login is being checked", async () => {
    localStorage.setItem("bsj-token", "test-token");
    let finishAuthCheck!: () => void;
    signedInBackend(
      new Promise<void>((resolve) => (finishAuthCheck = resolve)),
    );
    mount("/gill");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Checking your sign-in",
    );
    expect(
      screen.queryByText(/Gill is for signed-in students/),
    ).not.toBeInTheDocument();
    expect(paths().filter((path) => path.startsWith("/assistant"))).toEqual([]);
    finishAuthCheck();
    expect(await screen.findByText("Good day.")).toBeInTheDocument();
  });
  it("sends the question a guest brought to Gill only after they sign in", async () => {
    signedInBackend();
    mount("/gill?initialQuestion=What%20is%20APR%3F");
    await screen.findByText(/Gill is for signed-in students/);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "student@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Happy to help.")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => new URL(url).pathname === "/assistant/sessions/as_1/messages",
    )!;
    expect(JSON.parse(init.body)).toEqual({ text: "What is APR?" });
    expect(paths()[0]).toBe("/auth/login");
    expect(paths().indexOf("/auth/login")).toBeLessThan(
      paths().indexOf("/assistant/sessions"),
    );
  });
});
describe("finance editing and reduced motion", () => {
  it("skips bubbles on ordinary page navigation and browser Back", async () => {
    const { router, history } = mount();
    await screen.findByRole("button", { name: "Edit Campus Coffee" });
    expect(document.querySelector(".bubble-transition")).toBeNull();
    await act(() => router.navigate({ to: "/purchases" }));
    expect(document.querySelector(".bubble-transition")).toBeNull();
    await act(() => history.back());
    expect(router.state.location.pathname).toBe("/accounts");
    expect(document.querySelector(".bubble-transition")).toBeNull();
  });
  it("opens Bowl Street immediately without bubbles when motion is reduced", async () => {
    motionSettings.reduced = true;
    mount("/");
    fireEvent.click(await screen.findByRole("button", { name: "Enter Bowl Street stock market" }));
    expect(document.querySelector(".bubble-transition")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter Bowl Street stock market" })).not.toBeInTheDocument();
  });
  it("adds and deletes guest activity without leaving the page", async () => {
    mount("/purchases");
    fireEvent.click(
      await screen.findByRole("button", { name: "Add transaction" }),
    );
    fireEvent.change(
      within(screen.getByRole("dialog")).getByLabelText(
        "Merchant / description",
      ),
      { target: { value: "Test lunch" } },
    );
    fireEvent.change(
      screen.getByLabelText("Amount (negative for a purchase)"),
      { target: { value: "-12.25" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Test lunch" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Test lunch")).not.toBeInTheDocument();
    expect(screen.getByText("Total spent: $774.24")).toBeInTheDocument();
  });
  it("saves guest goals and monthly budgets across navigation", async () => {
    const { router } = mount();
    fireEvent.change(await screen.findByLabelText("Goal name"), {
      target: { value: "New laptop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }));
    expect(await screen.findByText("Goal saved.")).toBeInTheDocument();
    await act(() => router.navigate({ to: "/spending" }));
    fireEvent.change(
      await screen.findByRole("spinbutton", { name: "Food & Drink budget" }),
      { target: { value: "5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save budget" }));
    expect(await screen.findByText("Budget saved.")).toBeInTheDocument();
    expect(screen.getByText(/\$1.50 over budget/)).toBeInTheDocument();
    await act(() => router.navigate({ to: "/accounts" }));
    await waitFor(() => expect(screen.getByLabelText("Goal name")).toHaveValue("New laptop"));
    await act(() => router.navigate({ to: "/spending" }));
    expect(
      await screen.findByRole("spinbutton", { name: "Food & Drink budget" }),
    ).toHaveValue(5);
  });
  it("skips bubbles with reduced motion and focuses the destination", async () => {
    motionSettings.reduced = true;
    const { router } = mount();
    await screen.findByRole("button", { name: "Edit Campus Coffee" });
    fireEvent.click(screen.getByRole("button", { name: "Talk to Gill Gates" }));
    expect(
      await screen.findByRole("heading", { name: "Gill’s conversation room" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/gill");
    expect(document.querySelector(".bubble-transition")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Gill’s conversation room" }),
      ).toHaveFocus(),
    );
  });
  it("cancels a pending Gill transition when another route is chosen", async () => {
    const { router } = mount();
    await screen.findByRole("button", { name: "Edit Campus Coffee" });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Talk to Gill Gates" }));
    await act(() => router.navigate({ to: "/purchases" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(router.state.location.pathname).toBe("/purchases");
    expect(document.querySelector(".bubble-transition")).toBeNull();
  });
});

describe("data pagination and safe navigation", () => {
  it("loads beyond the first 200 transactions", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          transactions: Array.from({ length: 200 }, (_, i) => ({
            ...tx,
            id: `e${i}`,
          })),
        }),
      )
      .mockResolvedValueOnce(
        response({ transactions: [{ ...tx, id: "e201" }] }),
      );
    const rows = await loadAllTransactions();
    expect(rows).toHaveLength(201);
    expect(fetchMock.mock.calls[1]![0]).toContain("offset=200");
  });
  it("does not return partial totals on a failed later page", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ transactions: Array.from({ length: 200 }, () => tx) }),
      )
      .mockResolvedValueOnce(response({ detail: "page failed" }, 500));
    await expect(loadAllTransactions()).rejects.toThrow("page failed");
  });
  it("restricts return links to app destinations", () => {
    expect(safeReturn("https://example.com")).toBe("/");
    expect(safeReturn("/purchases")).toBe("/purchases");
  });
});
