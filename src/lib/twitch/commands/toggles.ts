/**
 * Per-channel on/off for built-in chat commands (`gs_command_toggles`,
 * supabase/command-toggles-m1.sql). No row = on. The dispatcher asks
 * `isCommandOff` for every built-in it's about to run; the Commands page
 * writes through `setCommandEnabled`. Cached per community for 15s, and a
 * missing table (migration not run yet) reads as everything on.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

const TTL_MS = 15_000;
const CACHE = new Map<string, { at: number; off: Set<string> }>();
let warnedMissing = false;

/** Names of the built-ins this community has switched off. */
export async function offCommands(communityId: string): Promise<Set<string>> {
  const hit = CACHE.get(communityId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.off;
  const { data, error } = await createServiceClient()
    .from("gs_command_toggles")
    .select("command_name")
    .eq("community_id", communityId)
    .eq("enabled", false);
  if (error) {
    if (!warnedMissing) {
      console.warn("[commands] gs_command_toggles unreadable (run supabase/command-toggles-m1.sql):", error.message);
      warnedMissing = true;
    }
    return new Set();
  }
  const off = new Set((data ?? []).map((r) => r.command_name as string));
  CACHE.set(communityId, { at: Date.now(), off });
  return off;
}

export async function isCommandOff(communityId: string, name: string): Promise<boolean> {
  return (await offCommands(communityId)).has(name);
}

export async function setCommandEnabled(args: {
  communityId: string;
  name: string;
  enabled: boolean;
  userId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createServiceClient()
    .from("gs_command_toggles")
    .upsert(
      { community_id: args.communityId, command_name: args.name, enabled: args.enabled, updated_by: args.userId },
      { onConflict: "community_id,command_name" },
    );
  CACHE.delete(args.communityId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
