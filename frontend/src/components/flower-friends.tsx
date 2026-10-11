import { useEffect, useRef, useState } from "react";

// Hidden easter egg: the sunflowers in the meadow cheer you on when you hover them, and get
// grumpy if you spam-click. Nothing about them looks interactive on purpose.
export const CHEERS = [
  "You can do this!",
  "I believe in you!",
  "Keep going!",
  "You've got this!",
  "You're doing great!",
] as const;

export const OWS = [
  "Ow!",
  "Stop!",
  "Hey, that hurts!",
  "Ouch! Quit it!",
  "Not the petals!",
] as const;

export const SPAM_CLICKS = 3;
export const SPAM_WINDOW_MS = 1500;
export const CHEER_VISIBLE_MS = 2200;
export const OW_VISIBLE_MS = 1600;
export const OW_COOLDOWN_MS = 2500;

// Flower heads in the meadow picture: centre and width, as a percentage of the image width.
// `y` is a percentage of its height.
const FLOWERS = [
  { x: 22.4, y: 31.9, size: 17 },
  { x: 11.4, y: 60, size: 17 },
  { x: 31.1, y: 59, size: 14 },
  { x: 23.3, y: 72.8, size: 13 },
  { x: 43.1, y: 42.5, size: 20 },
  { x: 48.1, y: 69.1, size: 16 },
  { x: 57.7, y: 57.4, size: 13 },
  { x: 66.7, y: 36.7, size: 14 },
  { x: 70.3, y: 65.9, size: 14 },
  { x: 81.3, y: 53.7, size: 14 },
  { x: 84.9, y: 73.3, size: 13 },
  { x: 93, y: 67, size: 10 },
] as const;

type Talk = { flower: number; text: string; hurt: boolean; id: number };

/** Next line from a list, never the same one twice in a row. */
export function pick<T extends string>(
  lines: readonly T[],
  previous: string | null,
  random: () => number = Math.random,
): T {
  const options = lines.filter((l) => l !== previous);
  return options[Math.floor(random() * options.length)]!;
}

/**
 * Invisible hover spots over each flower head. Hovering one makes it cheer; spam-clicking
 * makes it cry out instead. Only one flower talks at a time.
 */
export function FlowerFriends({
  onHurt,
}: {
  onHurt?: (hurt: boolean) => void;
}) {
  const [talk, setTalk] = useState<Talk | null>(null);
  const clicks = useRef<number[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastLine = useRef<string | null>(null);
  const angryUntil = useRef(0);
  const nextId = useRef(0);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const say = (flower: number, text: string, hurt: boolean) => {
    clearTimeout(hideTimer.current);
    lastLine.current = text;
    setTalk({ flower, text, hurt, id: nextId.current++ });
    onHurt?.(hurt);
    hideTimer.current = setTimeout(
      () => {
        setTalk(null);
        onHurt?.(false);
      },
      hurt ? OW_VISIBLE_MS : CHEER_VISIBLE_MS,
    );
  };

  const hover = (flower: number) => {
    // Leave a flower that has just been hurt alone, and don't interrupt a cheer from the same one.
    if (Date.now() < angryUntil.current) return;
    if (talk && talk.flower === flower) return;
    say(flower, pick(CHEERS, lastLine.current), false);
  };

  const click = (flower: number) => {
    const now = Date.now();
    clicks.current = [
      ...clicks.current.filter((t) => now - t < SPAM_WINDOW_MS),
      now,
    ];
    if (clicks.current.length >= SPAM_CLICKS) {
      angryUntil.current = now + OW_COOLDOWN_MS;
      say(flower, pick(OWS, lastLine.current), true);
    }
  };

  return (
    <>
      {FLOWERS.map((f, i) => (
        <span
          key={i}
          className="flower-spot"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}%` }}
          onPointerEnter={() => hover(i)}
          onClick={() => click(i)}
          aria-hidden="true"
        >
          {talk?.flower === i && (
            <span
              key={talk.id}
              className="flower-bubble"
              data-hurt={talk.hurt || undefined}
              data-align={f.x < 20 ? "left" : f.x > 85 ? "right" : undefined}
            >
              {talk.text}
            </span>
          )}
        </span>
      ))}
    </>
  );
}
