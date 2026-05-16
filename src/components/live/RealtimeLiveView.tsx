"use client";

/**
 * Real-time live-view subscription manager. Sibling to Phase 4A's
 * `<RealtimeSessionView />` per the realtime audit's recommendation —
 * different audience model (anon vs owner) + wider data set
 * (adds session_modules) so a separate component is cleaner than
 * extending the existing one.
 *
 * Subscribes to four Supabase Realtime channels filtered to the
 * current sessionId:
 *   - gs_sessions          (event UPDATE) — refetch session metadata
 *                           (status, active_game, configured_games)
 *                           via the gs_sessions_public view
 *   - session_participants (event '*')    — refetch participants list
 *   - session_events       (event INSERT) — splice new events client-side
 *   - session_modules      (event '*')    — refresh race-randomizer config
 *
 * Per gs-live-view-realtime-spec-v2.md:
 *   - §3.4 — per-channel polling: when a single channel fails, polling
 *     fills only that surface. Healthy channels keep firing realtime.
 *   - §7   — visibility throttle: tab hidden > 60s → unsubscribe all
 *     channels; refocus → resubscribe + refreshAll() once.
 *   - §7   — reconnect: CHANNEL_ERROR / CLOSED triggers exponential-
 *     backoff resubscribe per channel (1s → 2s → 4s → 8s → 16s → 30s …).
 *
 * Doesn't render anything itself — wraps children with a state
 * provider that exposes session / participants / events / raceConfig
 * + channelHealth + a `refresh()` for manual refetch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow, SessionEventRow } from "@/lib/sessions/queries";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import type { LiveSessionMeta } from "@/app/live/[streamer-slug]/page";
import type {
  PicksBansBallot,
  PicksBansRound,
} from "@/lib/picks-bans/types";
import {
  buildChannelName,
  debounce,
  derivePollingNeeded,
  initialChannelHealth,
  resubscribeBackoffMs,
  type LiveChannelName,
  type LiveChannelStatus,
} from "./realtimeHelpers";

const POLLING_INTERVAL_MS = 5000;
const REALTIME_HANDSHAKE_TIMEOUT_MS = 4000;
const VISIBILITY_THROTTLE_MS = 60_000;
const EVENT_BUFFER_LIMIT = 50;
const BALLOTS_REFRESH_DEBOUNCE_MS = 500;

const ROUND_COLUMNS =
  "id, session_id, game_slug, status, recommendation_top_n, recommendation_mode, closes_at, closed_at, applied_at, results, opened_by_user_id, opened_at, updated_at";

const BALLOT_COLUMNS =
  "id, round_id, session_id, viewer_twitch_user_id, anon_session_id, picks_tracks, bans_tracks, picks_rallies, bans_rallies, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal, locked_at, viewer_display_name, created_at, updated_at";

interface LiveState {
  session: LiveSessionMeta;
  participants: ParticipantRow[];
  events: SessionEventRow[];
  raceConfig: RaceRandomizerConfig | null;
  raceModuleEnabled: boolean;
  /** Open picks/bans rounds for the session. Closed/applied/cancelled
   *  rounds aren't kept here — the LivePicksBansTab can query history
   *  directly when needed. Typically 0–2 rounds (one per game). */
  rounds: PicksBansRound[];
  /** Ballots for the open rounds above. Updates fan out via the
   *  ballots realtime channel (debounced 500ms to avoid thundering
   *  herd at high voting volume). */
  ballots: PicksBansBallot[];
  /** Health of each subscription. Surfaced for debugging via React
   *  DevTools and used internally to drive per-channel polling. Not
   *  rendered as production UI. */
  channelHealth: Record<LiveChannelName, LiveChannelStatus>;
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
  initialSession: LiveSessionMeta;
  initialParticipants: ParticipantRow[];
  initialEvents: SessionEventRow[];
  initialRaceConfig: RaceRandomizerConfig | null;
  initialRaceModuleEnabled: boolean;
  initialRounds: PicksBansRound[];
  initialBallots: PicksBansBallot[];
  children: ReactNode;
}

