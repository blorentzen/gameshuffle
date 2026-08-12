"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";

export function JoinClient({ token, championshipId, name }: { token: string; championshipId: string; name: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setJoining(true);
    setError(null);
    const res = await fetch("/api/championship/accept", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await res.json();
    if (j.ok) router.push(`/tournament/championship/${championshipId}`);
    else { setError(j.error || "Could not join the league."); setJoining(false); }
  };

  const redirect = encodeURIComponent(`/championship/join/${token}`);

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div className="comp-card" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <span className="marketing-eyebrow">🏆 Championship invite</span>
          <h1 style={{ fontSize: "1.7rem", fontWeight: 700, margin: "0.35rem 0 0.5rem" }}>Join {name}</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            You&apos;ve been invited to the <strong>{name}</strong> championship series on GameShuffle. Points carry across every event into a season table.
          </p>

          {loading ? (
            <p style={{ color: "var(--text-tertiary)" }}>…</p>
          ) : user ? (
            <>
              <Button variant="primary" onClick={join} disabled={joining}>{joining ? "Joining…" : "Join the league"}</Button>
              {error && <p style={{ color: "var(--error-700, #c0392b)", marginTop: "0.75rem", fontSize: "14px" }}>{error}</p>}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
              <p style={{ fontSize: "14px", color: "var(--text-tertiary)", marginBottom: "0.25rem" }}>Create a free account (or sign in) to join. It&apos;s how the league keeps your points all season.</p>
              <Link href={`/signup?redirect=${redirect}`}><Button variant="primary">Create free account</Button></Link>
              <Link href={`/login?redirect=${redirect}`}><Button variant="secondary">Sign in</Button></Link>
            </div>
          )}
        </div>
      </Container>
    </main>
  );
}
