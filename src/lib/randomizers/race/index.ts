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
import { MKWORLD_RALLIES } from "./rallies/mkworld";
import { MK8DX_ITEM_MODES, MK8DX_ITEMS } from "./items/mk8dx";
import { MKWORLD_ITEM_MODES, MKWORLD_ITEMS } from "./items/mkworld";
import type {
  Item,
  ItemMode,
  ItemPreset,
  RaceGame,
  Rally,
  Track,
} from "./types";

export type {
  Item,
  ItemMode,
  ItemPreset,
  RaceGame,
  Rally,
  Track,
} from "./types";

const TRACKS_BY_GAME: Record<RaceGame, Track[]> = {
  mk8dx: MK8DX_TRACKS,
  mkworld: MKWORLD_TRACKS,
};

/** MKWorld is the only game with knockout rallies today. MK8DX gets an
 *  empty list — the rallies sub-pool just doesn't surface in the UI. */
const RALLIES_BY_GAME: Record<RaceGame, Rally[]> = {
  mk8dx: [],
  mkworld: MKWORLD_RALLIES,
};

const ITEM_MODES_BY_GAME: Record<RaceGame, ItemMode[]> = {
  mk8dx: MK8DX_ITEM_MODES,
  mkworld: MKWORLD_ITEM_MODES,
};

const ITEMS_BY_GAME: Record<RaceGame, Item[]> = {
  mk8dx: MK8DX_ITEMS,
  mkworld: MKWORLD_ITEMS,
};

const TRACK_BY_ID = new Map<string, Track>();
for (const t of [...MK8DX_TRACKS, ...MKWORLD_TRACKS]) TRACK_BY_ID.set(t.id, t);

const RALLY_BY_ID = new Map<string, Rally>();
for (const r of MKWORLD_RALLIES) RALLY_BY_ID.set(r.id, r);

const ITEM_MODE_BY_ID = new Map<string, ItemMode>();
for (const p of [...MK8DX_ITEM_MODES, ...MKWORLD_ITEM_MODES]) {
  ITEM_MODE_BY_ID.set(p.id, p);
}

const ITEM_BY_ID = new Map<string, Item>();
for (const i of [...MK8DX_ITEMS, ...MKWORLD_ITEMS]) ITEM_BY_ID.set(i.id, i);

/** Resolve a track by id across both games. Track ids are cup-prefixed
 *  so they're unique across MK8DX + MKWorld; no game scoping needed. */
export function getTrackById(id: string): Track | null {
  return TRACK_BY_ID.get(id) ?? null;
}

/** Resolve a rally by id (MKWorld only — MK8DX has none). */
export function getRallyById(id: string): Rally | null {
  return RALLY_BY_ID.get(id) ?? null;
}

/** Resolve an item mode by id, optionally scoped to a specific game.
 *  Item mode IDs CAN collide between games (`normal` exists for MKW;
 *  MK8DX uses themed IDs like `mk64`). Pass the game when you know
 *  it for correct disambiguation. */
export function getItemModeById(
  id: string,
  game?: RaceGame
): ItemMode | null {
  if (game) {
    return (
      (ITEM_MODES_BY_GAME[game] ?? []).find((m) => m.id === id) ?? null
    );
  }
  return ITEM_MODE_BY_ID.get(id) ?? null;
}

/** Resolve a literal item by id, optionally scoped to a specific game.
 *  Item IDs SHARE between games (`green-shell` exists in both); pass
 *  the game so the lookup returns the right per-game artwork. Without
 *  the game param, the merged map answers (last-write-wins between
 *  catalogs — fine for display where the name is what matters). */
export function getItemById(id: string, game?: RaceGame): Item | null {
  if (game) {
    return (ITEMS_BY_GAME[game] ?? []).find((i) => i.id === id) ?? null;
  }
  return ITEM_BY_ID.get(id) ?? null;
}

/** @deprecated Renamed to `getItemModeById`. */
export function getItemPresetById(id: string): ItemPreset | null {
  return getItemModeById(id);
}

/** All tracks for a given game (useful for the configure UI). */
export function listTracksForGame(game: RaceGame): Track[] {
  return TRACKS_BY_GAME[game] ?? [];
}

/** All knockout rallies for a given game. MK8DX returns []. */
export function listRalliesForGame(game: RaceGame): Rally[] {
  return RALLIES_BY_GAME[game] ?? [];
}

/** Randomize a rally for the given game, respecting picks/bans. */
export function randomizeRally(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): Rally | null {
  if (!config.enabled) return null;
  const pool = applyPicksBansToPool(listRalliesForGame(game), config);
  return pickRandom(pool);
}

/** All item modes for a given game. */
export function listItemModesForGame(game: RaceGame): ItemMode[] {
  return ITEM_MODES_BY_GAME[game] ?? [];
}

/** All literal items for a given game. */
export function listItemsForGame(game: RaceGame): Item[] {
  return ITEMS_BY_GAME[game] ?? [];
}

/** @deprecated Renamed to `listItemModesForGame`. */
export function listItemPresetsForGame(game: RaceGame): ItemPreset[] {
  return listItemModesForGame(game);
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
 * Randomize an item *mode* for the given game, respecting the sub-config.
 */
export function randomizeItemMode(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): ItemMode | null {
  if (!config.enabled) return null;
  const pool = applyPicksBansToPool(listItemModesForGame(game), config);
  return pickRandom(pool);
}

/**
 * @deprecated Renamed to `randomizeItemMode` to disambiguate from
 * `randomizeLiteralItems`. Behavior unchanged.
 */
export function randomizeItems(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): ItemPreset | null {
  return randomizeItemMode(game, config);
}

/**
 * Randomize a single literal item from the per-game item box,
 * respecting the literal-pool sub-config. Used when the rolled mode has
 * `usesLiteralPool: true` (e.g. "Custom").
 */
export function randomizeLiteralItem(
  game: RaceGame,
  config: RaceRandomizerSubConfig
): Item | null {
  if (!config.enabled) return null;
  const pool = applyPicksBansToPool(listItemsForGame(game), config);
  return pickRandom(pool);
}

/**
 * Randomize a subset of N literal items for the given game (no
 * duplicates within the subset). Used to seed a "Custom" mode's lobby
 * with a randomized hand-picked pool.
 */
export function randomizeLiteralItemSubset(
  game: RaceGame,
  config: RaceRandomizerSubConfig,
  count: number
): Item[] {
  if (!config.enabled) return [];
  const pool = applyPicksBansToPool(listItemsForGame(game), config);
  if (pool.length === 0) return [];
  const target = Math.max(1, Math.min(count, pool.length));
  // Fisher-Yates shuffle, take first `target`. O(n) and unbiased.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, target);
}
