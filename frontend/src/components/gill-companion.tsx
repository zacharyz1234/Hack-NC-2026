import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GillQuipBubble } from "@/components/gill-quip-bubble";
import { GillSpeaker } from "@/components/gill-speaker";
import { useFinance } from "@/lib/finance-context";
import {
  useGillNavigation,
  type ReturnDestination,
} from "@/lib/gill-navigation-context";
import emptyBowl from "@/assets/gill-computer-bowl.png";
import gillFish from "@/assets/gill-fuller-fish.png";

export function GillCompanion({
  returnTo,
  compact = false,
  children,
}: {
  returnTo: ReturnDestination;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { muted, setMuted, quipsOn } = useFinance();
  const { openGill, transitioning } = useGillNavigation();
  return (
    <aside
      className={`gill-side ${compact ? "finance-gill" : ""}`}
      aria-label="Gill Gates"
    >
      <GillQuipBubble enabled={quipsOn} paused={transitioning} />
      {children}
      <Button
        variant="ghost"
        className="bowl-control"
        onClick={() => openGill(returnTo)}
        disabled={transitioning}
        aria-label="Talk to Gill Gates"
      >
        <img
          className="bowl-glass"
          src={emptyBowl}
          width={1024}
          height={1024}
          alt="Gill's glass fishbowl"
        />
        <span className="swimming-gill">
          <img
            src={gillFish}
            width={1024}
            height={1024}
            alt="Gill Gates swimming"
          />
        </span>
        <span className="bowl-bubble" />
        <span className="bowl-bubble" />
      </Button>
      <h2 className="side-label">Meet Gill Gates</h2>
      <div className="gill-plaque">Senior Bowl Street Broker</div>
      {returnTo !== "/" && (
        <div className="gill-actions">
          <Button
            variant="green"
            className="gill-chat-button"
            disabled={transitioning}
            onClick={() => openGill(returnTo)}
          >
            <span>Chat with Gill</span>
          </Button>
          <Button
            variant="ghost"
            className="gill-sound-button"
            size="icon"
            aria-label={muted ? "Enable Gill’s voice" : "Mute Gill’s voice"}
            aria-pressed={!muted}
            onClick={() => setMuted(!muted)}
          >
            <GillSpeaker muted={muted} />
          </Button>
        </div>
      )}
    </aside>
  );
}
