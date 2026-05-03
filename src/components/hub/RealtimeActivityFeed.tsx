"use client";

/**
 * Activity feed wired to Supabase Realtime — INSERT-only on
 * `session_events`, falls back to 5s polling if the WebSocket handshake
 * doesn't establish in 4s. Renders via the shared `<SessionActivityFeed />`
 * primitive.
 *
 * Two visual modes:
 *   - Truncated (Overview tab): pass `limit={10}` and `viewAllHref="?tab=activity"`
 *     to render a compact slice with a "View all activity →" link.
 *   - Full (Activity tab): pass `limit={25}` (or higher) and no link.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SessionEventRow } from "@/lib/sessions/queries";
import { SessionActivityFeed } from "./SessionActivityFeed";

interface RealtimeActivityFeedProps {
  sessionId: string;
  initialEvents: SessionEventRow[];
  /** Hard cap on rendered events. The realtime stream still fires; we
   *  just slice. */
  limit?: number;
  /** When set, renders a "View all activity →" link below the feed. */
  viewAllHref?: string;
}

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;
const FETCH_LIMIT = 25;

export function RealtimeActivityFeed({
  sessionId,
  initialEvents,
  limit,
  viewAllHref,
}: RealtimeActivityFeedProps) {
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    const supabase = createClient();
    let pollingHandle: number | null = null;
    let usingRealtime = false;

    const refreshFromDb = async () => {
      const { data } = await supabase
        .from("session_events")
        .select(
          "id, session_id, event_type, actor_type, actor_id, payload, created_at"
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (data) setEvents(data as unknown as SessionEventRow[]);
    };

    const startPolling = () => {
      if (pollingHandle !== null) return;
      pollingHandle = window.setInterval(refreshFromDb, POLLING_INTERVAL_MS);
    };

    const channel = supabase
      .channel(`session-events-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newEvent = payload.new as unknown as SessionEventRow;
          setEvents((prev) => [newEvent, ...prev].slice(0, FETCH_LIMIT));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") usingRealtime = true;
      });

    const fallbackTimer = window.setTimeout(() => {
      if (!usingRealtime) startPolling();
    }, REALTIME_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (pollingHandle !== null) window.clearInterval(pollingHandle);
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const visibleEvents = useMemo(
    () => (limit ? events.slice(0, limit) : events),
    [events, limit]
  );

  const truncated = !!limit && events.length > limit;
  const showViewAll = !!viewAllHref && (truncated || events.length === 0);

  return (
    <div className="hub-detail__activity">
      <SessionActivityFeed events={visibleEvents} />
      {showViewAll && (
        <div className="hub-detail__activity-footer">
          <Link href={viewAllHref!} className="hub-detail__activity-view-all">
            View all activity →
          </Link>
        </div>
      )}
    </div>
  );
}
