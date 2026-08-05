/**
 * Coin tool trigger (Streamer Tools Integration). Shared server entry point for
 * every trigger surface (chat / Hub / channel points): flip server-side, record
 * a typed overlay event, return the result. Mirrors `triggerDiceRoll`.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
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
  const cfg = await getStreamerModuleDefault({
    ownerUserId: args.ownerUserId,
    moduleId: "coin",
    gameSlug: "*",
  });
  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "coin",
    payload: {
      result,
      headsColor: cfg?.headsColor ?? null,
      tailsColor: cfg?.tailsColor ?? null,
      triggeredBy: args.triggeredBy ?? null,
    },
    ttlMs: COIN_TTL_MS,
  });
  return { result };
}
