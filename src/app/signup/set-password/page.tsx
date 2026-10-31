"use client";

/**
 * /signup/set-password
 *
 * The backup-password prompt for Twitch / Discord sign-ups. Per
 * gs-connections-architecture.md §5 every account should have a password as
 * a fallback, so nobody's locked out if Twitch or Discord sign-in stops
 * working. Since 2026-10-10 it's a strong recommendation: "Not now" sets a
 * 30-day cookie (src/lib/auth/passwordNudge.ts) and the middleware stops
 * redirecting here until it expires. Staff and admins get no "Not now".
 *
 * Rules come from src/lib/auth/passwordRules.ts, like every password form.
 * Signed out, it sends you to log in first; an account with two-step
 * verification enters its code before saving (Supabase refuses a password
 * change from a half-verified session).
 */

import { describeSupabaseAuthError, providerName } from "@/lib/auth/errors";
import { PASSWORD_HINT, passwordProblem } from "@/lib/auth/passwordRules";
import { useSecondStep } from "@/lib/auth/useSecondStep";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { LoadingLines } from "@/components/loading/LoadingLines";

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
  // A path on this site only: anything absolute or protocol-relative would send
  // a freshly signed-up person to another website.
  const rawReturn = searchParams.get("return_to");
  const returnTo = rawReturn && rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/account?tab=profile";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Whether THIS user actually needs to set a password — null = still
  // checking, false = already has one (we'll auto-redirect away), true =
  // show the form.
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const second = useSecondStep(!!user && needsPassword === true);

  // Signed out (or signed out in another tab): log in first, then come back here.
  useEffect(() => {
    if (loading || user) return;
    const back = `/signup/set-password${rawReturn ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;
    router.replace(`/login?redirect=${encodeURIComponent(back)}`);
  }, [loading, user, rawReturn, returnTo, router]);

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
          setCanSkip(body.canSkip !== false);
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
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(describeSupabaseAuthError(updateErr).message);
      setSubmitting(false);
      return;
    }
    // The auth.users trigger sets app_metadata.has_password
    // (supabase/auth-has-password-m1.sql); refresh so the session carries it.
    await supabase.auth.refreshSession();
    router.replace(returnTo);
  };

  const notNow = async () => {
    setSkipping(true);
    const res = await fetch("/api/account/password-later", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setSkipping(false);
      setError("Couldn't skip just now. Add a password, or try again.");
      return;
    }
    router.replace(returnTo);
  };

  if (loading || !user || needsPassword === null || second.state === "checking") {
    return (
      <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
        <Container>
          <LoadingLines label="Loading" />
        </Container>
      </main>
    );
  }
  if (second.state === "needed") {
    return (
      <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
        <Container>
          <div className="auth-page" style={{ maxWidth: 460 }}>
            <h1 className="auth-page__title">Add a backup password</h1>
            <MfaChallenge
              cancelLabel={canSkip ? "Not now" : "Sign out"}
              onDone={second.passed}
              onCancel={() => void (canSkip ? notNow() : signOut())}
            />
          </div>
        </Container>
      </main>
    );
  }

  // The account they signed up with (Supabase keeps it as app_metadata.provider).
  const via = (() => {
    const name = providerName(user.app_metadata?.provider as string | undefined);
    return name === "that account" || name === "email" ? "Twitch, Discord or Facebook" : name;
  })();

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page" style={{ maxWidth: 460 }}>
          <h1 className="auth-page__title">Add a backup password</h1>

          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "1rem", lineHeight: 1.6 }}>
            {canSkip
              ? <>We recommend it. You signed in with {via}, and that keeps working. If you ever can&rsquo;t get in that way (you lose that account, or it&rsquo;s locked), your email and this password still get you in.</>
              : <>Staff accounts need one. You signed in with {via}, and that keeps working; the password is your way back in if it ever doesn&rsquo;t.</>}
          </p>

          <div
            style={{
              background: "var(--background-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "var(--font-size-12)",
              color: "var(--text-primary)",
            }}
          >
            <strong>Account email:</strong> {user.email ?? "(no email on file)"}
          </div>

          <form onSubmit={handleSubmit} className="auth-page__form">
            {error && <div className="auth-page__error">{error}</div>}
            <p className="auth-page__hint">{PASSWORD_HINT}</p>

            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />

            <Button type="submit" variant="primary" fullWidth disabled={submitting || skipping}>
              {submitting ? "Saving…" : "Save password and continue"}
            </Button>

            {canSkip && (
              <>
                <Button type="button" variant="secondary" fullWidth disabled={submitting || skipping} onClick={() => void notNow()}>
                  {skipping ? "One moment…" : "Not now"}
                </Button>
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.25rem", lineHeight: 1.5 }}>
                  We&rsquo;ll remind you in a month. You can add one any time in Settings ▸ Sign-in &amp; security.
                </p>
              </>
            )}
            <Button type="button" variant="ghost" fullWidth onClick={() => void signOut()}>
              Sign out
            </Button>
          </form>
        </div>
      </Container>
    </main>
  );
}
