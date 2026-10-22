/**
 * Coin tool trigger (Streamer Tools Integration). Shared server entry point for
 * every trigger surface (chat / Hub / channel points): flip server-side, record
 * a typed overlay event, return the result. Mirrors `triggerDiceRoll`.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { coinForOverlay } from "@/lib/tools/looksServer";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

const COIN_TTL_MS = 4000;

export interface CoinFlipResult {
  result: "heads" | "tails";
}

export async function triggerCoinFlip(args: {
  ownerUserId: string;
  sessionId?: string | null;
  triggeredBy?: string | null;
  source?: ToolSource;
}): Promise<CoinFlipResult> {
  const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
  void trackServerEvent("Streamer Tool", {
    props: { tool: "coin", surface: args.source ?? "unknown" },
  });
  // The streamer's coin look, drawn the same as the free coin page.
  const { paint } = await coinForOverlay(args.ownerUserId);
  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "coin",
    payload: {
      result,
      paint,
      headsColor: paint.base,
      tailsColor: paint.base,
      triggeredBy: args.triggeredBy ?? null,
    },
    ttlMs: COIN_TTL_MS,
  });
  return { result };
}
