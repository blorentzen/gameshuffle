import "server-only";

/**
 * Tokens from a streamer's monthly allowance to viewers who won something on
 * stream (break mode champions and bounties, Chat Brain's top brains). A
 * viewer is a Twitch account (their chat wallet) or a GameShuffle account
 * (their site wallet, for someone playing on the live page without Twitch).
 * A shortfall in the allowance stops that payout but undoes nothing.
 */

import { awardMint } from "./awards";
import { ensureAccountWallet } from "./accountWallet";
import { resolveIdentity } from "./identity";

export interface PayableViewer { platform: string; viewer: string; name: string | null }

/** Pay one viewer. Returns what was minted (0 when nothing went out). */
export async function payViewer(communityId: string, refId: string, w: PayableViewer, amount: number, source: string): Promise<number> {
  if (amount <= 0) return 0;
  try {
    const identityId = w.platform === "site"
      ? (await ensureAccountWallet(w.viewer, w.name ?? "Someone"))?.identityId
      : (await resolveIdentity({ platform: w.platform === "youtube" ? "youtube" : "twitch", platformId: w.viewer, displayName: w.name })).identityId;
    if (!identityId) return 0;
    const minted = await awardMint({ communityId, toIdentityId: identityId, amount, refId, meta: { source } });
    return minted.ok ? minted.minted : 0;
  } catch (err) {
    console.error(`[payouts] ${source} payout failed:`, err);
    return 0;
  }
}
