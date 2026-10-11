import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GillQuipBubble } from "@/components/gill-quip-bubble";
import { useFinance } from "@/lib/finance-context";
import {
  useGillNavigation,
  type ReturnDestination,
} from "@/lib/gill-navigation-context";
import emptyBowl from "@/assets/gill-computer-bowl.png";
import gillFish from "@/assets/gill-mouth-closed.png";

export function GillCompanion({
  returnTo,
  compact = false,
  children,
}: {
  returnTo: ReturnDestination;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { quipsOn } = useFinance();
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
            className="gill-tie-fish"
            src={gillFish}
            width={509}
            height={441}
            alt="Gill Gates, a goldfish wearing a tie, swimming"
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
        </div>
      )}
    </aside>
  );
}
