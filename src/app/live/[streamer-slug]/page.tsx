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
import type { GsSession } from "@/lib/sessions/types";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import type { RaceGame } from "@/lib/randomizers/race";
import { LiveStreamView } from "@/components/live/LiveStreamView";

interface PageProps {
  params: Promise<{ "streamer-slug": string }>;
}

interface StreamerProfile {
  id: string;
  username: string | null;
  twitch_username: string | null;
  display_name: string | null;
  twitch_avatar: string | null;
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
  if (byUsername) return byUsername as StreamerProfile;

  const { data: byTwitchLogin } = await admin
    .from("users")
    .select(fields)
    .eq("twitch_username", slug)
    .limit(1)
    .maybeSingle();
  if (byTwitchLogin) return byTwitchLogin as StreamerProfile;

  return null;
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { "streamer-slug": slug } = await params;
  const streamer = await resolveStreamer(slug);
  if (!streamer) return { title: "Live not found" };
  const name = streamer.display_name ?? streamer.twitch_username ?? slug;
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
          twitchUsername: streamer.twitch_username,
          avatar: streamer.twitch_avatar,
        }}
        sessionState={null}
      />
    );
  }

  const raceModule = await loadRaceConfig(session.id);
  const [participants, events] = await Promise.all([
    listActiveParticipants(session.id),
    listSessionEvents(session.id, { limit: 50 }),
  ]);

  const gameSlug = (session.config?.game as string | null) ?? null;
  const game: RaceGame | null =
    gameSlug === "mk8dx" || gameSlug === "mkworld" ? gameSlug : null;

  return (
    <LiveStreamView
      streamer={{
        slug,
        displayName: streamer.display_name,
        twitchUsername: streamer.twitch_username,
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
      }}
    />
  );
}
