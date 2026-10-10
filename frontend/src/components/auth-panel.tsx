import { useState } from "react";
import { login, register } from "@/lib/api";
import { Button } from "@/components/ui/button";
// Accounts live in our FastAPI backend (/auth), not Supabase.
export function AuthPanel({ onSuccess }: { onSuccess: () => void }) {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (signup) await register(email, password, name);
      else await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold">
        {signup ? "Your Bowl Street account" : "Welcome back to Bowl Street"}
      </h3>
      <form onSubmit={submit}>
        {signup && (
          <>
            <label className="field-label" htmlFor="auth-name">
              Name (optional)
            </label>
            <input
              className="xp-input"
              id="auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </>
        )}
        <label className="field-label" htmlFor="auth-email">
          Email address
        </label>
        <input
          className="xp-input"
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <label className="field-label" htmlFor="auth-password">
          Password
        </label>
        <input
          className="xp-input"
          id="auth-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={signup ? "new-password" : "current-password"}
        />
        {error && (
          <p className="chat-error" role="status">
            {error}
          </p>
        )}
        <Button
          variant="aero"
          type="submit"
          className="w-full mt-4"
          disabled={busy}
        >
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </Button>
      </form>
      <div className="flex justify-between mt-3">
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? "Already have an account?" : "Create an account"}
        </Button>
      </div>
    </div>
  );
}
