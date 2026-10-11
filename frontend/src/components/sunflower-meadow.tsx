import { useEffect, useState } from "react";
import meadow from "@/assets/sunflower-meadow.webp";
import beeFlowers from "@/assets/sunflower-bee.webp";

// Told in order, one per click on the bee. The last line is the "here's what you can click" tour.
export const BEE_LINES = [
  "Bzzz! I'm not really a big city bee. Too many buses, not enough blossoms.",
  "But I heard about a fish named Gill Gates who knows everything about money. Click his bowl to chat with him!",
  "Click the skyline for a trip to Bowl Street, or poke any card on your desk to dig into your accounts and spending. Happy buzzing!",
] as const;

/**
 * Sunflowers tucked into the bottom corners of the home page. The flowers are decoration only
 * (clicks pass straight through them); the bee is a button that tells a short story and shows
 * what else on the page can be clicked. Each click moves to the next line, then closes.
 */
export function SunflowerMeadow({ leaving = false }: { leaving?: boolean }) {
  const [line, setLine] = useState<number | null>(null);
  const [poked, setPoked] = useState(false);

  useEffect(() => {
    if (line === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLine(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line]);

  const advance = () => {
    setPoked(true);
    setLine((l) => (l === null ? 0 : l + 1 >= BEE_LINES.length ? null : l + 1));
  };

  return (
    <div className="sunflowers" data-leaving={leaving || undefined}>
      <img
        className="sunflowers-meadow"
        src={meadow}
        alt=""
        width={1100}
        height={620}
        loading="lazy"
      />
      <div className="sunflowers-bee">
        <img src={beeFlowers} alt="" width={800} height={600} loading="lazy" />
        {line !== null && (
          <p className="bee-bubble" role="status" onClick={advance}>
            {BEE_LINES[line]}
            <small>
              {line + 1 < BEE_LINES.length
                ? "Click the bee for more"
                : "Click the bee to say goodbye"}
            </small>
          </p>
        )}
        <button
          type="button"
          className="bee-button"
          data-poked={poked || undefined}
          onClick={advance}
          aria-expanded={line !== null}
          aria-label="Talk to the bee"
        />
      </div>
    </div>
  );
}
