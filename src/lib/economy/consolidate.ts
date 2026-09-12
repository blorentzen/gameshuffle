import "server-only";

/**
 * Fold a chat identity's economy ledger into an account's canonical wallet.
 * Called when a twitch/discord identity links to a GS account, so the account
 * identity becomes the single wallet (balance, picks, bets) — see
 * `supabase/economy-wallet-consolidation-m1.sql` + `resolveIdentity`.
 *
 * Best-effort at the call site: a failure here must never break the link/merge.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";

/**
 * Move `fromIdentityId`'s ledger onto the account's canonical wallet identity
 * (creating the wallet if needed). No-op when the source already is the wallet.
 */
export async function consolidateIntoAccount(
  fromIdentityId: string,
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!fromIdentityId || !accountId) return { ok: false, reason: "invalid_args" };
  // Ensure the canonical account wallet exists (and has its starting grant).
  const wallet = await ensureAccountWallet(accountId);
  if (!wallet) return { ok: false, reason: "wallet_unavailable" };
  if (wallet.identityId === fromIdentityId) return { ok: true }; // already canonical

  const admin = createServiceClient();
  const { error } = await admin.rpc("gs_consolidate_identity", {
    p_from: fromIdentityId,
    p_to: wallet.identityId,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
