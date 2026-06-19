/**
 * session_modules read/write helpers. All operations use the service-role
 * admin client because chat handlers and the (future) Hub API both need
 * to bypass RLS.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { MODULE_REGISTRY } from "./registry";
import type {
  ConfigForModule,
  ModuleId,
  StateForModule,
} from "./types";

export interface SessionModuleRow<Id extends ModuleId = ModuleId> {
  id: string;
  session_id: string;
  module_id: Id;
  enabled: boolean;
  config: ConfigForModule<Id>;
  state: StateForModule<Id>;
  created_at: string;
  updated_at: string;
}

/**
 * Ensure a session has a row for `moduleId`. Idempotent — first call
 * inserts with the registry's defaultConfig + an empty state; subsequent
 * calls return the existing row unchanged. Used by the auto-enable path
 * on session start (kart_randomizer always auto-enables) and by the Hub
 * when a streamer flips a module on for the first time.
 */
export async function ensureSessionModule<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  enabled?: boolean;
  initialState?: StateForModule<Id>;
}): Promise<SessionModuleRow<Id>> {
  const admin = createServiceClient();
  const def = MODULE_REGISTRY[args.moduleId];
  const enabled = args.enabled ?? true;

  const { data: existing } = await admin
    .from("session_modules")
    .select("*")
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId)
    .maybeSingle();
  if (existing) return existing as SessionModuleRow<Id>;

  const { data: inserted, error } = await admin
    .from("session_modules")
    .insert({
      session_id: args.sessionId,
      module_id: args.moduleId,
      enabled,
      config: def.defaultConfig as Record<string, unknown>,
      state: (args.initialState ?? {}) as Record<string, unknown>,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    throw new Error(
      `[modules/store] failed to insert session_module ${args.moduleId} for session ${args.sessionId}: ${error?.message ?? "unknown"}`
    );
  }
  return inserted as SessionModuleRow<Id>;
}

/** Look up a single module row for a session. Returns null when not enabled / not present. */
export async function getSessionModule<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  /** When true, returns the row even if `enabled = false`. Default false. */
  includeDisabled?: boolean;
}): Promise<SessionModuleRow<Id> | null> {
  const admin = createServiceClient();
  let query = admin
    .from("session_modules")
    .select("*")
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (!args.includeDisabled) {
    query = query.eq("enabled", true);
  }
  const { data } = await query.maybeSingle();
  return (data as SessionModuleRow<Id> | null) ?? null;
}

/** Update the runtime state portion. Used by chat command handlers. */
export async function updateModuleState<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  state: StateForModule<Id>;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ state: args.state as Record<string, unknown> })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) {
    console.error(
      `[modules/store] failed to update state for ${args.moduleId} on session ${args.sessionId}:`,
      error
    );
    throw error;
  }
}

/** Update the config portion. Used by the Hub UI / future API. */
export async function updateModuleConfig<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  config: ConfigForModule<Id>;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ config: args.config as unknown as Record<string, unknown> })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) throw error;
}

// ---- Per-game module config (multi-game spec) ----------------------------
//
// The multi-game data model wraps `session_modules.config` so each
// configured game holds its own slice. Shape:
//
//   { per_game: { "mario-kart-8-deluxe": { ...legacy }, "mario-kart-world": { ...legacy } } }
//
// Reads support a legacy unwrapped shape: when `config.per_game` is
// absent, the row is treated as a single-game config bound to whatever
// game the caller asks for. Writes always emit the wrapped form, so the
// next read sees the new shape — opportunistic migration with no
// big-bang DB step required (though the SQL migration accelerates it).

/**
 * Read a module's config for a specific game slug.
 *
 * - If the row's config is in the wrapped form (`{ per_game: { ... } }`),
 *   returns the slice for `gameSlug` or `null` when absent.
 * - If the row's config is in the legacy unwrapped form, returns the
 *   whole config (treated as the slice for whatever game the caller asks
 *   for — preserves single-game behavior during the transition window).
 * - Returns `null` when the row itself doesn't exist.
 */
export async function getModuleConfigForGame<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  gameSlug: string | null | undefined;
  includeDisabled?: boolean;
}): Promise<ConfigForModule<Id> | null> {
  const row = await getSessionModule({
    sessionId: args.sessionId,
    moduleId: args.moduleId,
    includeDisabled: args.includeDisabled,
  });
  if (!row) return null;
  const raw = row.config as unknown as Record<string, unknown> | null;
  if (!raw) return null;
  if (isPerGameWrapped(raw)) {
    if (!args.gameSlug) return null;
    const slice = (raw.per_game as Record<string, unknown>)[args.gameSlug];
    return (slice ?? null) as ConfigForModule<Id> | null;
  }
  // Legacy unwrapped shape — treat as the slice for the requested game.
  return raw as unknown as ConfigForModule<Id>;
}

/**
 * Write a module's config slice for a specific game slug. Existing slices
 * for other games are preserved. If the row's config was previously in
 * legacy unwrapped form, the whole thing is migrated to the wrapped form
 * with the legacy slice keyed under the game from `legacyGameSlug` (if
 * provided) — otherwise it's discarded in favor of the new write.
 */
