"use client";

/**
 * Persistent token-balance badge for the /live header. Shows the signed-in
 * viewer's balance (or a "play to earn" hint before they've a GS identity).
 * Renders nothing for signed-out viewers — the page's sign-in CTA covers that.
 */

import { useViewerBalance } from "@/lib/economy/useViewerBalance";
import { TokenIcon } from "@/components/TokenIcon";

export function ViewerBalanceBadge() {
  const { signedIn, activated, balance } = useViewerBalance();

  if (!signedIn) return null;

  return (
    <span className="viewer-balance" title="Your token balance">
      {activated && balance !== null ? (
        <>
          <TokenIcon size={16} />
          <span className="viewer-balance__amount">{balance.toLocaleString()}</span>
        </>
      ) : (
        <span className="viewer-balance__hint">Play to earn tokens</span>
      )}
    </span>
  );
}
