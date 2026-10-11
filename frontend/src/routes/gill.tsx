import { focusPageHeading } from "@/lib/page-focus";
import { createFileRoute, Link } from "@tanstack/react-router";
import { safeReturn } from "@/lib/gill-navigation-context";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";

// Integration slot: replace only GillDestination with the teammate's conversation view.
// Search carries navigation context, never financial records. Opening this route makes no assistant request.
export const Route = createFileRoute("/gill")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeReturn(search["returnTo"]),
    initialQuestion:
      typeof search["initialQuestion"] === "string"
        ? search["initialQuestion"].slice(0, 2000)
        : "",
  }),
  head: () => ({ meta: [{ title: "Gill Gates — Bowl Street Journal" }] }),
  component: GillDestination,
});
function GillDestination() {
  const { returnTo } = Route.useSearch();
  return (
    <div className="gill-destination">
      <XPWindow title="Gill Gates">
        <h1 tabIndex={-1} ref={focusPageHeading} data-page-heading>
          Gill’s conversation room
        </h1>
        <p>This space is getting ready for Gill.</p>
        <Button variant="aero" asChild>
          <Link to={returnTo}>Return to your money</Link>
        </Button>
      </XPWindow>
    </div>
  );
}
