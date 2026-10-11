import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GillQuipBubble } from "@/components/gill-quip-bubble";
import {
  GILL_QUIPS,
  QUIP_FIRST_MS,
  QUIP_INTERVAL_MS,
  QUIP_VISIBLE_MS,
  QUIPS_STORAGE_KEY,
  drawQuip,
  loadQuipsEnabled,
  saveQuipsEnabled,
} from "@/lib/gill-quips";

describe("Gill's quips", () => {
  it("has 6 to 8 quips and no em dashes", () => {
    expect(GILL_QUIPS.length).toBeGreaterThanOrEqual(6);
    expect(GILL_QUIPS.length).toBeLessThanOrEqual(8);
    for (const quip of GILL_QUIPS) expect(quip).not.toContain("—");
  });

  it("uses every quip once per round and never repeats across rounds", () => {
    const bag: string[] = [];
    let previous: string | null = null;
    const drawn: string[] = [];
    for (let i = 0; i < GILL_QUIPS.length * 5; i++) {
      const quip = drawQuip(bag, previous);
      expect(quip).not.toBe(previous);
      drawn.push(quip);
      previous = quip;
    }
    for (let round = 0; round < 5; round++) {
      const slice = drawn.slice(
        round * GILL_QUIPS.length,
        (round + 1) * GILL_QUIPS.length,
      );
      expect(new Set(slice).size).toBe(GILL_QUIPS.length);
    }
  });

  it("remembers the settings toggle, defaulting to on", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    expect(loadQuipsEnabled()).toBe(true);
    saveQuipsEnabled(false);
    expect(store.get(QUIPS_STORAGE_KEY)).toBe("off");
    expect(loadQuipsEnabled()).toBe(false);
    saveQuipsEnabled(true);
    expect(loadQuipsEnabled()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("falls back to on when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadQuipsEnabled()).toBe(true);
    expect(() => saveQuipsEnabled(false)).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe("GillQuipBubble", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const bubble = (container: HTMLElement) =>
    container.querySelector(".gill-quip");

  it("pops up a quip, hides it, then returns about every 30 seconds", () => {
    const { container } = render(<GillQuipBubble enabled />);
    expect(bubble(container)).toHaveAttribute("data-visible", "false");

    act(() => void vi.advanceTimersByTime(QUIP_FIRST_MS));
    expect(bubble(container)).toHaveAttribute("data-visible", "true");
    const first = bubble(container)!.textContent;
    expect(GILL_QUIPS).toContain(first);

    act(() => void vi.advanceTimersByTime(QUIP_VISIBLE_MS));
    expect(bubble(container)).toHaveAttribute("data-visible", "false");

    act(() => void vi.advanceTimersByTime(QUIP_INTERVAL_MS - QUIP_VISIBLE_MS));
    expect(bubble(container)).toHaveAttribute("data-visible", "true");
    expect(bubble(container)!.textContent).not.toBe(first);
  });

  it("renders nothing and never fires when disabled", () => {
    const { container } = render(<GillQuipBubble enabled={false} />);
    act(() => void vi.advanceTimersByTime(QUIP_INTERVAL_MS * 3));
    expect(bubble(container)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides and stops while the chat is open", () => {
    const { container, rerender } = render(<GillQuipBubble enabled />);
    act(() => void vi.advanceTimersByTime(QUIP_FIRST_MS));
    expect(bubble(container)).toHaveAttribute("data-visible", "true");

    rerender(<GillQuipBubble enabled paused />);
    expect(bubble(container)).toHaveAttribute("data-visible", "false");
    act(() => void vi.advanceTimersByTime(QUIP_INTERVAL_MS * 3));
    expect(bubble(container)).toHaveAttribute("data-visible", "false");
    expect(vi.getTimerCount()).toBe(0);
  });
});
