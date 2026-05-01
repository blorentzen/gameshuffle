"use client";

/**
 * Real-time live-view subscription manager. Sibling to Phase 4A's
 * `<RealtimeSessionView />` per the realtime audit's recommendation —
 * different audience model (anon vs owner) + wider data set
 * (adds session_modules) so a separate component is cleaner than
 * extending the existing one.
 *
 * Subscribes to three Supabase Realtime channels filtered to the
 * current sessionId:
 *   - session_participants (event '*') — refetch participants list
 *   - session_events       (event INSERT) — splice new events client-side
 *   - session_modules      (event '*') — refresh race-randomizer config
 *
 * Falls back to 5s polling when the subscription handshake doesn't
 * resolve within 4s (same pattern as Phase 4A).
 *
 * Doesn't render anything itself — wraps children with a state
 * provider that exposes participants / events / raceConfig + a
 * `refresh()` for manual refetch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow, SessionEventRow } from "@/lib/sessions/queries";
import type { RaceRandomizerConfig } from "@/lib/modules/types";

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;
const EVENT_BUFFER_LIMIT = 50;

interface LiveState {
  participants: ParticipantRow[];
  events: SessionEventRow[];
  raceConfig: RaceRandomizerConfig | null;
  raceModuleEnabled: boolean;
  refresh: () => Promise<void>;
}

const LiveStateContext = createContext<LiveState | null>(null);

export function useLiveState(): LiveState {
  const ctx = useContext(LiveStateContext);
  if (!ctx) {
    throw new Error("useLiveState must be used inside <RealtimeLiveView>");
  }
  return ctx;
}

interface RealtimeLiveViewProps {
  sessionId: string;
  initialParticipants: ParticipantRow[];
  initialEvents: SessionEventRow[];
  initialRaceConfig: RaceRandomizerConfig | null;
  initialRaceModuleEnabled: boolean;
  children: ReactNode;
}

export function RealtimeLiveView({
  sessionId,
  initialParticipants,
  initialEvents,
  initialRaceConfig,
  initialRaceModuleEnabled,
  children,
}: RealtimeLiveViewProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [events, setEvents] = useState(initialEvents);
  const [raceConfig, setRaceConfig] = useState(initialRaceConfig);
  const [raceModuleEnabled, setRaceModuleEnabled] = useState(initialRaceModuleEnabled);

  const refreshAll = useCallback(async () => {
    const supabase = createClient();
    const [pRes, eRes, mRes] = await Promise.all([
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
        .limit(EVENT_BUFFER_LIMIT),
      supabase
        .from("session_modules")
        .select("enabled, config")
        .eq("session_id", sessionId)
        .eq("module_id", "race_randomizer")
        .maybeSingle(),
    ]);
    if (pRes.data) setParticipants(pRes.data as unknown as ParticipantRow[]);
    if (eRes.data) setEvents(eRes.data as unknown as SessionEventRow[]);
    if (mRes.data) {
      setRaceConfig(mRes.data.config as RaceRandomizerConfig);
      setRaceModuleEnabled(!!mRes.data.enabled);
    }
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    let pollingHandle: number | null = null;
    let cleanups: Array<() => void> = [];
    let usingRealtime = false;

    const startPolling = () => {
      if (pollingHandle !== null) return;
      pollingHandle = window.setInterval(() => {
        void refreshAll();
      }, POLLING_INTERVAL_MS);
    };

    const participantsChannel = supabase
      .channel(`live-participants-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshAll();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") usingRealtime = true;
      });
    cleanups.push(() => {
      void supabase.removeChannel(participantsChannel);
    });

    const eventsChannel = supabase
      .channel(`live-events-${sessionId}`)
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
          setEvents((prev) => [newEvent, ...prev].slice(0, EVENT_BUFFER_LIMIT));
        }
      )
      .subscribe();
    cleanups.push(() => {
      void supabase.removeChannel(eventsChannel);
    });

    const modulesChannel = supabase
      .channel(`live-modules-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_modules",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshAll();
        }
      )
      .subscribe();
    cleanups.push(() => {
      void supabase.removeChannel(modulesChannel);
    });

    const fallbackTimer = window.setTimeout(() => {
      if (!usingRealtime) startPolling();
    }, REALTIME_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (pollingHandle !== null) window.clearInterval(pollingHandle);
      cleanups.forEach((fn) => fn());
      cleanups = [];
    };
  }, [sessionId, refreshAll]);

  const value = useMemo<LiveState>(
    () => ({
      participants,
      events,
      raceConfig,
      raceModuleEnabled,
      refresh: refreshAll,
    }),
    [participants, events, raceConfig, raceModuleEnabled, refreshAll]
  );

  return (
    <LiveStateContext.Provider value={value}>
      {children}
    </LiveStateContext.Provider>
  );
}
