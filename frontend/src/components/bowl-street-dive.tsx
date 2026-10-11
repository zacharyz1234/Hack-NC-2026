// The Dive overlay: the picture half of lib/bowl-street-dive.ts. Purely decorative (aria-hidden);
// every layer is a CSS keyframe animation timed by custom properties from TIMELINES.
import { useContext, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { QueryClientContext } from "@tanstack/react-query";
import landscape from "@/assets/new-york-aero.jpg";
import gill from "@/assets/gill-mouth-closed.png";
import { cssVars, type DiveState } from "@/lib/bowl-street-dive";
import { money } from "@/lib/finance";
import { quoteChange, type StockQuotes } from "@/lib/market";
import { SAMPLE_QUOTES } from "@/lib/sample-quotes";

// One gentle swell, drawn twice across a 200%-wide strip so it can loop seamlessly.
const CREST =
  "M0 30 C 150 0 350 0 500 30 S 850 60 1000 30 S 1350 0 1500 30 S 1850 60 2000 30";

function Wave({ className }: { className: string }) {
  return (
    <svg
      className={`dive-wave ${className}`}
      viewBox="0 0 2000 80"
      preserveAspectRatio="none"
    >
      <path className="dive-wave-fill" d={`${CREST} V 80 H 0 Z`} />
      <path className="dive-wave-crest" d={CREST} />
    </svg>
  );
}

function useTapeQuotes() {
  // Read whatever the taskbar ticker already fetched; no new requests. Fall back to samples.
  const client = useContext(QueryClientContext);
  const live = client?.getQueryData<StockQuotes>(["ticker-quotes"])?.quotes;
  return (live?.length ? live : SAMPLE_QUOTES).slice(0, 8);
}

export function BowlStreetDive({
  state,
  onSkip,
}: {
  state: DiveState;
  onSkip: () => void;
}) {
  const { variant, skipping, origin, objectPosition } = state;
  const quotes = useTapeQuotes();
  const bubbles = useMemo(
    () =>
      Array.from({ length: variant === "full" ? 26 : 16 }, () => ({
        left: Math.random() * 100,
        size: 6 + Math.random() ** 2 * 38,
        delay: Math.random() * 700,
        dur: 900 + Math.random() * 800,
        drift: (Math.random() - 0.5) * 60,
      })),
    [variant],
  );
  if (!variant || typeof document === "undefined") return null;
  const entering = variant !== "return";
  return createPortal(
    <div
      className="bowl-street-dive"
      data-variant={variant}
      data-skip={skipping}
      style={cssVars(variant) as CSSProperties}
      onClick={onSkip}
    >
      <p className="sr-only" role="status">
        {entering ? "Entering Bowl Street" : "Returning home"}
      </p>
      <div className="dive-scene" aria-hidden="true">
        {entering && (
          <>
            <img
              className="dive-camera"
              src={landscape}
              alt=""
              style={{ objectPosition, transformOrigin: origin }}
            />
            <div className="wallpaper-wash dive-wash" />
          </>
        )}
        <div className="dive-water">
          <Wave className="dive-wave-back" />
          <Wave className="dive-wave-front" />
          <div className="dive-water-body">
            <div className="dive-rays" />
            <div className="dive-caustics" />
          </div>
        </div>
        <div className="dive-bubbles">
          {bubbles.map((b, i) => (
            <span
              key={i}
              className="dive-bubble"
              style={
                {
                  left: `${b.left}%`,
                  width: b.size,
                  height: b.size,
                  "--bubble-delay": `${b.delay}ms`,
                  "--bubble-dur": `${b.dur}ms`,
                  "--bubble-drift": `${b.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        {variant === "full" && (
          <>
            <div className="dive-swim">
              <div className="dive-bob">
                <img src={gill} alt="" width={509} height={441} />
              </div>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="dive-trail"
                  style={{ "--i": i } as CSSProperties}
                />
              ))}
            </div>
            <div className="dive-title">
              <div className="dive-presents">Bowl Street Journal</div>
              <div className="dive-logo">
                <span className="dive-flag" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="dive-word">Bowl Street</span>
                <sup className="dive-exchange">Exchange</sup>
              </div>
              <div className="dive-bootbar">
                <span />
                <span />
                <span />
              </div>
              <div className="dive-tape">
                <div className="dive-tape-track">
                  {[...quotes, ...quotes].map((q, i) => (
                    <span key={i}>
                      <b>{q.symbol}</b> {money(q.price)}{" "}
                      <em
                        className={
                          (q.change ?? 0) >= 0 ? "ticker-up" : "ticker-down"
                        }
                      >
                        {(q.change ?? 0) >= 0 ? "▲" : "▼"}{" "}
                        {quoteChange(q.change)}
                      </em>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {entering && <div className="dive-ring" aria-hidden="true" />}
    </div>,
    document.body,
  );
}
