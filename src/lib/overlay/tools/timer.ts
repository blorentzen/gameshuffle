/**
 * Stream Timer tool (Streamer Tools Integration, Phase 3). Unlike the momentary
 * pops (dice/coin/oracle/name-picker), a timer is a *persistent* overlay event:
 * it's recorded with `ttlMs: null` so a new timer replaces the prior one
 * (OverlayClient keeps the latest event per type). The renderer counts down
 * from an absolute `endsAt`, so clock drift between server + overlay never
 * accumulates. A "stop" is just another persistent event flagged `stopped`.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import { DEFAULT_TIMER_CONFIG } from "@/lib/modules/registry";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

/** Bounds so a fat-fingered `!gs-timer 9999h` can't sit on the overlay forever. */
export const TIMER_MIN_SECONDS = 5;
export const TIMER_MAX_SECONDS = 6 * 60 * 60; // 6 hours

/** The streamer's timer customization (accent + default duration), with fallbacks. */
export async function getTimerConfig(ownerUserId: string) {
  const cfg = await getStreamerModuleDefault({
    ownerUserId,
    moduleId: "timer",
    gameSlug: "*", // timer isn't game-specific
  });
  return {
    accentColor: cfg?.accentColor ?? DEFAULT_TIMER_CONFIG.accentColor,
    defaultSeconds: cfg?.defaultSeconds ?? DEFAULT_TIMER_CONFIG.defaultSeconds,
  };
}

export interface TimerStartResult {
  seconds: number;
  endsAt: string;
  label: string | null;
}

/** Start (or restart) a countdown on the overlay. Clamps to [MIN, MAX] seconds. */
export async function triggerTimerStart(args: {
  ownerUserId: string;
  sessionId?: string | null;
  seconds?: number;
  label?: string | null;
  accentColor?: string;
  source?: ToolSource;
}): Promise<TimerStartResult> {
  const cfg = await getTimerConfig(args.ownerUserId);
  const seconds = Math.max(
    TIMER_MIN_SECONDS,
    Math.min(TIMER_MAX_SECONDS, Math.round(args.seconds ?? cfg.defaultSeconds)),
  );
  const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
  const label = args.label?.trim() ? args.label.trim().slice(0, 60) : null;

  void trackServerEvent("Streamer Tool", {
    props: { tool: "timer", surface: args.source ?? "unknown", seconds },
  });

  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "timer",
    payload: {
      endsAt,
      seconds,
      label,
      accentColor: args.accentColor ?? cfg.accentColor,
      stopped: false,
    },
    ttlMs: null, // persistent — replaced by the next timer event
  });

  return { seconds, endsAt, label };
}

/** Clear a running countdown from the overlay (records a `stopped` timer event). */
export async function triggerTimerStop(args: {
  ownerUserId: string;
  sessionId?: string | null;
  source?: ToolSource;
}): Promise<void> {
  void trackServerEvent("Streamer Tool", {
    props: { tool: "timer", surface: args.source ?? "unknown", seconds: 0 },
  });
  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "timer",
    payload: { stopped: true },
    ttlMs: null,
  });
}
