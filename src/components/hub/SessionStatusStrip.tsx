/**
 * The session's status in one line under its title: a badge, then what the
 * state means right now (when it starts, how long it's been live, when it
 * ended). Times use the streamer's profile timezone. Replaced the full-width
 * strip that repeated what the header and "At a glance" already said
 * (2026-10-10).
 */
import { Badge } from "@empac/cascadeds";
import { statusLabel, type GsSession, type SessionStatus } from "@/lib/sessions/types";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { formatEventShort } from "@/lib/time/format";
import { Countdown } from "@/components/hub/Countdown";

export function SessionStatusLine({ session, tz, extra }: {
  session: GsSession;
  tz: string | null;
  /** Shown after the status copy, e.g. "Playing Mario Kart World · 7 in the lobby". */
  extra?: string | null;
}) {
  const inGrace = !!session.grace_period_expires_at;
  return (
    <p className={`hub-session__status hub-session__status--${session.status}${inGrace ? " is-grace" : ""}`} role="status">
      <Badge variant={badgeVariant(session.status)} size="small">
        {session.status === "active" ? "Live" : statusLabel(session.status)}
      </Badge>
      <span>
        <StatusCopy session={session} tz={tz} />
        {extra ? <> · {extra}</> : null}
      </span>
    </p>
  );
}

function badgeVariant(status: SessionStatus): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "ending":
      return "warning";
    case "cancelled":
      return "error";
    case "scheduled":
    case "ready":
      return "info";
    default:
      return "default";
  }
}

const span = (from: string | null, to: string | null) => {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
};

/** How long a live session has run; a session left open for days reads better as a date. */
function liveFor(session: GsSession, tz: string | null): string {
  if (!session.activated_at) return "Started just now";
  const secs = span(session.activated_at, new Date().toISOString());
  if (secs === null) return "Started just now";
  if (secs > 12 * 3600) return `Live since ${formatEventShort(session.activated_at, tz).split(" · ")[0]}`;
  return `Live for ${formatDuration(secs)}`;
}

function StatusCopy({ session, tz }: { session: GsSession; tz: string | null }) {
  switch (session.status) {
    case "draft":
      return <>Not scheduled · start it whenever you&apos;re ready</>;
    case "scheduled": {
      const windowHours = session.scheduled_eligibility_window_hours ?? 4;
      const windowOpensAt = session.scheduled_at
        ? new Date(Date.parse(session.scheduled_at) - windowHours * 3600_000).toISOString()
        : null;
      const mode = session.open_mode === "auto_open"
        ? "opens on its own"
        : session.open_mode === "announce_only"
          ? "announces on Discord"
          : null;
      return (
        <>
          {session.scheduled_at ? formatEventShort(session.scheduled_at, tz) : "Scheduled"}
          {" · "}you can start it <Countdown to={windowOpensAt} />
          {mode && <> · {mode}</>}
        </>
      );
    }
    case "ready": {
      const windowHours = session.scheduled_eligibility_window_hours ?? 4;
      const windowClosesAt = session.scheduled_at
        ? new Date(Date.parse(session.scheduled_at) + windowHours * 3600_000).toISOString()
        : null;
      return <>Ready to start · the window closes <Countdown to={windowClosesAt} /></>;
    }
    case "active": {
      if (session.grace_period_expires_at) {
        return <>Stream offline · the session ends <Countdown to={session.grace_period_expires_at} /> unless you&apos;re back</>;
      }
      return <>{liveFor(session, tz)}</>;
    }
    case "ending":
      return <>Wrapping up · the recap posts to chat when it&apos;s done</>;
    case "ended": {
      const secs = span(session.activated_at, session.ended_at);
      return (
        <>
          Ended {session.ended_at ? formatEventShort(session.ended_at, tz).split(" · ")[0] : formatRelativeTime(session.ended_at)}
          {secs !== null && <> · {formatDuration(secs)}</>}
        </>
      );
    }
    case "cancelled":
      return <>Cancelled {formatRelativeTime(session.ended_at ?? session.updated_at)}</>;
  }
}
