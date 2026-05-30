/**
 * Leaderboard read paths — Spec 01 §5.
 *
 * Three flavors crossed with two scopes:
 *
 *               | combined        | player           | crowd
 *   per-comm.   | all events      | in-game payouts  | market payouts
 *                                  | + earn_t1        | + bet net
 *   global      | (same, no       | (same)           | (same)
 *                  community filter)
 *
 * Combined = raw balance in scope (Spec 01: "v1 = raw token total").
 * Player track surfaces who's actually winning gameplay outcomes.
 * Crowd track surfaces who's reading the market correctly. The two
 * tracks render side-by-side on /live/[slug] with combined as a
 * default third tab.
 *
 * All three return the same row shape so the live page can swap
 * filter without re-binding queries.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type LeaderboardKind = "combined" | "player" | "crowd";

export interface LeaderboardRow {
  identityId: string;
  displayName: string | null;
  score: number;
}

const RPC_NAME: Record<LeaderboardKind, string> = {
  combined: "gs_leaderboard_combined",
  player: "gs_leaderboard_player",
  crowd: "gs_leaderboard_crowd",
};

/**
 * Pull the top N for a given leaderboard kind. `communityId = null`
 * returns the global leaderboard; passing a uuid scopes to one
 * streamer's community.
 *
 * Returns are sorted score-desc, identity-asc (deterministic tie-
 * break so realtime updates don't visually shuffle equal-score rows).
 */
export async function getLeaderboard(args: {
  kind: LeaderboardKind;
  communityId?: string | null;
  limit?: number;
}): Promise<LeaderboardRow[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc(RPC_NAME[args.kind], {
    p_community_id: args.communityId ?? null,
    p_limit: args.limit ?? 10,
  });
  if (error) {
    throw new Error(`${RPC_NAME[args.kind]} failed: ${error.message}`);
  }
  const rows = (data as Array<{
    identity_id: string;
    display_name: string | null;
    score: number;
  }> | null) ?? [];
  return rows.map((r) => ({
    identityId: r.identity_id,
    displayName: r.display_name,
    score: Number(r.score),
  }));
}
