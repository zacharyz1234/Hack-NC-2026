import { focusPageHeading } from "@/lib/page-focus";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { safeReturn } from "@/lib/gill-navigation-context";
import { GillChat } from "@/components/gill-chat";
import { useFinance } from "@/lib/finance-context";
import { useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Search carries navigation context, never financial records.
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
  const { returnTo, initialQuestion } = Route.useSearch();
  const navigate = useNavigate();
  const { user, muted, setMuted, reload } = useFinance();
  const [signIn, setSignIn] = useState(false);
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
      <GillChat
        key={user?.id ?? "guest"}
        userId={user?.id ?? null}
        initialQuestion={initialQuestion}
        muted={muted}
        onMute={() => setMuted(!muted)}
        onClose={() => void navigate({ to: returnTo })}
        onSignIn={() => setSignIn(true)}
        onDataChanged={() => void reload()}
      />
      <Dialog open={signIn} onOpenChange={setSignIn}>
        <DialogContent>
          <DialogTitle>Sign in to Bowl Street Journal</DialogTitle>
          <DialogDescription>
            Connect your account to let Gill help with your money.
          </DialogDescription>
          <AuthPanel onSuccess={() => setSignIn(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
