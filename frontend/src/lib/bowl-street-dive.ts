// "The Dive": the cinematic trip into Bowl Street (and the short "surfacing" trip home).
// Timing lives here only. The overlay's CSS reads the same numbers as custom properties, and the
// callbacks run from these timers, so the picture and the page swap always line up.
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export type DiveVariant = "full" | "return";

type Timeline = {
  covered: number; // the screen is fully covered: swap the page underneath
  reveal: number; // the iris starts opening (enter variants)
  done: number; // the overlay is gone
  vars: Record<string, number>; // per-layer delays/durations for the CSS, in ms
};

export const TIMELINES: Record<DiveVariant, Timeline> = {
  // Every trip in: minimize, camera dive, water, Gill, XP boot card, iris.
  full: {
    covered: 1250,
    reveal: 2000,
    done: 2650,
    vars: {
      minimize: 350,
      cameraDelay: 450, // after the windows have minimized (350ms + stagger)
      cameraDur: 1100,
      waterDelay: 600,
      waterDur: 650,
      bubblesDelay: 750,
      swimDelay: 1000,
      swimDur: 1050,
      titleDelay: 1300,
      titleDur: 750,
      revealDelay: 2000,
      revealDur: 650,
    },
  },
  // Back home: water fades in over the market, then drains while the camera pulls back out.
  return: {
    covered: 160,
    reveal: 160,
    done: 900,
    vars: {
      waterIn: 160,
      drainDelay: 220,
      drainDur: 620,
      surfaceDur: 700,
    },
  },
};

export const SKIP_MS = 300;

export function cssVars(variant: DiveVariant): Record<string, string> {
  return Object.fromEntries(
    Object.entries(TIMELINES[variant].vars).map(([key, ms]) => [
      `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      `${ms}ms`,
    ]),
  );
}

/** Where the camera dives: the centre of the skyline hotspot, in viewport pixels. */
function diveOrigin(): string {
  const hotspot = document.querySelector(".city-destination");
  const box = hotspot?.getBoundingClientRect();
  return box && box.width
    ? `${Math.round(box.left + box.width / 2)}px ${Math.round(box.top + box.height / 2)}px`
    : "62% 40%";
}

export type DiveState = {
  variant: DiveVariant | null;
  skipping: boolean;
  origin: string;
  objectPosition: string;
  home: "leaving" | "returning" | null; // drives the XP minimize / restore on the home grid
  stockEntering: boolean; // drives the XP restore of the market's sections
};

const IDLE: DiveState = {
  variant: null,
  skipping: false,
  origin: "62% 40%",
  objectPosition: "center",
  home: null,
  stockEntering: false,
};

export function useBowlStreetDive() {
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<DiveState>(IDLE);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false);
  const covered = useRef<(() => void) | null>(null);
  const finish = useRef<(() => void) | null>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (ms: number, run: () => void) =>
    timers.current.push(setTimeout(run, ms));
  const cover = () => {
    const swap = covered.current;
    covered.current = null;
    swap?.();
  };
  const cleanUp = () => {
    delete document.documentElement.dataset["dive"];
    for (const name of ["--dive-origin", "--surface-delay", "--surface-dur"])
      document.documentElement.style.removeProperty(name);
  };

  useEffect(
    () => () => {
      clearTimers();
      cleanUp();
      busy.current = false;
    },
    [],
  );

  const play = useCallback(
    (variant: DiveVariant, onCovered: () => void, onDone: () => void) => {
      const line = TIMELINES[variant];
      const origin = diveOrigin();
      const wallpaper = document.querySelector(".wallpaper");
      const objectPosition = wallpaper
        ? getComputedStyle(wallpaper).objectPosition || "center"
        : "center";
      covered.current = onCovered;
      finish.current = () => {
        clearTimers();
        cleanUp();
        busy.current = false;
        setState(IDLE);
        onDone();
      };
      if (variant === "return") {
        // The real wallpaper does the pull-back, so the home page shows through as the water drains.
        const root = document.documentElement.style;
        root.setProperty("--dive-origin", origin);
        root.setProperty("--surface-delay", `${line.covered}ms`);
        root.setProperty("--surface-dur", `${line.vars["surfaceDur"]}ms`);
        document.documentElement.dataset["dive"] = "surfacing";
      }
      setState({
        variant,
        skipping: false,
        origin,
        objectPosition,
        home: variant === "return" ? null : "leaving",
        stockEntering: false,
      });
      at(line.covered, () => {
        cover();
        setState((s) => ({
          ...s,
          home: variant === "return" ? "returning" : null,
        }));
      });
      if (variant !== "return")
        at(line.reveal, () => setState((s) => ({ ...s, stockEntering: true })));
      at(line.done, () => finish.current?.());
    },
    [],
  );

  const enter = useCallback(
    (onCovered: () => void) => {
      if (busy.current) return;
      if (reducedMotion) {
        onCovered();
        return;
      }
      busy.current = true;
      play("full", onCovered, () => focusFirst(".stock-view h2"));
    },
    [play, reducedMotion],
  );

  const leave = useCallback(
    (onCovered: () => void) => {
      if (busy.current) return;
      if (reducedMotion) {
        onCovered();
        return;
      }
      busy.current = true;
      play("return", onCovered, () => focusFirst(".city-destination"));
    },
    [play, reducedMotion],
  );

  const skip = useCallback(() => {
    if (!busy.current || state.skipping) return;
    clearTimers();
    cover();
    setState((s) => ({
      ...s,
      skipping: true,
      home: s.variant === "return" ? "returning" : null,
      stockEntering: s.variant !== "return",
    }));
    at(SKIP_MS, () => finish.current?.());
  }, [state.skipping]);

  // Esc / Enter / Space skip while a dive plays (and don't re-trigger the focused hotspot).
  useEffect(() => {
    if (!state.variant) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.variant, skip]);

  return { state, enter, leave, skip };
}

function focusFirst(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (!el.matches("button, a, input, select, textarea, [tabindex]"))
    el.tabIndex = -1;
  el.focus({ preventScroll: true });
}
