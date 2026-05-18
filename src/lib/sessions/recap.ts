/**
 * Last-stream recap loader — powers `/live/<slug>`'s "Not live" state
 * with a "This happened last time" surface so visitors land somewhere
 * useful between streams.
 *
 * Per the UX brief: only the most recent ended (non-test) session for
 * the streamer; no historical archive. Respects the streamer's
 * `users.show_recap_on_live_page` opt-out toggle.
 *
 * Data is aggregated on-demand at request time — no snapshot table.
 * Reasonable at current session volumes; if visit-side latency grows,
 * we can persist a recap snapshot via the existing `recap_ready` event
 * (already fires on session end).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { PicksBansResults } from "@/lib/picks-bans/types";

export interface RecapHighlight {
  /** The session we're recapping. */
  sessionId: string;
  sessionName: string;
  /** Active game slug at end of session (kebab — e.g. `mario-kart-8-deluxe`).
   *  Null when the streamer was in queue mode for the closing minutes. */
  gameSlug: string | null;
  /** When the session entered the live state. */
  activatedAt: string | null;
  /** When the session ended (we already filter to status='ended'). */
  endedAt: string;
  /** Duration in milliseconds — null when activatedAt isn't set. */
  durationMs: number | null;
  /** Distinct viewers who joined the queue during the session. The
   *  broadcaster is excluded so the count reads as "viewers participated". */
  participantCount: number;
  /** Total race rolls (race_randomized + track_randomized events). */
  raceCount: number;
  /** Total picks/bans rounds opened during the session. */
  roundsOpened: number;
  /** Channel-point reroll events. */
  channelPointRerollCount: number;
  /** Most recent race rolled — track / rally. Null when no race rolled. */
  lastRoll: {
    trackId: string | null;
    trackName: string | null;
    kind: "race" | "rally";
    presetId: string | null;
    presetName: string | null;
  } | null;
  /** Last applied picks/bans results, if any. Top 5 picks + top 5 bans
   *  in each pool — keeps the surface scannable. */
  lastApplied: PicksBansResults | null;
}

/** Fetch the recap for a streamer's last ended (non-test) session.
 *  Returns null when:
 *   - streamer has opted out (`show_recap_on_live_page === false`)
 *   - no eligible ended session exists yet
 *   - DB error
 *
 * Callers (the /live page) treat null as "no recap to show" and fall
 * back to the bare "Not live" state. */
export async function loadRecapForStreamer(
  streamerUserId: string,
): Promise<RecapHighlight | null> {
  const admin = createServiceClient();

  // Step 1: opt-in check. Default-on column lands `true` for existing
  // rows after migration, so any user with the column missing still
  // gets a recap.
  const { data: profile } = await admin
    .from("users")
    .select("show_recap_on_live_page")
    .eq("id", streamerUserId)
    .maybeSingle();
  const optedOut =
    (profile?.show_recap_on_live_page as boolean | null | undefined) === false;
  if (optedOut) return null;

  // Step 2: find the most recent ended non-test session.
  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select(
      "id, name, active_game, configured_games, activated_at, ended_at, config, feature_flags",
    )
    .eq("owner_user_id", streamerUserId)
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(10);
  // Drop test sessions client-side — filtering on a JSONB key is
  // awkward in PostgREST and the limit is small enough to scan in JS.
  const session = (sessionRow ?? []).find((s) => {
    const flags = (s as { feature_flags: { test_session?: boolean } | null })
      .feature_flags;
    return !flags?.test_session;
  }) as
    | {
        id: string;
        name: string;
        active_game: string | null;
        configured_games: string[] | null;
        activated_at: string | null;
        ended_at: string;
        config: { game?: string | null } | null;
      }
    | undefined;
  if (!session) return null;

  const sessionId = session.id;
  // Resolve the closing game slug — prefer the active_game pointer,
  // fall back to first configured, then legacy config.game.
  const gameSlug =
    session.active_game ??
    session.configured_games?.[0] ??
    session.config?.game ??
    null;

  // Step 3: aggregate session_events for race count, channel-point
  // rerolls, last roll. One query, client-side bucketing.
  const { data: eventsRaw } = await admin
    .from("session_events")
    .select("event_type, payload, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(500);
  const events = (eventsRaw ?? []) as Array<{
    event_type: string;
    payload: {
      track_id?: string | null;
      track_name?: string | null;
      kind?: "race" | "rally" | string | null;
      preset_id?: string | null;
      preset_name?: string | null;
      trigger?: string | null;
    } | null;
    created_at: string;
  }>;

  let raceCount = 0;
  let channelPointRerollCount = 0;
  let lastRoll: RecapHighlight["lastRoll"] = null;
  for (const e of events) {
    if (
      e.event_type === "race_randomized" ||
      e.event_type === "track_randomized"
    ) {
      raceCount += 1;
      if (!lastRoll) {
        const p = e.payload ?? {};
        lastRoll = {
          trackId: p.track_id ?? null,
          trackName: p.track_name ?? null,
          kind: p.kind === "rally" ? "rally" : "race",
          presetId: p.preset_id ?? null,
          presetName: p.preset_name ?? null,
        };
      }
    }
    if (e.event_type === "shuffle" && e.payload?.trigger === "channel_points") {
      channelPointRerollCount += 1;
    }
  }

  // Step 4: rounds opened + last applied results.
  const { data: roundsRaw } = await admin
    .from("session_picks_bans_rounds")
    .select("id, results, applied_at")
    .eq("session_id", sessionId);
  const rounds = (roundsRaw ?? []) as Array<{
    id: string;
    results: unknown;
    applied_at: string | null;
  }>;
  const roundsOpened = rounds.length;
  // Take the most recent applied round's results — most informative
  // (auto-apply also writes `results` so we don't need to distinguish).
  const lastAppliedRound = rounds
    .filter((r) => !!r.applied_at)
    .sort(
      (a, b) =>
        (b.applied_at ? Date.parse(b.applied_at) : 0) -
        (a.applied_at ? Date.parse(a.applied_at) : 0),
    )[0];
  const lastApplied =
    (lastAppliedRound?.results as PicksBansResults | null | undefined) ?? null;

  // Step 5: distinct participants (excluding broadcaster).
  const { data: parts } = await admin
    .from("session_participants")
    .select("platform_user_id, is_broadcaster")
    .eq("session_id", sessionId);
  const participantCount = (parts ?? []).filter(
    (p) => !(p as { is_broadcaster: boolean }).is_broadcaster,
  ).length;

  const activatedMs = session.activated_at
    ? Date.parse(session.activated_at)
    : NaN;
  const endedMs = Date.parse(session.ended_at);
  const durationMs =
    Number.isFinite(activatedMs) && Number.isFinite(endedMs)
      ? Math.max(0, endedMs - activatedMs)
      : null;

  return {
    sessionId,
    sessionName: session.name,
    gameSlug,
    activatedAt: session.activated_at,
    endedAt: session.ended_at,
    durationMs,
    participantCount,
    raceCount,
    roundsOpened,
    channelPointRerollCount,
    lastRoll,
    lastApplied,
  };
}
