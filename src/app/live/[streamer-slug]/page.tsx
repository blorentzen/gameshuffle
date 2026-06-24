/**
 * /live/[streamer-slug] — public live stream view.
 *
 * Per gs-track-item-randomization-phase-b-spec.md §4. Public surface
 * (no auth required for read access). Renders a streamer's currently-
 * active session with read-only state + tactile interaction surfaces
 * for picks/bans, gated behind Twitch OAuth viewer auth.
 *
 * The view is read-only-for-streamer: a signed-in streamer viewing
 * their own slug sees the same UI as any anonymous viewer (per spec
 * §2.5). Streamer controls live on /hub.
 *
 * Slug resolution: try users.username first (canonical GS slug), fall
 * back to users.twitch_username (Twitch login). Either resolves to a
 * single streamer; if neither matches, 404.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { listSessionEvents, listActiveParticipants } from "@/lib/sessions/queries";
import type { GsSession, SessionStatus } from "@/lib/sessions/types";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import type { RaceGame } from "@/lib/randomizers/race";
import type {
  PicksBansBallot,
  PicksBansRound,
} from "@/lib/picks-bans/types";
import { LiveStreamView } from "@/components/live/LiveStreamView";
import { loadRecapForStreamer } from "@/lib/sessions/recap";
import { getReplayVodId } from "@/lib/twitch/client";
import { getCommunityBySlug } from "@/lib/economy/community";
import { brandCssVars } from "@/lib/theme/brand";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import {
  getLeaderboard,
  type LeaderboardRow,
} from "@/lib/economy/leaderboards";

/** Live session metadata sourced from the gs_sessions_public view. The
 *  view's column list is the explicit public contract — see
 *  supabase/live-view-gs-sessions-public-view.sql. */
export interface LiveSessionMeta {
  id: string;
  slug: string;
  ownerUserId: string;
  status: SessionStatus;
  activeGame: string | null;
  configuredGames: string[];
  name: string;
}

interface PageProps {
  params: Promise<{ "streamer-slug": string }>;
}

interface StreamerProfile {
  id: string;
  username: string | null;
  /** Twitch login from the sign-in OAuth identity (Supabase Auth).
   *  Null when the streamer signed up via email or Discord and never
   *  used Twitch to sign in. The embed prefers
   *  `twitch_connections.twitch_login` (streamer-integration flow)
   *  resolved separately. */
  twitch_username: string | null;
  display_name: string | null;
  twitch_avatar: string | null;
  /** Twitch handle from the streamer-integration OAuth flow. This is
   *  the channel name we use for the Twitch player embed and any
   *  twitch.tv/<handle> link, since it's populated whenever the
   *  streamer connects their Twitch account for bot/overlay/EventSub
   *  even if they didn't sign in with Twitch. Falls back to
   *  twitch_username for streamers who haven't run the streamer-
   *  integration flow yet. */
  twitch_channel: string | null;
  /** Numeric Twitch user id (from twitch_connections) — for Helix lookups
   *  like the offline-page VOD replay. */
  twitch_user_id: string | null;
}

async function resolveStreamer(slug: string): Promise<StreamerProfile | null> {
  if (!slug) return null;
  const admin = createServiceClient();

  // username first (canonical custom slug), then twitch_username fallback.
  const fields = "id, username, twitch_username, display_name, twitch_avatar";
  const { data: byUsername } = await admin
    .from("users")
    .select(fields)
    .eq("username", slug)
    .maybeSingle();
  let row = (byUsername as Record<string, unknown> | null) ?? null;

  if (!row) {
    const { data: byTwitchLogin } = await admin
      .from("users")
      .select(fields)
      .eq("twitch_username", slug)
      .limit(1)
      .maybeSingle();
    row = (byTwitchLogin as Record<string, unknown> | null) ?? null;
  }

  if (!row) return null;

  // Pull the streamer-integration Twitch handle separately. Streamers
  // who connected via the streamer-integration OAuth (not the sign-in
  // flow) populate this even when users.twitch_username is null.
  const userId = row.id as string;
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("twitch_login, twitch_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  const twitchChannel =
    ((connection?.twitch_login as string | null) ?? null) ||
    ((row.twitch_username as string | null) ?? null);

  return {
    id: userId,
    username: (row.username as string | null) ?? null,
    twitch_username: (row.twitch_username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    twitch_avatar: (row.twitch_avatar as string | null) ?? null,
    twitch_channel: twitchChannel,
    twitch_user_id: (connection?.twitch_user_id as string | null) ?? null,
  };
}

async function loadActiveSession(ownerUserId: string): Promise<GsSession | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_sessions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as GsSession | null) ?? null;
}

