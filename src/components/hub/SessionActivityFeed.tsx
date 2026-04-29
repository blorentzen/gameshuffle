"use client";

/**
 * Renders session events as an activity feed. CDS `<ActivityFeed />`
 * primitive (per CDS inventory §A) handles the visual chrome; this
 * component owns the event-type → display mapping.
 *
 * Per gs-pro-v1-phase-4a-spec.md §5.2 (active state) + §5.1.4 (detail
 * page activity feed).
 *
 * The CDS ActivityItemData shape is `{ user, action, target?, timestamp,
 * type? }` — modeled around "X did Y to Z". Session events shaped like
 * "stream.online" or "wrap_up_complete" map to a synthetic "GameShuffle"
 * actor for system events and the actual viewer for participant events.
 */

import {
  ActivityFeed,
  type ActivityItemData,
} from "@empac/cascadeds";
import { formatRelativeTime } from "@/lib/time/relative";
import type { SessionEventRow } from "@/lib/sessions/queries";

interface SessionActivityFeedProps {
  events: SessionEventRow[];
}

const SYSTEM_ACTOR = { name: "GameShuffle", initials: "GS" } as const;

export function SessionActivityFeed({ events }: SessionActivityFeedProps) {
  const items: ActivityItemData[] = events
    .map(eventToActivityItem)
    .filter((item): item is ActivityItemData => item !== null);

  return (
    <ActivityFeed
      items={items}
      showTimestamps
      showDividers
      emptyState={
        <div>
          <strong>No activity yet</strong>
          <div>Session events appear here as they happen.</div>
        </div>
      }
    />
  );
}

function eventToActivityItem(event: SessionEventRow): ActivityItemData | null {
  const summary = describeEvent(event);
  if (!summary) return null;
  return {
    id: event.id,
    user: summary.user,
    action: summary.action,
    target: summary.target,
    timestamp: formatRelativeTime(event.created_at),
    type: summary.type,
  };
}

interface EventSummary {
  user: { name: string; initials?: string; avatar?: string };
  action: string;
  target?: string;
  type?: ActivityItemData["type"];
}

function describeEvent(event: SessionEventRow): EventSummary | null {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case "shuffle": {
      const name =
        (p.twitch_display_name as string) ??
        (p.display_name as string) ??
        "viewer";
      const combo = p.combo as
        | {
            character?: { name: string };
            vehicle?: { name: string };
            wheels?: { name: string };
            glider?: { name: string };
          }
        | undefined;
      const parts = [
        combo?.character?.name,
        combo?.vehicle?.name,
        combo?.wheels?.name,
        combo?.glider?.name,
      ].filter((s): s is string => !!s && s !== "N/A");
      return {
        user: { name, initials: initialsFor(name) },
        action: "rolled a combo",
        target: parts.length > 0 ? parts.join(" · ") : undefined,
        type: "create",
      };
    }
    case "participant_join": {
      const name = (p.display_name as string) ?? "viewer";
      return {
        user: { name, initials: initialsFor(name) },
        action: "joined the lobby",
        type: "create",
      };
    }
    case "participant_leave": {
      const name = (p.display_name as string) ?? "viewer";
      const reason = p.left_reason as string | undefined;
      return {
        user: { name, initials: initialsFor(name) },
        action: "left the lobby",
        target: reason,
        type: "delete",
      };
    }
    case "state_change": {
      const from = p.from as string | null;
      const to = p.to as string | null;
      if (!to) return null;
      return {
        user: SYSTEM_ACTOR,
        action: from ? "transitioned the session" : "set session state to",
        target: from ? `${from} → ${to}` : to,
        type: "edit",
      };
    }
    case "grace_period_started":
      return {
        user: SYSTEM_ACTOR,
        action: "started a grace period",
        target: "stream went offline",
        type: "edit",
      };
    case "grace_period_cancelled":
      return {
        user: SYSTEM_ACTOR,
        action: "cancelled the grace period",
        target: "stream came back online",
        type: "complete",
      };
    case "auto_timeout_triggered":
      return {
        user: SYSTEM_ACTOR,
        action: "ended the session automatically",
        type: "complete",
      };
    case "wrap_up_started":
      return {
        user: SYSTEM_ACTOR,
        action: "started wrap-up",
        type: "edit",
      };
    case "wrap_up_complete":
      return {
        user: SYSTEM_ACTOR,
        action: "completed wrap-up",
        type: "complete",
      };
    case "recap_ready": {
      const count = p.shuffle_count as number | undefined;
      const duration = p.duration_seconds as number | undefined;
      return {
        user: SYSTEM_ACTOR,
        action: "posted the recap",
        target:
          count !== undefined && duration !== undefined
            ? `${count} shuffles, ${Math.round(duration / 60)}m`
            : undefined,
        type: "share",
      };
    }
    case "inactive_notification_sent":
      return {
        user: SYSTEM_ACTOR,
        action: "sent an inactive notification",
        target: (p.level as string | undefined) ?? undefined,
        type: "edit",
      };
    case "adapter_call":
    case "adapter_call_failed":
      // Internal audit — not surfaced to user.
      return null;
    default:
      return null;
  }
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}
