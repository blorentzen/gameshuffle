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
import { Alert, Badge, Breadcrumb, Card } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { getSessionBySlug } from "@/lib/sessions/service";
import { listSessionEvents, listActiveParticipants } from "@/lib/sessions/queries";
import { getAllAdaptersForSession } from "@/lib/adapters/dispatcher";
import type { ConnectionHealth, StreamStatusResult } from "@/lib/adapters/types";
import type { GsSession, SessionStatus } from "@/lib/sessions/types";
import { WRAP_UP_DURATION_MS } from "@/lib/sessions/constants";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { Countdown } from "@/components/hub/Countdown";
import { RealtimeSessionView } from "@/components/hub/RealtimeSessionView";
import { SessionActions } from "@/components/hub/SessionActions";
import { SessionActivityFeed } from "@/components/hub/SessionActivityFeed";
import { PlatformBadge } from "@/components/hub/PlatformBadge";
import type { SessionEventRow, ParticipantRow } from "@/lib/sessions/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
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

export default async function SessionDetailPage({ params }: PageProps) {
  const { slug } = await params;
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

  // Resolve the streamer's public slug for the "Live view" link in the
  // subnav. Mirrors /live/[streamer-slug] resolution: username first,
  // twitch_username fallback. Null when neither is set — link is hidden.
  let liveSlug: string | null = null;
  {
    const admin = createServiceClient();
    const { data: profile } = await admin
      .from("users")
      .select("username, twitch_username")
      .eq("id", session.owner_user_id)
      .maybeSingle();
    liveSlug =
      (profile?.username as string | null) ??
      (profile?.twitch_username as string | null) ??
      null;
  }

  // Phase 4B — when this session is a draft and a sibling session is
  // still wrapping up (status='ending'), the user can't activate until
  // the wrap-up completes. Compute the enable timestamp so the action
  // button can render a countdown.
  let blockingEndingEnableAt: string | null = null;
  if (session.status === "draft" || session.status === "scheduled" || session.status === "ready") {
    const admin = createServiceClient();
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
      />

      <SessionSubNav session={session} liveSlug={liveSlug} />

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
          {session.status === "ended" || session.status === "cancelled"
            ? "Recap"
            : "Status"}
        </h2>
        <StateSpecificPanel session={session} participants={participants} />
      </section>

      {isActive ? (
        <RealtimeSessionView
          sessionId={session.id}
          initialParticipants={serializeParticipants(participants)}
          initialEvents={serializeEvents(events)}
        />
      ) : (
        <section className="hub-detail__section">
          <h2 className="hub-detail__section-title">Activity</h2>
          <SessionActivityFeed events={serializeEvents(events)} />
        </section>
      )}

      <SessionMetadata session={session} />
    </div>
  );
}

function SessionSubNav({
  session,
  liveSlug,
}: {
  session: GsSession;
  liveSlug: string | null;
}) {
  const isLive = session.status === "active" || session.status === "ending";
  const showRecap = session.status === "ended" || session.status === "cancelled";
  return (
    <nav className="hub-detail__subnav">
      <Link
        href={`/hub/sessions/${session.slug}/configure`}
        className="hub-detail__subnav-link"
      >
        Configure
      </Link>
      {isLive && liveSlug && (
        <Link
          href={`/live/${encodeURIComponent(liveSlug)}`}
          className="hub-detail__subnav-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Live view ↗
        </Link>
      )}
      {showRecap && (
        <Link
          href={`/hub/sessions/${session.slug}/recap`}
          className="hub-detail__subnav-link"
        >
          Recap
        </Link>
      )}
    </nav>
  );
}

function SessionHeader({
  session,
  blockingEndingEnableAt,
}: {
  session: GsSession;
  blockingEndingEnableAt: string | null;
}) {
  const isTest = !!session.feature_flags?.test_session;
  return (
    <header className="hub-detail__header">
      <div className="hub-detail__header-main">
        <h1 className="hub-detail__title">{session.name}</h1>
        <div className="hub-detail__header-badges">
          <SessionStatusBadge status={session.status} />
          {isTest && <Badge variant="info" size="small">Test session</Badge>}
        </div>
      </div>
      <div className="hub-detail__header-actions">
        <SessionActions
          session={session}
          blockingEndingEnableAt={blockingEndingEnableAt}
        />
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

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const variant: "success" | "warning" | "error" | "info" | "default" =
    status === "active"
      ? "success"
      : status === "ending"
        ? "warning"
        : status === "cancelled"
          ? "error"
          : status === "scheduled" || status === "ready"
            ? "info"
            : "default";
  return (
    <Badge variant={variant} size="small">
      {status}
    </Badge>
  );
}

function SessionMetadata({ session }: { session: GsSession }) {
  return (
    <footer className="hub-detail__metadata">
      <div>
        <span className="hub-detail__metadata-label">Slug</span>
        <code>{session.slug}</code>
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
