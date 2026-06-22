/**
 * GET /api/twitch/overlay/[token]/latest?since=<iso>&session=<uuid>
 *
 * Public endpoint hit by the OBS browser-source overlay. Resolves an
 * overlay_token to its connection, finds the streamer's current active
 * (or test) session, and returns the most recent broadcaster shuffle
 * event newer than `since`. Viewer shuffles never come through here —
 * the overlay only animates broadcaster combos per spec §8.
 *
 * No auth: the overlay token IS the authorization. Anyone with the URL
 * (i.e. the streamer who pasted it into OBS) can read.
 *
 * Hot-path optimization (overlay-polling-optimization-spec): the client
 * caches the active session id and passes it back in `?session=`. When
 * the param is present and validates against this token's owner, we
 * skip the `findTwitchSessionForUser` query and go straight to the
 * shuffle lookup. Stale or mismatched session IDs fall through to the
 * full lookup path, and the response always returns the *current*
 * session info so the client can update its cached id.
 */

import { NextResponse } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  findTwitchSessionForUser,
  getLatestTwitchShuffleEvent,
  type TwitchSessionRow,
} from "@/lib/sessions/twitch-platform";
import { getLatestSpin } from "@/lib/wheels/store";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedSession {
  id: string;
  randomizerSlug: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_display_name")
    .eq("overlay_token", token)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  }

  // Wheel spins are owner-keyed and session-independent — resolve the
  // latest one regardless of whether a session is active. The overlay
  // client dedups by `createdAt`, so we always return the most recent.
  const latestSpin = await getLatestSpin(connection.user_id);
  const wheelSpin = latestSpin
    ? {
        id: latestSpin.id,
        segments: latestSpin.segments,
        winningIndex: latestSpin.winningIndex,
        winningLabel: latestSpin.winningLabel,
        triggeredBy: latestSpin.triggeredBy,
        createdAt: latestSpin.createdAt,
        themeId: latestSpin.themeId,
        fillStyle: latestSpin.fillStyle,
      }
    : null;

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sessionParam = url.searchParams.get("session");

  // Hot path: client provided a session id. Validate ownership against
  // this token's connection. The cheapest possible query — single row
  // by primary key + owner check.
  let resolved: ResolvedSession | null = null;
  if (sessionParam && UUID_REGEX.test(sessionParam)) {
    const { data: ownedSession } = await admin
      .from("gs_sessions")
      .select("id, config")
      .eq("id", sessionParam)
      .eq("owner_user_id", connection.user_id)
      .in("status", ["active", "ending"])
      .maybeSingle();
    if (ownedSession) {
      const config = (ownedSession as { config?: { game?: string | null } | null })
        .config;
      resolved = {
        id: (ownedSession as { id: string }).id,
        randomizerSlug: config?.game ?? null,
      };
    }
  }

  // Fall through to the full lookup if no session id was passed, or it
  // failed ownership/status validation. Treats any stale-id case as a
  // "tell me what the current session is" prompt.
  if (!resolved) {
    const session: TwitchSessionRow | null = await findTwitchSessionForUser(
      connection.user_id,
      ["active", "test"]
    );
    if (session) {
      resolved = {
        id: session.id,
        randomizerSlug: session.randomizer_slug,
      };
    }
  }

  if (!resolved) {
    return NextResponse.json({
      ok: true,
      broadcaster: connection.twitch_display_name,
      session: null,
      shuffle: null,
      wheelSpin,
    });
  }

  const shuffle = await getLatestTwitchShuffleEvent(resolved.id, {
    broadcasterOnly: true,
    since,
  });

  // Multi-game spec PR B — the overlay surfaces an open picks/bans
  // round so viewers watching the stream can see the live counts +
  // the shareable URL. Returns null when no round is open.
  let picksBans: {
    roundId: string;
    gameSlug: string;
    streamerSlug: string;
    locked: number;
    inProgress: number;
    topPicks: Array<{ id: string; count: number; pool: "tracks" | "itemModes" | "itemLiteral" }>;
    topBans: Array<{ id: string; count: number; pool: "tracks" | "itemModes" | "itemLiteral" }>;
  } | null = null;

  try {
    const { data: openRows } = await admin
      .from("session_picks_bans_rounds")
      .select("id, game_slug")
      .eq("session_id", resolved.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1);
    const open = openRows?.[0] as { id: string; game_slug: string } | undefined;
    if (open) {
      const { data: ballots } = await admin
        .from("session_picks_bans_ballots")
        .select(
          "id, locked_at, picks_tracks, bans_tracks, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal"
        )
        .eq("round_id", open.id);
      const list = (ballots ?? []) as Array<{
        id: string;
        locked_at: string | null;
        picks_tracks: string[];
        bans_tracks: string[];
        picks_item_modes: string[];
        bans_item_modes: string[];
        picks_item_literal: string[];
        bans_item_literal: string[];
      }>;
      const locked = list.filter((b) => b.locked_at != null).length;
      const inProgress = list.length - locked;

      // Top 3 across all pools combined — overlay real estate is small.
      const counts = new Map<
        string,
        { picks: number; bans: number; pool: "tracks" | "itemModes" | "itemLiteral" }
      >();
      const accumulate = (
        ids: string[],
        field: "picks" | "bans",
        pool: "tracks" | "itemModes" | "itemLiteral"
      ) => {
        for (const id of ids) {
          const key = `${pool}:${id}`;
          const cur = counts.get(key) ?? { picks: 0, bans: 0, pool };
          if (field === "picks") cur.picks += 1;
          else cur.bans += 1;
          cur.pool = pool;
          counts.set(key, cur);
        }
      };
      for (const b of list) {
        accumulate(b.picks_tracks, "picks", "tracks");
        accumulate(b.bans_tracks, "bans", "tracks");
        accumulate(b.picks_item_modes, "picks", "itemModes");
        accumulate(b.bans_item_modes, "bans", "itemModes");
        accumulate(b.picks_item_literal, "picks", "itemLiteral");
        accumulate(b.bans_item_literal, "bans", "itemLiteral");
      }

      const picksRanked: Array<{
        id: string;
        count: number;
        pool: "tracks" | "itemModes" | "itemLiteral";
      }> = [];
      const bansRanked: Array<{
        id: string;
        count: number;
        pool: "tracks" | "itemModes" | "itemLiteral";
      }> = [];
      for (const [key, v] of counts.entries()) {
        const id = key.split(":").slice(1).join(":");
        if (v.picks > 0) picksRanked.push({ id, count: v.picks, pool: v.pool });
        if (v.bans > 0) bansRanked.push({ id, count: v.bans, pool: v.pool });
      }
      picksRanked.sort((a, b) => b.count - a.count);
      bansRanked.sort((a, b) => b.count - a.count);

      // Need streamer slug for the live-view URL the overlay surfaces.
      const { data: profile } = await admin
        .from("users")
        .select("username, twitch_username")
        .eq("id", connection.user_id)
        .maybeSingle();
      const streamerSlug =
        ((profile?.username as string | null) ??
          (profile?.twitch_username as string | null)) ??
        "";

      picksBans = {
        roundId: open.id,
        gameSlug: open.game_slug,
        streamerSlug,
        locked,
        inProgress,
        topPicks: picksRanked.slice(0, 3),
        topBans: bansRanked.slice(0, 3),
      };
    }
  } catch (err) {
    console.error("[overlay/latest] picks-bans fetch failed:", err);
    // Don't fail the whole response — overlay still gets shuffle data.
  }

  return NextResponse.json({
    ok: true,
    broadcaster: connection.twitch_display_name,
    session: {
      id: resolved.id,
      randomizerSlug: resolved.randomizerSlug,
    },
    shuffle: shuffle
      ? {
          id: shuffle.id,
          displayName: shuffle.twitch_display_name,
          combo: shuffle.combo,
          createdAt: shuffle.created_at,
        }
      : null,
    picksBans,
    wheelSpin,
  });
}
