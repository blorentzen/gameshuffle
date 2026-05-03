/**
 * Race randomizer types — shared shapes for the race_randomizer module.
 *
 * Per gs-track-item-randomization-phase-a-spec.md §4.2.
 */

export type RaceGame = "mk8dx" | "mkworld";

export interface Track {
  /** Stable cup-prefixed slug, e.g. 'propeller-sky-high-sundae'. Cup
   *  prefix disambiguates the same name appearing in multiple cups
   *  (Mario Circuit appears in Flower, Shell, Boomerang; Rainbow Road
   *  in Special, Lightning, Triforce, Moon, Spiny). */
  id: string;
  /** Display name as shown to viewers. */
  name: string;
  /** Cup grouping, used for visual grouping in the configure UI. */
  cup: string;
  /** Full CDN URL for the track artwork. */
  image: string;
  game: RaceGame;
}

/**
 * MKWorld knockout rally — a separate game mode from races. Rallies
 * are 24-player elimination events along a planned route; rolling one
 * is parallel to (but distinct from) rolling a race track.
 */
export interface Rally {
  id: string;
  name: string;
  image: string;
  game: RaceGame;
}

/**
 * Item *mode* — a themed item box the streamer can roll for a race.
 * Each mode is a curated list of item IDs that defines what can appear
 * in the lobby's box for that race. Examples: "Rise of the Koopa"
 * (shells only), "Need for Speed" (mushrooms + Bullet Bill).
 *
 * Per Britton's themed-modes spec — replaces the old generic rule-set
 * modes (Normal / Frantic / No Items / etc.) with curated themed
 * item sets. Each mode IS the item pool when rolled — no separate
 * "Custom" path needed.
 *
 * (Naming note: this type was called `ItemPreset` before the multi-game
 * spec split modes from literal items. `ItemPreset` is kept as a
 * deprecated alias in `index.ts`.)
 */
export interface ItemMode {
  id: string;
  name: string;
  description: string;
  game: RaceGame;
  /** Item IDs that make up this mode's box. Surfaced in chat when the
   *  mode rolls so viewers know what's in play. References ids in
   *  `MK8DX_ITEMS` / equivalent per-game item catalog. */
  items: string[];
}

/**
 * Individual item — a single physical item that can appear in the box.
 * Picks/bans operate on these independently of modes, so a streamer can
 * keep "Frantic" mode running but ban Blue Shells, or use "Custom" mode
 * to assemble a literal pool from scratch.
 */
export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  game: RaceGame;
  /** Optional CDN icon. Items render as artwork tiles when present, text
   *  chips otherwise. */
  image?: string;
}

/** Coarse grouping for the item-picker UI (visual cup-style headers). */
export type ItemCategory =
  | "offensive"
  | "defensive"
  | "speed"
  | "utility"
  | "special";

/**
 * @deprecated Renamed to `ItemMode`. Kept as an alias during the
 * multi-game spec rollout — remove once all callers reference `ItemMode`.
 */
export type ItemPreset = ItemMode;
