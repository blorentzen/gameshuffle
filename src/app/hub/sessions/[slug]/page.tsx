/**
 * /hub/sessions/[slug]: one stream's page, shaped by its state (rebuilt
 * 2026-10-10, audit + mockups https://claude.ai/artifact/4npmxxzygb6MWZemkxtQ54):
 *
 *   before (draft / scheduled / ready)  Plan · Games
 *   live (active / ending)              Control room · Games · Activity · Settings
 *   after (ended / cancelled)           Recap · Activity
 *
 * The control room puts everything touched during a stream on one screen:
 * rolls and picks and bans, the tools' run buttons, prediction and bounty,
 * the lobby (with Kick) and recent activity. Channel points, tool setup and
 * the overlay link live in Account ▸ Streaming now. Old tab ids
 * (stream-tools, markets, viewers, redemptions) open the control room.
 *
 * All platform data is read through the adapter abstraction
 * (gs-pro-v1-phase-3a-spec.md). Components do not parse `platforms`
 * JSONB directly.
 */

import { AiRecapButton } from "@/components/ai/AiRecapButton";
import { getBaseUrl } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Breadcrumb, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { getSessionBySlug } from "@/lib/sessions/service";
import { listSessionEvents, listActiveParticipants } from "@/lib/sessions/queries";
import { getAllAdaptersForSession } from "@/lib/adapters/dispatcher";
import type { ConnectionHealth, StreamStatusResult } from "@/lib/adapters/types";
import { type GsSession } from "@/lib/sessions/types";
import { WRAP_UP_DURATION_MS } from "@/lib/sessions/constants";
import { formatEventShort } from "@/lib/time/format";
import { Countdown } from "@/components/hub/Countdown";
import { InviteButton } from "@/components/social/InviteButton";
import { SessionActions } from "@/components/hub/SessionActions";
import { RealtimeActivityFeed } from "@/components/hub/RealtimeActivityFeed";
import { SessionDetailTabs, type SessionDetailTabDef } from "@/components/hub/SessionDetailTabs";
import { SessionStatusLine } from "@/components/hub/SessionStatusStrip";
import { HubToolsRun } from "@/components/hub/HubToolsRun";
import { TokenAllowanceBadge } from "@/components/hub/TokenAllowanceBadge";
import { GameCover } from "@/components/games/GameCover";
import { getGameName } from "@/data/game-registry";
import { ModParticipantsPanel } from "@/app/mod/[streamer]/ModParticipantsPanel";
import { SessionConfigureTab } from "@/components/hub/tabs/SessionConfigureTab";
import { SessionModulesTab } from "@/components/hub/tabs/SessionModulesTab";
import { DashboardLiveControls } from "@/components/hub/DashboardLiveControls";
import { SessionMarketsTab } from "@/components/hub/tabs/SessionMarketsTab";
import { PublicLobbySurface } from "@/components/hub/ConfigureSections";
import { HubLiveProvider } from "@/components/hub/live/HubLiveProvider";
import { GameRolls, LastRoll } from "@/components/hub/live/OnScreenNow";
import { RunningNow } from "@/components/hub/live/RunningNow";
import { LiveGamesPanel } from "@/components/hub/live/LiveGamesPanel";
import { hubGameActions } from "@/lib/hub/gameActions";
import type { SessionEventRow, ParticipantRow } from "@/lib/sessions/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Phase = "plan" | "live" | "recap";

const phaseOf = (status: GsSession["status"]): Phase =>
  status === "active" || status === "ending" ? "live" : status === "ended" || status === "cancelled" ? "recap" : "plan";

/** Which tab a ?tab= value opens in each phase (old ids from the 8-tab page land somewhere sensible). */
function resolveTab(raw: string | undefined, phase: Phase, raceGame: boolean): string {
  const t = raw ?? "";
  if (phase === "plan") return t === "modules" ? "modules" : "configure";
  if (phase === "recap") return t === "activity" ? "activity" : "overview";
  if (["lobby", "live-games", "predictions", "modules", "activity", "configure"].includes(t)) return t;
  if (t === "picks") return raceGame ? "picks" : "overview";
  if (t === "markets") return "predictions";
  if (t === "viewers") return "lobby";
  return "overview"; // overview, stream-tools, redemptions, anything else
}

