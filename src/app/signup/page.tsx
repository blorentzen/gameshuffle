"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useAnalytics } from "@/hooks/useAnalytics";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

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
  const turnstileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const onTurnstileLoad = useCallback(() => {
    if (turnstileRef.current && (window as any).turnstile) {
      (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
        theme: "light",
      });
    }
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          display_name: displayName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      // Reset Turnstile for retry
      if ((window as any).turnstile) {
        (window as any).turnstile.reset();
        setCaptchaToken(null);
      }
    } else {
      setSuccess(true);
      trackEvent("Signup", { method: "email" });
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
                    src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad"
                    strategy="afterInteractive"
                    onReady={onTurnstileLoad}
                  />
                  <div ref={turnstileRef} style={{ display: "flex", justifyContent: "center" }} />
                </>
              )}

              <Button variant="primary" type="submit" fullWidth disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>

              <p style={{ fontSize: "12px", color: "#808080", textAlign: "center", marginTop: "0.5rem" }}>
                By signing up, you agree to our{" "}
                <a href="/terms" style={{ color: "#0E75C1" }}>Terms of Service</a> and{" "}
                <a href="/privacy" style={{ color: "#0E75C1" }}>Privacy Policy</a>.
              </p>

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
                    onClick={async () => {
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
