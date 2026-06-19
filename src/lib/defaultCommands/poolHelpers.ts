/**
 * Shared helpers for the default-command pool — used by both the
 * Twitch dispatcher (which adds community-scoped entries on top)
 * and the Discord bot (which uses platform pool only since Discord
 * servers aren't yet mapped to communities).
 *
 * Phase 1 of Discord parity: only platform-default entries
 * (community_id IS NULL) are reachable from Discord. Once we wire
 * up Discord-server → community linking, we can layer the
 * community pool the same way the Twitch fallback does.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

interface PoolResponse {
  id: string;
  response: string;
  weight: number;
}

/**
 * Load + pick one enabled platform-default response for a given
 * command trigger. Returns null when no matching command exists,
 * the command is platform-disabled, or the pool is empty.
 *
 * Single combined query — the command lookup gates the pool fetch
 * so we don't scan responses for unknown triggers.
 */
export async function pickFromPlatformPool(
  trigger: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const { data: cmdRow } = await admin
    .from("gs_default_commands")
    .select("id")
    .eq("trigger", trigger)
    .eq("enabled", true)
    .maybeSingle();
  const cmd = cmdRow as { id: string } | null;
  if (!cmd) return null;

  const { data: poolRows } = await admin
    .from("gs_default_command_responses")
    .select("id, response, weight")
    .eq("command_id", cmd.id)
    .eq("enabled", true)
    .is("community_id", null);
  const pool = (poolRows as PoolResponse[] | null) ?? [];
  if (pool.length === 0) return null;
  return pickWeighted(pool).response;
}

/** Weighted random pick. Caller guarantees pool.length > 0. */
function pickWeighted(pool: PoolResponse[]): PoolResponse {
  const total = pool.reduce((acc, r) => acc + r.weight, 0);
  let pick = Math.random() * total;
  for (const r of pool) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return pool[pool.length - 1];
}
