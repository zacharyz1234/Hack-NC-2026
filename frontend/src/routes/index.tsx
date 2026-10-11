import { useFinance } from "@/lib/finance-context";
import { focusPageHeading } from "@/lib/page-focus";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Wallet,
  PieChart,
  ShoppingBasket,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { XPWindow } from "@/components/xp-window";
import { BowlStreetDive } from "@/components/bowl-street-dive";
import { TIMELINES, useBowlStreetDive } from "@/lib/bowl-street-dive";
import { StockMarket } from "@/components/stock-market";
import { GillCompanion } from "@/components/gill-companion";
import { SunflowerMeadow } from "@/components/sunflower-meadow";
import { useGillNavigation } from "@/lib/gill-navigation-context";
import { DEMO_MONTH } from "@/components/finance-provider";
import { FinanceDataBoundary } from "@/components/finance-layout";
import { money, spending } from "@/lib/finance";
import { thisMonth } from "@/lib/api";
import { lessons } from "@/lib/education";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Bowl Street Journal — Making Sense of Your Money" }],
  }),
  component: Index,
});
function Index() {
  const [stockView, setStockView] = useState(false);
  const dive = useBowlStreetDive();
  const router = useRouter();
  useEffect(
    () => router.subscribe("onBeforeNavigate", () => setStockView(false)),
    [router],
  );
  const [education, setEducation] = useState(false);
  const { user, accountBalance, transactions } = useFinance();
  const { openGill } = useGillNavigation();
  const month = user ? thisMonth() : DEMO_MONTH;
  const spent = spending(transactions.filter((t) => t.date.startsWith(month)));
  return (
    <>
      <BowlStreetDive state={dive.state} onSkip={dive.skip} />
      {stockView ? (
        <div
          className="stock-entrance"
          data-entering={dive.state.stockEntering}
        >
          <StockMarket
            onReturn={() => dive.leave(() => setStockView(false))}
            onAsk={(q) => openGill("/", q)}
            onEducation={() => setEducation(true)}
          />
        </div>
      ) : (
        <div
          className="desktop-grid home-grid"
          data-dive={dive.state.home ?? undefined}
          style={
            dive.state.variant && dive.state.variant !== "return"
              ? ({
                  "--minimize": `${TIMELINES[dive.state.variant].vars["minimize"]}ms`,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="center-dashboard">
            <XPWindow
              title="My Money — Bowl Street Journal"
              className="money-window"
              icon={<Wallet size={15} />}
              footer={
                <span>
                  {user
                    ? "Capital One Nessie sandbox • Not a real bank"
                    : "Demo accounts • Not connected to a bank"}
                </span>
              }
            >
              <h1
                className="sr-only"
                tabIndex={-1}
                ref={focusPageHeading}
                data-page-heading
              >
                Your money desktop
              </h1>
              <FinanceDataBoundary>
                <div className="account-grid home-accounts">
                  <Link
                    to="/accounts"
                    className="account-card combined-account"
                  >
                    <div className="account-top">
                      <span className="account-icon">
                        <Wallet />
                      </span>
                      Accounts
                      <ChevronRight />
                    </div>
                    <div className="combined-balances">
                      <div>
                        <span>Checking</span>
                        <strong>{money(accountBalance("checking"))}</strong>
                      </div>
                      <div>
                        <span>Savings</span>
                        <strong>{money(accountBalance("savings"))}</strong>
                      </div>
                    </div>
                    <div className="account-bottom">
                      Everyday money. Future possibilities.
                      <ChevronRight size={12} />
                    </div>
                  </Link>
                  <Link to="/spending" className="account-card">
                    <div className="account-top">
                      <span className="account-icon">
                        <PieChart />
                      </span>
                      Spending Analysis
                      <ChevronRight />
                    </div>
                    <div className="account-value">{money(spent)}</div>
                    <div className="account-bottom">
                      Checking spending ·{" "}
                      {new Date(`${month}-01T12:00:00`).toLocaleDateString(
                        "en-US",
                        { month: "short", year: "numeric" },
                      )}
                    </div>
                  </Link>
                  <Link to="/purchases" className="account-card">
                    <div className="account-top">
                      <span className="account-icon orange">
                        <ShoppingBasket />
                      </span>
                      Recent Purchases
                      <ChevronRight />
                    </div>
                    <div className="account-value">
                      {transactions.filter((t) => t.amount < 0).length}{" "}
                      purchases
                    </div>
                    <div className="account-bottom">
                      Explore your activity
                      <ChevronRight size={12} />
                    </div>
                  </Link>
                </div>
              </FinanceDataBoundary>
            </XPWindow>
          </div>
          <aside className="market-side">
            <Button
              variant="ghost"
              className="city-destination"
              onClick={() => dive.enter(() => setStockView(true))}
              aria-label="Enter Bowl Street stock market"
            >
              <div className="city-overlay">
                <span className="bowl-street-sign-group" aria-hidden="true">
                  <span className="bowl-street-sign-pole bowl-street-sign-pole-left" />
                  <span className="bowl-street-sign-pole bowl-street-sign-pole-right" />
                  <span className="bowl-street-sign">
                    <span className="bowl-street-sign-bolt bowl-street-sign-bolt-tl" />
                    <span className="bowl-street-sign-bolt bowl-street-sign-bolt-tr" />
                    <span className="bowl-street-sign-bolt bowl-street-sign-bolt-bl" />
                    <span className="bowl-street-sign-bolt bowl-street-sign-bolt-br" />
                    <span className="bowl-street-sign-bulb bulb-top-1" />
                    <span className="bowl-street-sign-bulb bulb-top-2" />
                    <span className="bowl-street-sign-bulb bulb-top-3" />
                    <span className="bowl-street-sign-bulb bulb-top-4" />
                    <span className="bowl-street-sign-bulb bulb-top-5" />
                    <span className="bowl-street-sign-bulb bulb-top-6" />
                    <span className="bowl-street-sign-bulb bulb-top-7" />
                    <span className="bowl-street-sign-bulb bulb-right-1" />
                    <span className="bowl-street-sign-bulb bulb-right-2" />
                    <span className="bowl-street-sign-bulb bulb-right-3" />
                    <span className="bowl-street-sign-bulb bulb-bottom-1" />
                    <span className="bowl-street-sign-bulb bulb-bottom-2" />
                    <span className="bowl-street-sign-bulb bulb-bottom-3" />
                    <span className="bowl-street-sign-bulb bulb-bottom-4" />
                    <span className="bowl-street-sign-bulb bulb-bottom-5" />
                    <span className="bowl-street-sign-bulb bulb-bottom-6" />
                    <span className="bowl-street-sign-bulb bulb-bottom-7" />
                    <span className="bowl-street-sign-bulb bulb-left-1" />
                    <span className="bowl-street-sign-bulb bulb-left-2" />
                    <span className="bowl-street-sign-bulb bulb-left-3" />
                    <span className="bowl-street-sign-words">Take a Trip to<br />Bowl Street</span>
                    <span className="bowl-street-sign-arrow">→</span>
                  </span>
                </span>
              </div>
            </Button>
          </aside>
          <XPWindow
            title="A peek at the market"
            icon={<TrendingUp size={12} />}
            className="market-preview market-mini home-market-preview"
          >
            {[
              ["S&P 500", "+0.63%"],
              ["NASDAQ", "+0.91%"],
              ["Dow", "+0.47%"],
            ].map(([name, change]) => (
              <div className="market-mini-row" key={name}>
                <strong>{name}</strong>
                <span className="positive">↗ {change}</span>
              </div>
            ))}
          </XPWindow>

          <GillCompanion returnTo="/">
            <div className="gill-tip-wrap">
              <span className="gill-tip-solid" aria-hidden />
              <span className="gill-tip-trail gill-tip-trail-near" aria-hidden />
              <span className="gill-tip-trail gill-tip-trail-far" aria-hidden />
              <aside
                className="gill-tip-bubble"
                aria-label="Gill’s tip of the day"
              >
                <strong>Gill’s tip of the day</strong>
                <p>
                  “I, Gill Gates, recommend setting aside a little from each
                  paycheck before the coffee shops get their fins on it.”
                </p>
              </aside>
            </div>
          </GillCompanion>
        </div>
      )}
      {!stockView && (
        <SunflowerMeadow leaving={dive.state.home === "leaving"} />
      )}
      <Dialog open={education} onOpenChange={setEducation}>
        <DialogContent className="finance-dialog">
          <DialogTitle>Financial Education</DialogTitle>
          <DialogDescription>
            Money knowledge, without the jargon.
          </DialogDescription>
          {lessons.map(([title, text]) => (
            <article className="education-item" key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
              <Button
                variant="link"
                onClick={() => {
                  setEducation(false);
                  openGill(
                    "/",
                    `Please explain: ${title}, for a college student.`,
                  );
                }}
              >
                Discuss with Gill <ChevronRight />
              </Button>
            </article>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
