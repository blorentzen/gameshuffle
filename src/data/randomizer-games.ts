/**
 * Randomizer capability registry (client-safe — no game-data JSON). Declares
 * which randomize dimensions each game supports so the tournament randomizer UI
 * (manage card + sandbox) only shows options a game actually has. Adding a new
 * game/randomizer is a single entry here + its data in the generation lib.
 * See specs/gs-tournament-randomizers.md.
 */

export interface RandomizerGameMeta {
  slug: string;
  label: string;
  /** Has a track pool to randomize. */
  tracks: boolean;
  /** Tracks have a "Tour" subset (the tour-only filter is meaningful). */
  tourOnly: boolean;
  /** Has kart combos to randomize. */
  combo: boolean;
  /** Has an item set to randomize. */
  items: boolean;
}

export const RANDOMIZER_GAMES: RandomizerGameMeta[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", tracks: true, tourOnly: true, combo: true, items: true },
  { slug: "mario-kart-world", label: "Mario Kart World", tracks: true, tourOnly: false, combo: true, items: true },
];

export function randomizerGameMeta(slug: string | null | undefined): RandomizerGameMeta | null {
  return RANDOMIZER_GAMES.find((g) => g.slug === slug) ?? null;
}

/** Options for a game <Select>. */
export const RANDOMIZER_GAME_OPTIONS = RANDOMIZER_GAMES.map((g) => ({ value: g.slug, label: g.label }));
