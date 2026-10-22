/**
 * Dice tool trigger (Streamer Tools Integration, Phase 0). ONE server-side
 * entry point shared by every trigger surface (chat command, Hub button,
 * channel-point redemption): compute the roll server-side, record a typed
 * overlay event, return the result for the caller to announce. Mirrors
 * `performSpin()` for the wheel.
 *
 * Colors, table and default count come from the streamer's saved dice look
 * (src/lib/tools/looks.ts), the same one the free dice page uses: GS Pro
 * brand color applied, pips matched to the die. Explicit args override.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { diceForOverlay } from "@/lib/tools/looksServer";
import { trackServerEvent } from "@/lib/analytics/server";

export type ToolSource = "chat" | "hub" | "channel_point";

// Dice tumble (~1.15s) + a short hold before the overlay clears.
const DICE_TTL_MS = 4200;

export interface DiceRollResult {
  values: number[];
  total: number;
}

/** The streamer's dice as drawn on stream (colors, table) and their default count. */
export async function getDiceConfig(ownerUserId: string) {
  const d = await diceForOverlay(ownerUserId);
  return { dieColor: d.dieColor, pipColor: d.pipColor, table: d.table, defaultCount: d.look.defaultCount };
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
      pipColor: args.pipColor ?? (args.dieColor ? undefined : cfg.pipColor),
      table: cfg.table,
      triggeredBy: args.triggeredBy ?? null,
    },
    ttlMs: DICE_TTL_MS,
  });

  return { values, total };
}
