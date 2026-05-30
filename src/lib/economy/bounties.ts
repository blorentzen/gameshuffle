/**
 * Bounty engine — Spec 02 §8a.
 *
 * Wraps `gs_bounty_open` / `gs_bounty_cancel` / `gs_bounty_settle`
 * RPCs. Bounties are streamer-funded outcome-pegged token rewards
 * minted to the satisfier on resolution. Funding flows from the
 * monthly allowance — opening reserves; cancelling releases; settling
 * mints to the named winner.
 *
 * Phase 1 grammar (this module): `!gs bounty <amount> <description>`
 * opens; `!gs bounty award @user` settles; `!gs bounty cancel`
 * releases. Phase 2 (deferred): auto-resolution fan-out alongside
 * `!gs resolve <value>` when the bounty is pegged to a variable_type
 * + condition. The schema already carries those fields for forward
 * compatibility.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface OpenBountyArgs {
  communityId: string;
  streamId: string;
  sessionId: string | null;
  chapter?: number | null;
  gameKey?: string | null;
  amount: number;
  description: string;
  /** Phase 2 forward-compat — leave null for Phase 1 manual flow. */
  variableType?: "binary" | "placement" | "pickone" | "count" | null;
  condition?: Record<string, unknown> | null;
  /** The streamer's identity. */
  createdByIdentityId: string;
}

export type OpenBountyResult =
  | {
      ok: true;
      bountyId: string;
      amount: number;
      ceiling: number;
      consumed: number;
    }
  | {
      ok: false;
      reason:
        | "invalid_amount"
        | "missing_description"
        | "no_allowance"
        | "allowance_exceeded"
        | string;
      ceiling?: number;
      consumed?: number;
      requested?: number;
    };

export async function openBounty(args: OpenBountyArgs): Promise<OpenBountyResult> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_bounty_open", {
    p_community_id: args.communityId,
    p_stream_id: args.streamId,
    p_session_id: args.sessionId,
    p_chapter: args.chapter ?? null,
    p_game_key: args.gameKey ?? null,
    p_amount: args.amount,
    p_description: args.description,
    p_variable_type: args.variableType ?? null,
    p_condition: args.condition ?? null,
    p_created_by: args.createdByIdentityId,
  });
  if (error) {
    throw new Error(`gs_bounty_open failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    reason?: string;
    bounty_id?: string;
    amount?: number;
    ceiling?: number;
    consumed?: number;
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
    bountyId: String(result.bounty_id),
    amount: Number(result.amount ?? args.amount),
    ceiling: Number(result.ceiling ?? 0),
    consumed: Number(result.consumed ?? 0),
  };
}

export async function cancelBounty(
  bountyId: string,
): Promise<{ ok: boolean; released?: number; reason?: string }> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_bounty_cancel", {
    p_bounty_id: bountyId,
  });
  if (error) throw new Error(`gs_bounty_cancel failed: ${error.message}`);
  const result = data as { ok: boolean; reason?: string; released?: number };
  return {
    ok: result.ok,
    released: result.released ? Number(result.released) : undefined,
    reason: result.reason,
  };
}

export async function settleBounty(args: {
  bountyId: string;
  toIdentityId: string;
}): Promise<
  | { ok: true; minted: number; bountyId: string; eventId: number }
  | { ok: false; reason: string }
> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_bounty_settle", {
    p_bounty_id: args.bountyId,
    p_to_identity_id: args.toIdentityId,
  });
  if (error) throw new Error(`gs_bounty_settle failed: ${error.message}`);
  const result = data as {
    ok: boolean;
    reason?: string;
    minted?: number;
    bounty_id?: string;
    event_id?: number;
  };
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? "unknown" };
  }
  return {
    ok: true,
    minted: Number(result.minted ?? 0),
    bountyId: String(result.bounty_id ?? args.bountyId),
    eventId: Number(result.event_id ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface BountyRow {
  id: string;
  community_id: string;
  stream_id: string;
  session_id: string | null;
  chapter: number | null;
  game_key: string | null;
  status: "open" | "settled" | "cancelled";
  amount: number;
  description: string;
  variable_type: "binary" | "placement" | "pickone" | "count" | null;
  condition: Record<string, unknown> | null;
  created_by: string;
  settled_to: string | null;
  payout_event: number | null;
  created_at: string;
  settled_at: string | null;
  cancelled_at: string | null;
}

/** List open bounties for a stream — used by the /live page and the
 *  `!gs bounty award` handler's "which bounty?" disambiguator (v1
 *  uses the most-recent open bounty when ambiguous). */
export async function listOpenBountiesForStream(
  streamId: string,
): Promise<BountyRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_bounties")
    .select(
      "id, community_id, stream_id, session_id, chapter, game_key, status, amount, description, variable_type, condition, created_by, settled_to, payout_event, created_at, settled_at, cancelled_at",
    )
    .eq("stream_id", streamId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return ((data as BountyRow[] | null) ?? []) as BountyRow[];
}

/** The most recent open bounty for this stream — convenience for
 *  chat commands that don't specify a bounty id. */
export async function findMostRecentOpenBounty(
  streamId: string,
): Promise<BountyRow | null> {
  const rows = await listOpenBountiesForStream(streamId);
  return rows[0] ?? null;
}
