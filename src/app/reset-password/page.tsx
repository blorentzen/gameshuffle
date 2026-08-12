"use client";

/**
 * Reset-password landing. Reached from the recovery email link after
 * /auth/callback has exchanged the code for a session. With that session in
 * hand we call updateUser({ password }) to set a new password, then send the
 * user into the app. If there's no session (link expired / opened cold), we
 * point them back to /forgot-password.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
      setError(error.message);
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

          {checking ? (
            <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Loading…</p>
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
          ) : (
            <form onSubmit={handleSubmit} className="auth-page__form">
              {error && <div className="auth-page__error">{error}</div>}
              <Input
                type="password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                type="password"
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
