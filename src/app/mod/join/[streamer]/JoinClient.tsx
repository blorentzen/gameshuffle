"use client";

/** Sign in with Twitch, then join as a mod (/mod/join/<streamer>). */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@empac/cascadeds";
import { startOAuth } from "@/lib/auth/oauth";

export function JoinClient({ slug, streamerName, signedIn }: { slug: string; streamerName: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(`/mod/join/${slug}`)}`;
    const problem = await startOAuth("twitch", redirectTo, { surface: "mod-join" });
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mod/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ streamer: slug }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !body.ok) {
      setError(body.message ?? "That didn't go through. Try again.");
      setBusy(false);
      return;
    }
    router.push(`/mod/${encodeURIComponent(body.slug ?? slug)}`);
  };

  return (
    <div className="mod-join__actions">
      {error && <Alert variant="error">{error}</Alert>}
      {signedIn ? (
        <Button variant="primary" onClick={() => void join()} disabled={busy}>{busy ? "Checking with Twitch…" : `Join as ${streamerName}'s mod`}</Button>
      ) : (
        <Button variant="primary" onClick={() => void signIn()} disabled={busy}>{busy ? "Opening Twitch…" : "Sign in with Twitch"}</Button>
      )}
    </div>
  );
}
