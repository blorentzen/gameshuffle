import "server-only";

/**
 * Saving a viewer's picks and bans ballot for an open round: shared by
 * /api/picks-bans/ballot (the live page) and the Twitch extension. One ballot
 * per viewer per round (their Twitch id, else an anonymous browser id); a
 * locked ballot is frozen (Britton's rule: viewers lock their vote and the
 * streamer decides). An update only touches the fields it's given, so the
 * extension (tracks only) never wipes item picks made on the live page.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";

export type BallotField =
  | "picks_tracks" | "bans_tracks" | "picks_rallies" | "bans_rallies"
  | "picks_item_modes" | "bans_item_modes" | "picks_item_literal" | "bans_item_literal";

export const BALLOT_FIELDS: BallotField[] = [
  "picks_tracks", "bans_tracks", "picks_rallies", "bans_rallies",
  "picks_item_modes", "bans_item_modes", "picks_item_literal", "bans_item_literal",
];

export type SaveBallotResult =
  | { ok: true; ballotId: string; locked: boolean; alreadyLocked?: boolean }
  | { ok: false; error: "round_not_found" | "round_not_open" | "save_failed"; status: number };

export async function saveBallot(input: {
  roundId: string;
  viewerTwitchUserId: string | null;
  anonSessionId: string | null;
  displayName: string | null;
  fields: Partial<Record<BallotField, string[]>>;
  lock: boolean;
}): Promise<SaveBallotResult> {
  const admin = createServiceClient();
  const { data: round } = await admin.from("session_picks_bans_rounds").select("id, status, session_id").eq("id", input.roundId).maybeSingle();
  if (!round) return { ok: false, error: "round_not_found", status: 404 };
  if ((round as { status: string }).status !== "open") return { ok: false, error: "round_not_open", status: 409 };

  let q = admin.from("session_picks_bans_ballots").select("id, locked_at").eq("round_id", input.roundId);
  q = input.viewerTwitchUserId ? q.eq("viewer_twitch_user_id", input.viewerTwitchUserId) : q.eq("anon_session_id", input.anonSessionId ?? "");
  const { data: existing } = await q.maybeSingle();
  const had = existing as { id: string; locked_at: string | null } | null;
  if (had?.locked_at) return { ok: true, ballotId: had.id, locked: true, alreadyLocked: true };

  const given = Object.fromEntries(BALLOT_FIELDS.filter((f) => input.fields[f] !== undefined).map((f) => [f, input.fields[f]]));
  const lockedAt = input.lock ? new Date().toISOString() : null;
  let ballotId: string;
  if (had) {
    const { data, error } = await admin.from("session_picks_bans_ballots")
      .update({ ...given, viewer_display_name: input.displayName, locked_at: lockedAt }).eq("id", had.id).select("id").single();
    if (error || !data) {
      console.error("[picks-bans/ballot] update failed:", error);
      return { ok: false, error: "save_failed", status: 500 };
    }
    ballotId = (data as { id: string }).id;
  } else {
    const row = {
      ...Object.fromEntries(BALLOT_FIELDS.map((f) => [f, [] as string[]])),
      ...given,
      round_id: input.roundId,
      viewer_twitch_user_id: input.viewerTwitchUserId,
      anon_session_id: input.viewerTwitchUserId ? null : input.anonSessionId,
      viewer_display_name: input.displayName,
      locked_at: lockedAt,
    };
    const { data, error } = await admin.from("session_picks_bans_ballots").insert(row).select("id").single();
    if (error || !data) {
      console.error("[picks-bans/ballot] insert failed:", error);
      return { ok: false, error: "save_failed", status: 500 };
    }
    ballotId = (data as { id: string }).id;
  }

  // Audit on lock: in-progress edits are noisy and not interesting.
  if (input.lock) {
    try {
      await recordEvent({
        sessionId: (round as { session_id: string }).session_id,
        eventType: SESSION_EVENT_TYPES.picks_bans_ballot_locked,
        actorType: input.viewerTwitchUserId ? "viewer" : "system",
        actorId: input.viewerTwitchUserId ?? input.anonSessionId ?? undefined,
        payload: { round_id: input.roundId, ballot_id: ballotId, authed: !!input.viewerTwitchUserId },
      });
    } catch (err) {
      console.error("[picks-bans/ballot] audit failed:", err);
    }
  }
  return { ok: true, ballotId, locked: input.lock };
}
