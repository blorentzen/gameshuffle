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

import { NextResponse, after } from "next/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  findTwitchSessionForUser,
  getLatestTwitchShuffleEvent,
  type TwitchSessionRow,
} from "@/lib/sessions/twitch-platform";
import { getLatestSpin } from "@/lib/wheels/store";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import { themeFromBrand, USER_THEME_ID } from "@/lib/wheel/themes";
import { listLiveSessionEvents, type LiveEvents } from "@/lib/economy/events/live";
import { getLatestOverlayEvents } from "@/lib/overlay/events";
import { getLayoutProfiles } from "@/lib/overlay/layouts";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getOpenPollForCommunity, tally as pollTally } from "@/lib/polls/store";
import { getCurrentDraft, tickDraft, viewOf as draftView, type StreamDraftView } from "@/lib/drafts/store";
import { gameView as brainGameView, getShowableGame as getBrainGame, tickGame as tickBrainGame, type StreamGameView } from "@/lib/chatbrain/streamGame";
import { maybeAiPass as brainSurveyAi, overlaySurveyView, tickSurvey as tickBrainSurvey, type StreamSurveyView } from "@/lib/chatbrain/survey";
import { guestGameFor as brainGuestGame } from "@/lib/chatbrain/streamCostream";
import { overlayTrivia } from "@/lib/trivia/stream";
import { getCurrentGame as getBingoGame, tickAuto as tickBingo, viewOf as bingoView, type StreamBingoView } from "@/lib/bingo/stream";
import { breakView, getShowable as getShowableBreak, tickBreak } from "@/lib/break/store";
import type { BreakView } from "@/lib/break/types";
import { getViewerCountsForOwner } from "@/lib/streams/viewers";
import { mmrTokenFor } from "@/lib/mmr/store";
import { warPieceFor } from "@/lib/wars/streamPiece";
import { seriesPieceFor } from "@/lib/series/store";
import { levelQueueOverlay } from "@/lib/levels/store";
import { ttPieceFor } from "@/lib/tournaments/tt/overlayServer";
import { roomOverlayFor } from "@/lib/lounge/roomServer";
import { noteOverlaySeen } from "@/lib/streaming/setup";

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

  // Resolve the overlay token against Twitch first, then YouTube — both mint an
  // `overlay_token` for the same OBS browser source. Everything below is
  // owner-keyed (wheel / events / polls / layouts / session), so a single
  // resolved `ownerUserId` + display name drives both platforms.
  let ownerUserId: string;
  let broadcasterName: string | null;
  const { data: twConn } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_display_name")
    .eq("overlay_token", token)
    .maybeSingle();
  if (twConn) {
    ownerUserId = twConn.user_id;
    broadcasterName = twConn.twitch_display_name;
    // Streaming's setup checklist ticks "Add the overlay to OBS" from this (at most once every ten minutes).
    noteOverlaySeen(token);
  } else {
    const { data: ytConn } = await admin
      .from("youtube_connections")
      .select("user_id, youtube_channel_title")
      .eq("overlay_token", token)
      .maybeSingle();
    if (!ytConn) {
      return NextResponse.json({ error: "unknown_token" }, { status: 404 });
    }
    ownerUserId = ytConn.user_id;
    broadcasterName = ytConn.youtube_channel_title;
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sessionParam = url.searchParams.get("session");

  // This answers every 2 seconds per open overlay, and the reads below don't depend on each other,
  // so they run side by side (one after another they were about 20 round trips). The community is
  // resolved once for every piece that needs it (cached per server instance in the resolver).
  const communityP = resolveCommunityIdForOwner(ownerUserId).catch((err) => {
    console.error("[overlay/latest] community lookup failed:", err);
    return null;
  });

  const [viewers, mmrToken, loungeRoom, warPiece, seriesPiece, ttPiece, levelQueue, wheelSpin, overlayEvents, layouts, poll, bingo, draft, brainParts, trivia, breakScreen, resolved] = await Promise.all([
    // All-up viewer count (Twitch today; cached ~20s so this 2s poll doesn't hit
    // Helix every tick). Null on failure — the overlay just hides the badge.
    getViewerCountsForOwner(ownerUserId).catch(() => null),
    // The streamer's MMR card, for its overlay piece (it reads its own live link).
    mmrTokenFor(ownerUserId).catch(() => null),
    // Tonight's checked lounge room, for its overlay piece (GS Pro; cached 10s per streamer).
    roomOverlayFor(ownerUserId).catch(() => null),
    // The war channel the streamer added to this overlay (GS Pro; the piece reads its own war link; cached 10s).
    warPieceFor(ownerUserId).catch(() => null),
    // The live team series this streamer plays in, and their team (the piece reads the series' own feed; cached 30s).
    seriesPieceFor(ownerUserId).catch(() => null),
    // The running time trial tournament the streamer plays in or runs (the piece reads its own view; cached 30s).
    ttPieceFor(ownerUserId).catch(() => null),
    // The level queue, while it's open or a level is being played (cached 3s per streamer; null before levels-m1.sql).
    levelQueueOverlay(ownerUserId).catch(() => null),
    readWheelSpin(ownerUserId),
    // Generic streamer-tool overlay events (dice, coin, oracle, …). Owner-keyed
    // and session-independent, like wheel spins; the client dedups by id.
    getLatestOverlayEvents(ownerUserId).then((list) => list.map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      ttlMs: e.ttlMs,
      createdAt: e.createdAt,
    }))),
    // Per-format layout overrides (streamer-positioned tool elements). Owner-
    // keyed; the client applies the profile matching its detected format. Absent
    // formats fall back to DEFAULT_LAYOUTS.
    getLayoutProfiles(ownerUserId),
    communityP.then(readPoll),
    communityP.then(readBingo),
    communityP.then(readDraft),
    communityP.then(readBrain),
    // Trivia on stream: the night on stream (also locks a question whose time is up), or one that just ended.
    overlayTrivia(ownerUserId).catch((err) => {
      console.error("[overlay/latest] trivia fetch failed:", err);
      return null;
    }),
    communityP.then(readBreak),
    resolveSession(admin, ownerUserId, sessionParam),
  ]);
  const { brain, brainSurvey } = brainParts;

  if (!resolved) {
    return NextResponse.json({
      ok: true,
      broadcaster: broadcasterName,
      session: null,
      shuffle: null,
      wheelSpin,
      overlayEvents,
      layouts,
      poll,
      bingo,
      draft,
      brain,
      brainSurvey,
      trivia,
      breakScreen,
      viewers,
      mmrToken,
      loungeRoom,
      warPiece,
      seriesPiece,
      ttPiece,
      levelQueue,
    });
  }

  // The session's own pieces, side by side like the rest.
  const [shuffle, picksBans, events] = await Promise.all([
    getLatestTwitchShuffleEvent(resolved.id, { broadcasterOnly: true, since }),
    readPicksBans(admin, resolved.id, ownerUserId),
    readLiveEvents(resolved.id),
  ]);

  return NextResponse.json({
    ok: true,
    broadcaster: broadcasterName,
    session: {
      id: resolved.id,
      randomizerSlug: resolved.randomizerSlug,
    },
    events,
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
    overlayEvents,
    layouts,
    poll,
    bingo,
    draft,
    brain,
    brainSurvey,
    trivia,
    breakScreen,
    viewers,
    mmrToken,
    loungeRoom,
    warPiece,
    seriesPiece,
    ttPiece,
    levelQueue,
  });
}

