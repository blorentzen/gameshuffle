/**
 * Dice tool trigger (Streamer Tools Integration, Phase 0). ONE server-side
 * entry point shared by every trigger surface (chat command, Hub button,
 * channel-point redemption): compute the roll server-side, record a typed
 * overlay event, return the result for the caller to announce. Mirrors
 * `performSpin()` for the wheel.
 *
 * Colors + default count are streamer-owned (§3.4) — read from the streamer's
 * `dice` module default; explicit args override, registry defaults backstop.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import { DEFAULT_DICE_CONFIG } from "@/lib/modules/registry";
import { trackServerEvent } from "@/lib/analytics/server";

export type ToolSource = "chat" | "hub" | "channel_point";

// Dice tumble (~1.15s) + a short hold before the overlay clears.
const DICE_TTL_MS = 4200;

export interface DiceRollResult {
  values: number[];
  total: number;
}

/** The streamer's dice customization (colors + default count), with fallbacks. */
export async function getDiceConfig(ownerUserId: string) {
  const cfg = await getStreamerModuleDefault({
    ownerUserId,
    moduleId: "dice",
    gameSlug: "*", // dice isn't game-specific
  });
  return {
    dieColor: cfg?.dieColor ?? DEFAULT_DICE_CONFIG.dieColor,
    pipColor: cfg?.pipColor ?? DEFAULT_DICE_CONFIG.pipColor,
    defaultCount: cfg?.defaultCount ?? DEFAULT_DICE_CONFIG.defaultCount,
  };
}

export async function triggerDiceRoll(args: {
  ownerUserId: string;
  sessionId?: string | null;
  count?: number;
  triggeredBy?: string | null;
  dieColor?: string;
  pipColor?: string;
  source?: ToolSource;
}): Promise<DiceRollResult> {
  const cfg = await getDiceConfig(args.ownerUserId);
  const count = Math.max(1, Math.min(6, Math.round(args.count ?? cfg.defaultCount)));
  const values = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
  const total = values.reduce((a, b) => a + b, 0);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "dice", surface: args.source ?? "unknown", count },
  });

  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "dice",
    payload: {
      values,
      dieColor: args.dieColor ?? cfg.dieColor,
      pipColor: args.pipColor ?? cfg.pipColor,
      triggeredBy: args.triggeredBy ?? null,
    },
    ttlMs: DICE_TTL_MS,
  });

  return { values, total };
}
