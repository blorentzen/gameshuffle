"use client";

import { IconShare } from "@tabler/icons-react";
import { ShareButton } from "@/components/share/ShareButton";

/**
 * The owner's own Supporter badge on their profile: tapping it shares their supporter card
 * (Britton's picks, 2026-10-19). Everyone else's badge is a plain link to /support.
 */
export function SupporterBadge({ label }: { label: string }) {
  return (
    <ShareButton
      request={{ kind: "supporter" }}
      game="supporter"
      title="I support GameShuffle"
      fallbackUrl="https://www.gameshuffle.co/support"
      text={(url) => `I support GameShuffle: free dailies, randomizers and game night tools. Come play: ${url}`}
      trigger={(share) => (
        <button type="button" className="profile-badge profile-badge--supporter profile-badge--button" onClick={share} aria-label={`${label}. Share your supporter card`}>
          {label}<IconShare size={12} stroke={2.25} aria-hidden="true" />
        </button>
      )}
    />
  );
}