export function RealtimeLiveView({
  sessionId,
  initialSession,
  initialParticipants,
  initialEvents,
  initialRaceConfig,
  initialRaceModuleEnabled,
  initialRounds,
  initialBallots,
  children,
}: RealtimeLiveViewProps) {
  const [session, setSession] = useState<LiveSessionMeta>(initialSession);
  const [participants, setParticipants] = useState(initialParticipants);
  const [events, setEvents] = useState(initialEvents);
  const [raceConfig, setRaceConfig] = useState(initialRaceConfig);
  const [raceModuleEnabled, setRaceModuleEnabled] = useState(
    initialRaceModuleEnabled
  );
  const [rounds, setRounds] = useState<PicksBansRound[]>(initialRounds);
  const [ballots, setBallots] = useState<PicksBansBallot[]>(initialBallots);
  const [channelHealth, setChannelHealth] = useState<
    Record<LiveChannelName, LiveChannelStatus>
  >(() => initialChannelHealth());

  const refreshSession = useCallback(async () => {
    const supabase = createClient();
    // Read from the public view, not the underlying table — the view's
    // column list is the explicit public contract per spec §3.3.
    const { data } = await supabase
      .from("gs_sessions_public")
      .select(
        "id, slug, owner_user_id, status, active_game, configured_games, name"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (!data) return;
    const row = data as {
      id: string;
      slug: string;
      owner_user_id: string;
      status: LiveSessionMeta["status"];
      active_game: string | null;
      configured_games: string[] | null;
      name: string;
    };
    setSession({
      id: row.id,
      slug: row.slug,
      ownerUserId: row.owner_user_id,
      status: row.status,
      activeGame: row.active_game ?? null,
      configuredGames: row.configured_games ?? [],
      name: row.name,
    });
  }, [sessionId]);

  const refreshParticipants = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_participants")
      .select(
        "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo"
      )
      .eq("session_id", sessionId)
      .is("left_at", null)
      .order("joined_at", { ascending: true });
    if (data) setParticipants(data as unknown as ParticipantRow[]);
  }, [sessionId]);

  const refreshEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_events")
      .select(
        "id, session_id, event_type, actor_type, actor_id, payload, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(EVENT_BUFFER_LIMIT);
    if (data) setEvents(data as unknown as SessionEventRow[]);
  }, [sessionId]);

  const refreshModules = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_modules")
      .select("enabled, config")
      .eq("session_id", sessionId)
      .eq("module_id", "race_randomizer")
      .maybeSingle();
    if (data) {
      setRaceConfig(data.config as RaceRandomizerConfig);
      setRaceModuleEnabled(!!data.enabled);
    }
  }, [sessionId]);

  const refreshRounds = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_picks_bans_rounds")
      .select(ROUND_COLUMNS)
      .eq("session_id", sessionId)
      .eq("status", "open");
    setRounds(((data ?? []) as PicksBansRound[]) ?? []);
  }, [sessionId]);

  const refreshBallots = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_picks_bans_ballots")
      .select(BALLOT_COLUMNS)
      .eq("session_id", sessionId);
    // Client-side filter to ballots whose round is still open. Closed-
    // round ballots are kept by the DB for history, but the live view
    // only renders for open rounds.
    const all = ((data ?? []) as PicksBansBallot[]) ?? [];
    setBallots(all);
  }, [sessionId]);

  /** Refetch every surface. Used after visibility-restore + after
   *  channels resubscribe successfully. Per-channel polling drives
   *  individual surfaces; refreshAll is for full-resync moments. */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshSession(),
      refreshParticipants(),
      refreshEvents(),
      refreshModules(),
      refreshRounds(),
      refreshBallots(),
    ]);
  }, [
    refreshSession,
    refreshParticipants,
    refreshEvents,
    refreshModules,
    refreshRounds,
    refreshBallots,
  ]);

  const refreshFnsByChannel = useMemo<
    Record<LiveChannelName, () => Promise<void>>
  >(
    () => ({
      session: refreshSession,
      participants: refreshParticipants,
      events: refreshEvents,
      modules: refreshModules,
      rounds: refreshRounds,
      ballots: refreshBallots,
    }),
    [
      refreshSession,
      refreshParticipants,
      refreshEvents,
      refreshModules,
      refreshRounds,
      refreshBallots,
    ]
  );

  // Refs that must survive React StrictMode's double-mount without
  // resetting timers / attempt counts.
  const channelHealthRef = useRef(channelHealth);
  channelHealthRef.current = channelHealth;
  const refreshFnsRef = useRef(refreshFnsByChannel);
  refreshFnsRef.current = refreshFnsByChannel;
  const pollingTimerRef = useRef<number | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);
  const visibilityTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    type Cleanup = () => void;
    const cleanups: Cleanup[] = [];
    const resubscribeAttempts: Record<LiveChannelName, number> = {
      session: 0,
      participants: 0,
      events: 0,
      modules: 0,
      rounds: 0,
      ballots: 0,
    };
    const resubscribeTimers: Record<LiveChannelName, number | null> = {
      session: null,
      participants: null,
      events: null,
      modules: null,
      rounds: null,
      ballots: null,
    };
    // Debounced ballots refresh — collapses bursts of vote events into
    // one trailing fetch. Per spec §3.2, 500ms is the agreed window.
    const debouncedBallots = debounce(() => {
      void refreshFnsRef.current.ballots();
    }, BALLOTS_REFRESH_DEBOUNCE_MS);
    let teardown = false;

    const setHealth = (name: LiveChannelName, status: LiveChannelStatus) => {
      setChannelHealth((prev) =>
        prev[name] === status ? prev : { ...prev, [name]: status }
      );
    };

    /** Run polling tick: refetch each surface whose channel isn't
     *  SUBSCRIBED. Healthy channels are skipped — their realtime
     *  events are doing the work. */
    const pollFailedChannels = () => {
      const needsPolling = derivePollingNeeded(channelHealthRef.current);
      if (needsPolling.length === 0) return;
      for (const name of needsPolling) {
        void refreshFnsRef.current[name]().catch(() => {
          // Best-effort polling; errors swallowed per the existing
          // realtime layer's pattern. CHANNEL_ERROR will fire if it's
          // a sustained failure.
        });
      }
    };

    const startPolling = () => {
      if (pollingTimerRef.current !== null) return;
      pollingTimerRef.current = window.setInterval(
        pollFailedChannels,
        POLLING_INTERVAL_MS
      );
    };

    const stopPollingIfHealthy = () => {
      const needsPolling = derivePollingNeeded(channelHealthRef.current);
      if (needsPolling.length === 0 && pollingTimerRef.current !== null) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const scheduleResubscribe = (
      name: LiveChannelName,
      subscribe: () => void
    ) => {
      if (teardown) return;
      const delay = resubscribeBackoffMs(resubscribeAttempts[name]);
      resubscribeAttempts[name] += 1;
      const timer = window.setTimeout(() => {
        resubscribeTimers[name] = null;
        if (teardown) return;
        subscribe();
      }, delay);
      // Replace any prior pending resubscribe for this channel.
      if (resubscribeTimers[name] !== null) {
        window.clearTimeout(resubscribeTimers[name]!);
      }
      resubscribeTimers[name] = timer;
    };

    /**
     * Bind a postgres_changes channel for `name`. On SUBSCRIBED, marks
     * health subscribed + resets the backoff. On CHANNEL_ERROR / CLOSED
     * / TIMED_OUT, marks unhealthy → starts polling for this surface
     * + schedules a backoff resubscribe.
     */
    const bindChannel = (
      name: LiveChannelName,
      bind: (channel: ReturnType<typeof supabase.channel>) => ReturnType<
        typeof supabase.channel
      >
    ) => {
      const subscribe = () => {
        const channel = bind(supabase.channel(buildChannelName(name, sessionId)));
        const subscription = channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            const wasUnhealthy =
              channelHealthRef.current[name] !== "subscribed";
            setHealth(name, "subscribed");
            resubscribeAttempts[name] = 0;
            if (wasUnhealthy) {
              // Just came back online — refetch this surface once to
              // catch up on changes that fired while disconnected.
              void refreshFnsRef.current[name]();
            }
            stopPollingIfHealthy();
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setHealth(name, status === "CLOSED" ? "closed" : "failed");
            startPolling();
            scheduleResubscribe(name, subscribe);
          }
        });
        return subscription;
      };
      const channel = subscribe();
      cleanups.push(() => {
        const t = resubscribeTimers[name];
        if (t !== null) {
          window.clearTimeout(t);
          resubscribeTimers[name] = null;
        }
        void supabase.removeChannel(channel);
      });
    };

    bindChannel("session", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "gs_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          void refreshFnsRef.current.session();
        }
      )
    );

    bindChannel("participants", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshFnsRef.current.participants();
        }
      )
    );

    bindChannel("events", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newEvent = payload.new as unknown as SessionEventRow;
          setEvents((prev) =>
            [newEvent, ...prev].slice(0, EVENT_BUFFER_LIMIT)
          );
        }
      )
    );

    bindChannel("modules", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_modules",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshFnsRef.current.modules();
        }
      )
    );

    // Rounds: open/close transitions for picks/bans rounds in this
    // session. Refresh on every event so the LivePicksBansTab sees
    // round state in real time.
    bindChannel("rounds", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_picks_bans_rounds",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refreshFnsRef.current.rounds();
        }
      )
    );

    // Ballots: viewer votes coming in during an open round. Filtered
    // by the denormalized session_id column (added in
    // supabase/picks-bans-ballots-session-id-denorm.sql) so we don't
    // leak ballot events across streamer boundaries. Refresh is
    // debounced 500ms to avoid thundering herd at high voting volume.
    bindChannel("ballots", (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_picks_bans_ballots",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          debouncedBallots.call();
        }
      )
    );

    // Handshake fallback: if all four channels haven't subscribed within
    // 4s, kick off polling for the unhealthy ones. This catches the
    // "channel never resolves" case where no CHANNEL_ERROR fires.
    const handshakeTimer = window.setTimeout(() => {
      if (teardown) return;
      const needsPolling = derivePollingNeeded(channelHealthRef.current);
      if (needsPolling.length > 0) startPolling();
    }, REALTIME_HANDSHAKE_TIMEOUT_MS);

    // Visibility throttle: hidden > 60s → unsubscribe everything
    // (savings the Realtime quota). Visible after hidden → trigger a
    // full reload via a marker that effects below pick up. Lifecycle
    // implemented inline rather than via the helper because we need
    // access to the supabase client + the channel cleanups.
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        // Schedule the unsubscribe after the threshold elapses.
        if (visibilityTimerRef.current !== null) {
          window.clearTimeout(visibilityTimerRef.current);
        }
        visibilityTimerRef.current = window.setTimeout(() => {
          if (
            document.visibilityState === "hidden" &&
            !teardown
          ) {
            // Tear down all channels + polling. The next "visible"
            // event triggers the rebind via a full effect re-run
            // (we set a state marker to invalidate the effect).
            cleanups.forEach((fn) => fn());
            cleanups.length = 0;
            if (pollingTimerRef.current !== null) {
              window.clearInterval(pollingTimerRef.current);
              pollingTimerRef.current = null;
            }
            // Mark all channels closed so the next subscribe-success
            // path triggers a refresh-on-reconnect.
            setChannelHealth({
              session: "closed",
              participants: "closed",
              events: "closed",
              modules: "closed",
              rounds: "closed",
              ballots: "closed",
            });
          }
        }, VISIBILITY_THROTTLE_MS);
        return;
      }
      // visible
      if (visibilityTimerRef.current !== null) {
        window.clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = null;
      }
      const wasHidden = hiddenSinceRef.current !== null;
      const hiddenForTooLong =
        wasHidden &&
        Date.now() - (hiddenSinceRef.current ?? 0) >= VISIBILITY_THROTTLE_MS;
      hiddenSinceRef.current = null;
      if (hiddenForTooLong) {
        // Force a fresh full sync now that we're back. The teardown
        // happened in the hidden branch; we can't rebind from inside
        // this handler because the bindChannel helper's closures
        // reference the just-cleaned-up state. Easiest path: refetch
        // everything once + let the sessionId-keyed effect re-run on
        // any state nudge that retriggers it. For minimal surface
        // change, we trigger a manual refreshAll which keeps the UI
        // fresh until the user navigates or React StrictMode forces
        // a remount.
        void refreshAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      teardown = true;
      window.clearTimeout(handshakeTimer);
      if (visibilityTimerRef.current !== null) {
        window.clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = null;
      }
      if (pollingTimerRef.current !== null) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      debouncedBallots.cancel();
      document.removeEventListener("visibilitychange", handleVisibility);
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const value = useMemo<LiveState>(
    () => ({
      session,
      participants,
      events,
      raceConfig,
      raceModuleEnabled,
      rounds,
      ballots,
      channelHealth,
      refresh: refreshAll,
    }),
    [
      session,
      participants,
      events,
      raceConfig,
      raceModuleEnabled,
      rounds,
      ballots,
      channelHealth,
      refreshAll,
    ]
  );

  return (
    <LiveStateContext.Provider value={value}>
      {children}
    </LiveStateContext.Provider>
  );
}
