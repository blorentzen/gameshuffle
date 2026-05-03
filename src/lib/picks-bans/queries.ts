import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { PicksBansBallot, PicksBansRound } from "./types";

const ROUND_COLUMNS =
  "id, session_id, game_slug, status, recommendation_top_n, recommendation_mode, closes_at, closed_at, applied_at, results, opened_by_user_id, opened_at, updated_at";

const BALLOT_COLUMNS =
  "id, round_id, viewer_twitch_user_id, anon_session_id, picks_tracks, bans_tracks, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal, locked_at, viewer_display_name, created_at, updated_at";

/** Fetch the currently-open round for (session, game), if any. */
export async function getOpenRoundForGame(args: {
  sessionId: string;
  gameSlug: string;
}): Promise<PicksBansRound | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_picks_bans_rounds")
    .select(ROUND_COLUMNS)
    .eq("session_id", args.sessionId)
    .eq("game_slug", args.gameSlug)
    .eq("status", "open")
    .maybeSingle();
  return (data as PicksBansRound | null) ?? null;
}

/** Fetch a single round by id. */
export async function getRoundById(
  roundId: string
): Promise<PicksBansRound | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_picks_bans_rounds")
    .select(ROUND_COLUMNS)
    .eq("id", roundId)
    .maybeSingle();
  return (data as PicksBansRound | null) ?? null;
}

/** List recent rounds for a session, newest first. Caps at 25 rows. */
export async function listRoundsForSession(
  sessionId: string,
  opts: { limit?: number } = {}
): Promise<PicksBansRound[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_picks_bans_rounds")
    .select(ROUND_COLUMNS)
    .eq("session_id", sessionId)
    .order("opened_at", { ascending: false })
    .limit(opts.limit ?? 25);
  return ((data ?? []) as PicksBansRound[]) ?? [];
}

/** Fetch the most recent applied/closed round for (session, game). Used
 *  to seed carry-over picks for the next round in the same game. */
export async function getLastClosedRoundForGame(args: {
  sessionId: string;
  gameSlug: string;
}): Promise<PicksBansRound | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_picks_bans_rounds")
    .select(ROUND_COLUMNS)
    .eq("session_id", args.sessionId)
    .eq("game_slug", args.gameSlug)
    .in("status", ["closed", "applied"])
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PicksBansRound | null) ?? null;
}

/** All ballots for a round (admin / streamer-side read). */
export async function listBallotsForRound(
  roundId: string
): Promise<PicksBansBallot[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_picks_bans_ballots")
    .select(BALLOT_COLUMNS)
    .eq("round_id", roundId);
  return ((data ?? []) as PicksBansBallot[]) ?? [];
}

/**
 * Find a viewer's ballot in a round (used to seed prior-round carry-
 * over and to support the live-view's "your ballot" highlight). Either
 * twitchUserId or anonSessionId must be provided.
 */
export async function findBallotForViewer(args: {
  roundId: string;
  twitchUserId?: string | null;
  anonSessionId?: string | null;
}): Promise<PicksBansBallot | null> {
  if (!args.twitchUserId && !args.anonSessionId) return null;
  const admin = createServiceClient();
  let query = admin
    .from("session_picks_bans_ballots")
    .select(BALLOT_COLUMNS)
    .eq("round_id", args.roundId);
  if (args.twitchUserId) {
    query = query.eq("viewer_twitch_user_id", args.twitchUserId);
  } else if (args.anonSessionId) {
    query = query.eq("anon_session_id", args.anonSessionId);
  }
  const { data } = await query.maybeSingle();
  return (data as PicksBansBallot | null) ?? null;
}
