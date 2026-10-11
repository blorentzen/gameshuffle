/**
 * /mod/[streamer] — the mod's operational view of a streamer's surfaces.
 *
 * Laid out like the streamer's control room (2026-10-10): a banner saying
 * whose stream it is and what a mod can do, the session header, the lobby
 * with Kick and the activity feed, then the streamer's decks.
 *
 * Mod access levels (supabase/mod-access-m1.sql): Standard mods get the
 * above. Full mods, while the streamer is live, get the stream page's own
 * controls as tabs: Control room (rolls, what's running, overlay tools),
 * Picks & bans for games that have it, Live games (polls, bingo, drafts,
 * Chat Brain, break mode) and Decks. Those components act on "the
 * streamer": their actions and routes resolve a Full mod on this page to
 * the streamer (src/lib/mods/acting.ts). Ending or editing the stream
 * stays on the streamer's own stream page.
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
import { modAccess } from "@/lib/mods/acting";
import { hubGameActions } from "@/lib/hub/gameActions";
import { HubLiveProvider } from "@/components/hub/live/HubLiveProvider";
import { GameRolls, LastRoll } from "@/components/hub/live/OnScreenNow";
import { RunningNow } from "@/components/hub/live/RunningNow";
import { LiveGamesPanel } from "@/components/hub/live/LiveGamesPanel";
import { HubToolsRun } from "@/components/hub/HubToolsRun";
import { DashboardLiveControls } from "@/components/hub/DashboardLiveControls";
import { SessionDetailTabs, type SessionDetailTabDef } from "@/components/hub/SessionDetailTabs";

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

  // Access gates: caller is an active mod OR the streamer themselves. The
  // streamer previewing their own page sees what a Full mod sees.
  const isStreamerSelf = user.id === streamer.id;
  const access = isStreamerSelf ? "full" : await modAccess(streamer.id, user.id);
  const canAccess = access !== null;
  const full = access === "full";

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

  // Full access while live: the stream page's controls, for the game on stream.
  const configuredGames: string[] = session
    ? Array.isArray(session.configured_games) && session.configured_games.length > 0
      ? session.configured_games
      : session.config?.game ? [session.config.game as string] : []
    : [];
  const gameActions = session && full ? hubGameActions(game) : null;
  let rawRaceConfig: Record<string, unknown> | null = null;
  if (session && full && gameActions?.race) {
    const { data: raceRow } = await admin
      .from("session_modules")
      .select("config")
      .eq("session_id", session.id)
      .eq("module_id", "race_randomizer")
      .maybeSingle();
    rawRaceConfig = (raceRow?.config as Record<string, unknown> | null) ?? null;
  }

  const lobbyPanel = session ? (
    <section className="hub-panel" aria-labelledby="mod-lobby">
      <h2 id="mod-lobby" className="hub-panel__title">Lobby <span className="hub-page__group-count">{inLobby}</span></h2>
      <ModParticipantsPanel streamerSlug={slug} sessionId={session.id} initialParticipants={participants} />
    </section>
  ) : null;
  const activityPanel = session ? (
    <section className="hub-panel" aria-labelledby="mod-activity">
      <h2 id="mod-activity" className="hub-panel__title">Activity</h2>
      <RealtimeActivityFeed sessionId={session.id} initialEvents={events.map((row) => ({ ...row }))} limit={12} />
    </section>
  ) : null;
  const decksPanel = (
    <section className="hub-panel" aria-labelledby="mod-decks">
      <h2 id="mod-decks" className="hub-panel__title">{streamerName}&rsquo;s decks</h2>
      <p className="hub-panel__empty">Chance cards, missions and house rules for {streamerName}&rsquo;s game nights and live nights.</p>
      <DeckEditor scope={streamer.id} />
    </section>
  );

  let fullTabs: SessionDetailTabDef[] | null = null;
  if (session && full) {
    fullTabs = [
      {
        id: "overview",
        label: "Control room",
        content: (
          <div className="hub-control">
            <div className="hub-control__grid">
              <div className="hub-control__main">
                <GameRolls key={gameActions?.slug ?? "queue"} sessionId={session.id} actions={gameActions} rawRaceConfig={rawRaceConfig} legacyDefaultSlug={configuredGames[0]} streamerName={isStreamerSelf ? undefined : streamerName} />
                <RunningNow sessionSlug={session.slug} liveSlug={slug} actions={gameActions} predictions={false} />
                <HubToolsRun slug={session.slug} setupLink={false} />
              </div>
              <aside className="hub-control__side">
                <LastRoll />
                {lobbyPanel}
                {activityPanel}
              </aside>
            </div>
          </div>
        ),
      },
      ...(gameActions?.race
        ? [{
            id: "picks",
            label: "Picks & bans",
            content: (
              <DashboardLiveControls
                sessionId={session.id}
                sessionSlug={session.slug}
                initialActiveGameSlug={game}
                legacyDefaultSlug={configuredGames[0]}
                rawRaceConfig={rawRaceConfig}
                part="picks"
              />
            ),
          }]
        : []),
      { id: "live-games", label: "Live games", content: <LiveGamesPanel /> },
      { id: "decks", label: "Decks", content: decksPanel },
    ];
  }
  const tabParam = typeof sp.tab === "string" ? sp.tab : "";
  const initialTab = fullTabs?.some((t) => t.id === tabParam) ? tabParam : "overview";

  return (
    <Container as="main">
      <div className="hub-detail hub-session mod-view">
        {justClaimed && (
          <Alert variant="success">
            You&rsquo;re in. {streamerName} now sees you as an active mod for their streams.
          </Alert>
        )}

        <div className="mod-view__banner">
          <Alert variant="info" title={isStreamerSelf ? "This is your mods' page" : `You're a mod for ${streamerName}`}>
            {isStreamerSelf
              ? "Standard mods manage the lobby and edit your decks. Full mods also get the controls below while you're live: rolls, picks and bans, overlay tools, live games and break mode. Starting, ending and editing the stream stay with you."
              : full
                ? `You have Full access: while ${streamerName} is live you can roll, run picks and bans, the overlay tools, live games and break mode, and manage the lobby and decks. Starting, ending and editing the stream stay with ${streamerName}.`
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

        {session && fullTabs ? (
          <HubLiveProvider sessionId={session.id} renderedGame={game}>
            <SessionDetailTabs tabs={fullTabs} initialTab={initialTab} />
          </HubLiveProvider>
        ) : (
          <>
            {session && (
              <div className="hub-control">
                <div className="hub-control__main">{lobbyPanel}</div>
                <aside className="hub-control__side">{activityPanel}</aside>
              </div>
            )}
            {decksPanel}
          </>
        )}
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
