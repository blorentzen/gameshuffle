/**
 * One key per game across GameShuffle (game spaces picks 2026-11-05, 12A step 1,
 * https://claude.ai/artifact/YBhN8GBidm9XpEkx78EbWw): the game catalog's slug ("mario-kart-8-deluxe").
 *
 * Games are named four ways in the code and the database, and `gameKey` turns any of them into the key:
 *   - catalog slugs ("mario-kart-8-deluxe", tournaments.game_slug, events, series),
 *   - competitive codes ("mk8dx", "mkworld", "mkworld12p", "mkworld24p": lounge, time trials, ladders, wars),
 *   - our app's own slugs where they differ ("mario-party" is the N64 game on a live night),
 *   - names people typed (users.favorite_games, "MK8DX", "Mario Kart 8"), through the catalog's names and aliases.
 * Series names ("pokemon", "mario-kart", the trivia packs' game_slug) name a family, not one game: `familyKeys`.
 * Client-safe and pure.
 */

import { GAME_CATALOG, catalogForApp, catalogGame, type CatalogEntry } from "@/data/game-catalog";

export type GameKey = string;

const BY_SLUG = new Map<string, CatalogEntry>(GAME_CATALOG.map((g) => [g.slug, g]));

/** The competitive codes (lounge, time trials, ladders, wars) and other short codes, to their game. */
const CODES: Record<string, GameKey> = {
  mk8dx: "mario-kart-8-deluxe",
  mk8: "mario-kart-8-deluxe",
  mkworld: "mario-kart-world",
  mkworld12p: "mario-kart-world",
  mkworld24p: "mario-kart-world",
  mkw: "mario-kart-world",
  mk64: "mario-kart-64",
  ssbu: "super-smash-bros-ultimate",
  kar: "kirby-air-riders",
};

/** The key for any way a game is named, or null for a game GameShuffle doesn't know (a custom name). */
export function gameKey(input: string | null | undefined): GameKey | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (BY_SLUG.has(lower)) return lower;
  if (CODES[lower]) return CODES[lower];
  const app = catalogForApp(lower);
  if (app) return app.slug;
  return catalogGame(raw)?.slug ?? null;
}

/** The catalog entry for a key (or anything `gameKey` reads). */
export function gameEntry(input: string | null | undefined): CatalogEntry | null {
  const k = gameKey(input);
  return k ? BY_SLUG.get(k) ?? null : null;
}

/**
 * Series names to the games in them ("pokemon" → every Pokémon game we know). Used where a thing names a family
 * rather than one game (the trivia packs' game_slug, hashtags).
 */
const FAMILIES: Record<string, (g: CatalogEntry) => boolean> = {
  pokemon: (g) => g.family === "Pokémon",
  "mario-kart": (g) => g.family === "Mario Kart",
  "mario-party": (g) => g.family === "Mario Party",
  "super-smash-bros": (g) => g.slug.startsWith("super-smash-bros"),
  smash: (g) => g.slug.startsWith("super-smash-bros"),
  sonic: (g) => g.slug.startsWith("sonic-"),
};

export function familyKeys(family: string | null | undefined): GameKey[] {
  const test = family ? FAMILIES[family.toLowerCase()] : null;
  return test ? GAME_CATALOG.filter(test).map((g) => g.slug) : [];
}
