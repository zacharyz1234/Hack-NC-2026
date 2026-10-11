import { useEffect, useRef, useState } from "react";
import {
  QUIP_FIRST_MS,
  QUIP_INTERVAL_MS,
  QUIP_VISIBLE_MS,
  drawQuip,
} from "@/lib/gill-quips";

/**
 * A speech bubble above Gill's bowl that pops up with a canned quip every ~30 seconds.
 * Decorative only (aria-hidden); the Settings toggle is the way to turn it off.
 */
export function GillQuipBubble({
  enabled,
  paused = false,
}: {
  enabled: boolean;
  paused?: boolean;
}) {
  const [quip, setQuip] = useState("");
  const [visible, setVisible] = useState(false);
  const bag = useRef<string[]>([]);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || paused) {
      setVisible(false);
      return;
    }
    let hide: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      if (!document.hidden) {
        last.current = drawQuip(bag.current, last.current);
        setQuip(last.current);
        setVisible(true);
        hide = setTimeout(() => setVisible(false), QUIP_VISIBLE_MS);
      }
      next = setTimeout(show, QUIP_INTERVAL_MS);
    };
    next = setTimeout(show, QUIP_FIRST_MS);
    return () => {
      clearTimeout(next);
      clearTimeout(hide);
    };
  }, [enabled, paused]);

  if (!enabled) return null;
  return (
    <div className="gill-quip" data-visible={visible} aria-hidden="true">
      <p>{quip}</p>
    </div>
  );
}