/**
 * Project a GsSession row into the public LiveSessionMeta shape that
 * the realtime layer consumes. Mirrors the column subset exposed by
 * the gs_sessions_public view — keeps the SSR initial fetch and the
 * client-side `refreshSession()` reading the same columns.
 */
function toLiveSessionMeta(session: GsSession): LiveSessionMeta {
  return {
    id: session.id,
    slug: session.slug,
    ownerUserId: session.owner_user_id,
    status: session.status,
    activeGame: session.active_game ?? null,
    configuredGames: session.configured_games ?? [],
    name: session.name,
  };
}

async function loadRaceConfig(
  sessionId: string
): Promise<{ enabled: boolean; config: RaceRandomizerConfig } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_modules")
    .select("enabled, config")
    .eq("session_id", sessionId)
    .eq("module_id", "race_randomizer")
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: !!data.enabled,
    config: data.config as RaceRandomizerConfig,
  };
}

/** Initial leaderboard snapshot for the live page's Leaderboard tab.
 *  Three flavors fetched in parallel; each returns up to 10 rows.
 *  Streamers without a gs_communities row yet (no chat/web interactions)
 *  return three empty arrays — the tab renders its own empty state. */
async function loadInitialLeaderboards(
  streamerSlug: string,
  fallbackSlug: string | null,
): Promise<{
  communityId: string | null;
  combined: LeaderboardRow[];
  player: LeaderboardRow[];
  crowd: LeaderboardRow[];
}> {
  const community =
    (await getCommunityBySlug(streamerSlug)) ??
    (fallbackSlug ? await getCommunityBySlug(fallbackSlug) : null);
  if (!community) {
    return { communityId: null, combined: [], player: [], crowd: [] };
  }
  const [combined, player, crowd] = await Promise.all([
    getLeaderboard({ kind: "combined", communityId: community.id, limit: 10 }),
    getLeaderboard({ kind: "player", communityId: community.id, limit: 10 }),
    getLeaderboard({ kind: "crowd", communityId: community.id, limit: 10 }),
  ]);
  return { communityId: community.id, combined, player, crowd };
}

/** Initial load of open picks/bans rounds + their ballots. The
 *  realtime layer keeps these fresh via the rounds + ballots
 *  channels; this fetch hydrates the SSR pass so the
 *  LivePicksBansTab renders the correct state on first paint. */
