import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Platform feature flags — small admin-toggleable switches stored in
 * `gs_platform_flags` (see supabase/platform-flags.sql). Read via the service
 * role with a short in-memory cache so hot paths don't hit the DB every call;
 * writes come from the staff-gated admin API.
 */

export interface PlatformFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { enabled: boolean; ts: number }>();

/** Read one flag, with a 30s cache. Falls back to `fallback` on any error or a
 *  missing row (so a not-yet-seeded flag behaves as its default). */
export async function getPlatformFlag(key: string, fallback = false): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.enabled;
  try {
    const admin = createServiceClient();
    const { data } = await admin.from("gs_platform_flags").select("enabled").eq("key", key).maybeSingle();
    const enabled = data ? !!(data as { enabled: boolean }).enabled : fallback;
    cache.set(key, { enabled, ts: Date.now() });
    return enabled;
  } catch {
    return fallback;
  }
}

/** All flags (staff admin UI). */
export async function listPlatformFlags(): Promise<PlatformFlag[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_platform_flags")
    .select("key, enabled, description, updated_at")
    .order("key");
  return (data as PlatformFlag[] | null) ?? [];
}

/** Set a flag (staff admin API). Upserts so a new flag can be created inline. */
export async function setPlatformFlag(
  key: string,
  enabled: boolean,
  updatedBy: string | null,
  description?: string,
): Promise<void> {
  const admin = createServiceClient();
  const row: Record<string, unknown> = {
    key,
    enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  if (description !== undefined) row.description = description;
  await admin.from("gs_platform_flags").upsert(row, { onConflict: "key" });
  cache.set(key, { enabled, ts: Date.now() });
}