export const metadata: Metadata = {
  title: "Stream",
  robots: { index: false, follow: false },
};

interface PlatformConnectionCard {
  platform: "twitch" | "discord" | "youtube" | "kick";
  health: ConnectionHealth;
  streamStatus: StreamStatusResult | null;
}

const PLATFORM_NAMES: Record<PlatformConnectionCard["platform"], string> = { twitch: "Twitch", discord: "Discord", youtube: "YouTube", kick: "Kick" };

export default async function SessionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  await requireHubAccess(`/hub/sessions/${slug}`);
  const session = await getSessionBySlug(slug);
  if (!session) notFound();

  // Verify ownership (the layout gate is hub.access; this is the owner check).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (session.owner_user_id !== user.id) notFound();

  const phase = phaseOf(session.status);

  const adapters = await getAllAdaptersForSession(session.id);
  const platformCards: PlatformConnectionCard[] = await Promise.all(
    adapters.map(async (adapter) => ({
      platform: adapter.platform,
      health: await adapter.validateConnection().catch(
        () => ({
          healthy: false as const,
          reason: "Adapter health check threw. See logs.",
          userActionRequired: true,
        })
      ),
      streamStatus: adapter.hasCapability("stream_status")
        ? await adapter.checkStreamStatus().catch(() => null)
        : null,
    }))
  );

  const events = await listSessionEvents(session.id, { limit: 25 });
  const participants = await listActiveParticipants(session.id);

  const admin = createServiceClient();
  const [
    { data: profile },
    { data: connectionRow },
    { data: raceRow },
    { data: discordServer },
  ] = await Promise.all([
    admin
      .from("users")
      .select("username, twitch_username, socials, timezone")
      .eq("id", session.owner_user_id)
      .maybeSingle(),
    admin
      .from("twitch_connections")
      .select("id, public_lobby_enabled")
      .eq("user_id", session.owner_user_id)
      .maybeSingle(),
    admin
      .from("session_modules")
      .select("config, enabled")
      .eq("session_id", session.id)
      .eq("module_id", "race_randomizer")
      .maybeSingle(),
    admin
      .from("discord_guilds")
      .select("guild_id")
      .eq("owner_user_id", session.owner_user_id)
      .is("removed_at", null)
      .limit(1)
      .maybeSingle(),
  ]);

  const tz = (profile?.timezone as string | null) ?? null;
  // Live-view slug: username first (canonical custom slug), then twitch_username.
  const liveSlug =
    (profile?.username as string | null) ??
    (profile?.twitch_username as string | null) ??
    null;

  const configuredGamesList: string[] =
    Array.isArray(session.configured_games) &&
    session.configured_games.length > 0
      ? session.configured_games
      : session.config?.game
        ? [session.config.game]
        : [];

  // Lazy-seed per-game race_randomizer slices from templates so the chat
  // commands always find a config for whatever game the streamer pivots to.
  // Idempotent; re-read the row so the UI hydrates against fresh config.
  const { ensureRaceRandomizerSlices } = await import(
    "@/lib/modules/store"
  );
  await ensureRaceRandomizerSlices({
    sessionId: session.id,
    ownerUserId: session.owner_user_id,
    configuredGames: configuredGamesList,
  });
  let rawRaceConfig: Record<string, unknown> | null =
    (raceRow?.config as Record<string, unknown> | null) ?? null;
  if (configuredGamesList.length > 0) {
    const { data: seededRow } = await admin
      .from("session_modules")
      .select("config")
      .eq("session_id", session.id)
      .eq("module_id", "race_randomizer")
      .maybeSingle();
    rawRaceConfig =
      (seededRow?.config as Record<string, unknown> | null) ?? rawRaceConfig;
  }
  const raceSessionLive = phase === "live";

  // A draft can't start while another session is still wrapping up; work
  // out when it can so the Start button shows a countdown.
  let blockingEndingEnableAt: string | null = null;
  if (phase === "plan") {
    const { data: ending } = await admin
      .from("gs_sessions")
      .select("id")
      .eq("owner_user_id", session.owner_user_id)
      .eq("status", "ending")
      .neq("id", session.id)
      .maybeSingle();
    if (ending) {
      const { data: enterEvent } = await admin
        .from("session_events")
        .select("created_at")
        .eq("session_id", (ending as { id: string }).id)
        .eq("event_type", "state_change")
        .filter("payload->>to", "eq", "ending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (enterEvent?.created_at) {
        const enteredMs = Date.parse(enterEvent.created_at as string);
        if (Number.isFinite(enteredMs)) {
          blockingEndingEnableAt = new Date(
            enteredMs + WRAP_UP_DURATION_MS + 60_000
          ).toISOString();
        }
      }
    }
  }

  const currentGame = phase === "live"
    ? session.active_game ?? configuredGamesList[0] ?? null
    : configuredGamesList[0] ?? null;
  const viewersInLobby = participants.filter((p) => !p.is_broadcaster).length;
  // What this game can do on stream (just in time: rolls, picks and bans,
  // predictions only where the game has them). Null for a queue.
  const gameActions = phase === "live" ? hubGameActions(currentGame) : null;
  const activeTab = resolveTab(tabParam, phase, !!gameActions?.race);
  const lobbyConnection = connectionRow
    ? {
        publicLobbyEnabled: (connectionRow.public_lobby_enabled as boolean | null) !== false,
        channelPointsEnabled: false,
        channelPointCost: 500,
        channelPointRewardId: null,
      }
    : null;

  // One alert when a connection needs fixing, in plain words (the per-session
  // connection cards repeated Setup in developer terms).
  const broken = platformCards.filter((c) => !c.health.healthy);
  const setupAlert = broken.length > 0 && phase !== "recap" ? (
    <Alert variant="warning" title={broken.some((c) => c.platform === "twitch") ? "Twitch needs attention" : `${broken.map((c) => PLATFORM_NAMES[c.platform]).join(" and ")} needs attention`}>
      <span className="hub-home__alert-body">
        {broken.some((c) => c.platform === "twitch")
          ? "The bot may not be able to read or post in your chat, so commands and rolls could go quiet."
          : "Posts there may not go out."}{" "}
        <Link href="/account/streaming?tab=integrations">Fix in Setup</Link>
      </span>
    </Alert>
  ) : null;

  const configureContent = (
    <SessionConfigureTab
      slug={session.slug}
      sessionId={session.id}
      initialPublicLobby={(session.feature_flags?.public_lobby as boolean | null | undefined) ?? null}
      status={session.status}
      initial={{
        name: session.name,
        description: session.description ?? null,
        configuredGames: configuredGamesList,
        scheduledAt: session.scheduled_at,
        openMode: session.open_mode ?? null,
        announceAt: session.announce_at ?? null,
        opensQueue: session.feature_flags?.opens_queue !== false,
        recurrence: session.recurrence ?? null,
        recurrenceUntil: session.recurrence_until ?? null,
        maxParticipants:
          typeof session.config?.max_participants === "number"
            ? (session.config.max_participants as number)
            : null,
      }}
      showTwitchNotConnectedWarning={!connectionRow}
      // While live, the lobby's visibility sits on the Lobby tab.
      connection={phase === "live" ? null : lobbyConnection}
    />
  );

  const queueCfg = (session.config?.queue ?? {}) as {
    cap?: number;
    rotation?: "fifo" | "random";
  };
  const initialQueueCap =
    typeof queueCfg.cap === "number" && Number.isFinite(queueCfg.cap)
      ? queueCfg.cap
      : typeof session.config?.max_participants === "number"
        ? (session.config.max_participants as number)
        : 20;
  const initialQueueRotation: "fifo" | "random" =
    queueCfg.rotation === "random" ? "random" : "fifo";

  // "Share via Discord" needs a connected server AND a public invite.
  const profileSocials =
    (profile?.socials as { discord_invite?: string } | null) ?? {};
  const discordInviteUrl =
    typeof profileSocials.discord_invite === "string" &&
    profileSocials.discord_invite.trim().length > 0
      ? profileSocials.discord_invite.trim()
      : null;
  const discordShareAvailable = !!(discordServer && discordInviteUrl);

  const gamesContent = (
    <SessionModulesTab
      sessionId={session.id}
      sessionSlug={session.slug}
      configuredGames={configuredGamesList}
      rawRaceConfig={rawRaceConfig}
      initialQueueCap={initialQueueCap}
      initialQueueRotation={initialQueueRotation}
      raceSessionLive={raceSessionLive}
      discordShareAvailable={discordShareAvailable}
    />
  );

  const activityContent = (
    <section className="hub-panel" aria-labelledby="hub-activity-all">
      <h2 id="hub-activity-all" className="hub-panel__title">Everything that happened</h2>
      <RealtimeActivityFeed sessionId={session.id} initialEvents={serializeEvents(events)} />
    </section>
  );

  const lobbyList = liveSlug ? (
    <ModParticipantsPanel streamerSlug={liveSlug} sessionId={session.id} initialParticipants={serializeParticipants(participants)} />
  ) : (
    <p className="hub-panel__empty">Set a username in Account ▸ Profile to manage the lobby here.</p>
  );

  // The control room: the game on stream's rolls, what's running with its
  // next step, then the overlay tools, all as aligned rows and cards (one
  // primary button: the main roll). Status sits beside them: the last roll,
  // the lobby and activity.
  const controlRoom = (
    <div className="hub-control">
      {session.grace_period_expires_at && (
        <Alert variant="warning" title="Your stream went offline">
          The session ends on its own <Countdown to={session.grace_period_expires_at} /> unless you go live again.
        </Alert>
      )}
      <div className="hub-control__grid">
        <div className="hub-control__main">
          <GameRolls
            key={gameActions?.slug ?? "queue"}
            sessionId={session.id}
            actions={gameActions}
            rawRaceConfig={rawRaceConfig}
            legacyDefaultSlug={configuredGamesList[0]}
          />
          <RunningNow sessionSlug={session.slug} liveSlug={liveSlug} actions={gameActions} />
          <HubToolsRun slug={session.slug} />
        </div>
        <aside className="hub-control__side">
          <LastRoll />
          <section className="hub-panel" aria-labelledby="hub-lobby">
            <div className="hub-panel__head">
              <h2 id="hub-lobby" className="hub-panel__title">Lobby <span className="hub-page__group-count">{viewersInLobby}</span></h2>
              <Link className="hub-panel__link" href={`/hub/sessions/${session.slug}?tab=lobby`}>Manage</Link>
            </div>
            <div className="hub-control__lobby" tabIndex={0} role="region" aria-label="Who's in the lobby">{lobbyList}</div>
          </section>
          <section className="hub-panel" aria-labelledby="hub-activity">
            <h2 id="hub-activity" className="hub-panel__title">Activity</h2>
            <RealtimeActivityFeed
              sessionId={session.id}
              initialEvents={serializeEvents(events)}
              limit={6}
              viewAllHref={`/hub/sessions/${session.slug}?tab=activity`}
            />
          </section>
        </aside>
      </div>
    </div>
  );

  const lobbyTab = (
    <div className="hub-lobby">
      <section className="hub-panel" aria-labelledby="hub-lobby-all">
        <h2 id="hub-lobby-all" className="hub-panel__title">Who&rsquo;s in <span className="hub-page__group-count">{viewersInLobby}</span></h2>
        {lobbyList}
      </section>
      <div className="hub-lobby__side">
        <PublicLobbySurface initial={lobbyConnection} sessionId={session.id} initialPublicLobby={(session.feature_flags?.public_lobby as boolean | null | undefined) ?? null} />
        <section className="hub-panel" aria-labelledby="hub-lobby-chat">
          <h2 id="hub-lobby-chat" className="hub-panel__title">From chat</h2>
          <ul className="hub-lobby__commands">
            <li><code>!gs-join</code> / <code>!gs-leave</code> get in and out</li>
            {gameActions && <li><code>!gs-shuffle</code> rolls a viewer their own {gameActions.noun}</li>}
            <li><code>!gs-lobby</code> lists who&rsquo;s in</li>
            <li><code>!gs-kick @name</code> and <code>!gs-clear</code> for you and your mods</li>
          </ul>
        </section>
      </div>
    </div>
  );

  let tabs: SessionDetailTabDef[];
  if (phase === "plan") {
    tabs = [
      { id: "configure", label: "Plan", content: <div className="hub-plan"><PlanChecklist session={session} games={configuredGamesList} hasDiscord={!!discordServer} tz={tz} />{configureContent}</div> },
      { id: "modules", label: "Games", content: gamesContent },
    ];
  } else if (phase === "live") {
    // Just in time: Picks & bans only for a game that has it, and the
    // predictions tab says Bounties where there are no prediction markets.
    tabs = [
      { id: "overview", label: "Control room", content: controlRoom },
      { id: "lobby", label: "Lobby", badge: viewersInLobby, content: lobbyTab },
      ...(gameActions?.race
        ? [{
            id: "picks",
            label: "Picks & bans",
            content: (
              <DashboardLiveControls
                sessionId={session.id}
                sessionSlug={session.slug}
                initialActiveGameSlug={currentGame ?? (session.config?.game as string | null) ?? null}
                legacyDefaultSlug={configuredGamesList[0]}
                rawRaceConfig={rawRaceConfig}
                part="picks"
              />
            ),
          }]
        : []),
      { id: "live-games", label: "Live games", content: <LiveGamesPanel /> },
      ...(liveSlug
        ? [{
            id: "predictions",
            label: gameActions?.markets ? "Predictions" : "Bounties",
            content: (
              <div className="hub-predict">
                <div className="hub-predict__head">
                  <p className="hub-panel__empty">
                    {gameActions?.markets
                      ? "Chat bets tokens on how a race goes, and bounties pay whoever does something first."
                      : "Bounties pay tokens to whoever does something first."}{" "}
                    Same as running them from chat.
                  </p>
                  <TokenAllowanceBadge ownerUserId={session.owner_user_id} />
                </div>
                <SessionMarketsTab streamerSlug={liveSlug} ownerUserId={session.owner_user_id} markets={!!gameActions?.markets} />
              </div>
            ),
          }]
        : []),
      { id: "modules", label: "Games", content: gamesContent },
      { id: "activity", label: "Activity", content: activityContent },
      { id: "configure", label: "Settings", content: configureContent },
    ];
  } else {
    const recap = await loadSessionNumbers(session.id);
    tabs = [
      {
        id: "overview",
        label: "Recap",
        content: (
          <div className="hub-recap">
            <div className="hub-stats hub-stats--four">
              <div className="hub-stats__item"><span className="hub-stats__label">Viewers who played</span><span className="hub-stats__value">{recap.players}</span></div>
              <div className="hub-stats__item"><span className="hub-stats__label">Rolls</span><span className="hub-stats__value">{recap.rolls}</span></div>
              <div className="hub-stats__item"><span className="hub-stats__label">Picks and bans rounds</span><span className="hub-stats__value">{recap.rounds}</span></div>
              <div className="hub-stats__item"><span className="hub-stats__label">Ballots</span><span className="hub-stats__value">{recap.ballots}</span></div>
            </div>
            <section className="hub-panel" aria-labelledby="hub-recap-feed">
              <h2 id="hub-recap-feed" className="hub-panel__title">What happened</h2>
              <RealtimeActivityFeed sessionId={session.id} initialEvents={serializeEvents(events)} limit={10} viewAllHref={`/hub/sessions/${session.slug}?tab=activity`} />
            </section>
            {liveSlug && (
              <section className="hub-panel">
                <SessionMarketsTab streamerSlug={liveSlug} ownerUserId={session.owner_user_id} part="history" />
              </section>
            )}
          </div>
        ),
      },
      { id: "activity", label: "Activity", content: activityContent },
    ];
  }

  const isTest = !!session.feature_flags?.test_session;
  const extra = phase === "live"
    ? [currentGame ? `Playing ${getGameName(currentGame)}` : null, `${viewersInLobby} in the lobby`].filter(Boolean).join(" · ")
    : phase === "recap" && currentGame ? getGameName(currentGame) : null;

  return (
    <div className="hub-detail hub-session">
      <Breadcrumb
        items={[
          { label: "Stream hub", href: "/hub" },
          { label: session.name },
        ]}
        separator="chevron"
      />

      <header className="hub-session__head">
        <span className="hub-session__cover">{currentGame && <GameCover slug={currentGame} name={getGameName(currentGame)} />}</span>
        <div className="hub-session__titles">
          <h1 className="hub-detail__title">{session.name}{isTest && <span className="hub-rows__tag">Test</span>}</h1>
          <SessionStatusLine session={session} tz={tz} extra={extra} />
        </div>
        <div className="hub-detail__header-actions">
          {phase === "live" && liveSlug && (
            <>
              <Link href={`/live/${encodeURIComponent(liveSlug)}`} target="_blank" rel="noopener noreferrer" className="hub-detail__header-link-action">
                <Button variant="secondary">Live page ↗</Button>
              </Link>
              <Link href={`/mod/${encodeURIComponent(liveSlug)}`} target="_blank" rel="noopener noreferrer" className="hub-detail__header-link-action">
                <Button variant="secondary">Mod view ↗</Button>
              </Link>
            </>
          )}
          {phase !== "recap" && liveSlug && (
            <InviteButton kind="session" targetId={session.id} targetName={session.name} link={`/live/${liveSlug}`} label="Invite followers" />
          )}
          {phase === "recap" && session.status === "ended" && (
            <>
              <Link href={`/hub/sessions/${session.slug}/recap`} target="_blank" rel="noopener noreferrer" className="hub-detail__header-link-action">
                <Button variant="secondary">Public recap ↗</Button>
              </Link>
              <AiRecapButton target={{ kind: "stream", sessionId: session.id }} link={`${getBaseUrl()}/hub/sessions/${session.slug}/recap`} size="medium" />
            </>
          )}
          <SessionActions session={session} blockingEndingEnableAt={blockingEndingEnableAt} />
        </div>
      </header>

      {setupAlert}

      {phase === "live" ? (
        <HubLiveProvider sessionId={session.id} renderedGame={currentGame}>
          <SessionDetailTabs tabs={tabs} initialTab={activeTab} />
        </HubLiveProvider>
      ) : (
        <SessionDetailTabs tabs={tabs} initialTab={activeTab} />
      )}
    </div>
  );
}

