/**
 * Streamer→viewer mint-on-award — Spec 01 §3.10.
 *
 * Wraps the `gs_award_mint` atomic RPC. The streamer (community
 * host) discretionarily awards tokens to a viewer via `!gs award`
 * (instant tip) or a bounty resolves via the same path (Spec 02
 * §8a). Tokens come into existence at the moment of the call —
 * they are NOT pre-minted into a streamer balance.
 *
 * Ceiling logic lives in the RPC; this module is a thin typed
 * wrapper. The caller validates the recipient identity (e.g. that
 * it's not the community owner — the RPC also rejects that case
 * defensively).
 *
 * ⚠️ CLOSED LOOP (Spec 07 §1). `award_mint` is the ONLY streamer-
 * originated mint and it is safe because the streamer's *capability*
 * to mint comes from a paid tier subscription buying capability /
 * sessions, NOT tokens. Money never buys tokens; the subscription
 * unlocks the allowance feature. Removing the entire economy must
 * leave the tier worth its price — the closed-loop test.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface AwardMintArgs {
  communityId: string;
  toIdentityId: string;
  amount: number;
  /** Optional trace pointer — bounty id, etc. */
  refId?: string | null;
  meta?: Record<string, unknown>;
}

export type AwardMintResult =
  | {
      ok: true;
      minted: number;
      ceiling: number;
      consumed: number;
      eventId: number;
      periodMonth: string;
    }
  | {
      ok: false;
      reason:
        | "invalid_amount"
        | "self_award_rejected"
        | "no_allowance"
        | "allowance_exceeded"
        | string;
      ceiling?: number;
      consumed?: number;
      requested?: number;
    };

/**
 * Mint `amount` tokens directly into the viewer's balance, debiting
 * the streamer's monthly allowance. Atomic — ceiling check, credit,
 * and consumed-increment happen in one transaction inside the RPC.
 */
export async function awardMint(args: AwardMintArgs): Promise<AwardMintResult> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_award_mint", {
    p_community_id: args.communityId,
    p_to_identity_id: args.toIdentityId,
    p_amount: args.amount,
    p_ref_id: args.refId ?? null,
    p_meta: { source: "award", ...(args.meta ?? {}) },
  });
  if (error) {
    throw new Error(`gs_award_mint failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    reason?: string;
    minted?: number;
    ceiling?: number;
    consumed?: number;
    event_id?: number;
    period_month?: string;
    requested?: number;
  };
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason ?? "unknown",
      ceiling: result.ceiling,
      consumed: result.consumed,
      requested: result.requested,
    };
  }
  return {
    ok: true,
    minted: Number(result.minted ?? args.amount),
    ceiling: Number(result.ceiling ?? 0),
    consumed: Number(result.consumed ?? 0),
    eventId: Number(result.event_id ?? 0),
    periodMonth: String(result.period_month ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Allowance reads
// ---------------------------------------------------------------------------

export interface AllowanceState {
  communityId: string;
  periodMonth: string;
  ceiling: number;
  consumed: number;
  remaining: number;
}

/**
 * Read the current month's allowance for a community. Returns null
 * when no row exists for this period yet (no awards have been made;
 * the row gets lazy-created on first `gs_award_mint` call). The
 * default ceiling applies on first award — see `defaultCeiling`.
 */
export async function getCurrentAllowance(
  communityId: string,
): Promise<AllowanceState | null> {
  const admin = createServiceClient();
  const periodMonth = currentPeriodMonth();
  const { data } = await admin
    .from("gs_streamer_allowance")
    .select("community_id, period_month, ceiling, consumed")
    .eq("community_id", communityId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    community_id: string;
    period_month: string;
    ceiling: number;
    consumed: number;
  };
  return {
    communityId: row.community_id,
    periodMonth: row.period_month,
    ceiling: Number(row.ceiling),
    consumed: Number(row.consumed),
    remaining: Math.max(0, Number(row.ceiling) - Number(row.consumed)),
  };
}

/**
 * Resolve a streamer's current-month allowance starting from their
 * `users.id` (auth user id, also `gs_sessions.owner_user_id`). Walks
 *   users.id → gs_identities (platform='twitch') → gs_communities
 *      → gs_streamer_allowance for the current period.
 *
 * Returns null when:
 *   - The user has no linked Twitch identity yet (hasn't connected
 *     streamer integration on `/account`/`/twitch`).
 *   - The community exists but no allowance row yet (no awards made
 *     this month). The caller should fall back to `defaultCeiling()`
 *     for the "you have N to disburse" UI in that case.
 *
 * Read-only, safe to call on every hub render. The two-step lookup
 * is small + indexed; no caching needed at this scale.
 */
export async function getAllowanceForOwner(
  ownerUserId: string,
): Promise<AllowanceState | null> {
  const admin = createServiceClient();
  const { data: identityRow } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", ownerUserId)
    .eq("platform", "twitch")
    .maybeSingle();
  if (!identityRow) return null;
  const { data: communityRow } = await admin
    .from("gs_communities")
    .select("id")
    .eq("owner_identity_id", (identityRow as { id: string }).id)
    .maybeSingle();
  if (!communityRow) return null;
  return getCurrentAllowance((communityRow as { id: string }).id);
}

/** First day of the current UTC month, ISO date string. */
function currentPeriodMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Look up the default monthly ceiling from gs_economy_config. Used
 * by the dashboard when surfacing "you'll start with N if you don't
 * customize" copy. Per-tier overrides happen at the application
 * layer (set during pre-period seeding); this is the floor default.
 */
export async function defaultCeiling(): Promise<number> {
  const admin = createServiceClient();
  const { data } = await admin.rpc("gs_economy_config_value", {
    p_key: "streamer_monthly_allowance",
    p_default: 5000,
  });
  return Number(data ?? 5000);
}
