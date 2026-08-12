"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { useAnalytics } from "@/hooks/useAnalytics";
import { getStoredLeadSource } from "@/lib/analytics/leadSource";

/** Signup event props, tagged with the campaign lead source when the visitor
 *  arrived from a `?src=` link (e.g. the TCG insert) so conversions attribute
 *  back to the campaign. */
function signupProps(method: string): Record<string, string> {
  const source = getStoredLeadSource();
  return source ? { method, source } : { method };
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

// Carry a `?redirect=` through signup → /auth/callback (which honors it), so an
// invite link (e.g. a championship join) returns the new user where they started.
// Read from the URL directly to avoid a useSearchParams Suspense boundary.
function postAuthRedirectSuffix(): string {
  if (typeof window === "undefined") return "";
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
}

export default function SignupPage() {
  const { trackEvent } = useAnalytics();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Supabase obfuscates a repeat signup of an existing email: no error, no
  // email, and an empty `identities` array. We detect that and route the user
  // to recovery instead of showing a false "check your email".
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Marketing emails — opt-in (default OFF). Honors privacy policy commitment.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const router = useRouter();

  // Prefill from a soft-signup link (e.g. tournament guest join): ?prefillName / ?prefillEmail.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const n = p.get("prefillName");
    const e = p.get("prefillEmail");
    if (n) setDisplayName(n);
    if (e) setEmail(e);
  }, []);

  // Render Turnstile widget once the script is loaded and the ref is available
  useEffect(() => {
    if (!turnstileReady || !turnstileRef.current || !TURNSTILE_SITE_KEY) return;
    if (widgetIdRef.current) return; // already rendered

    const id = (window as any).turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
      theme: "light",
    });
    widgetIdRef.current = id;
  }, [turnstileReady]);

  const resetTurnstile = () => {
    if ((window as any).turnstile && widgetIdRef.current) {
      (window as any).turnstile.reset(widgetIdRef.current);
      setCaptchaToken(null);
    }
  };

  // Resend the signup confirmation — the recovery path for an unconfirmed
  // account. For an already-confirmed account Supabase returns an error; we
  // keep the message neutral either way (and don't leak which case it is).
  const handleResend = async () => {
    setResendStatus(null);
    setResending(true);
    const supabase = createClient();
    await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    setResendStatus(
      `If ${email} still needs confirming, a new link is on its way. If you already confirmed, just log in.`,
    );
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      setError("Please confirm you're at least 13 and agree to the Terms of Service and Privacy Policy.");
      return;
    }

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
        data: {
          display_name: displayName,
        },
        // welcome=1 rides through the confirmation link so the landing page can
        // show a one-time welcome toast once the account is confirmed.
        emailRedirectTo: `${window.location.origin}/auth/callback?welcome=1${
          postAuthRedirectSuffix() ? `&${postAuthRedirectSuffix().slice(1)}` : ""
        }`,
      },
    });

    resetTurnstile();

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.user && (data.user.identities?.length ?? 0) === 0) {
      // Email already registered — Supabase returns an obfuscated user with no
      // identities and sends no confirmation email. Route to recovery.
      setAlreadyExists(true);
      setLoading(false);
    } else {
      setSuccess(true);
      trackEvent("Signup", signupProps("email"));
      // Best-effort opt-in record. Don't block signup confirmation on this —
      // if it fails, the user can opt in later from account settings.
      if (marketingOptIn) {
        fetch("/api/email/subscriptions/opt-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, categories: ["product_updates"] }),
        }).catch((err) => console.warn("[signup] marketing opt-in record failed:", err));
      }
    }
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page">
          <h1 className="auth-page__title">Create your account</h1>

          {success ? (
            <div className="auth-page__message">
              <h2>Check your email</h2>
              <p>
                We sent a confirmation link to <strong>{email}</strong>. Click
                it to activate your account.
              </p>
            </div>
          ) : alreadyExists ? (
            <div className="auth-page__message">
              <h2>You already have an account</h2>
              <p>
                An account with <strong>{email}</strong> already exists. Log in
                below, or resend the confirmation email if you never finished
                setting it up.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => router.push(`/login${postAuthRedirectSuffix()}`)}
                >
                  Log in
                </Button>
                <Button variant="secondary" fullWidth loading={resending} onClick={handleResend}>
                  Resend confirmation email
                </Button>
              </div>
              {resendStatus && (
                <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
                  {resendStatus}
                </p>
              )}
              <p className="auth-page__switch" style={{ marginTop: "1rem" }}>
                Wrong email?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setAlreadyExists(false);
                    setResendStatus(null);
                  }}
                >
                  Go back
                </a>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="auth-page__form">
              {error && <div className="auth-page__error">{error}</div>}

              <Input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: "-0.25rem 0 0" }}>
                Public: shown on your profile, live pages, and tournaments. Use a nickname if you&apos;d rather not use your real name.
              </p>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {TURNSTILE_SITE_KEY && (
                <>
                  <Script
                    src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                    strategy="afterInteractive"
                    onReady={() => setTurnstileReady(true)}
                  />
                  <div ref={turnstileRef} style={{ display: "flex", justifyContent: "center" }} />
                </>
              )}

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: "0.2rem", flexShrink: 0 }}
                />
                <span>
                  I&apos;m at least 13 years old and I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-500)" }}>Terms of Service</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-500)" }}>Privacy Policy</a>.
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  style={{ marginTop: "0.2rem", flexShrink: 0 }}
                />
                <span>
                  Send me product updates and feature announcements (optional). You can unsubscribe at any time.
                </span>
              </label>

              <Button variant="primary" type="submit" fullWidth disabled={loading || !acceptedTerms || (!!TURNSTILE_SITE_KEY && !captchaToken)}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>

              <div className="auth-page__divider">
                <span>or</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {(["discord", "twitch"] as const).map((provider) => (
                  <Button
                    key={provider}
                    variant="secondary"
                    type="button"
                    fullWidth
                    disabled={!acceptedTerms}
                    onClick={async () => {
                      if (!acceptedTerms) {
                        setError("Please confirm you're at least 13 and agree to the Terms of Service and Privacy Policy.");
                        return;
                      }
                      trackEvent("Signup", signupProps(provider));
                      const supabase = createClient();
                      await supabase.auth.signInWithOAuth({
                        provider,
                        options: { redirectTo: `${window.location.origin}/auth/callback${postAuthRedirectSuffix()}` },
                      });
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <img src={`/images/icons/${provider}.svg`} alt="" className="gs-platform-icon" style={{ width: 18, height: 18 }} />
                      Sign up with {provider === "discord" ? "Discord" : "Twitch"}
                    </span>
                  </Button>
                ))}
              </div>

              <p className="auth-page__switch">
                Already have an account?{" "}
                <a href="/login">Log in</a>
              </p>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}
