import { focusPageHeading } from "@/lib/page-focus";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { safeReturn } from "@/lib/gill-navigation-context";
import { GillChat } from "@/components/gill-chat";
import { useFinance } from "@/lib/finance-context";
import { AuthPanel } from "@/components/auth-panel";
import { XPWindow } from "@/components/xp-window";
import { Button } from "@/components/ui/button";

// Search carries navigation context. Gill needs a signed-in student: guests see a sign-in desk here
// instead of the chat (the backend also rejects every /assistant call without a login). A question
// handed over by a button stays in the URL, so it is sent once the student has signed in. Signed-in
// financial records are read only through Gill's consent-gated tools.
export const Route = createFileRoute("/gill")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeReturn(search["returnTo"]),
    initialQuestion:
      typeof search["initialQuestion"] === "string"
        ? search["initialQuestion"].slice(0, 16000)
        : "",
  }),
  head: () => ({ meta: [{ title: "Gill Gates — Bowl Street Journal" }] }),
  component: GillDestination,
});
function GillDestination() {
  const { returnTo, initialQuestion } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading, muted, setMuted, reload } = useFinance();
  const close = () => void navigate({ to: returnTo });
  return (
    <div className="gill-destination">
      <h1
        className="sr-only"
        tabIndex={-1}
        ref={focusPageHeading}
        data-page-heading
      >
        Gill’s conversation room
      </h1>
      {user ? (
        <GillChat
          key={user.id}
          initialQuestion={initialQuestion}
          muted={muted}
          onMute={() => setMuted(!muted)}
          onClose={close}
          onDataChanged={() => void reload()}
        />
      ) : loading ? (
        // Don't flash the sign-in desk while a saved login is still being checked.
        <p role="status">Checking your sign-in…</p>
      ) : (
        <XPWindow title="Gill Gates — Sign in required" className="gill-signin">
          <p>
            Gill is for signed-in students. Sign in or create an account to chat
            with him, and he’ll answer your question right away.
          </p>
          <AuthPanel onSuccess={() => undefined} />
          <Button variant="soft" onClick={close}>
            Back to your money
          </Button>
        </XPWindow>
      )}
    </div>
  );
}