/** Before a stream: what's set, what isn't, at a glance. */
function PlanChecklist({ session, games, hasDiscord, tz }: { session: GsSession; games: string[]; hasDiscord: boolean; tz: string | null }) {
  const steps: { done: boolean; title: string; detail: string }[] = [
    { done: true, title: "Name", detail: session.name },
    { done: games.length > 0, title: "Games", detail: games.length ? games.map(getGameName).join(", ") : "Pick what you'll play, or leave it empty for a viewer queue" },
    { done: !!session.scheduled_at, title: "When", detail: session.scheduled_at ? formatEventShort(session.scheduled_at, tz) : "Start it by hand, or schedule it so it opens and announces itself" },
    { done: hasDiscord, title: "Announce", detail: hasDiscord ? "Twitch chat and your Discord server" : "Twitch chat (connect Discord in Setup to post there too)" },
  ];
  return (
    <ol className="hub-plan__steps" aria-label="Before you go live">
      {steps.map((st, i) => (
        <li key={st.title} className={st.done ? "is-done" : ""}>
          <span className="hub-plan__n" aria-hidden="true">{st.done ? "✓" : i + 1}</span>
          <span><strong>{st.title}</strong> {st.detail}</span>
        </li>
      ))}
    </ol>
  );
}

/** A finished stream in numbers. */
async function loadSessionNumbers(sessionId: string): Promise<{ players: number; rolls: number; rounds: number; ballots: number }> {
  const admin = createServiceClient();
  const [{ count: players }, { count: rolls }, { data: rounds }] = await Promise.all([
    admin.from("session_participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("is_broadcaster", false),
    admin.from("session_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId).in("event_type", ["shuffle", "race_randomized"]),
    admin.from("session_picks_bans_rounds").select("id").eq("session_id", sessionId),
  ]);
  const roundIds = ((rounds ?? []) as { id: string }[]).map((r) => r.id);
  let ballots = 0;
  if (roundIds.length) {
    const { count } = await admin.from("session_picks_bans_ballots").select("id", { count: "exact", head: true }).in("round_id", roundIds);
    ballots = count ?? 0;
  }
  return { players: players ?? 0, rolls: rolls ?? 0, rounds: roundIds.length, ballots };
}

// Serializers: Realtime + ActivityFeed are client components, so the props
// must be plain serializable values.
function serializeParticipants(rows: ParticipantRow[]): ParticipantRow[] {
  return rows.map((row) => ({ ...row }));
}

function serializeEvents(rows: SessionEventRow[]): SessionEventRow[] {
  return rows.map((row) => ({ ...row }));
}
