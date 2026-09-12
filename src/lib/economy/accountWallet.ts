/**
 * Account-level token wallet (Phase 1 — decouple minting from forced chat).
 *
 * Every GameShuffle account gets a wallet identity (platform = 'account',
 * platform_id = auth user id) that receives the starting grant at signup,
 * WITHOUT having to chat or bet first. Chat identities (twitch/discord) still
 * work as before; because `listIdentitiesForAccount` + `getBalance` sum across
 * an account's linked identities, a viewer who later links a platform sees one
 * unified balance.
 *
 * All calls are best-effort at the call site: wrap in try/catch so a missing
 * migration or a transient error never blocks auth/heartbeat.
 *
 * Backed by `supabase/economy-account-wallet-m1.sql`
 * (`gs_resolve_account_identity`, `gs_grant_onboarding`).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/economy/tokens";
import { listIdentitiesForAccount } from "@/lib/economy/identity";

/** The account's canonical wallet identity id, if it exists (read-only — does
 *  NOT create it). Used to route linked identities to the account wallet. */
export async function getAccountIdentityId(
  accountId: string,
  admin: SupabaseClient = createServiceClient(),
): Promise<string | null> {
  if (!accountId) return null;
  const { data } = await admin
    .from("gs_identities")
    .select("id")
    .eq("platform", "account")
    .eq("platform_id", accountId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export interface AccountWalletResult {
  identityId: string;
  /** True only on the call that created the wallet + fired the starting grant. */
  isNew: boolean;
  balance: number;
}

/**
 * Ensure the account has a wallet identity and its starting grant. Idempotent —
 * grants exactly once, so it's safe (and intended) to call on every
 * authenticated load; it also backfills accounts created before this shipped.
 */
export async function ensureAccountWallet(
  accountId: string,
  displayName?: string | null,
): Promise<AccountWalletResult | null> {
  if (!accountId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_resolve_account_identity", {
    p_account_id: accountId,
    p_display_name: displayName ?? null,
  });
  if (error) {
    throw new Error(`gs_resolve_account_identity failed: ${error.message}`);
  }
  const r = data as { identity_id: string; is_new: boolean; balance: number };
  return { identityId: r.identity_id, isNew: r.is_new, balance: r.balance };
}

/** Onboarding milestones that mint a one-time activation grant. Config key is
 *  `onboarding_<milestone>` (falls back to `grant_onboarding_default`). */
export type OnboardingMilestone =
  | "profile"
  | "link_platform"
  | "first_follow"
  | "join_community"
  | "first_tournament";

/**
 * Grant a one-time onboarding milestone reward. Idempotent per
 * (account, milestone) at the DB level. Requires the account wallet to exist —
 * callers that might run before first sign-in should `ensureAccountWallet`
 * first. Returns whether a grant actually fired.
 */
export async function grantOnboardingMilestone(
  accountId: string,
  milestone: OnboardingMilestone,
): Promise<{ granted: boolean; balance?: number; reason?: string }> {
  if (!accountId) return { granted: false, reason: "invalid_args" };
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_grant_onboarding", {
    p_account_id: accountId,
    p_milestone: milestone,
  });
  if (error) {
    throw new Error(`gs_grant_onboarding failed: ${error.message}`);
  }
  const r = data as { ok: boolean; reason?: string; balance?: number };
  return { granted: !!r.ok && r.reason !== "already_granted", balance: r.balance, reason: r.reason };
}

/**
 * Total token balance for a GS account, summed across every linked identity
 * (account wallet + any linked twitch/discord chat identities). Read-only.
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  if (!accountId) return 0;
  const identities = await listIdentitiesForAccount(accountId);
  if (identities.length === 0) return 0;
  const balances = await Promise.all(identities.map((i) => getBalance(i.id)));
  return balances.reduce((sum, b) => sum + b, 0);
}
