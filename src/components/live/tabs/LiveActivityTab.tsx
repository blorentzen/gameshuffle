"use client";

/**
 * Activity tab — viewer-curated event feed. Per spec §7.
 *
 * Reuses Phase 4A's `<ActivityFeed />` primitive but with a viewer-
 * audience event filter: shows race/track/items randomizations,
 * shuffles (abbreviated), participant join/leave, and picks/bans.
 * Internal events (adapter_call, state_change, etc.) are filtered out
 * because they're not meaningful to viewers.
 */

import { useMemo } from "react";
import {
  ActivityFeed,
  type ActivityItemData,
} from "@empac/cascadeds";
import { formatRelativeTime } from "@/lib/time/relative";
import type { SessionEventRow } from "@/lib/sessions/queries";
import { useLiveState } from "../RealtimeLiveView";

const SYSTEM_ACTOR = { name: "GameShuffle", initials: "GS" } as const;

const VIEWER_VISIBLE_EVENTS = new Set([
  "race_randomized",
  "track_randomized",
  "items_randomized",
  "shuffle",
  "participant_join",
  "participant_leave",
]);

export function LiveActivityTab() {
  const live = useLiveState();

  const items: ActivityItemData[] = useMemo(() => {
    return live.events
      .filter((e) => VIEWER_VISIBLE_EVENTS.has(e.event_type))
      .map(eventToActivityItem)
      .filter((x): x is ActivityItemData => x !== null);
  }, [live.events]);

  return (
    <div className="live-tab">
      <ActivityFeed
        items={items}
        showTimestamps
        showDividers
        emptyState={
          <div>
            <strong>No activity yet</strong>
            <div>Events from this session will appear here as they happen.</div>
          </div>
        }
      />
    </div>
  );
}

function eventToActivityItem(event: SessionEventRow): ActivityItemData | null {
  const p = event.payload ?? {};
  const ts = formatRelativeTime(event.created_at);

  if (event.event_type === "race_randomized") {
    const seriesIdx = p.series_index as number | undefined;
    const seriesTotal = p.series_total as number | undefined;
    const trackName = (p.track_name as string | null) ?? null;
    const presetName = (p.preset_name as string | null) ?? null;
    const parts: string[] = [];
    if (trackName) parts.push(`🏁 ${trackName}`);
    if (presetName) parts.push(`🎯 ${presetName}`);
    const action =
      seriesIdx && seriesTotal && seriesTotal > 1
        ? `rolled race ${seriesIdx}/${seriesTotal}`
        : "rolled a race";
    return {
      id: event.id,
      user: SYSTEM_ACTOR,
      action,
      target: parts.join(" · ") || undefined,
      timestamp: ts,
      type: "complete",
    };
  }

  if (event.event_type === "track_randomized") {
    const trackName = (p.track_name as string | null) ?? "a track";
    return {
      id: event.id,
      user: SYSTEM_ACTOR,
      action: "rolled a track",
      target: `🏁 ${trackName}`,
      timestamp: ts,
      type: "create",
    };
  }

  if (event.event_type === "items_randomized") {
    const presetName = (p.preset_name as string | null) ?? "items";
    return {
      id: event.id,
      user: SYSTEM_ACTOR,
      action: "rolled item rules",
      target: `🎯 ${presetName}`,
      timestamp: ts,
      type: "create",
    };
  }

  if (event.event_type === "shuffle") {
    const name =
      (p.twitch_display_name as string | null) ??
      (p.display_name as string | null) ??
      "viewer";
    return {
      id: event.id,
      user: { name, initials: initialsFor(name) },
      action: "rolled a kart combo",
      timestamp: ts,
      type: "share",
    };
  }

  if (event.event_type === "participant_join") {
    const name = (p.display_name as string | null) ?? "viewer";
    return {
      id: event.id,
      user: { name, initials: initialsFor(name) },
      action: "joined the lobby",
      timestamp: ts,
      type: "assign",
    };
  }

  if (event.event_type === "participant_leave") {
    const name = (p.display_name as string | null) ?? "viewer";
    return {
      id: event.id,
      user: { name, initials: initialsFor(name) },
      action: "left the lobby",
      timestamp: ts,
      type: "delete",
    };
  }

  return null;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}
