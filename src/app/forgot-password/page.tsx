"use client";

/**
 * Forgot-password request page. Enter your email, we send a Supabase password
 * recovery link whose `redirectTo` routes through /auth/callback (which exchanges
 * the code for a recovery session) and lands on /reset-password to set a new one.
 *
 * Neutral success copy ("if an account exists…") so we don't leak whether the
 * email is registered.
 */

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileReady || !turnstileRef.current || !TURNSTILE_SITE_KEY) return;
    if (widgetIdRef.current) return;
    widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
      theme: "light",
    });
  }, [turnstileReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Please wait for the security check to complete.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?redirect=/reset-password`,
      ...(TURNSTILE_SITE_KEY && captchaToken ? { captchaToken } : {}),
    });
    setLoading(false);
    // Neutral: don't reveal whether the email exists. Only surface hard errors
    // (rate limits, captcha) so the user knows to retry.
    if (error && /captcha|rate|too many/i.test(error.message)) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page">
          <h1 className="auth-page__title">Reset your password</h1>

          {sent ? (
            <div className="auth-page__message">
              <h2>Check your email</h2>
              <p>
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset
                your password. It expires shortly, so use it soon.
              </p>
              <p className="auth-page__switch" style={{ marginTop: "1rem" }}>
                <a href="/login">Back to log in</a>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-page__form">
              {error && <div className="auth-page__error">{error}</div>}
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
                Enter the email for your account and we&apos;ll send a reset link.
              </p>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <Button
                variant="primary"
                type="submit"
                fullWidth
                disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
              >
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <p className="auth-page__switch">
                Remembered it? <a href="/login">Log in</a>
              </p>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}
