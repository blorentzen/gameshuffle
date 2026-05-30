/**
 * Identity layer — Spec 01 §3.1, §3.3, §3.9.
 *
 * The token economy is keyed on `gs_identities` rows, NOT on
 * `users.id` or `session_participants.platform_user_id`. An identity
 * row exists per `(platform, platform_id)` pair — one for each
 * durable OAuth user on each chat platform we support.
 *
 * Two tier states:
 *   - **Tier 0** (anonymous) — chat user has never signed up. Row
 *     has `gs_account_id = NULL`, `tier = 'anon'`. Created lazily on
 *     first chat command or authenticated web tactile interaction.
 *     Already has a balance (starting grant fires at creation time).
 *   - **Tier 1+** (linked) — chat user has signed up + linked their
 *     Twitch / Discord identity. Row's `gs_account_id` points at
 *     `auth.users(id)`, `tier = 'free'` (or 'paid' eventually).
 *
 * The Tier 0 → Tier 1 transition is a LINK (`upgradeIdentityToAccount`),
 * never a recreate. The `id` column stays the same, every
 * `token_events.identity_id` still points at the right row, balance
 * survives untouched.
 *
 * Per `specs/gs-token-economy/01-economy-identity-spine.md`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type Platform = "twitch" | "discord";

export interface Identity {
  id: string;
  platform: Platform;
  platform_id: string;
  display_name: string | null;
  gs_account_id: string | null;
  tier: "anon" | "free" | "paid";
  created_at: string;
}

export interface ResolveIdentityResult {
  identityId: string;
  /** True only on the call that actually created the row. Lets
   *  callers emit a one-time welcome message + announce the
   *  starting grant. */
  isNew: boolean;
  balance: number;
}

/**
 * Lazy-create + refresh identity on every interaction. The first
 * call for a `(platform, platform_id)` pair creates the row and
 * fires the starting grant (`gs_grant_starting_tokens` — Spec 01
 * §3.3). Subsequent calls refresh `display_name` opportunistically
 * and return the existing row.
 *
 * Atomic via PG unique constraint on `(platform, platform_id)` —
 * concurrent first-contacts serialize at the DB layer so we can't
 * accidentally double-grant on a Twitch burst.
 *
 * Called from:
 *   - Twitch chat command dispatch (every `!gs-*` / `!tokens` / `!bet`)
 *   - Discord chat command dispatch
 *   - Web tactile bet endpoint (when the visitor is authenticated
 *     via Twitch OAuth on /live/[slug])
 */
export async function resolveIdentity(args: {
  platform: Platform;
  platformId: string;
  displayName?: string | null;
}): Promise<ResolveIdentityResult> {
  if (!args.platformId) {
    throw new Error("resolveIdentity: platformId is required");
  }
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_resolve_identity", {
    p_platform: args.platform,
    p_platform_id: args.platformId,
    p_display_name: args.displayName ?? null,
  });
  if (error) {
    throw new Error(`gs_resolve_identity failed: ${error.message}`);
  }
  const result = data as {
    identity_id: string;
    is_new: boolean;
    balance: number;
  };
  return {
    identityId: result.identity_id,
    isNew: result.is_new,
    balance: result.balance,
  };
}

/** Direct lookup by id. Read-only — no side effects. */
export async function getIdentityById(
  identityId: string,
): Promise<Identity | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_identities")
    .select(
      "id, platform, platform_id, display_name, gs_account_id, tier, created_at",
    )
    .eq("id", identityId)
    .maybeSingle();
  return (data as Identity | null) ?? null;
}

/**
 * Direct lookup by platform identifier without creating a row. Used
 * by paths that need to check "does this user have an identity yet?"
 * without actually triggering the lazy-create + starting grant
 * (e.g. account-link merge backfills, leaderboard ranges that should
 * skip never-interacted accounts).
 */
export async function getIdentityByPlatform(
  platform: Platform,
  platformId: string,
): Promise<Identity | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_identities")
    .select(
      "id, platform, platform_id, display_name, gs_account_id, tier, created_at",
    )
    .eq("platform", platform)
    .eq("platform_id", platformId)
    .maybeSingle();
  return (data as Identity | null) ?? null;
}

/**
 * Lookup every identity row linked to a given GS account. A user
 * who has linked BOTH Twitch and Discord will have two rows here,
 * one per platform — both balances are the same auth.users row's
 * tokens, but live on separate identity rows. Used by the account
 * page's "tokens" surface to sum across platforms.
 */
export async function listIdentitiesForAccount(
  gsAccountId: string,
): Promise<Identity[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_identities")
    .select(
      "id, platform, platform_id, display_name, gs_account_id, tier, created_at",
    )
    .eq("gs_account_id", gsAccountId);
  return ((data as Identity[] | null) ?? []) as Identity[];
}

export interface UpgradeIdentityResult {
  ok: boolean;
  reason?: string;
  identityId?: string;
  balance?: number;
}

/**
 * Tier 0 → Tier 1 LINK. Sets `gs_account_id` + `tier` on the EXISTING
 * row. Does NOT touch `token_events` — the balance is anchored to
 * `identity_id`, so the user's full history carries over unchanged.
 *
 * Idempotent: re-linking the same identity to the same account is a
 * no-op. Re-linking to a DIFFERENT account is rejected (returns
 * `reason: 'already_linked_to_different_account'`) — that path
 * indicates a bug upstream, not a normal use case.
 *
 * Called from the cross-surface identity merge helper
 * (`src/lib/identity/merge.ts`) whenever an auth.users row gets its
 * Twitch / Discord identity confirmed.
 */
export async function upgradeIdentityToAccount(args: {
  identityId: string;
  gsAccountId: string;
  tier?: "free" | "paid";
}): Promise<UpgradeIdentityResult> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_upgrade_to_account", {
    p_identity_id: args.identityId,
    p_account_id: args.gsAccountId,
    p_tier: args.tier ?? "free",
  });
  if (error) {
    throw new Error(`gs_upgrade_to_account failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    reason?: string;
    identity_id?: string;
    balance?: number;
  };
  return {
    ok: result.ok,
    reason: result.reason,
    identityId: result.identity_id,
    balance: result.balance,
  };
}
