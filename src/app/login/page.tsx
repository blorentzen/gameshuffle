"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect") || "/account";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
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
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}`,
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

              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button variant="primary" type="submit" fullWidth disabled={loading}>
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
                disabled={loading}
              >
                Send Magic Link
              </Button>

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
