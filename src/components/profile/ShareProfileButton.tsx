"use client";

/**
 * Share a public GameShuffle profile. Uses the native share sheet when
 * available (mobile), otherwise copies the link to the clipboard with a toast.
 * Shown on every public profile — share your own to connect, or pass a player's
 * profile along.
 */

import { useState } from "react";
import { Button, Icon } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function ShareProfileButton({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/u/${username}`
        : `/u/${username}`;
    const shareData = {
      title: `${displayName} on GameShuffle`,
      text: `Check out ${displayName}'s GameShuffle profile — follow + find players to game with.`,
      url,
    };
    // Native share sheet (mobile / supported browsers).
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User dismissed or it failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Profile link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <Button variant="secondary" size="small" onClick={() => void share()}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-6)" }}>
        <Icon name={copied ? "check" : "share"} size="16" />
        {copied ? "Copied" : "Share"}
      </span>
    </Button>
  );
}
