"use client";

/**
 * "Sign in with Twitch to participate" modal. Shown when an
 * unauthenticated viewer attempts a tactile action (pick/ban) on the
 * live view. Per spec §9.
 *
 * On confirm, kicks off Supabase Auth's Twitch provider OAuth flow
 * with `redirect=/live/[slug]` so the post-callback handler returns
 * the viewer to the page they came from. The pending action is
 * stashed in sessionStorage by the caller (via rememberPendingAction)
 * so it can replay after auth.
 */

import { useState } from "react";
import { Alert, Button, Modal } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Slug of the live view the viewer is on — used to build the
   *  post-callback redirect path. */
  streamerSlug: string;
  /** Friendly action label rendered in the modal copy
   *  (e.g., "pick Sky-High Sundae"). Optional. */
  actionLabel?: string;
}

export function AuthPromptModal({
  isOpen,
  onClose,
  streamerSlug,
  actionLabel,
}: AuthPromptModalProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectPath = `/live/${streamerSlug}`;
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("redirect", redirectPath);
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "twitch",
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthErr) {
        setError(oauthErr.message ?? "Couldn't start Twitch sign-in.");
        setSigningIn(false);
      }
      // Success path: the browser redirects away to Twitch's OAuth
      // page; we never resume from here. signingIn stays true to
      // disable the button in case React hydrates fast enough to
      // re-render before the redirect lands.
    } catch (err) {
      console.error("[AuthPromptModal] signInWithOAuth threw:", err);
      setError("Couldn't start Twitch sign-in (network error).");
      setSigningIn(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sign in with Twitch to participate"
      primaryAction={{
        label: signingIn ? "Redirecting…" : "Sign in with Twitch",
        onClick: () => void startSignIn(),
      }}
      secondaryAction={{
        label: "Continue browsing",
        onClick: onClose,
      }}
    >
      <p>
        {actionLabel
          ? `To ${actionLabel}, sign in with Twitch.`
          : "To pick or ban tracks and items, sign in with Twitch."}
      </p>
      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-8)" }}>
        We only request your Twitch identity (display name + avatar). No
        chat, no channel-points, no DMs. You stay signed in across page
        loads on this site only.
      </p>
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Modal>
  );
}
