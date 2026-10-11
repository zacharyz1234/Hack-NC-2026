import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHEERS,
  CHEER_VISIBLE_MS,
  OWS,
  OW_COOLDOWN_MS,
  FlowerFriends,
  pick,
} from "@/components/flower-friends";

const spots = (c: HTMLElement) => [...c.querySelectorAll(".flower-spot")];
const bubble = (c: HTMLElement) => c.querySelector(".flower-bubble");

describe("flower friends easter egg", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never picks the same line twice in a row", () => {
    for (let i = 0; i < 50; i++)
      expect(pick(CHEERS, CHEERS[0])).not.toBe(CHEERS[0]);
  });

  it("includes the requested encouragements and has no em dashes", () => {
    expect(CHEERS).toContain("You can do this!");
    expect(CHEERS).toContain("I believe in you!");
    expect(CHEERS).toContain("Keep going!");
    for (const line of [...CHEERS, ...OWS]) expect(line).not.toContain("—");
  });

  it("is invisible: no bubble until a flower is hovered", () => {
    const { container } = render(<FlowerFriends />);
    expect(bubble(container)).toBeNull();
  });

  it("cheers on hover, then goes quiet", () => {
    const { container } = render(<FlowerFriends />);
    fireEvent.pointerEnter(spots(container)[0]!);
    expect(CHEERS as readonly string[]).toContain(
      bubble(container)!.textContent,
    );
    act(() => void vi.advanceTimersByTime(CHEER_VISIBLE_MS + 50));
    expect(bubble(container)).toBeNull();
  });

  it("a single click says nothing; spam clicking makes it cry out", () => {
    const onHurt = vi.fn();
    const { container } = render(<FlowerFriends onHurt={onHurt} />);
    const flower = spots(container)[2]!;
    fireEvent.click(flower);
    fireEvent.click(flower);
    expect(bubble(container)).toBeNull();
    fireEvent.click(flower);
    expect(OWS as readonly string[]).toContain(bubble(container)!.textContent);
    expect(bubble(container)!.getAttribute("data-hurt")).toBe("true");
    expect(onHurt).toHaveBeenLastCalledWith(true);
  });

  it("ignores hovers while it is still upset, and cheers again afterwards", () => {
    const { container } = render(<FlowerFriends />);
    const flower = spots(container)[2]!;
    for (let i = 0; i < 3; i++) fireEvent.click(flower);
    const upset = bubble(container)!.textContent;
    fireEvent.pointerEnter(spots(container)[4]!);
    expect(bubble(container)!.textContent).toBe(upset);
    act(() => void vi.advanceTimersByTime(OW_COOLDOWN_MS + 50));
    fireEvent.pointerEnter(spots(container)[4]!);
    expect(CHEERS as readonly string[]).toContain(
      bubble(container)!.textContent,
    );
  });
});
