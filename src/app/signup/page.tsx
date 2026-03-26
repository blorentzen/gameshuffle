"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
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
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button variant="primary" type="submit" fullWidth disabled={loading}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>

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
