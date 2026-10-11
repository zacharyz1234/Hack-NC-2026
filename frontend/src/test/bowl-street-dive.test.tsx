import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { TIMELINES, SKIP_MS } from "@/lib/bowl-street-dive";
import { Route as Home } from "@/routes/index";

const motionSettings = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionSettings.reduced,
}));

async function mount() {
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceProvider>
          <GillNavigationProvider>
            <Outlet />
          </GillNavigationProvider>
        </FinanceProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/",
        component: Home.options.component!,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "accounts",
        component: () => <h1>Accounts page</h1>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  const hotspot = await screen.findByRole("button", {
    name: "Enter Bowl Street stock market",
  });
  // Timers created from here on (the dive's timeline) are fake and advanced by hand.
  vi.useFakeTimers();
  return { router, hotspot };
}

const overlay = () => document.querySelector(".bowl-street-dive");
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const marketHeading = () =>
  screen.queryByRole("heading", { name: "Welcome to Bowl Street." });

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
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("The Dive into Bowl Street", () => {
  it("plays the full dive, swaps the page while covered, then reveals and focuses the market", async () => {
    const { hotspot } = await mount();
    const full = TIMELINES.full;
    fireEvent.click(hotspot);

    expect(overlay()).toHaveAttribute("data-variant", "full");
    expect(document.querySelector(".home-grid")).toHaveAttribute(
      "data-dive",
      "leaving",
    );
    expect(document.querySelector(".bubble-transition")).toBeNull();

    advance(full.covered - 1);
    expect(marketHeading()).toBeNull(); // still home until the water covers the screen
    advance(1);
    expect(marketHeading()).toBeInTheDocument();
    expect(document.querySelector(".stock-entrance")).toHaveAttribute(
      "data-entering",
      "false",
    );

    advance(full.reveal - full.covered);
    expect(document.querySelector(".stock-entrance")).toHaveAttribute(
      "data-entering",
      "true",
    );

    advance(full.done - full.reveal);
    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(marketHeading());
  });

  it("surfaces back home, and every trip back in plays the full dive", async () => {
    const { hotspot } = await mount();
    fireEvent.click(hotspot);
    advance(TIMELINES.full.done);

    fireEvent.click(
      screen.getByRole("button", { name: /Return to Dashboard/ }),
    );
    expect(overlay()).toHaveAttribute("data-variant", "return");
    expect(document.documentElement.dataset["dive"]).toBe("surfacing");
    advance(TIMELINES.return.covered);
    expect(marketHeading()).toBeNull();
    expect(document.querySelector(".home-grid")).toHaveAttribute(
      "data-dive",
      "returning",
    );
    advance(TIMELINES.return.done - TIMELINES.return.covered);
    expect(overlay()).toBeNull();
    expect(document.documentElement.dataset["dive"]).toBeUndefined();
    const again = screen.getByRole("button", {
      name: "Enter Bowl Street stock market",
    });
    expect(document.activeElement).toBe(again);

    fireEvent.click(again);
    expect(overlay()).toHaveAttribute("data-variant", "full");
    expect(document.querySelector(".dive-swim")).toBeInTheDocument();
    advance(TIMELINES.full.covered);
    expect(marketHeading()).toBeInTheDocument();
  });

  it("skips with Esc: the market appears at once and the overlay clears fast", async () => {
    const { hotspot } = await mount();
    fireEvent.click(hotspot);
    advance(300);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(marketHeading()).toBeInTheDocument();
    expect(overlay()).toHaveAttribute("data-skip", "true");
    advance(SKIP_MS);
    expect(overlay()).toBeNull();
  });

  it("skips with a click on the overlay", async () => {
    const { hotspot } = await mount();
    fireEvent.click(hotspot);
    advance(1500);
    fireEvent.click(overlay()!);
    advance(SKIP_MS);
    expect(overlay()).toBeNull();
    expect(marketHeading()).toBeInTheDocument();
  });

  it("starts only one dive for a double click", async () => {
    const { hotspot } = await mount();
    fireEvent.click(hotspot);
    fireEvent.click(hotspot);
    expect(document.querySelectorAll(".bowl-street-dive")).toHaveLength(1);
    expect(overlay()).toHaveAttribute("data-variant", "full");
  });

  it("cleans up if you navigate away mid-dive", async () => {
    const { hotspot, router } = await mount();
    fireEvent.click(hotspot);
    advance(500);
    await act(() => router.navigate({ to: "/accounts" }));
    expect(overlay()).toBeNull();
    advance(TIMELINES.full.done);
    expect(
      screen.getByRole("heading", { name: "Accounts page" }),
    ).toBeInTheDocument();
  });

  it("swaps instantly with no overlay when motion is reduced", async () => {
    motionSettings.reduced = true;
    const { hotspot } = await mount();
    fireEvent.click(hotspot);
    expect(overlay()).toBeNull();
    expect(marketHeading()).toBeInTheDocument();
  });
});
