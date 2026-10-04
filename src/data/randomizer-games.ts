/**
 * Randomizer capability registry (client-safe — no game-data JSON). Declares
 * which randomize dimensions each game supports so the tournament randomizer UI
 * (manage card + sandbox) only shows options a game actually has. Adding a new
 * game/randomizer is a single entry here + its data in the generation lib.
 * See specs/gs-tournament-randomizers.md.
 */

import { randomizerPublic } from "@/lib/games-visibility";

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
  /** Has a roster for the random-character format ("a random fighter for every player each round"). */
  roster?: { noun: string; plural: string };
}

export const RANDOMIZER_GAMES: RandomizerGameMeta[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", tracks: true, tourOnly: true, combo: true, items: true },
  { slug: "mario-kart-world", label: "Mario Kart World", tracks: true, tourOnly: false, combo: true, items: true },
  { slug: "super-smash-bros-ultimate", label: "Super Smash Bros. Ultimate", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "fighter", plural: "fighters" } },
  { slug: "super-mario-party-jamboree", label: "Mario Party Jamboree", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "character", plural: "characters" } },
  { slug: "mario-party-superstars", label: "Mario Party Superstars", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "character", plural: "characters" } },
  { slug: "mario-party", label: "Mario Party", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "character", plural: "characters" } },
  { slug: "mario-party-2", label: "Mario Party 2", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "character", plural: "characters" } },
  { slug: "mario-party-3", label: "Mario Party 3", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "character", plural: "characters" } },
  { slug: "splatoon-3", label: "Splatoon 3", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "weapon", plural: "weapons" } },
  { slug: "kirby-air-riders", label: "Kirby Air Riders", tracks: false, tourOnly: false, combo: false, items: false, roster: { noun: "rider", plural: "riders" } },
];

export function randomizerGameMeta(slug: string | null | undefined): RandomizerGameMeta | null {
  return RANDOMIZER_GAMES.find((g) => g.slug === slug) ?? null;
}

/** Options for a game <Select> (hidden games left out). */
export const RANDOMIZER_GAME_OPTIONS = RANDOMIZER_GAMES.filter((g) => randomizerPublic(g.slug)).map((g) => ({ value: g.slug, label: g.label }));
