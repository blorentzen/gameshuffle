"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Script from "next/script";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect") || "/account";

  // Brute force protection
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (!lockoutEnd) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutEnd(null);
        setLockoutRemaining(0);
        setFailedAttempts(0);
      } else {
        setLockoutRemaining(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  const isLockedOut = lockoutEnd !== null && Date.now() < lockoutEnd;

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

  const resetTurnstile = () => {
    if ((window as any).turnstile) {
      (window as any).turnstile.reset();
      setCaptchaToken(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: TURNSTILE_SITE_KEY ? { captchaToken: captchaToken || undefined } : undefined,
    });

    resetTurnstile();

    if (error) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockoutEnd(Date.now() + LOCKOUT_SECONDS * 1000);
        setError(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setError(error.message);
      }
      setLoading(false);
    } else {
      router.push(redirect);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    if (isLockedOut) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}`,
        ...(TURNSTILE_SITE_KEY && captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="auth-page">
          <h1 className="auth-page__title">Log in to GameShuffle</h1>

          {magicLinkSent ? (
            <div className="auth-page__message">
              <h2>Check your email</h2>
              <p>
                We sent a magic link to <strong>{email}</strong>. Click the link
                to log in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="auth-page__form">
              {error && <div className="auth-page__error">{error}</div>}

              {isLockedOut && (
                <div style={{ textAlign: "center", padding: "1rem", background: "#fff3cd", borderRadius: "0.5rem", marginBottom: "0.5rem" }}>
                  <p style={{ fontWeight: 600, color: "#856404", fontSize: "14px" }}>
                    Too many failed attempts. Try again in {lockoutRemaining}s.
                  </p>
                </div>
              )}

              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLockedOut}
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLockedOut}
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

              <Button variant="primary" type="submit" fullWidth disabled={loading || isLockedOut}>
                {loading ? "Logging in..." : "Log In"}
              </Button>

              <div className="auth-page__divider">
                <span>or</span>
              </div>

              <Button
                variant="secondary"
                type="button"
                fullWidth
                onClick={handleMagicLink}
                disabled={loading || isLockedOut}
              >
                Send Magic Link
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
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.auth.signInWithOAuth({
                        provider,
                        options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` },
                      });
                    }}
                    disabled={isLockedOut}
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <img src={`/images/icons/${provider}.svg`} alt="" style={{ width: 18, height: 18 }} />
                      Continue with {provider === "discord" ? "Discord" : "Twitch"}
                    </span>
                  </Button>
                ))}
              </div>

              <p className="auth-page__switch">
                Don&apos;t have an account?{" "}
                <a href="/signup">Sign up</a>
              </p>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}
