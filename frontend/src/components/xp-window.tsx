import type { ReactNode } from "react";
import { ChevronDown, Minus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
export function XPWindow({
  title,
  icon,
  children,
  className = "",
  onClose,
  footer,
  expanded,
  onToggle,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  footer?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className={`window ${className}`}>
      <div className="window-title">
        {onToggle ? <Button variant="ghost" className="window-expand" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? "Collapse My Money" : "Expand My Money"}>
          <span className="window-title-label">{icon}{title}</span>
          <ChevronDown className={expanded ? "rotate-180" : ""} size={16} />
        </Button> : <div className="window-title-label">
          {icon}
          {title}
        </div>}
        {onClose ? (
          <Button className="modal-close" size="icon" onClick={onClose} aria-label="Close window">
            <X />
          </Button>
        ) : !onToggle ? (
          <div className="window-dots" aria-hidden="true">
            <span>
              <Minus size={11} />
            </span>
            <span>
              <Square size={9} />
            </span>
          </div>
        ) : null}
      </div>
      {expanded !== false && <div className="window-body">{children}</div>}
      {expanded !== false && footer && <div className="window-footer">{footer}</div>}
    </section>
  );
}
