import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
export function AuthPanel({ onSuccess }: { onSuccess: () => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (result.data.session) onSuccess();
    else setError("Check your email to confirm your account, then sign in.");
  }
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold">
        {signup ? "Your Bowl Street account" : "Welcome back to Bowl Street"}
      </h3>
      <Button
        variant="soft"
        className="w-full mb-3"
        onClick={async () => {
          const r = await lovable.auth.signInWithOAuth("google", {
            redirect_uri: window.location.origin,
          });
          if (r.error) setError(r.error.message);
          else if (!r.redirected) onSuccess();
        }}
      >
        Continue with Google
      </Button>
      <form onSubmit={submit}>
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
        <Button variant="aero" type="submit" className="w-full mt-4" disabled={busy}>
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
        <Button
          variant="link"
          size="sm"
          onClick={async () => {
            if (!email) {
              setError("Enter your email address first.");
              return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin,
            });
            setError(error?.message ?? "Password reset email sent.");
          }}
        >
          Forgot password?
        </Button>
      </div>
    </div>
  );
}
