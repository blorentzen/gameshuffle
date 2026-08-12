"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@empac/cascadeds";
import { TurnstileWidget } from "@/components/TurnstileWidget";

/**
 * Logged-out join. A prospect grabs a spot with their info (no account); adding
 * an email sends a soft-signup link that claims the spot on signup. Turnstile-
 * gated (protects the email-send path). On success, nudges account creation with
 * the value props + prefilled signup.
 */
export function GuestJoinCard({ tournamentId, acceptanceMode }: { tournamentId: string; acceptanceMode: string }) {
  const [name, setName] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const redirect = encodeURIComponent(`/tournament/${tournamentId}`);

  const submit = async () => {
    if (!name.trim()) { setError("Enter a display name."); return; }
    if (!hasEmail) { setError("Enter a valid email address."); return; }
    if (!token) { setError("Please complete the captcha."); return; }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournament/${tournamentId}/guest-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name.trim(), friendCode: friendCode.trim(), email: email.trim(), consent, turnstileToken: token }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (j.ok) setJoined(true);
    else setError(j.error || "Could not join. Please try again.");
  };

  if (joined) {
    const prefill =
      (hasEmail ? `&prefillEmail=${encodeURIComponent(email.trim())}` : "") +
      (name.trim() ? `&prefillName=${encodeURIComponent(name.trim())}` : "");
    return (
      <div className="comp-card" style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 700, fontSize: "16px", marginBottom: "0.35rem" }}>
          🏁 You&apos;re in{acceptanceMode === "auto" ? "!" : ". Pending organizer approval."}
        </p>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Create a free GameShuffle account to lock in your spot, <strong>save your progress</strong>, and{" "}
          <strong>track your rankings</strong> across events. It links this entry to your account
          {hasEmail ? " (we also emailed you a link)" : ""}.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href={`/signup?redirect=${redirect}${prefill}`}><Button variant="primary">Create free account</Button></Link>
          <Link href={`/login?redirect=${redirect}`}><Button variant="secondary">Log in</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="comp-card">
      <p style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Join this tournament</p>
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "1rem" }}>
        Grab your spot. We&apos;ll email you a link to lock it in with a free account (takes a few seconds).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 420 }}>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name *" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" />
        <Input type="text" value={friendCode} onChange={(e) => setFriendCode(e.target.value)} placeholder="Friend code (optional)" />
        {hasEmail && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "12px", color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
            Email me occasional GameShuffle updates (optional). Your save-your-spot link is sent either way.
          </label>
        )}
        <TurnstileWidget onToken={setToken} size="flexible" />
        {error && <p style={{ color: "var(--error-700, #c0392b)", fontSize: "12px" }}>{error}</p>}
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? "Joining…" : acceptanceMode === "auto" ? "Join tournament" : "Request to join"}
        </Button>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          Already have an account?{" "}
          <Link href={`/login?redirect=${redirect}`} style={{ color: "var(--bg-primary, var(--primary-500))" }}>Log in</Link>.
        </p>
      </div>
    </div>
  );
}
