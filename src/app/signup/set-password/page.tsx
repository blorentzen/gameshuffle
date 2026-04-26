"use client";

/**
 * /signup/set-password
 *
 * Required step for OAuth-only signups. Per gs-connections-architecture.md
 * §5 — every account MUST have a password set as the canonical sign-in
 * fallback so users don't get locked out if their OAuth provider revokes
 * access or they accidentally disconnect.
 *
 * No skip button. No staff bypass. The middleware redirects every protected
 * route to this page until a password is set; the only escape hatches are
 * setting one or signing out.
 *
 * Validation mirrors signup + the Security tab's "Change password" form.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordContent />
    </Suspense>
  );
}

function SetPasswordContent() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/account?tab=profile";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Whether THIS user actually needs to set a password — null = still
  // checking, false = already has one (we'll auto-redirect away), true =
  // show the form.
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);

  // If the user already has a password set, this page shouldn't show — bounce
  // them straight to where they were headed.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    fetch("/api/account/needs-password", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.needsPassword === false) {
          router.replace(returnTo);
        } else {
          setNeedsPassword(true);
        }
      })
      .catch((err) => {
        console.error("[set-password] needs check failed:", err);
        // Fail open — show the form so the user has SOME way to proceed.
        if (!cancelled) setNeedsPassword(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, returnTo, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(password)) return setError("Password must include an uppercase letter.");
    if (!/[a-z]/.test(password)) return setError("Password must include a lowercase letter.");
    if (!/[0-9]/.test(password)) return setError("Password must include a number.");
    if (!/[^A-Za-z0-9]/.test(password)) return setError("Password must include a special character.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message || "Couldn't set password. Try again.");
      setSubmitting(false);
      return;
    }
    // updateUser flips `app_metadata.providers` to include `email` server-side
    // — refresh the session so middleware sees the change before the redirect.
    await supabase.auth.refreshSession();
    router.replace(returnTo);
  };

  if (loading || needsPassword === null) {
    return (
      <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
        <Container>
          <p style={{ color: "#808080", fontSize: "14px" }}>Loading…</p>
        </Container>
      </main>
    );
  }
  if (!user) {
    // Edge case: user signed out from another tab while this page loaded.
    return null;
  }

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page" style={{ maxWidth: 460 }}>
          <h1 className="auth-page__title">Set a password</h1>

          <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1rem", lineHeight: 1.6 }}>
            We need a password on file for your account before you can keep going. This is
            your <strong>fallback</strong> sign-in method — your linked accounts (Discord,
            Twitch) keep working as before, but if you ever lose access to them, the
            password gets you back in.
          </p>

          <div
            style={{
              background: "#F7F9FB",
              border: "1px solid #E1E8ED",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "13px",
              color: "#404040",
            }}
          >
            <strong>Account email:</strong> {user.email ?? "(no email on file)"}
          </div>

          <form onSubmit={handleSubmit} className="auth-page__form">
            {error && <div className="auth-page__error">{error}</div>}

            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p style={{ fontSize: "12px", color: "#808080", marginTop: "-0.5rem" }}>
              Min 8 characters, with uppercase, lowercase, number, and special character.
            </p>

            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />

            <Button type="submit" variant="primary" fullWidth disabled={submitting}>
              {submitting ? "Saving…" : "Set password and continue"}
            </Button>

            <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.75rem", lineHeight: 1.5 }}>
              Need to step away? Sign out — your account is preserved and you can finish
              this when you come back.
            </p>
            <Button type="button" variant="ghost" fullWidth onClick={() => void signOut()}>
              Sign out
            </Button>
          </form>
        </div>
      </Container>
    </main>
  );
}
