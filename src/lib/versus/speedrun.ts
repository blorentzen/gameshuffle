import "server-only";

/**
 * Speedrun races on the head-to-head rooms (picks 2026-11-10): what a runner brings to a race from their speedrun
 * setup. The lane itself comes from their relay object, which the room binds; the site only needs which relay, the
 * runner's stream delay (watchers show their lane that much later, pick 5A) and their splits.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gameName, setupFor } from "@/lib/speedrun/store";
import { keepSegments } from "@/lib/speedrun/rules";
import type { RelaySegment } from "@/lib/speedrun/types";

export interface SpeedrunEntry {
  relayId: string;
  delayMs: number;
  /** Split names as stored (LiveSplit's group marks kept). */
  splits: string[];
  pbMs: number | null;
  game: string | null;
  gameName: string;
  category: string;
}

export async function speedrunEntry(userId: string): Promise<SpeedrunEntry | null> {
  const s = await setupFor(userId);
  if (!s) return null;
  return {
    relayId: s.relayId,
    delayMs: Math.max(0, Math.min(60, s.settings.replyDelay)) * 1000,
    splits: s.run.map((x) => x.name),
    pbMs: s.run.at(-1)?.pbMs ?? null,
    game: s.game,
    gameName: gameName(s.game),
    category: s.category ?? "",
  };
}

/** Several runners' relays, stream delays and PBs at once (a room's entrants). */
export async function speedrunEntries(userIds: string[]): Promise<Map<string, { relayId: string; delayMs: number; pbMs: number | null; count: number }>> {
  const out = new Map<string, { relayId: string; delayMs: number; pbMs: number | null; count: number }>();
  if (!userIds.length) return out;
  const { data } = await createServiceClient().from("speedrun_setups").select("user_id, relay_id, settings, run").in("user_id", userIds);
  for (const r of (data ?? []) as { user_id: string; relay_id: string; settings: { replyDelay?: unknown } | null; run: unknown }[]) {
    const run = Array.isArray(r.run) ? keepSegments(r.run as RelaySegment[]) : [];
    const delay = typeof r.settings?.replyDelay === "number" ? Math.max(0, Math.min(60, r.settings.replyDelay)) : 5;
    out.set(r.user_id, { relayId: r.relay_id, delayMs: delay * 1000, pbMs: run.at(-1)?.pbMs ?? null, count: run.length });
  }
  return out;
}
