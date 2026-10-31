"use client";

import { ShareButton } from "@/components/share/ShareButton";

/**
 * "Share that you're a supporter" (Britton's picks, 2026-10-19): the supporter card, from the
 * thank-you page (by its Checkout session, so a gift made signed out works too) or Account ▸ Support.
 */
export function SupporterShare({ session, label = "Share that you're a supporter", variant = "primary" }: {
  session?: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <ShareButton
      request={{ kind: "supporter", ...(session ? { session } : {}) }}
      game="supporter"
      title="I support GameShuffle"
      label={label}
      variant={variant}
      fallbackUrl="https://www.gameshuffle.co/support"
      text={(url) => `I support GameShuffle: free dailies, randomizers and game night tools. Come play: ${url}`}
    />
  );
}
