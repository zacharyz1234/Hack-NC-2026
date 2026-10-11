import { focusPageHeading } from "@/lib/page-focus";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Home,
  Wallet,
  PieChart,
  ShoppingBasket,
  PlusCircle,
} from "lucide-react";
import { GillCompanion } from "@/components/gill-companion";
import { useFinance } from "@/lib/finance-context";
import { Button } from "@/components/ui/button";
import type { ReturnDestination } from "@/lib/gill-navigation-context";

export function FinanceDataBoundary({ children }: { children: ReactNode }) {
  const { loading, error, reload } = useFinance();
  if (loading)
    return (
      <div className="finance-empty" role="status">
        Gathering your money data…
      </div>
    );
  if (error)
    return (
      <div className="finance-empty">
        <p role="alert">{error}</p>
        <Button variant="aero" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  return children;
}
export function FinanceLayout({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: ReturnDestination;
  children: ReactNode;
}) {
  const { user } = useFinance();
  return (
    <div className="finance-workspace">
      <nav className="finance-nav" aria-label="Finance pages">
        {[
          ["/", "Home", Home],
          ["/accounts", "Accounts", Wallet],
          ["/spending", "Spending Analysis", PieChart],
          ["/purchases", "Recent Purchases", ShoppingBasket],
          ["/quick-add", "Quick Add", PlusCircle],
        ].map(([to, label, Icon]) => {
          const Glyph = Icon as typeof Home;
          return (
            <Link
              key={to as string}
              to={to as ReturnDestination}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ className: "active", "aria-current": "page" }}
            >
              <Glyph size={16} />
              {label as string}
            </Link>
          );
        })}
      </nav>
      <div className="finance-layout">
        <div className="finance-content">
          <header className="finance-page-heading">
            <span className="badge-demo">
              {user ? "SANDBOX BANK" : "DEMO MODE"}
            </span>
            <h1 tabIndex={-1} ref={focusPageHeading} data-page-heading>
              {title}
            </h1>
            <p>{description}</p>
          </header>
          <FinanceDataBoundary>{children}</FinanceDataBoundary>
        </div>
        <GillCompanion compact returnTo={path} />
      </div>
    </div>
  );
}
