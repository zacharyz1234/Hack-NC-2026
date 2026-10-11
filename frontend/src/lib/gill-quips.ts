// Gill's little asides on the home page. Hardcoded on purpose: no Gemini call, no network.
export const GILL_QUIPS = [
  "Thirty years on Bowl Street and I still check the markets before my morning flakes.",
  "Married to the job. We've never had a bad quarter together.",
  "Jordan Bellfish says I should take a day off. I wore a tie to the beach.",
  "A tie on my day off? Of course. The markets never really close.",
  "Thousands of clients served, every one of them a fish. You're my first human. Mind the water.",
  "Compound interest is the only colleague who works harder than I do.",
  "Pay yourself first. Then pay the coffee shop whatever is left.",
  "Jordan and I have a rule: no spreadsheets at lunch. We break it daily.",
] as const;

export const QUIP_FIRST_MS = 6_000;
export const QUIP_INTERVAL_MS = 30_000;
export const QUIP_VISIBLE_MS = 7_000;

export const QUIPS_STORAGE_KEY = "gill.quips";

/** Next quip from a shuffled bag that refills when empty, never repeating the one just shown. */
export function drawQuip(
  bag: string[],
  previous: string | null,
  random: () => number = Math.random,
): string {
  if (bag.length === 0) {
    const shuffled: string[] = [...GILL_QUIPS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    if (shuffled[shuffled.length - 1] === previous)
      shuffled.unshift(shuffled.pop()!);
    bag.push(...shuffled);
  }
  return bag.pop()!;
}

export function loadQuipsEnabled(): boolean {
  try {
    return window.localStorage.getItem(QUIPS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveQuipsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(QUIPS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be blocked (private windows); the toggle still works for this visit.
  }
}
