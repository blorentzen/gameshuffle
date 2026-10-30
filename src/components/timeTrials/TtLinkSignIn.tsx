"use client";

/** Signed out on /time-trials/link: sign in with Discord (makes a free account if there isn't one), then back to time trials. */

import { useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@empac/cascadeds";
import { IconBrandDiscord } from "@tabler/icons-react";
import { startOAuth } from "@/lib/auth/oauth";

export function TtLinkSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const failed = await startOAuth("discord", `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/time-trials")}`, { surface: "time-trials-link" });
    if (failed) { setError(failed); setBusy(false); }
  };
  return (
    <div className="tt-link">
      <Button variant="primary" iconBefore={IconBrandDiscord} onClick={go} loading={busy}>Continue with Discord</Button>
      <p className="tt-note">Use the Discord account you add times with. New to GameShuffle? This makes your free account.</p>
      <p className="tt-note">Already have an account? <Link href={`/login?redirect=${encodeURIComponent("/time-trials/link")}`}>Sign in</Link>, then connect Discord.</p>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
