"use client";

/**
 * Real-time session view — subscribes to Supabase channels for
 * `session_participants` and `session_events` filtered to the current
 * session. Falls back to 5s polling if the WebSocket subscription fails
 * to establish.
 *
 * Per gs-pro-v1-phase-4a-spec.md §5.3.
 *
 * Server-rendered initial state is passed via props so first paint is
 * immediate; updates flow in as the stream emits events.
 */

import { useEffect, useState } from "react";
import { Card } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow, SessionEventRow } from "@/lib/sessions/queries";
import { SessionActivityFeed } from "./SessionActivityFeed";

interface RealtimeSessionViewProps {
  sessionId: string;
  initialParticipants: ParticipantRow[];
  initialEvents: SessionEventRow[];
}

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;

export function RealtimeSessionView({
  sessionId,
  initialParticipants,
  initialEvents,
}: RealtimeSessionViewProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    const supabase = createClient();
    let pollingHandle: number | null = null;
    let cleanups: Array<() => void> = [];
    let usingRealtime = false;

    const refreshFromDb = async () => {
      const [pRes, eRes] = await Promise.all([
        supabase
          .from("session_participants")
          .select(
            "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo"
          )
          .eq("session_id", sessionId)
          .is("left_at", null)
          .order("joined_at", { ascending: true }),
        supabase
          .from("session_events")
          .select(
            "id, session_id, event_type, actor_type, actor_id, payload, created_at"
          )
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (pRes.data) setParticipants(pRes.data as unknown as ParticipantRow[]);
      if (eRes.data) setEvents(eRes.data as unknown as SessionEventRow[]);
    };

    const startPolling = () => {
      if (pollingHandle !== null) return;
      pollingHandle = window.setInterval(refreshFromDb, POLLING_INTERVAL_MS);
    };

    // Try realtime first; if it doesn't establish in 4s, fall back to polling.
    const participantsChannel = supabase
      .channel(`session-participants-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          // We could splice the new row in directly; refetch is simpler
          // and keeps the active list correct on left_at transitions.
          void refreshFromDb();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          usingRealtime = true;
        }
      });
    cleanups.push(() => {
      void supabase.removeChannel(participantsChannel);
    });

    const eventsChannel = supabase
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
          setEvents((prev) => [newEvent, ...prev].slice(0, 25));
        }
      )
      .subscribe();
    cleanups.push(() => {
      void supabase.removeChannel(eventsChannel);
    });

    // After the handshake window, if realtime didn't engage, polling
    // covers the same surface invisibly to the user.
    const fallbackTimer = window.setTimeout(() => {
      if (!usingRealtime) startPolling();
    }, REALTIME_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (pollingHandle !== null) window.clearInterval(pollingHandle);
      cleanups.forEach((fn) => fn());
      cleanups = [];
    };
  }, [sessionId]);

  return (
    <>
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">
          Participants ({participants.length})
        </h2>
        <Card variant="outlined" padding="medium">
          {participants.length === 0 ? (
            <p className="hub-detail__panel-meta">No active participants yet.</p>
          ) : (
            <ul className="hub-detail__participant-list">
              {participants.map((p) => (
                <li key={p.id} className="hub-detail__participant-row">
                  <span className="hub-detail__participant-name">
                    {p.display_name ?? p.platform_user_id}
                  </span>
                  {p.is_broadcaster && (
                    <span className="hub-detail__participant-badge">streamer</span>
                  )}
                  <span className="hub-detail__participant-platform">
                    via {p.platform}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Activity</h2>
        <SessionActivityFeed events={events} />
      </section>
    </>
  );
}
