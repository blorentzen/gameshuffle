"use client";

/**
 * Dashboard-side live controls — surfaces the streamer's run-time
 * triggers (manual roll, picks/bans round lifecycle, ballot picker,
 * apply editor) for the **currently active game** only. Reuses the
 * unified `<RaceSetupSection>` with `surface="live"`.
 *
 * Reactive to the live `gs_sessions.active_game` field — when the
 * streamer changes their Twitch category mid-stream, the EventSub
 * webhook updates the row, this component picks up the change via a
 * Supabase Realtime subscription, and the rendered controls swap to
 * the new game without a page refresh.
 *
 * Single-game scope on purpose: the Dashboard is the streamer's
 * command center while running a live session. They're playing one
 * game at a time; the controls match that. Other configured games'
 * setup still lives on the Modules tab.
 *
 * Modules tab keeps the same `<RaceSetupSection>` with
 * `surface="config"` for pure-setup work (defaults + canonical
 * picker). The split keeps the streamer's "configure before going
 * live" vs "control while live" mental models clean.
 *
 * Renders nothing when the active game isn't a supported race game
 * (e.g., GS Queue mode, or no game set yet) or when no live session
 * is in progress (lifecycle gating happens at the page level).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RaceSetupSection } from "./RaceSetupSection";
import {
  sliceRaceConfig,
  slugToRaceGame,
} from "./tabs/SessionModulesTab";
import { isSupportedGame } from "@/lib/games/artwork";

interface Props {
  sessionId: string;
  sessionSlug: string;
  /** SSR-resolved active game slug — used as the initial value before
   *  the realtime subscription has fired. Resolved upstream via
   *  `session.active_game ?? configured_games[0] ?? config.game`. */
  initialActiveGameSlug: string | null;
  /** First configured game slug — used as a fallback when slicing the
   *  legacy single-pool config shape. */
  legacyDefaultSlug: string | undefined;
  /** Raw `session_modules.config` blob for race_randomizer (or null). */
  rawRaceConfig: Record<string, unknown> | null;
}

export function DashboardLiveControls({
  sessionId,
  sessionSlug,
  initialActiveGameSlug,
  legacyDefaultSlug,
  rawRaceConfig,
}: Props) {
  const [activeGameSlug, setActiveGameSlug] = useState<string | null>(
    initialActiveGameSlug,
  );

  // Subscribe to gs_sessions UPDATE for this session so active_game
  // changes flip the rendered controls live. EventSub's
  // channel.update webhook writes the new slug via
  // updateTwitchSessionCategory; the Realtime publication on
  // gs_sessions (added in live-view-gs-sessions-public-view.sql) +
  // the public-read RLS on active/ending sessions let an authed
  // streamer's browser see the row change.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-live-controls-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "gs_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = (payload.new as { active_game?: string | null } | null)
            ?.active_game;
          // `undefined` means the payload didn't carry that column —
          // ignore, keep the current value. `null` is a legitimate
          // value (queue fallback after stream.offline).
          if (next === undefined) return;
          setActiveGameSlug(next ?? null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  if (!activeGameSlug || !isSupportedGame(activeGameSlug)) return null;
  const raceGame = slugToRaceGame(activeGameSlug);
  if (!raceGame) return null;
  const raceConfig = sliceRaceConfig(
    rawRaceConfig,
    activeGameSlug,
    legacyDefaultSlug,
  );
  return (
    <RaceSetupSection
      // Force a clean remount when the active game changes — the
      // child polls round + ballot state keyed on gameSlug + caches
      // its own `config` from `initial` on first render, so a new
      // game needs a fresh component instance.
      key={activeGameSlug}
      sessionId={sessionId}
      sessionSlug={sessionSlug}
      game={raceGame}
      gameSlug={activeGameSlug}
      initial={raceConfig}
      sessionLive={true}
      surface="live"
    />
  );
}
