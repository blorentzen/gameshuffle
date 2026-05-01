/**
 * Race randomizer entry point — exposes lookups and randomization logic
 * for the race_randomizer module.
 *
 * Picks/bans logic per gs-track-item-randomization-phase-a-spec.md §4.3:
 *   - If `picks` is non-empty, the pool is restricted to picks
 *   - If `bans` is non-empty, the pool excludes bans
 *   - When both are set: picks beats bans (picks define the pool, bans
 *     subtract from it). UI prevents banning a picked id; this branch
 *     stays defensive in case state drifts
 *   - Returns null when the resulting pool is empty
 */

import type {
  RaceRandomizerSubConfig,
} from "@/lib/modules/types";
import { MK8DX_TRACKS } from "./tracks/mk8dx";
import { MKWORLD_TRACKS } from "./tracks/mkworld";
import { MK8DX_ITEM_PRESETS } from "./items/mk8dx";
import type { ItemPreset, RaceGame, Track } from "./types";

export type { ItemPreset, RaceGame, Track } from "./types";

const TRACKS_BY_GAME: Record<RaceGame, Track[]> = {
  mk8dx: MK8DX_TRACKS,
  mkworld: MKWORLD_TRACKS,
};

const ITEM_PRESETS_BY_GAME: Record<RaceGame, ItemPreset[]> = {
  mk8dx: MK8DX_ITEM_PRESETS,
  // MKWorld item presets are out-of-scope for Phase A per content
  // inventory §3. Empty list → randomization returns null and the
  // chat/UI surfaces explain the pool is empty.
  mkworld: [],
};

const TRACK_BY_ID = new Map<string, Track>();
for (const t of [...MK8DX_TRACKS, ...MKWORLD_TRACKS]) TRACK_BY_ID.set(t.id, t);

const ITEM_PRESET_BY_ID = new Map<string, ItemPreset>();
for (const p of MK8DX_ITEM_PRESETS) ITEM_PRESET_BY_ID.set(p.id, p);

/** Resolve a track by id across both games. */
export function getTrackById(id: string): Track | null {
  return TRACK_BY_ID.get(id) ?? null;
}

/** Resolve an item preset by id. */
export function getItemPresetById(id: string): ItemPreset | null {
  return ITEM_PRESET_BY_ID.get(id) ?? null;
}

/** All tracks for a given game (useful for the configure UI). */
export function listTracksForGame(game: RaceGame): Track[] {
  return TRACKS_BY_GAME[game] ?? [];
}

/** All item presets for a given game. */
export function listItemPresetsForGame(game: RaceGame): ItemPreset[] {
  return ITEM_PRESETS_BY_GAME[game] ?? [];
}

/**
 * Apply picks/bans to a base pool, returning the IDs eligible for
 * randomization. Pure function so the test surface can verify all
 * branch cases without DB.
 */
export function applyPicksBansToPool<T extends { id: string }>(
  pool: T[],
  config: RaceRandomizerSubConfig
): T[] {
  let working = pool;
  if (config.picks.length > 0) {
    const allow = new Set(config.picks);
    working = working.filter((item) => allow.has(item.id));
  }
  if (config.bans.length > 0) {
    const deny = new Set(config.bans);
    working = working.filter((item) => !deny.has(item.id));
  }
  return working;
}

function pickRandom<T>(pool: T[]): T | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Randomize a track for the given game, respecting the sub-config's
 * picks/bans. Returns null when the pool is empty after filtering or
 * when track randomization is disabled.
 */
export function randomizeTrack(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): Track | null {
  if (!config.enabled) return null;
  const pool = applyPicksBansToPool(listTracksForGame(game), config);
  return pickRandom(pool);
}

/**
 * Randomize an item preset for the given game, respecting the sub-config.
 */
export function randomizeItems(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): ItemPreset | null {
  if (!config.enabled) return null;
  const pool = applyPicksBansToPool(listItemPresetsForGame(game), config);
  return pickRandom(pool);
}