type OverlayAdmin = ReturnType<typeof createTwitchAdminClient>;

/** The owner's latest wheel spin. Owner-keyed and session-independent; the client dedups by `createdAt`. */
async function readWheelSpin(ownerUserId: string) {
  const latestSpin = await getLatestSpin(ownerUserId);
  if (!latestSpin) return null;
  return {
    id: latestSpin.id,
    segments: latestSpin.segments,
    winningIndex: latestSpin.winningIndex,
    winningLabel: latestSpin.winningLabel,
    triggeredBy: latestSpin.triggeredBy,
    createdAt: latestSpin.createdAt,
    themeId: latestSpin.themeId,
    fillStyle: latestSpin.fillStyle,
    // A spin stores only the theme ID, and "user" is not a preset — it is
    // derived from whatever brand the owner has set today. Resolving it
    // here keeps the overlay honest without adding a colour snapshot to
    // every spin row: the overlay would otherwise call getTheme("user"),
    // miss, and silently fall back to the default on stream.
    theme:
      latestSpin.themeId === USER_THEME_ID
        ? await (async () => {
            const brand = await getBrandThemeForOwner(ownerUserId);
            return themeFromBrand(brand.primary, brand.accent, brand.name);
          })()
        : null,
  };
}

/** Open poll for the streamer's community. Null when nothing is open (the overlay then hides it). */
async function readPoll(communityId: string | null): Promise<{
  id: string;
  question: string;
  options: { id: string; label: string }[];
  tally: { total: number; byOption: Record<string, number> };
} | null> {
  if (!communityId) return null;
  try {
    const open = await getOpenPollForCommunity(communityId);
    if (!open) return null;
    return { id: open.id, question: open.question, options: open.options, tally: await pollTally(open.id) };
  } catch (err) {
    console.error("[overlay/latest] poll fetch failed:", err);
    return null;
  }
}

/** Stream Bingo: the community's current game (also makes the timer's call when due, since this overlay polls every couple of seconds while live). */
async function readBingo(communityId: string | null): Promise<StreamBingoView | null> {
  if (!communityId) return null;
  try {
    const game = await getBingoGame(communityId);
    return game ? await bingoView(await tickBingo(game)) : null;
  } catch (err) {
    console.error("[overlay/latest] bingo fetch failed:", err);
    return null;
  }
}

