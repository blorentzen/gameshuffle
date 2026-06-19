/**
 * Streamer-level module default storage.
 *
 * Backed by the `streamer_module_defaults` table: one row per
 * (owner_user_id, module_id, game_slug). Streamers configure these
 * on `/account?tab=game-modules`; the session-creation seed helper
 * consults them before falling back to the hardcoded
 * `RACE_RANDOMIZER_TEMPLATES` constants.
 *
 * All operations use the service-role admin client so they bypass
 * RLS — call sites are server-only (API routes + the seed helper).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ModuleId, ConfigForModule } from "./types";

/** Look up a single streamer default. Returns null when not set. */
export async function getStreamerModuleDefault<Id extends ModuleId>(args: {
  ownerUserId: string;
  moduleId: Id;
  gameSlug: string;
}): Promise<ConfigForModule<Id> | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("streamer_module_defaults")
    .select("config")
    .eq("owner_user_id", args.ownerUserId)
    .eq("module_id", args.moduleId)
    .eq("game_slug", args.gameSlug)
    .maybeSingle();
  if (!data) return null;
  return ((data as { config: unknown }).config ?? null) as
    | ConfigForModule<Id>
    | null;
}

/** Upsert a streamer default. The unique index on
 *  (owner_user_id, module_id, game_slug) handles concurrent writes
 *  cleanly — last write wins. */
export async function setStreamerModuleDefault<Id extends ModuleId>(args: {
  ownerUserId: string;
  moduleId: Id;
  gameSlug: string;
  config: ConfigForModule<Id>;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("streamer_module_defaults")
    .upsert(
      {
        owner_user_id: args.ownerUserId,
        module_id: args.moduleId,
        game_slug: args.gameSlug,
        config: args.config as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id,module_id,game_slug" },
    );
  if (error) throw error;
}

/** List every saved default for a streamer + module. Used by the
 *  account-level Game Modules page to render the per-game cards
 *  with their hydrated state. */
export async function listStreamerModuleDefaults<Id extends ModuleId>(args: {
  ownerUserId: string;
  moduleId: Id;
}): Promise<Array<{ gameSlug: string; config: ConfigForModule<Id> }>> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("streamer_module_defaults")
    .select("game_slug, config")
    .eq("owner_user_id", args.ownerUserId)
    .eq("module_id", args.moduleId);
  return ((data as Array<{ game_slug: string; config: unknown }> | null) ?? [])
    .map((r) => ({
      gameSlug: r.game_slug,
      config: r.config as ConfigForModule<Id>,
    }));
}
