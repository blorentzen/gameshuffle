"use client";

/**
 * Claim-flow client — runs the "Accept invite" button + the sign-in
 * branches when the visitor isn't authenticated yet.
 *
 * The server component decided we're in the "open invite, ready to
 * proceed" state. From here, two paths:
 *
 *   1. Signed in → call POST /api/account/mods/claim with the token.
 *      The route validates the identity match (`gs_user_id` was
 *      backfilled at sign-in by the cross-surface identity merge).
 *
 *   2. Not signed in → render OAuth buttons that send them through
 *      `/auth/callback?redirect=/mod/invite/<token>` so they land
 *      back here logged in, then complete the claim.
 */

import { useState } from "react";
import { Alert, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

interface ClaimClientProps {
  token: string;
  isSignedIn: boolean;
  streamerName: string;
  neededProvider: "twitch" | "discord" | null;
  modDisplayName: string;
}

export function ClaimClient({
  token,
  isSignedIn,
  streamerName,
  neededProvider,
  modDisplayName,
}: ClaimClientProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthSignIn = async (provider: "twitch" | "discord") => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
      `/mod/invite/${token}`,
    )}`;
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setBusy(false);
    }
    // On success the browser is redirected away — no local state to clear.
  };

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mods/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          invite_not_found: "This invite link isn't valid anymore.",
          invite_not_open:
            "This invite has already been used or is no longer open.",
          invite_expired:
            "This invite expired. Ask the streamer for a fresh one.",
          invite_for_different_account:
            "This invite was sent to a different account. Sign out and sign in with the right one.",
          identity_link_required:
            body.needed === "twitch"
              ? "Link your Twitch account to your GS profile first, then come back to accept."
              : "Link your Discord account to your GS profile first, then come back to accept.",
        };
        setError(reasons[body.error as string] ?? body.error ?? "Claim failed.");
        setBusy(false);
        return;
      }
      // Success — land them on the streamer's mod view.
      window.location.href = `/mod/${body.streamerSlug}?claimed=1`;
    } catch {
      setError("Network error claiming invite.");
      setBusy(false);
    }
  };

  return (
    <>
      <h1 style={{ marginTop: 0, marginBottom: "var(--spacing-8)" }}>
        You&rsquo;re invited to mod
      </h1>
      <p
        style={{
          fontSize: "var(--font-size-16)",
          color: "var(--text-secondary)",
          margin: "0 0 var(--spacing-20)",
          lineHeight: "var(--line-height-relaxed)",
        }}
      >
        <strong>{streamerName}</strong> invited <strong>{modDisplayName}</strong>{" "}
        to mod their GameShuffle stream — approve code requests, kick the
        prequeue, release codes, clear no-shows.
      </p>
      <p
        style={{
          fontSize: "var(--font-size-14)",
          color: "var(--text-tertiary)",
          margin: "0 0 var(--spacing-24)",
          lineHeight: "var(--line-height-relaxed)",
        }}
      >
        Mods get operational power on stream surfaces. You can&rsquo;t
        change session config or your streamer&rsquo;s account settings —
        only help the night run.
      </p>

      {error && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {isSignedIn ? (
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={claim} disabled={busy}>
            {busy ? "Accepting…" : "Accept and continue →"}
          </Button>
        </div>
      ) : (
        <>
          <p
            style={{
              fontSize: "var(--font-size-14)",
              color: "var(--text-secondary)",
              margin: "0 0 var(--spacing-12)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            Sign in to accept
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
            }}
          >
            {(neededProvider === "twitch" || neededProvider === null) && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => oauthSignIn("twitch")}
                disabled={busy}
              >
                Continue with Twitch
              </Button>
            )}
            {(neededProvider === "discord" || neededProvider === null) && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => oauthSignIn("discord")}
                disabled={busy}
              >
                Continue with Discord
              </Button>
            )}
          </div>
          <p
            style={{
              fontSize: "var(--font-size-12)",
              color: "var(--text-tertiary)",
              margin: "var(--spacing-12) 0 0",
              lineHeight: "var(--line-height-snug)",
            }}
          >
            {neededProvider === "twitch"
              ? "This invite was sent to a Twitch identity — sign in with Twitch to match it."
              : neededProvider === "discord"
                ? "This invite was sent to a Discord identity — sign in with Discord to match it."
                : "Sign in with the platform that matches this invite."}
            {" "}Already have a GameShuffle account with a different sign-in?
            Sign in normally first, then revisit this link.
          </p>
        </>
      )}
    </>
  );
}
