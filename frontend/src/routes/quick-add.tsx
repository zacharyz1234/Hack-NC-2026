import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusCircle, ShoppingBasket } from "lucide-react";
import { FinanceLayout } from "@/components/finance-layout";
import { QuickAddForm } from "@/components/quick-add";
import { XPWindow } from "@/components/xp-window";
import { money } from "@/lib/finance";
import { useFinance } from "@/lib/finance-context";

export const Route = createFileRoute("/quick-add")({
  head: () => ({ meta: [{ title: "Quick Add — Bowl Street Journal" }] }),
  component: QuickAddPage,
});

function QuickAddPage() {
  return (
    <FinanceLayout
      path="/quick-add"
      title="Just bought something?"
      description="Log it in a few seconds, before you forget. You can also just tell Gill."
    >
      <QuickAddContent />
    </FinanceLayout>
  );
}

function QuickAddContent() {
  const { transactions } = useFinance();
  const recent = transactions.filter((t) => t.amount < 0).slice(0, 5);
  return (
    <div className="quick-add-page">
      <XPWindow title="Quick add" icon={<PlusCircle size={15} />}>
        <QuickAddForm />
      </XPWindow>
      <XPWindow title="Latest purchases" icon={<ShoppingBasket size={15} />}>
        {recent.length ? (
          <ul className="quick-add-recent">
            {recent.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.merchant}</strong>
                  <small>
                    {t.category} ·{" "}
                    {new Date(`${t.date}T12:00:00`).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" },
                    )}
                  </small>
                </span>
                <span>−{money(Math.abs(t.amount))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="finance-empty">No purchases yet.</p>
        )}
        <Link to="/purchases" className="quick-add-all">
          See all purchases
        </Link>
      </XPWindow>
    </div>
  );
}