async function loadInitialPicksBansState(
  sessionId: string
): Promise<{ rounds: PicksBansRound[]; ballots: PicksBansBallot[] }> {
  const admin = createServiceClient();
  const { data: roundsData } = await admin
    .from("session_picks_bans_rounds")
    .select(
      "id, session_id, game_slug, status, recommendation_top_n, recommendation_mode, closes_at, closed_at, applied_at, results, opened_by_user_id, opened_at, updated_at"
    )
    .eq("session_id", sessionId)
    .eq("status", "open");
  const rounds = ((roundsData ?? []) as PicksBansRound[]) ?? [];

  // Pull every ballot scoped to this session — denorm session_id
  // column makes the filter a single index lookup. The realtime
  // ballots channel uses the same filter shape.
  const { data: ballotsData } = await admin
    .from("session_picks_bans_ballots")
    .select(
      "id, round_id, session_id, viewer_twitch_user_id, anon_session_id, picks_tracks, bans_tracks, picks_rallies, bans_rallies, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal, locked_at, viewer_display_name, created_at, updated_at"
    )
    .eq("session_id", sessionId);
  const ballots = ((ballotsData ?? []) as PicksBansBallot[]) ?? [];
  return { rounds, ballots };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { "streamer-slug": slug } = await params;
  const streamer = await resolveStreamer(slug);
  if (!streamer) return { title: "Live not found" };
  const name =
    streamer.display_name ??
    streamer.twitch_channel ??
    streamer.twitch_username ??
    slug;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co";
  return {
    title: `${name} — Live on GameShuffle`,
    description: `Watch ${name}'s live GameShuffle session. Track + item randomization, picks/bans, real-time updates.`,
    alternates: { canonical: `${base}/live/${slug}` },
    openGraph: {
      type: "website",
      url: `${base}/live/${slug}`,
      title: `${name} — Live on GameShuffle`,
      description: `Watch ${name}'s live session — track + item randomization, real-time.`,
      siteName: "GameShuffle",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — Live on GameShuffle`,
    },
  };
}

export default async function LiveStreamPage({ params }: PageProps) {
  const { "streamer-slug": slug } = await params;
  const streamer = await resolveStreamer(slug);
  if (!streamer) notFound();

  const session = await loadActiveSession(streamer.id);

  // Brand theme re-skins this customer-facing page with the streamer's
  // channel colors (--brand-* on the view root). Default = no override.
  const brandStyle = brandCssVars(await getBrandThemeForOwner(streamer.id));

  // Leaderboard data is community-scoped, so it loads regardless of
  // whether the streamer's currently live. Viewers between streams
  // still want to check rank + balance.
  const initialLeaderboard = await loadInitialLeaderboards(
    slug,
    streamer.username ?? streamer.twitch_username,
  );

  // No live session — surface the "This happened last time" recap of
  // the streamer's most recent ended (non-test) session beside the
  // standard "Not live" frame. Recap honors the streamer's
  // `users.show_recap_on_live_page` opt-out (returns null when off).
  if (!session) {
    const recap = await loadRecapForStreamer(streamer.id);
    // Offline: replay the last broadcast unless they're live on Twitch right now.
    const replayVodId = await getReplayVodId(streamer.twitch_user_id);
    return (
      <LiveStreamView
        streamer={{
          slug,
          userId: streamer.id,
          displayName: streamer.display_name,
          twitchHandle: streamer.twitch_channel,
          avatar: streamer.twitch_avatar,
        }}
        sessionState={null}
        recap={recap}
        replayVodId={replayVodId}
        initialLeaderboard={initialLeaderboard}
        brandStyle={brandStyle}
      />
    );
  }

  const raceModule = await loadRaceConfig(session.id);
  const [participants, events, picksBansState] = await Promise.all([
    listActiveParticipants(session.id),
    listSessionEvents(session.id, { limit: 50 }),
    loadInitialPicksBansState(session.id),
  ]);

  // Derive the active game for the live page. Resolution chain
  // mirrors the chat-handlers' Section A defensive fix:
  //   1. active_game     — Twitch's current category (multi-game truth)
  //   2. configured_games[0] — test sessions before going live
  //   3. config.game     — legacy single-game rows
  // The DB stores kebab-case slugs (`mario-kart-8-deluxe`); the
  // RaceGame enum is the short-form (`mk8dx`). Normalize here so the
  // tabs receive the enum form they expect. Accept both forms on the
  // right-hand side — older rows may have stored the enum directly.
  const rawSlug =
    session.active_game ??
    session.configured_games?.[0] ??
    (session.config?.game as string | null) ??
    null;
  const game: RaceGame | null =
    rawSlug === "mario-kart-8-deluxe" || rawSlug === "mk8dx"
      ? "mk8dx"
      : rawSlug === "mario-kart-world" || rawSlug === "mkworld"
        ? "mkworld"
        : null;

  return (
    <LiveStreamView
      streamer={{
        slug,
        userId: streamer.id,
        displayName: streamer.display_name,
        twitchHandle: streamer.twitch_channel,
        avatar: streamer.twitch_avatar,
      }}
      sessionState={{
        sessionId: session.id,
        sessionName: session.name,
        status: session.status,
        startedAt: session.activated_at,
        game,
        raceConfig: raceModule?.config ?? null,
        raceModuleEnabled: raceModule?.enabled ?? false,
        initialParticipants: participants,
        initialEvents: events,
        initialSession: toLiveSessionMeta(session),
        initialRounds: picksBansState.rounds,
        initialBallots: picksBansState.ballots,
      }}
      initialLeaderboard={initialLeaderboard}
      brandStyle={brandStyle}
    />
  );
}