/** Chat draft: the community's current draft (also resolves a pick whose timer is up). */
async function readDraft(communityId: string | null): Promise<StreamDraftView | null> {
  if (!communityId) return null;
  try {
    const d = await getCurrentDraft(communityId);
    return d ? await draftView(await tickDraft(d)) : null;
  } catch (err) {
    if (!(err instanceof Error && err.name === "DraftsNotReady")) console.error("[overlay/latest] draft fetch failed:", err);
    return null;
  }
}

/**
 * Chat Brain: the community's game on stream (also closes a guess whose time is up). With no game, a
 * survey round (open, or just closed); closing it when its time is up and its AI merge pass both run
 * after this responds.
 */
async function readBrain(communityId: string | null): Promise<{ brain: StreamGameView | null; brainSurvey: StreamSurveyView | null }> {
  let brain: StreamGameView | null = null;
  let brainSurvey: StreamSurveyView | null = null;
  if (!communityId) return { brain, brainSurvey };
  try {
    // A streamer who is the guest in a co-stream shows the host's game.
    const g = (await getBrainGame(communityId)) ?? (await brainGuestGame(communityId));
    // A running game wins; an open survey beats a game that just finished.
    if (g?.status === "playing") brain = await brainGameView(await tickBrainGame(g));
    else {
      brainSurvey = await overlaySurveyView(communityId);
      if (g && brainSurvey?.status !== "open") { brain = await brainGameView(g); brainSurvey = null; }
      if (brainSurvey?.status === "open") {
        after(async () => {
          await tickBrainSurvey(communityId).catch((err) => console.error("[overlay/latest] survey close failed:", err));
          await brainSurveyAi(communityId).catch((err) => console.error("[overlay/latest] survey AI pass failed:", err));
        });
      }
    }
  } catch (err) {
    console.error("[overlay/latest] chat brain fetch failed:", err);
  }
  return { brain, brainSurvey };
}

/** Break mode: the channel's break (also moves it along, like Bingo's caller). */
async function readBreak(communityId: string | null): Promise<BreakView | null> {
  if (!communityId) return null;
  try {
    const run = await getShowableBreak(communityId);
    return run ? await breakView(run.status === "running" ? await tickBreak(run) : run) : null;
  } catch (err) {
    console.error("[overlay/latest] break fetch failed:", err);
    return null;
  }
}

/**
 * The streamer's current session. Hot path: the client passes the session id it has, checked against
 * this token's owner (one row by primary key). With none, or a stale one, the full lookup runs and
 * the response tells the client the current session.
 */
async function resolveSession(admin: OverlayAdmin, ownerUserId: string, sessionParam: string | null): Promise<ResolvedSession | null> {
  if (sessionParam && UUID_REGEX.test(sessionParam)) {
    const { data: ownedSession } = await admin
      .from("gs_sessions")
      .select("id, config")
      .eq("id", sessionParam)
      .eq("owner_user_id", ownerUserId)
      .in("status", ["active", "ending"])
      .maybeSingle();
    if (ownedSession) {
      const config = (ownedSession as { config?: { game?: string | null } | null }).config;
      return { id: (ownedSession as { id: string }).id, randomizerSlug: config?.game ?? null };
    }
  }
  const session: TwitchSessionRow | null = await findTwitchSessionForUser(ownerUserId, ["active", "test"]);
  return session ? { id: session.id, randomizerSlug: session.randomizer_slug } : null;
}

/**
 * Multi-game spec PR B — the overlay surfaces an open picks/bans
 * round so viewers watching the stream can see the live counts +
 * the shareable URL. Returns null when no round is open.
 */
type PicksPool = "tracks" | "itemModes" | "itemLiteral";
interface PicksBansOverlay {
  roundId: string;
  gameSlug: string;
  streamerSlug: string;
  locked: number;
  inProgress: number;
  topPicks: Array<{ id: string; count: number; pool: PicksPool }>;
  topBans: Array<{ id: string; count: number; pool: PicksPool }>;
}

async function readPicksBans(admin: OverlayAdmin, sessionId: string, ownerUserId: string): Promise<PicksBansOverlay | null> {
  try {
    const { data: openRows } = await admin
      .from("session_picks_bans_rounds")
      .select("id, game_slug")
      .eq("session_id", sessionId)
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
        .eq("id", ownerUserId)
        .maybeSingle();
      const streamerSlug =
        ((profile?.username as string | null) ??
          (profile?.twitch_username as string | null)) ??
        "";

      return {
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
  return null;
}

/**
 * Live event state — active modifiers + open public challenges, capped for the small overlay real
 * estate. Guarded so it never fails the response.
 */
async function readLiveEvents(sessionId: string): Promise<LiveEvents | null> {
  try {
    const e = await listLiveSessionEvents(sessionId);
    if (e.modifiers.length > 0 || e.challenges.length > 0) {
      return { modifiers: e.modifiers.slice(0, 4), challenges: e.challenges.slice(0, 4) };
    }
  } catch (err) {
    console.error("[overlay/latest] events fetch failed:", err);
  }
  return null;
}
