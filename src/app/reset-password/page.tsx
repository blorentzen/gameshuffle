"use client";

/**
 * Reset-password landing. Reached from the recovery email link after
 * /auth/callback has exchanged the code for a session. With that session in
 * hand we call updateUser({ password }) to set a new password, then send the
 * user into the app. If there's no session (link expired / opened cold), we
 * point them back to /forgot-password. An account with two-step verification
 * enters its code first: Supabase refuses a password change from the aal1
 * session a reset link gives.
 */

import { describeSupabaseAuthError } from "@/lib/auth/errors";
import { PASSWORD_HINT, passwordProblem } from "@/lib/auth/passwordRules";
import { useSecondStep } from "@/lib/auth/useSecondStep";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { MfaChallenge } from "@/components/auth/MfaChallenge";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const second = useSecondStep(hasSession);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(describeSupabaseAuthError(error).message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/account"), 1500);
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page">
          <h1 className="auth-page__title">Set a new password</h1>

          {checking || (hasSession && second.state === "checking") ? (
            <LoadingLines label="Loading" />
          ) : done ? (
            <div className="auth-page__message">
              <h2>Password updated</h2>
              <p>You&apos;re all set. Taking you to your account…</p>
            </div>
          ) : !hasSession ? (
            <div className="auth-page__message">
              <h2>This link has expired</h2>
              <p>Password reset links are single-use and time-limited. Request a fresh one.</p>
              <p className="auth-page__switch" style={{ marginTop: "1rem" }}>
                <a href="/forgot-password">Send a new reset link</a>
              </p>
            </div>
          ) : second.state === "needed" ? (
            <MfaChallenge
              cancelLabel="Cancel and sign out"
              onDone={second.passed}
              onCancel={async () => { await createClient().auth.signOut(); router.push("/login"); }}
            />
          ) : (
            <form onSubmit={handleSubmit} className="auth-page__form">
              {error && <div className="auth-page__error">{error}</div>}
              <p className="auth-page__hint">{PASSWORD_HINT}</p>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <Button variant="primary" type="submit" fullWidth disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}
