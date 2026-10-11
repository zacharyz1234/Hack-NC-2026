import { useEffect, useState } from "react";
import meadow from "@/assets/sunflower-meadow.webp";
import beeFlowers from "@/assets/sunflower-bee.webp";
import { FlowerFriends } from "@/components/flower-friends";

// Each script is told in order, one line per click on the bee. Finishing one queues up the next,
// so repeat visitors get the other story. Both end with a "here's what you can click" tour.
export const BEE_SCRIPTS = [
  [
    "Bzzz! I'm not really a big city bee. Too many buses, not enough blossoms.",
    "But I heard about a fish named Gill Gates who knows everything about money. Click his bowl to chat with him!",
    "Click the skyline for a trip to Bowl Street, or poke any card on your desk to dig into your accounts and spending. Happy buzzing!",
  ],
  [
    "Bzzz, back again! I've been thinking since I heard about Gill. Even a little bee has to watch his nectar budget.",
    "Gill says it starts with knowing where your money sits. Click the Accounts card to see your checking and savings side by side.",
    "Spending Analysis shows where it all flew off to, and Recent Purchases lists every little sip. Spot any sugary habits?",
    "Gill can dig into all of it with you, but only with your permission. Click his bowl and ask how much to set aside. Happy saving!",
  ],
] as const;

/**
 * Sunflowers tucked into the bottom corners of the home page. The flowers are decoration only
 * (clicks pass straight through them); the bee is a button that tells a short story and shows
 * what else on the page can be clicked. Each click moves to the next line, then closes.
 */
export function SunflowerMeadow({ leaving = false }: { leaving?: boolean }) {
  const [script, setScript] = useState(0);
  const [line, setLine] = useState<number | null>(null);
  const [poked, setPoked] = useState(false);
  const [hurt, setHurt] = useState(false);

  useEffect(() => {
    if (line === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLine(null); // keeps the same script, so Escape never skips a story
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line]);

  const lines = BEE_SCRIPTS[script]!;
  const close = () => {
    setLine(null);
    setScript((i) => (i + 1) % BEE_SCRIPTS.length);
  };
  const advance = () => {
    setPoked(true);
    if (line === null) setLine(0);
    else if (line + 1 >= lines.length) close();
    else setLine(line + 1);
  };

  return (
    <div className="sunflowers" data-leaving={leaving || undefined}>
      <div className="sunflowers-meadow" data-hurt={hurt || undefined}>
        <img src={meadow} alt="" width={1100} height={620} loading="lazy" />
        <FlowerFriends onHurt={setHurt} />
      </div>
      <div className="sunflowers-bee">
        <img src={beeFlowers} alt="" width={800} height={600} loading="lazy" />
        {line !== null && (
          <p className="bee-bubble" role="status" onClick={advance}>
            {lines[line]}
            <small>
              {line + 1 < lines.length
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
