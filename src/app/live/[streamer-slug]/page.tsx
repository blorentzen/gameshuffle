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
    .select("twitch_login")
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
      "id, round_id, session_id, viewer_twitch_user_id, anon_session_id, picks_tracks, bans_tracks, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal, locked_at, viewer_display_name, created_at, updated_at"
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

  // No live session — render the "Not live" state with streamer
  // identity + an "explore past sessions" affordance later.
  if (!session) {
    return (
      <LiveStreamView
        streamer={{
          slug,
          displayName: streamer.display_name,
          twitchHandle: streamer.twitch_channel,
          avatar: streamer.twitch_avatar,
        }}
        sessionState={null}
      />
    );
  }

  const raceModule = await loadRaceConfig(session.id);
  const [participants, events, picksBansState] = await Promise.all([
    listActiveParticipants(session.id),
    listSessionEvents(session.id, { limit: 50 }),
    loadInitialPicksBansState(session.id),
  ]);

  const gameSlug = (session.config?.game as string | null) ?? null;
  const game: RaceGame | null =
    gameSlug === "mk8dx" || gameSlug === "mkworld" ? gameSlug : null;

  return (
    <LiveStreamView
      streamer={{
        slug,
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
    />
  );
}
