/**
 * /hub/sessions/[slug] — session detail page.
 *
 * Per gs-pro-v1-phase-4a-spec.md §5. Server-rendered shell with state-
 * specific main panels; the active state delegates to a client component
 * for real-time updates via Supabase channels.
 *
 * All platform data is read through the adapter abstraction
 * (gs-pro-v1-phase-3a-spec.md). Components do not parse `platforms`
 * JSONB directly.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Breadcrumb, Button, Card } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { getSessionBySlug } from "@/lib/sessions/service";
import { listSessionEvents, listActiveParticipants } from "@/lib/sessions/queries";
import { getAllAdaptersForSession } from "@/lib/adapters/dispatcher";
import type { ConnectionHealth, StreamStatusResult } from "@/lib/adapters/types";
import { type GsSession } from "@/lib/sessions/types";
import { WRAP_UP_DURATION_MS } from "@/lib/sessions/constants";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { Countdown } from "@/components/hub/Countdown";
import { InviteButton } from "@/components/social/InviteButton";
import { SessionActions } from "@/components/hub/SessionActions";
import { WheelControl } from "@/components/hub/WheelControl";
import { RealtimeActivityFeed } from "@/components/hub/RealtimeActivityFeed";
import { PlatformBadge } from "@/components/hub/PlatformBadge";
import { SessionDetailTabs, type SessionDetailTabDef } from "@/components/hub/SessionDetailTabs";
import { SessionStatusStrip } from "@/components/hub/SessionStatusStrip";
import { UserAvatar, type UserAvatarUser } from "@/components/UserAvatar";
import { getGameArtwork } from "@/lib/games/artwork";

type SessionHeaderAvatarUser = UserAvatarUser;
import { SessionConfigureTab } from "@/components/hub/tabs/SessionConfigureTab";
import { SessionModulesTab } from "@/components/hub/tabs/SessionModulesTab";
import { DashboardLiveControls } from "@/components/hub/DashboardLiveControls";
import { SessionRedemptionsTab } from "@/components/hub/tabs/SessionRedemptionsTab";
import { SessionViewersTab } from "@/components/hub/tabs/SessionViewersTab";
import { SessionMarketsTab } from "@/components/hub/tabs/SessionMarketsTab";
import type { SessionEventRow, ParticipantRow } from "@/lib/sessions/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type DetailTabId =
  | "overview"
  | "configure"
  | "modules"
  | "viewers"
  | "redemptions"
  | "activity";

const DEFAULT_TAB: DetailTabId = "overview";

function parseActiveTab(raw: string | undefined): DetailTabId {
  if (
    raw === "overview" ||
    raw === "configure" ||
    raw === "modules" ||
    raw === "viewers" ||
    raw === "redemptions" ||
    raw === "activity"
  ) {
    return raw;
  }
  return DEFAULT_TAB;
}

export const metadata: Metadata = {
  title: "Session",
  robots: { index: false, follow: false },
};

interface PlatformConnectionCard {
  platform: "twitch" | "discord" | "youtube" | "kick";
  health: ConnectionHealth;
  streamStatus: StreamStatusResult | null;
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = parseActiveTab(tabParam);
  await requireHubAccess(`/hub/sessions/${slug}`);
  const session = await getSessionBySlug(slug);
  if (!session) notFound();

  // Verify ownership. Layout already gated on hub.access; here we ensure
  // the session belongs to the requesting user (or staff). RLS would
  // also catch this for reads but we want a deliberate 404 instead of a
  // silent empty page.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (session.owner_user_id !== user.id) {
    // Staff impersonation could legitimately view; check via the same
    // pattern the layout uses. For Phase 4A we keep it simple — if not
    // the owner, the staff role check we already passed at the layer
    // is enough. (Layout's `hasCapability(hub.access)` returns true for
    // staff regardless of impersonated tier.)
    // TODO Phase 4B: surface "viewing as another user's session" UI.
    notFound();
  }

  const adapters = await getAllAdaptersForSession(session.id);
  const platformCards: PlatformConnectionCard[] = await Promise.all(
    adapters.map(async (adapter) => ({
      platform: adapter.platform,
      health: await adapter.validateConnection().catch(
        () => ({
          healthy: false as const,
          reason: "Adapter health check threw — see logs.",
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

  // Bundle the per-tab queries with the existing live-slug lookup so
  // the page's data fetch stays in one round trip. Each is independent
  // of the others; Promise.all keeps them parallel.
  const admin = createServiceClient();
  const [
    { data: profile },
    { data: connectionRow },
    { data: raceRow },
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "username, twitch_username, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, discord_guild_id, socials"
      )
      .eq("id", session.owner_user_id)
      .maybeSingle(),
    admin
      .from("twitch_connections")
      .select(
        "id, twitch_login, twitch_display_name, public_lobby_enabled, channel_points_enabled, channel_point_cost, channel_point_reward_id"
      )
      .eq("user_id", session.owner_user_id)
      .maybeSingle(),
    admin
      .from("session_modules")
      .select("config, enabled")
      .eq("session_id", session.id)
      .eq("module_id", "race_randomizer")
      .maybeSingle(),
  ]);

  // Live-view slug — username first (canonical custom slug), then
  // twitch_username fallback.
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

  // Lazy-seed per-game race_randomizer slices from templates so the
  // chat commands (!gs-race / !gs-track / etc.) always find a config
  // for whatever game the streamer pivots to. Idempotent — existing
  // slices are preserved. Best-effort: errors are logged inside.
  // After seeding, re-read the row so the UI hydrates against the
  // freshly-written config.
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
  const raceSessionLive =
    session.status === "active" || session.status === "ending";

  // Phase 4B — when this session is a draft and a sibling session is
  // still wrapping up (status='ending'), the user can't activate until
  // the wrap-up completes. Compute the enable timestamp so the action
  // button can render a countdown.
  let blockingEndingEnableAt: string | null = null;
  if (session.status === "draft" || session.status === "scheduled" || session.status === "ready") {
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

  const isActive = session.status === "active" || session.status === "ending";
  const showRecapAction =
    session.status === "ended" || session.status === "cancelled";
  const showLiveAction = isActive && !!liveSlug;

  // Build tab contents. Each tab renders independently; CDS Tabs only
  // displays the active one's content but mounts all of them so realtime
  // subscriptions etc. wire up consistently. Performance is fine at this
  // surface area.
  const dashboardContent = (
    <div className="hub-detail__section-stack">
      {platformCards.length > 0 && (
        <section className="hub-detail__section">
          <h2 className="hub-detail__section-title">Platform connections</h2>
          <div className="hub-detail__platform-grid">
            {platformCards.map((card) => (
              <PlatformCard key={card.platform} card={card} />
            ))}
          </div>
        </section>
      )}
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">
          {showRecapAction ? "Wrap-up summary" : "At a glance"}
        </h2>
        <StateSpecificPanel session={session} participants={participants} />
      </section>

      {/* Live-only controls — manual roll, picks/bans round lifecycle,
          ballot picker, apply editor. Hidden when the session isn't
          active/ending so draft/scheduled/ended views stay focused on
          "at a glance" + recap. Configuration of the same modules
          lives on the Modules tab (surface="config").
          Scoped to a SINGLE game — whichever the streamer is currently
          playing — to keep the Dashboard focused on the moment. Other
          configured games' setup stays on Modules. */}
      {raceSessionLive && (
        <DashboardLiveControls
          sessionId={session.id}
          sessionSlug={session.slug}
          initialActiveGameSlug={
            session.active_game ??
            configuredGamesList[0] ??
            (session.config?.game as string | null) ??
            null
          }
          legacyDefaultSlug={configuredGamesList[0]}
          rawRaceConfig={rawRaceConfig}
        />
      )}

      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Recent activity</h2>
        <RealtimeActivityFeed
          sessionId={session.id}
          initialEvents={serializeEvents(events)}
          limit={10}
          viewAllHref={`/hub/sessions/${session.slug}?tab=activity`}
        />
      </section>
      {liveSlug ? (
        <section className="hub-detail__section">
          <InviteButton
            kind="session"
            targetId={session.id}
            targetName={session.name}
            link={`/live/${liveSlug}`}
            label="Invite followers"
          />
        </section>
      ) : null}
      <SessionMetadata session={session} liveSlug={liveSlug} />
    </div>
  );

  const configureContent = (
    <SessionConfigureTab
      slug={session.slug}
      status={session.status}
      initial={{
        name: session.name,
        description: session.description ?? null,
        configuredGames:
          Array.isArray(session.configured_games) &&
          session.configured_games.length > 0
            ? session.configured_games
            : session.config?.game
              ? [session.config.game]
              : [],
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
      connection={
        connectionRow
          ? {
              publicLobbyEnabled:
                (connectionRow.public_lobby_enabled as boolean | null) !== false,
              channelPointsEnabled: !!connectionRow.channel_points_enabled,
              channelPointCost:
                (connectionRow.channel_point_cost as number | null) ?? 500,
              channelPointRewardId:
                (connectionRow.channel_point_reward_id as string | null) ?? null,
            }
          : null
      }
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

  // Discord routing health for the Race Setup "Share via Discord"
  // option — the radio is only selectable when both pieces are in
  // place. Read here so the gate is server-truth (rather than a
  // client probe that might race the connection state).
  const profileSocials =
    (profile?.socials as { discord_invite?: string } | null) ?? {};
  const discordInviteUrl =
    typeof profileSocials.discord_invite === "string" &&
    profileSocials.discord_invite.trim().length > 0
      ? profileSocials.discord_invite.trim()
      : null;
  const discordShareAvailable = !!(
    profile?.discord_guild_id && discordInviteUrl
  );

  const modulesContent = (
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

  const redemptionsContent = (
    <SessionRedemptionsTab
      connection={
        connectionRow
          ? {
              publicLobbyEnabled:
                (connectionRow.public_lobby_enabled as boolean | null) !== false,
              channelPointsEnabled: !!connectionRow.channel_points_enabled,
              channelPointCost:
                (connectionRow.channel_point_cost as number | null) ?? 500,
              channelPointRewardId:
                (connectionRow.channel_point_reward_id as string | null) ?? null,
            }
          : null
      }
    />
  );

  const viewersPhase: "pre" | "live" | "post" = isActive
    ? "live"
    : session.status === "ended" || session.status === "cancelled"
      ? "post"
      : "pre";
  const viewersContent = (
    <SessionViewersTab
      sessionId={session.id}
      initialParticipants={serializeParticipants(participants)}
      phase={viewersPhase}
    />
  );

  const activityContent = (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Full activity</h2>
      <RealtimeActivityFeed
        sessionId={session.id}
        initialEvents={serializeEvents(events)}
      />
    </section>
  );

  const marketsContent = (
    <section className="hub-detail__section">
      {liveSlug ? (
        <SessionMarketsTab
          streamerSlug={liveSlug}
          ownerUserId={session.owner_user_id}
        />
      ) : (
        <p>Markets need a public slug. Set a username under /account first.</p>
      )}
    </section>
  );

  const tabs: SessionDetailTabDef[] = [
    // URL id stays "overview" so any pre-existing deep links / bookmarks
    // keep landing on the right tab. Label is the rename to "Dashboard"
    // per the UX redesign — see /hub UX brief 2026-05-15.
    { id: "overview", label: "Dashboard", content: dashboardContent },
    { id: "activity", label: "Activity", content: activityContent },
    { id: "modules", label: "Modules", content: modulesContent },
    { id: "markets", label: "Markets", content: marketsContent },
    {
      id: "viewers",
      label: "Viewers",
      content: viewersContent,
      badge: participants.filter((p) => !p.is_broadcaster).length || undefined,
    },
    { id: "redemptions", label: "Redemptions", content: redemptionsContent },
    { id: "configure", label: "Settings", content: configureContent },
  ];

  return (
    <div className="hub-detail">
      <Breadcrumb
        items={[
          { label: "Hub", href: "/hub" },
          { label: session.name },
        ]}
        separator="chevron"
      />

      <SessionHeader
        session={session}
        blockingEndingEnableAt={blockingEndingEnableAt}
        liveSlug={showLiveAction ? liveSlug : null}
        showRecapLink={showRecapAction}
        avatarUser={{
          id: session.owner_user_id,
          avatar_source:
            (profile?.avatar_source as
              | "initials"
              | "dicebear"
              | "twitch"
              | "discord"
              | undefined) ?? "dicebear",
          avatar_seed: (profile?.avatar_seed as string | null) ?? null,
          avatar_options:
            (profile?.avatar_options as Record<string, string> | null) ?? null,
          twitch_avatar: (profile?.twitch_avatar as string | null) ?? null,
          discord_avatar: (profile?.discord_avatar as string | null) ?? null,
        }}
      />

      <SessionStatusStrip session={session} />

      <SessionDetailTabs tabs={tabs} initialTab={activeTab} />
    </div>
  );
}

function SessionHeader({
  session,
  blockingEndingEnableAt,
  liveSlug,
  showRecapLink,
  avatarUser,
}: {
  session: GsSession;
  blockingEndingEnableAt: string | null;
  /** Live-view slug for the action row link. Null when the session
   *  isn't active/ending or the streamer has no resolvable slug. */
  liveSlug: string | null;
  showRecapLink: boolean;
  /** Streamer's avatar identity. The header thumbnail is the streamer's
   *  avatar (DiceBear/Twitch/Discord) — not game artwork. Future:
   *  `session.config.custom_event_image_url` overrides when a streamer
   *  uploads a session-specific event banner (upload UI deferred). */
  avatarUser: SessionHeaderAvatarUser;
}) {
  const isTest = !!session.feature_flags?.test_session;
  const isLive = session.status === "active" || session.status === "ending";
  // Custom event image override (future upload feature). For now this is
  // always undefined; the slot exists so when the upload lands we only
  // need to wire the upload UI, not the read path.
  const customEventImageUrl =
    typeof session.config?.custom_event_image_url === "string"
      ? (session.config.custom_event_image_url as string)
      : null;
  const categoryEntry = isLive ? getGameArtwork(session.active_game) : null;
  return (
    <header className="hub-detail__header">
      <div className="hub-detail__header-artwork">
        {customEventImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={customEventImageUrl}
            alt=""
            className="hub-detail__header-event-image"
            loading="lazy"
          />
        ) : (
          <UserAvatar user={avatarUser} size={56} alt="" />
        )}
      </div>
      <div className="hub-detail__header-main">
        <h1 className="hub-detail__title">{session.name}</h1>
        <div className="hub-detail__header-badges">
          {isTest && <Badge variant="info" size="small">Test session</Badge>}
          {categoryEntry && (
            <span className="hub-detail__header-category">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={categoryEntry.artworkUrl}
                alt=""
                className="hub-detail__header-category-art"
                loading="lazy"
              />
              <span className="hub-detail__header-category-meta">
                <span className="hub-detail__header-category-label">
                  Current Category
                </span>
                <span className="hub-detail__header-category-name">
                  {categoryEntry.name}
                </span>
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="hub-detail__header-actions">
        <SessionActions
          session={session}
          blockingEndingEnableAt={blockingEndingEnableAt}
        />
        <WheelControl />
        {liveSlug && (
          <Link
            href={`/live/${encodeURIComponent(liveSlug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hub-detail__header-link-action"
          >
            <Button variant="secondary">Live view ↗</Button>
          </Link>
        )}
        {/* Mod view — same surface the streamer's active mods see, useful
         *  for previewing setup + operating tools mid-stream. Auto-grants
         *  access on /mod/[slug] when caller is the streamer themselves. */}
        {liveSlug && (
          <Link
            href={`/mod/${encodeURIComponent(liveSlug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hub-detail__header-link-action"
          >
            <Button variant="secondary">Mod view ↗</Button>
          </Link>
        )}
        {showRecapLink && (
          <Link
            href={`/hub/sessions/${session.slug}/recap`}
            className="hub-detail__header-link-action"
          >
            <Button variant="secondary">Recap ↗</Button>
          </Link>
        )}
      </div>
    </header>
  );
}

function PlatformCard({ card }: { card: PlatformConnectionCard }) {
  return (
    <Card variant="outlined" padding="medium">
      <div className="hub-detail__platform-card">
        <div className="hub-detail__platform-card-header">
          <PlatformBadge platform={card.platform} />
          {card.health.healthy ? (
            <Badge variant="success" size="small">Connected</Badge>
          ) : (
            <Badge variant="warning" size="small">Needs attention</Badge>
          )}
        </div>
        {!card.health.healthy && (
          <p className="hub-detail__platform-card-reason">
            {card.health.reason}
          </p>
        )}
        {!card.health.healthy && card.health.userActionRequired && (
          <Link href="/account?tab=integrations">
            <Badge variant="info" size="small">Reconnect →</Badge>
          </Link>
        )}
        {card.streamStatus?.isLive && (
          <p className="hub-detail__platform-card-stream">
            <Badge variant="success" size="small">LIVE</Badge>
            {card.streamStatus.gameName ? ` ${card.streamStatus.gameName}` : ""}
          </p>
        )}
        {card.streamStatus && !card.streamStatus.isLive && (
          <p className="hub-detail__platform-card-stream hub-detail__platform-card-stream--offline">
            Offline
          </p>
        )}
      </div>
    </Card>
  );
}

function StateSpecificPanel({
  session,
  participants,
}: {
  session: GsSession;
  participants: ParticipantRow[];
}) {
  switch (session.status) {
    case "draft":
      return <DraftPanel session={session} />;
    case "scheduled":
      return <ScheduledPanel session={session} />;
    case "ready":
      return <ReadyPanel session={session} />;
    case "active":
      return (
        <ActivePanel session={session} participantCount={participants.length} />
      );
    case "ending":
      return <EndingPanel session={session} />;
    case "ended":
      return <EndedPanel session={session} />;
    case "cancelled":
      return <CancelledPanel session={session} />;
  }
}

function DraftPanel({ session }: { session: GsSession }) {
  return (
    <Card variant="flat" padding="medium">
      <p className="hub-detail__panel-text">
        Draft session — not yet activated. Use the activate action above
        to begin streaming behavior.
      </p>
      <p className="hub-detail__panel-meta">
        Created {formatRelativeTime(session.created_at)}.
      </p>
    </Card>
  );
}

function ScheduledPanel({ session }: { session: GsSession }) {
  const windowHours = session.scheduled_eligibility_window_hours ?? 4;
  const windowOpensAt = session.scheduled_at
    ? new Date(
        Date.parse(session.scheduled_at) - windowHours * 3600_000
      ).toISOString()
    : null;
  return (
    <Card variant="flat" padding="medium">
      <p className="hub-detail__panel-text">
        Scheduled for{" "}
        <strong>
          {session.scheduled_at
            ? new Date(session.scheduled_at).toLocaleString()
            : "—"}
        </strong>
        .
      </p>
      <p className="hub-detail__panel-meta">
        Eligibility window opens{" "}
        <strong>
          <Countdown to={windowOpensAt} />
        </strong>{" "}
        ({windowHours}h before / after the scheduled time).
      </p>
    </Card>
  );
}

function ReadyPanel({ session }: { session: GsSession }) {
  const windowHours = session.scheduled_eligibility_window_hours ?? 4;
  const windowClosesAt = session.scheduled_at
    ? new Date(
        Date.parse(session.scheduled_at) + windowHours * 3600_000
      ).toISOString()
    : null;
  return (
    <Card variant="flat" padding="medium">
      <Alert variant="info">
        Eligibility window is open — activate this session to start
        streaming behavior. Window closes{" "}
        <strong>
          <Countdown to={windowClosesAt} />
        </strong>
        .
      </Alert>
    </Card>
  );
}

function ActivePanel({
  session,
  participantCount,
}: {
  session: GsSession;
  participantCount: number;
}) {
  const inGrace = !!session.grace_period_expires_at;
  const autoTimeoutAt = session.auto_timeout_at;
  return (
    <Card variant="flat" padding="medium">
      <div className="hub-detail__active-grid">
        <div>
          <span className="hub-detail__stat-label">Participants</span>
          <span className="hub-detail__stat-value">{participantCount}</span>
        </div>
        <div>
          <span className="hub-detail__stat-label">Activated</span>
          <span className="hub-detail__stat-value">
            {formatRelativeTime(session.activated_at)}
          </span>
        </div>
        <div>
          <span className="hub-detail__stat-label">Auto-end</span>
          <span className="hub-detail__stat-value">
            <Countdown to={autoTimeoutAt} />
          </span>
        </div>
      </div>
      {inGrace && (
        <div className="hub-detail__grace-banner">
          <Alert variant="warning">
            Stream offline — grace period ends{" "}
            <strong>
              <Countdown to={session.grace_period_expires_at} />
            </strong>
            . Bring the stream back online to keep the session running.
          </Alert>
        </div>
      )}
    </Card>
  );
}

function EndingPanel({ session }: { session: GsSession }) {
  // Wrap-up runs on a 60s timer per Phase 2 constants. We don't expose the
  // exact wrap-up start to the client, so render a simple "wrapping up"
  // indicator without a precise countdown.
  void session;
  return (
    <Card variant="flat" padding="medium">
      <Alert variant="info">
        Session is wrapping up. Recap will be posted to chat when complete.
        Read-only until the lifecycle sweep marks it ended.
      </Alert>
    </Card>
  );
}

function EndedPanel({ session }: { session: GsSession }) {
  const durationSeconds =
    session.activated_at && session.ended_at
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(session.ended_at) - Date.parse(session.activated_at)) / 1000
          )
        )
      : null;
  return (
    <Card variant="flat" padding="medium">
      <div className="hub-detail__active-grid">
        <div>
          <span className="hub-detail__stat-label">Ended</span>
          <span className="hub-detail__stat-value">
            {formatRelativeTime(session.ended_at)}
          </span>
        </div>
        <div>
          <span className="hub-detail__stat-label">Duration</span>
          <span className="hub-detail__stat-value">
            {durationSeconds !== null ? formatDuration(durationSeconds) : "—"}
          </span>
        </div>
        <div>
          <span className="hub-detail__stat-label">Ended via</span>
          <span className="hub-detail__stat-value">
            {session.ended_via ?? "—"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function CancelledPanel({ session }: { session: GsSession }) {
  return (
    <Card variant="flat" padding="medium">
      <p className="hub-detail__panel-text">
        Cancelled {formatRelativeTime(session.ended_at ?? session.updated_at)}.
        Use the restart action above to clone this session into a new draft.
      </p>
    </Card>
  );
}

function SessionMetadata({
  session,
  liveSlug,
}: {
  session: GsSession;
  liveSlug: string | null;
}) {
  // Public live URL — what viewers click to follow along (lobby +
  // shuffle feed). Only shown when the streamer has a slug we can
  // resolve (username or twitch_username); otherwise the link target
  // would 404, so render plain text.
  const liveHref = liveSlug ? `/live/${encodeURIComponent(liveSlug)}` : null;
  return (
    <footer className="hub-detail__metadata">
      <div>
        <span className="hub-detail__metadata-label">Slug</span>
        {liveHref ? (
          <Link
            href={liveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hub-detail__metadata-link"
            title="Open the public viewer page in a new tab"
          >
            <code>{session.slug}</code> ↗
          </Link>
        ) : (
          <code>{session.slug}</code>
        )}
      </div>
      <div>
        <span className="hub-detail__metadata-label">ID</span>
        <code>{session.id}</code>
      </div>
      <div>
        <span className="hub-detail__metadata-label">Created</span>
        <span>{formatRelativeTime(session.created_at)}</span>
      </div>
    </footer>
  );
}

// Serializers — Realtime + ActivityFeed are client components, so the props
// must be plain serializable values.
function serializeParticipants(rows: ParticipantRow[]): ParticipantRow[] {
  return rows.map((row) => ({ ...row }));
}

function serializeEvents(rows: SessionEventRow[]): SessionEventRow[] {
  return rows.map((row) => ({ ...row }));
}
