/**
 * Module Registry layer — Spec 06 §3.
 *
 * Reads:
 *   - `isModuleEnabled(community, moduleKey)` — dispatcher gate
 *     check. Fails open if no row exists yet (community was created
 *     before the registry shipped); will be backfilled on the next
 *     `seedDefaultsForCommunity` call.
 *
 * Writes:
 *   - `seedDefaultsForCommunity(communityId)` — bootstrap a fresh
 *     community with the catalog defaults. Idempotent.
 *   - `setModuleEnabled(...)` — streamer-side toggle for the
 *     /twitch/modules manager UI.
 *
 * Cached for the lifetime of the request batch: 30s TTL per
 * (community, module_key) pair. Toggling via setModuleEnabled
 * invalidates the cache entry.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type ModuleKey =
  | "markets"
  | "bounty"
  | "award"
  | "chaos"
  | "random"
  | "leaderboard"
  | "custom_commands"
  | "seed_library";

export interface ModuleCatalogRow {
  module_key: ModuleKey;
  display_name: string;
  description: string;
  category: string;
  compliance_class: "none" | "prediction_pool" | "casino_style";
  default_enabled: boolean;
  age_gated: boolean;
  default_config: Record<string, unknown>;
  sort_order: number;
}

export interface CommunityModuleRow {
  community_id: string;
  module_key: ModuleKey;
  enabled: boolean;
  config: Record<string, unknown>;
  enabled_at: string | null;
  enabled_by: string | null;
}

const ENABLED_CACHE = new Map<string, { enabled: boolean; cachedAt: number }>();
const CACHE_TTL_MS = 30_000;

function cacheKey(communityId: string, moduleKey: string): string {
  return `${communityId}:${moduleKey}`;
}

/**
 * True when the module is enabled for the community. Fails OPEN
 * (returns true) when no row exists — that scenario means the
 * community pre-dates the registry; the seed helper will create
 * the rows on next contact. Per Spec 06 §3, the streamer enable
 * toggle is downstream of compliance; this is the gate the
 * dispatcher consults.
 */
export async function isModuleEnabled(
  communityId: string,
  moduleKey: string,
): Promise<boolean> {
  const key = cacheKey(communityId, moduleKey);
  const cached = ENABLED_CACHE.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.enabled;
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_community_modules")
    .select("enabled")
    .eq("community_id", communityId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  const enabled = data ? ((data as { enabled: boolean }).enabled === true) : true;
  ENABLED_CACHE.set(key, { enabled, cachedAt: Date.now() });
  return enabled;
}

export function invalidateModuleCache(communityId: string, moduleKey?: string): void {
  if (moduleKey) {
    ENABLED_CACHE.delete(cacheKey(communityId, moduleKey));
    return;
  }
  for (const key of ENABLED_CACHE.keys()) {
    if (key.startsWith(`${communityId}:`)) ENABLED_CACHE.delete(key);
  }
}

/**
 * Seed every catalog module into a fresh community's row set with
 * its default_enabled. Idempotent — re-runs against the
 * (community_id, module_key) unique constraint and DOes NOTHING for
 * any module that's already configured (preserving streamer overrides).
 */
export async function seedDefaultsForCommunity(
  communityId: string,
): Promise<{ inserted: number }> {
  const admin = createServiceClient();
  const { data: catalog } = await admin
    .from("gs_modules")
    .select("module_key, default_enabled");
  const rows = ((catalog as Array<{ module_key: string; default_enabled: boolean }> | null) ?? [])
    .map((m) => ({
      community_id: communityId,
      module_key: m.module_key,
      enabled: m.default_enabled,
    }));
  if (rows.length === 0) return { inserted: 0 };
  const { count } = await admin
    .from("gs_community_modules")
    .upsert(rows, { onConflict: "community_id,module_key", ignoreDuplicates: true, count: "exact" });
  invalidateModuleCache(communityId);
  return { inserted: count ?? 0 };
}

/** List the catalog (read-only). Used by the management UI. */
export async function listCatalog(): Promise<ModuleCatalogRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_modules")
    .select(
      "module_key, display_name, description, category, compliance_class, default_enabled, age_gated, default_config, sort_order",
    )
    .order("sort_order", { ascending: true });
  return ((data as ModuleCatalogRow[] | null) ?? []) as ModuleCatalogRow[];
}

/** List the streamer's current enablement + config per module. */
export async function listForCommunity(
  communityId: string,
): Promise<CommunityModuleRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_community_modules")
    .select(
      "community_id, module_key, enabled, config, enabled_at, enabled_by",
    )
    .eq("community_id", communityId);
  return ((data as CommunityModuleRow[] | null) ?? []) as CommunityModuleRow[];
}

/** Streamer-side toggle. The /twitch/modules manager calls this. */
export async function setModuleEnabled(args: {
  communityId: string;
  moduleKey: ModuleKey;
  enabled: boolean;
  byIdentityId?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_community_modules")
    .upsert(
      {
        community_id: args.communityId,
        module_key: args.moduleKey,
        enabled: args.enabled,
        enabled_at: args.enabled ? new Date().toISOString() : null,
        enabled_by: args.byIdentityId ?? null,
      },
      { onConflict: "community_id,module_key" },
    );
  if (error) {
    return { ok: false, reason: error.message };
  }
  invalidateModuleCache(args.communityId, args.moduleKey);
  return { ok: true };
}
