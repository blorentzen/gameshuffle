/**
 * Persistent status strip — sits between the session header and the tabs
 * so the streamer always sees the session's lifecycle context (status,
 * timing). The Current Category chip lives in the header alongside the
 * title and badges (no longer in the strip) — keeping IA tight: this
 * strip is purely about "what state is the session in?"
 */
import { Badge } from "@empac/cascadeds";
import { statusLabel, type GsSession, type SessionStatus } from "@/lib/sessions/types";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { Countdown } from "@/components/hub/Countdown";

interface SessionStatusStripProps {
  session: GsSession;
}

export function SessionStatusStrip({ session }: SessionStatusStripProps) {
  const inGrace = !!session.grace_period_expires_at;
  return (
    <div
      className={`hub-detail__status-strip hub-detail__status-strip--${session.status}${
        inGrace ? " hub-detail__status-strip--grace" : ""
      }`}
      role="status"
    >
      <Badge
        variant={badgeVariant(session.status)}
        size="small"
        className="hub-detail__status-strip-badge"
      >
        {statusLabel(session.status)}
      </Badge>
      <span className="hub-detail__status-strip-text">
        <StatusCopy session={session} />
      </span>
    </div>
  );
}

function badgeVariant(
  status: SessionStatus
): "success" | "warning" | "error" | "info" | "default" {
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

function StatusCopy({ session }: { session: GsSession }) {
  switch (session.status) {
    case "draft":
      return (
        <>
          Created {formatRelativeTime(session.created_at)} · activate when ready
        </>
      );
    case "scheduled": {
      const windowHours = session.scheduled_eligibility_window_hours ?? 4;
      const windowOpensAt = session.scheduled_at
        ? new Date(
            Date.parse(session.scheduled_at) - windowHours * 3600_000
          ).toISOString()
        : null;
      return (
        <>
          Scheduled for{" "}
          <strong>
            {session.scheduled_at
              ? new Date(session.scheduled_at).toLocaleString()
              : "—"}
          </strong>
          {" · "}
          window opens <Countdown to={windowOpensAt} />
        </>
      );
    }
    case "ready": {
      const windowHours = session.scheduled_eligibility_window_hours ?? 4;
      const windowClosesAt = session.scheduled_at
        ? new Date(
            Date.parse(session.scheduled_at) + windowHours * 3600_000
          ).toISOString()
        : null;
      return (
        <>
          Eligibility window open · closes <Countdown to={windowClosesAt} />
        </>
      );
    }
    case "active": {
      if (session.grace_period_expires_at) {
        return (
          <>
            Stream offline · grace ends{" "}
            <Countdown to={session.grace_period_expires_at} />
          </>
        );
      }
      const startedRel = formatRelativeTime(session.activated_at);
      return (
        <>
          Started {startedRel}
          {session.auto_timeout_at && (
            <>
              {" · "}auto-end <Countdown to={session.auto_timeout_at} />
            </>
          )}
        </>
      );
    }
    case "ending":
      return <>Wrapping up · recap will post to chat when complete</>;
    case "ended": {
      const durationSeconds =
        session.activated_at && session.ended_at
          ? Math.max(
              0,
              Math.floor(
                (Date.parse(session.ended_at) -
                  Date.parse(session.activated_at)) /
                  1000
              )
            )
          : null;
      return (
        <>
          Ended {formatRelativeTime(session.ended_at)}
          {durationSeconds !== null && (
            <> · lasted {formatDuration(durationSeconds)}</>
          )}
        </>
      );
    }
    case "cancelled":
      return (
        <>
          Cancelled {formatRelativeTime(session.ended_at ?? session.updated_at)}
        </>
      );
  }
}