export async function updateModuleConfigForGame<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  gameSlug: string;
  config: ConfigForModule<Id>;
  /** When the row is still legacy-shaped, fold its existing config under
   *  this game slug as we wrap. Defaults to dropping the legacy slice. */
  legacyGameSlug?: string;
}): Promise<void> {
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("session_modules")
    .select("config")
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId)
    .maybeSingle();

  const existing = (row?.config as Record<string, unknown> | null) ?? null;
  let nextPerGame: Record<string, unknown>;

  if (existing && isPerGameWrapped(existing)) {
    nextPerGame = {
      ...(existing.per_game as Record<string, unknown>),
      [args.gameSlug]: args.config as unknown as Record<string, unknown>,
    };
  } else if (existing && args.legacyGameSlug) {
    // Wrap the legacy slice under `legacyGameSlug` and add the new
    // write — only happens once per row, on the first write after the
    // multi-game spec lands.
    nextPerGame = {
      [args.legacyGameSlug]: existing,
      [args.gameSlug]: args.config as unknown as Record<string, unknown>,
    };
  } else {
    nextPerGame = {
      [args.gameSlug]: args.config as unknown as Record<string, unknown>,
    };
  }

  const { error } = await admin
    .from("session_modules")
    .update({ config: { per_game: nextPerGame } })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) throw error;
}

/**
 * Lazy-seed missing per-game slices for race_randomizer.
 *
 * Why this exists: chat command handlers call
 * `getModuleConfigForGame(..., gameSlug)`. When the streamer hasn't
 * explicitly saved the Modules tab, the session_modules row either
 * (a) doesn't exist OR (b) exists but is in the legacy unwrapped
 * shape (from `ensureSessionModule`'s registry default). In both
 * cases, when the active slug differs from the legacy-default slug
 * the lookup returns null and the command bails with "Race
 * randomizer isn't enabled."
 *
 * The fix: as soon as we have a session + its configured games,
 * write the per-game template for every game that doesn't yet have
 * a slice. Idempotent — existing slices are never overwritten, so
 * the streamer's customizations survive.
 *
 * Called from the hub session-detail page loader (server component)
 * so by the time the UI renders OR a chat command fires, every
 * configured game has a populated slice. Best-effort: errors are
 * logged but don't block the page render.
 */
export async function ensureRaceRandomizerSlices(args: {
  sessionId: string;
  ownerUserId: string;
  configuredGames: string[];
}): Promise<void> {
  if (args.configuredGames.length === 0) return;
  const admin = createServiceClient();

  // Lazy-load the resolver so this function stays cheap when called
  // on a session whose slices are already fully seeded (no DB
  // lookups for streamer overrides happen unless we actually need
  // to seed a missing slice below).
  const { resolveRaceRandomizerTemplate } = await import("./templateResolver");

  const { data: existing } = await admin
    .from("session_modules")
    .select("config")
    .eq("session_id", args.sessionId)
    .eq("module_id", "race_randomizer")
    .maybeSingle();

  // Build the next per_game payload from whatever already exists.
  // Three start states to handle:
  //   - No row at all → start with an empty wrapper.
  //   - Row exists, wrapped → start with the existing per_game map.
  //   - Row exists, legacy unwrapped → fold the legacy slice under
  //     configured_games[0] (the historical implicit alias).
  let nextPerGame: Record<string, unknown> = {};
  let needsWrap = false;
  if (existing?.config) {
    const raw = existing.config as Record<string, unknown>;
    if (isPerGameWrapped(raw)) {
      nextPerGame = { ...(raw.per_game as Record<string, unknown>) };
    } else {
      // Legacy unwrapped — preserve under the canonical first-game
      // alias so existing customizations don't disappear.
      const legacyKey = args.configuredGames[0];
      if (legacyKey) {
        nextPerGame = { [legacyKey]: raw };
      }
      needsWrap = true;
    }
  }

  // Add a template-default slice for every configured game that
  // doesn't already have one. Resolver returns the streamer's saved
  // account-level default (from `streamer_module_defaults`) when
  // present, else the hardcoded baseline.
  let added = false;
  for (const slug of args.configuredGames) {
    if (slug in nextPerGame) continue;
    const template = await resolveRaceRandomizerTemplate({
      ownerUserId: args.ownerUserId,
      gameSlug: slug,
    });
    nextPerGame[slug] = template as unknown as Record<string, unknown>;
    added = true;
  }

  // Nothing to do if no slices were added AND the existing row was
  // already wrapped — saves a write per page load.
  if (!added && !needsWrap) return;

  if (!existing) {
    // No row yet — create one with the seeded per_game payload + the
    // registry's default top-level enabled flag.
    const { error: insertErr } = await admin
      .from("session_modules")
      .insert({
        session_id: args.sessionId,
        module_id: "race_randomizer",
        enabled: true,
        config: { per_game: nextPerGame },
        state: {},
      });
    if (insertErr) {
      // 23505 = unique violation — another loader raced us to insert.
      // Re-fetch and merge our slices in via update.
      if (insertErr.code !== "23505") {
        console.error(
          "[modules/store] ensureRaceRandomizerSlices insert failed",
          insertErr,
        );
        return;
      }
    } else {
      return;
    }
  }

  // Row exists (either already, or after a race-loss above) — patch
  // in the seeded per_game map.
  const { error: updateErr } = await admin
    .from("session_modules")
    .update({ config: { per_game: nextPerGame } })
    .eq("session_id", args.sessionId)
    .eq("module_id", "race_randomizer");
  if (updateErr) {
    console.error(
      "[modules/store] ensureRaceRandomizerSlices update failed",
      updateErr,
    );
  }
}

function isPerGameWrapped(
  config: Record<string, unknown>
): config is { per_game: Record<string, unknown> } {
  return (
    typeof config.per_game === "object" &&
    config.per_game !== null &&
    !Array.isArray(config.per_game)
  );
}

/** Toggle the enabled flag. Used by the Hub UI. */
export async function setModuleEnabled<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  enabled: boolean;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ enabled: args.enabled })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) throw error;
}
