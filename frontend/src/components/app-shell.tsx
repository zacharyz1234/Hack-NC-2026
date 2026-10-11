import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AuthPanel } from "@/components/auth-panel";
import { Taskbar } from "@/components/taskbar";
import { useFinance } from "@/lib/finance-context";
import { api, logout, type ConsentStatus } from "@/lib/api";
import landscape from "@/assets/new-york-aero.jpg";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, muted, setMuted, quipsOn, toggleQuips, resetDemo } =
    useFinance();
  const [panel, setPanel] = useState<"settings" | "signin" | null>(null);
  const [consents, setConsents] = useState<ConsentStatus[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    let active = true;
    setMessage("");
    setConsents([]);
    if (panel === "settings" && user)
      api<{ consents: ConsentStatus[] }>("/consents")
        .then((r) => {
          if (active) setConsents(r.consents);
        })
        .catch((e: Error) => {
          if (active) setMessage(e.message);
        });
    return () => {
      active = false;
    };
  }, [panel, user]);
  return (
    <div
      className={`aero-app ${pathname === "/" ? "home-scene" : "finance-scene"}`}
    >
      <img
        className="wallpaper"
        src={landscape}
        alt=""
        width={1920}
        height={1024}
      />
      <div className="wallpaper-wash" />
      <header className="desktop-header">
        <Link to="/" className="brand" aria-label="Bowl Street Journal home">
          <img className="brand-logo" src="/bowl-street-logo.png" alt="" width={70} height={55} />
          <div className="brand-name">Bowl Street Journal</div>
        </Link>
        <div className="header-right">
          <span>
            <span className="status-dot" />
            Your money. A little clearer.
          </span>
          <Button variant="soft" size="sm" onClick={() => setPanel("settings")}>
            <Settings />
            Settings
          </Button>
          {!user && (
            <Button variant="soft" size="sm" onClick={() => setPanel("signin")}>
              <ShieldCheck />
              Sign in
            </Button>
          )}
        </div>
      </header>
      <main>{children}</main>
      <Taskbar />
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPanel(null);
        }}
      >
        <DialogContent className="finance-dialog">
          <DialogTitle>
            {panel === "signin"
              ? "Welcome to Bowl Street"
              : "Your little corner of Bowl Street"}
          </DialogTitle>
          <DialogDescription>Account and Gill preferences</DialogDescription>
          {panel === "signin" ? (
            <AuthPanel onSuccess={() => setPanel(null)} />
          ) : (
            <>
              <div className="settings-row">
                <span>Gill’s voice</span>
                <Button variant="soft" onClick={() => setMuted(!muted)}>
                  {muted ? "Text only" : "Voice enabled"}
                </Button>
              </div>
              <div className="settings-row">
                <span>Gill’s chatter bubbles</span>
                <Button
                  variant="soft"
                  aria-pressed={quipsOn}
                  onClick={toggleQuips}
                >
                  {quipsOn ? "On" : "Off"}
                </Button>
              </div>
              <div className="settings-row">
                <span>{user?.display_name || user?.email || "Guest"}</span>
                <Button
                  variant="aero"
                  disabled={busy}
                  onClick={async () => {
                    if (!user) {
                      setPanel("signin");
                      return;
                    }
                    setBusy(true);
                    await logout();
                    setBusy(false);
                    setPanel(null);
                  }}
                >
                  {user ? "Sign out" : "Sign in"}
                </Button>
              </div>
              {user ? (
                <>
                  <Button variant="soft" asChild>
                    <Link to="/accounts" onClick={() => setPanel(null)}>
                      Manage bank connection
                    </Link>
                  </Button>
                  <h3>What Gill may read</h3>
                  {consents.map((c) => (
                    <div className="settings-row" key={c.scope}>
                      <div>
                        <strong>{c.title}</strong>
                        <p>
                          {c.status === "always"
                            ? "Always allowed"
                            : c.status === "chat"
                              ? "Allowed in an open chat"
                              : "Off — Gill asks first"}
                        </p>
                      </div>
                      {c.status !== "off" && (
                        <Button
                          variant="soft"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api(`/consents/${c.scope}`, "DELETE");
                              const result = await api<{
                                consents: ConsentStatus[];
                              }>("/consents");
                              setConsents(result.consents);
                            } catch (e) {
                              setMessage(
                                e instanceof Error
                                  ? e.message
                                  : "Couldn't update access.",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Turn off
                        </Button>
                      )}
                    </div>
                  ))}
                  <p className="finance-fine">
                    Turning access off stops Gill from reading it again and
                    clears chats that used it. It can’t recall what was already
                    sent to Google Gemini.
                  </p>
                </>
              ) : (
                <>
                  <Button
                    variant="soft"
                    onClick={() => {
                      resetDemo();
                      setMessage("Demo reset.");
                    }}
                  >
                    Reset demo
                  </Button>
                </>
              )}
              {message && <p role="status">{message}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
