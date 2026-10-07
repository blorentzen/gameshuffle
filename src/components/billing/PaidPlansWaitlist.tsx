"use client";

/**
 * Where an upgrade button would be, for visitors outside the US: paid plans
 * are US-only for now, so they join the waitlist instead (and keep the whole
 * free site). Signed-in visitors join with their account email in one tap.
 */

import { useState } from "react";
import { Alert, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";

export function PaidPlansWaitlist({ product = "pro" }: { product?: "pro" | "circuit" }) {
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const label = product === "circuit" ? "Circuit" : "GS Pro";

  const join = async () => {
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/billing/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, email: user ? undefined : email }) });
      if (r.ok) { setJoined(true); track(EVENTS.waitlistJoined, { product }); toast.success("You're on the waitlist"); }
      else toast.error("Couldn't add you to the waitlist. Try again.");
    } finally { setBusy(false); }
  };

  if (joined) {
    return <Alert variant="success" title="You're on the waitlist">We&apos;ll email you when {label} opens where you are. Everything free on GameShuffle is yours in the meantime.</Alert>;
  }
  return (
    <div className="paid-waitlist">
      <p className="paid-waitlist__note">
        {label} is available in the US for now. Join the waitlist and we&apos;ll let you know when it opens where you are.
        Everything free on GameShuffle works wherever you are.
      </p>
      <div className="paid-waitlist__row">
        {!user && <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" />}
        <Button variant="primary" disabled={busy} onClick={() => void join()}>{busy ? "Joining…" : "Join the waitlist"}</Button>
      </div>
    </div>
  );
}
