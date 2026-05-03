"use client";

/**
 * Active-participants list wired to Supabase Realtime. Mirrors the
 * realtime+polling-fallback pattern of `<RealtimeActivityFeed />` so the
 * Viewers tab stays fresh as viewers join/leave the session.
 */

import { useEffect, useState } from "react";
import { Card } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow } from "@/lib/sessions/queries";

interface RealtimeParticipantsListProps {
  sessionId: string;
  initialParticipants: ParticipantRow[];
}

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;

export function RealtimeParticipantsList({
  sessionId,
  initialParticipants,
}: RealtimeParticipantsListProps) {
  const [participants, setParticipants] = useState(initialParticipants);

  useEffect(() => {
    const supabase = createClient();
    let pollingHandle: number | null = null;
    let usingRealtime = false;

    const refreshFromDb = async () => {
      const { data } = await supabase
        .from("session_participants")
        .select(
          "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo"
        )
        .eq("session_id", sessionId)
        .is("left_at", null)
        .order("joined_at", { ascending: true });
      if (data) setParticipants(data as unknown as ParticipantRow[]);
    };

    const startPolling = () => {
      if (pollingHandle !== null) return;
      pollingHandle = window.setInterval(refreshFromDb, POLLING_INTERVAL_MS);
    };

    const channel = supabase
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
          // Refetch is simpler than splicing; left_at transitions need
          // the active filter applied.
          void refreshFromDb();
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

  if (participants.length === 0) {
    return (
      <Card variant="outlined" padding="medium">
        <p className="hub-detail__panel-meta">
          No active participants yet. Viewers who run{" "}
          <code>!gs-join</code> in chat or queue up via channel-points
          redemption appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="outlined" padding="medium">
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
    </Card>
  );
}
