/**
 * /mod/[streamer] — the mod's operational view of a streamer's surfaces.
 *
 * Laid out like the streamer's control room (2026-10-10): a banner saying
 * whose stream it is and what a mod can do, the session header, the lobby
 * with Kick and the activity feed, then the streamer's decks. The
 * "Coming soon" boxes for unbuilt features are gone; add a panel when a
 * mod tool actually ships (code requests, pre-stream queue, room code).
 *
 * Auth: caller must be signed in AND either (a) the streamer
 * themselves (implicit-mod self-access) OR (b) hold an `active` row
 * in `streamer_mods` for this streamer. Server actions
 * (`./actions.ts`) repeat the check on every write — the page gate
 * is the first layer, not the only one.
 */

import { redirect } from "next/navigation";
import { Alert, Badge, Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getActiveSessionForOwner } from "@/lib/sessions/service";
import { listActiveParticipants, listSessionEvents } from "@/lib/sessions/queries";
import { RealtimeActivityFeed } from "@/components/hub/RealtimeActivityFeed";
import { ModParticipantsPanel } from "./ModParticipantsPanel";
import { DeckEditor } from "@/components/party/DeckEditor";
import { GameCover } from "@/components/games/GameCover";
import { getGameName } from "@/data/game-registry";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ streamer: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface StreamerProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  twitch_username: string | null;
  twitch_avatar: string | null;
}

export default async function ModView({ params, searchParams }: PageProps) {
  const { streamer: slug } = await params;
  const sp = await searchParams;
  const justClaimed = sp.claimed === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirect=/mod/${encodeURIComponent(slug)}`);
  }

  const admin = createServiceClient();

  // Resolve the streamer profile by slug (username OR twitch_username).
  const { data: byUsername } = await admin
    .from("users")
    .select("id, display_name, username, twitch_username, twitch_avatar")
    .eq("username", slug.toLowerCase())
    .maybeSingle();
  let streamer = byUsername as StreamerProfile | null;
  if (!streamer) {
    const { data: byTwitch } = await admin
      .from("users")
      .select("id, display_name, username, twitch_username, twitch_avatar")
      .eq("twitch_username", slug)
      .maybeSingle();
    streamer = byTwitch as StreamerProfile | null;
  }

  if (!streamer) {
    return (
      <Container as="main">
        <ModShell>
          <h1 style={{ marginTop: 0 }}>Streamer not found</h1>
          <Alert variant="error">
            No GameShuffle streamer matches <strong>@{slug}</strong>.
          </Alert>
        </ModShell>
      </Container>
    );
  }

  // Access gates: caller is an active mod OR the streamer themselves.
  const isStreamerSelf = user.id === streamer.id;
  const { data: modRow } = await admin
    .from("streamer_mods")
    .select("id, status")
    .eq("streamer_user_id", streamer.id)
    .eq("gs_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const isActiveMod = modRow !== null;
  const canAccess = isStreamerSelf || isActiveMod;

  const streamerName =
    streamer.display_name ?? streamer.username ?? streamer.twitch_username ?? slug;

  if (!canAccess) {
    return (
      <Container as="main">
        <ModShell>
          <h1 style={{ marginTop: 0 }}>You&rsquo;re not modding for this streamer</h1>
          <Alert variant="warning">
            You don&rsquo;t have active mod status for{" "}
            <strong>{streamerName}</strong>. If they invited you, check
            that you signed in with the same identity the invite was sent to.
          </Alert>
        </ModShell>
      </Container>
    );
  }

  // Active session lookup — drives whether we render the operational
  // panels or the "no active session" placeholder.
  const session = await getActiveSessionForOwner(streamer.id);

  // Pre-fetch initial state for the panels server-side so the client
  // gets first paint without a hydration flicker. Realtime takes over
  // from there.
  const [participants, events] = session
    ? await Promise.all([
        listActiveParticipants(session.id),
        listSessionEvents(session.id, { limit: 25 }),
      ])
    : [[], []];

  const game = session ? session.active_game ?? session.configured_games?.[0] ?? null : null;
  const inLobby = participants.filter((p) => !p.is_broadcaster).length;

  return (
    <Container as="main">
      <div className="hub-detail hub-session mod-view">
        {justClaimed && (
          <Alert variant="success">
            You&rsquo;re in. {streamerName} now sees you as an active mod for their streams.
          </Alert>
        )}

        <div className="mod-view__banner">
          <Alert variant="info" title={isStreamerSelf ? "This is what your mods see" : `You're a mod for ${streamerName}`}>
            {isStreamerSelf
              ? "They can manage the lobby and edit your decks. Rolls, picks and bans, predictions and the stream itself stay with you, in the Stream hub."
              : `You can manage the lobby and edit ${streamerName}'s decks. ${streamerName} runs rolls, picks and bans, predictions and the stream itself.`}
          </Alert>
        </div>

        <header className="hub-session__head">
          <span className="hub-session__cover">{game && <GameCover slug={game} name={getGameName(game)} />}</span>
          <div className="hub-session__titles">
            <h1 className="hub-detail__title">{session ? session.name : `${streamerName}'s streams`}</h1>
            <p className="hub-session__status">
              {session ? (
                <>
                  <Badge variant="success" size="small">Live</Badge>
                  <span>{[game ? `Playing ${getGameName(game)}` : null, `${inLobby} in the lobby`].filter(Boolean).join(" · ")}</span>
                </>
              ) : (
                <>
                  <Badge variant="default" size="small">Not live</Badge>
                  <span>Keep this tab open; it fills in when {streamerName} goes live.</span>
                </>
              )}
            </p>
          </div>
          <div className="hub-detail__header-actions">
            <a href={`/live/${slug}`} target="_blank" rel="noopener noreferrer"><Button variant="secondary">{streamerName}&rsquo;s live page ↗</Button></a>
            {isStreamerSelf && <a href="/account/streaming?tab=mods"><Button variant="secondary">Manage mods</Button></a>}
          </div>
        </header>

        {session && (
          <div className="hub-control">
            <div className="hub-control__main">
              <section className="hub-panel" aria-labelledby="mod-lobby">
                <h2 id="mod-lobby" className="hub-panel__title">Lobby <span className="hub-page__group-count">{inLobby}</span></h2>
                <ModParticipantsPanel streamerSlug={slug} sessionId={session.id} initialParticipants={participants} />
              </section>
            </div>
            <aside className="hub-control__side">
              <section className="hub-panel" aria-labelledby="mod-activity">
                <h2 id="mod-activity" className="hub-panel__title">Activity</h2>
                <RealtimeActivityFeed sessionId={session.id} initialEvents={events.map((row) => ({ ...row }))} limit={12} />
              </section>
            </aside>
          </div>
        )}

        <section className="hub-panel" aria-labelledby="mod-decks">
          <h2 id="mod-decks" className="hub-panel__title">{streamerName}&rsquo;s decks</h2>
          <p className="hub-panel__empty">Chance cards, missions and house rules for {streamerName}&rsquo;s game nights and live nights.</p>
          <DeckEditor scope={streamer.id} />
        </section>
      </div>
    </Container>
  );
}

function ModShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "640px",
        margin: "var(--spacing-48) auto",
        padding: "var(--spacing-24)",
        background: "var(--background-elevated)",
        borderRadius: "var(--radius-md, 0.5rem)",
        boxShadow: "0 0 1rem rgba(0, 0, 0, 0.1)",
      }}
    >
      {children}
    </div>
  );
}
