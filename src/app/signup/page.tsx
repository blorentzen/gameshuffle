"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { useAnalytics } from "@/hooks/useAnalytics";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function SignupPage() {
  const { trackEvent } = useAnalytics();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Marketing emails — opt-in (default OFF). Honors privacy policy commitment.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const router = useRouter();

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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
        data: {
          display_name: displayName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    resetTurnstile();

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      trackEvent("Signup", { method: "email" });
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

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "13px", color: "#404040", lineHeight: 1.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: "0.2rem", flexShrink: 0 }}
                />
                <span>
                  I&apos;m at least 13 years old and I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#0E75C1" }}>Terms of Service</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#0E75C1" }}>Privacy Policy</a>.
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "13px", color: "#404040", lineHeight: 1.5, cursor: "pointer" }}>
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
                      trackEvent("Signup", { method: provider });
                      const supabase = createClient();
                      await supabase.auth.signInWithOAuth({
                        provider,
                        options: { redirectTo: `${window.location.origin}/auth/callback` },
                      });
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <img src={`/images/icons/${provider}.svg`} alt="" style={{ width: 18, height: 18 }} />
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
