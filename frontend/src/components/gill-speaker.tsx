import { useId } from "react";

export function GillSpeaker({ muted }: { muted: boolean }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 72 72" className="gill-speaker-icon" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop className="speaker-highlight" offset="0" />
          <stop className="speaker-aqua" offset=".42" />
          <stop className="speaker-blue" offset="1" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`} stroke={`url(#${gradient})`} strokeLinejoin="round">
        <path d="M9 27h11L36 13v46L20 45H9a4 4 0 0 1-4-4V31a4 4 0 0 1 4-4Z" strokeWidth="2" />
        {muted ? <path d="m46 28 16 16m0-16L46 44" fill="none" strokeWidth="5" strokeLinecap="round" /> : (
          <g fill="none" strokeWidth="4" strokeLinecap="round">
            <path d="M45 27q9 9 0 18" />
            <path d="M53 20q16 16 0 32" />
            <path d="M61 13q23 23 0 46" />
          </g>
        )}
      </g>
      <path d="M10 30h10l12-11v5L21 34H10Z" className="speaker-shine" />
    </svg>
  );
}