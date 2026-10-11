import {
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
import { GillCard } from "@/components/gill-cards";
import { parseAmount } from "@/lib/quick-add";
import { today } from "@/lib/api";
import { useFinance } from "@/lib/finance-context";
import type { ComponentEvent } from "@/lib/gill-protocol";
import { Route as Purchases } from "@/routes/purchases";
import { Route as QuickAdd } from "@/routes/quick-add";

function mountQuickAddTab() {
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
      path: "quick-add",
      component: QuickAdd.options.component!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "purchases",
      component: Purchases.options.component!,
      validateSearch: Purchases.options.validateSearch!,
    }),
  ];
  const history = createMemoryHistory({ initialEntries: ["/quick-add"] });
  const router = createRouter({ routeTree: root.addChildren(routes), history });
  render(<RouterProvider router={router} />);
  return router;
}

function LatestPurchase() {
  const { transactions } = useFinance();
  const t = transactions[0]!;
  return (
    <output data-testid="latest">{`${t.merchant}|${t.amount}|${t.category}|${t.date}`}</output>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // No token: everything runs against the guest demo ledger, no network.
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("parseAmount", () => {
  it("accepts everyday ways of typing money", () => {
    expect(parseAmount("12")).toBe(12);
    expect(parseAmount("$12.50")).toBe(12.5);
    expect(parseAmount(" 4,75 ")).toBe(4.75);
    expect(parseAmount("-3")).toBeNaN();
    expect(parseAmount("12.345")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
  });
});

describe("Quick Add tab", () => {
  it("adds a purchase to the ledger and resets for the next one", async () => {
    const router = mountQuickAddTab();
    const form = await screen.findByRole("form", {
      name: "Quick add a purchase",
    });

    fireEvent.change(within(form).getByLabelText("How much?"), {
      target: { value: "12.50" },
    });
    fireEvent.change(within(form).getByLabelText("What did you buy?"), {
      target: { value: "Burrito bowl" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Food & Drink" }));
    fireEvent.click(within(form).getByRole("button", { name: "Yesterday" }));
    fireEvent.click(within(form).getByRole("button", { name: "Add purchase" }));

    expect(
      await within(form).findByText(
        /Added \$12\.50 · Burrito bowl to your demo ledger/,
      ),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("How much?")).toHaveValue("");
    expect(within(form).getByLabelText("What did you buy?")).toHaveValue("");
    const latest = screen.getByRole("list");
    expect(within(latest).getAllByRole("listitem")[0]).toHaveTextContent(
      /Burrito bowl.*Food & Drink.*−\$12\.50/,
    );

    // It's in the real ledger, not just this page.
    await router.navigate({ to: "/purchases" });
    expect(await screen.findByText("Burrito bowl")).toBeInTheDocument();
  });

  it("explains what's missing instead of saving", async () => {
    mountQuickAddTab();
    const form = await screen.findByRole("form", {
      name: "Quick add a purchase",
    });
    fireEvent.click(within(form).getByRole("button", { name: "Add purchase" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Enter how much you spent",
    );
    fireEvent.change(within(form).getByLabelText("How much?"), {
      target: { value: "5" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Add purchase" }));
    expect(within(form).getByRole("alert")).toHaveTextContent(
      "Say what you bought",
    );
  });

  it("is listed in the finance navigation", async () => {
    mountQuickAddTab();
    const nav = await screen.findByRole("navigation", {
      name: "Finance pages",
    });
    expect(
      within(nav).getByRole("link", { name: "Quick Add" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("Gill's quick add card", () => {
  const card = (props: Partial<Record<string, unknown>> = {}): ComponentEvent =>
    ({
      type: "component",
      call_id: "c_1",
      component: "expense_draft",
      awaits_input: false,
      props: {
        amount: null,
        description: "",
        category_id: 3,
        category: "Eating out",
        date: today(),
        category_options: [],
        can_save: false,
        ...props,
      },
    }) as ComponentEvent;

  function renderCard(event: ComponentEvent, onSaved = vi.fn()) {
    render(
      <FinanceProvider>
        <GillCard
          event={event}
          active={false}
          onSubmit={vi.fn()}
          onDismiss={vi.fn()}
          onSaved={onSaved}
        />
        <LatestPurchase />
      </FinanceProvider>,
    );
    return onSaved;
  }

  it("opens pre-filled from what Gill heard, and saves only on the student's click", async () => {
    const onSaved = renderCard(card({ amount: 4.5, description: "Cold brew" }));
    const form = screen.getByRole("form", { name: "Quick add a purchase" });
    expect(within(form).getByLabelText("How much?")).toHaveValue("4.5");
    expect(within(form).getByLabelText("What did you buy?")).toHaveValue(
      "Cold brew",
    );
    // Gill's suggested category isn't a demo category, so it's offered as an extra chip.
    expect(
      within(form).getByRole("button", { name: "Eating out" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(within(form).getByRole("button", { name: "Add purchase" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("expense"));
    expect(screen.getByTestId("latest")).toHaveTextContent(
      `Cold brew|-4.5|Eating out|${today()}`,
    );
    // Locked after saving, so it can't be added twice.
    expect(
      within(form).queryByRole("button", { name: "Add purchase" }),
    ).toBeNull();
    expect(within(form).getByLabelText("How much?")).toBeDisabled();
  });

  it("can open blank when Gill doesn't know the details yet", () => {
    renderCard(card({ category_id: null, category: null }));
    const form = screen.getByRole("form", { name: "Quick add a purchase" });
    expect(within(form).getByLabelText("How much?")).toHaveValue("");
    expect(within(form).getByLabelText("What did you buy?")).toHaveValue("");
    expect(within(form).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
