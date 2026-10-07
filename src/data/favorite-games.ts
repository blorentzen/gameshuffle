/**
 * Favorite games: the profile picker and everything that shows a stored
 * favorite name with art. Names come from the game catalog
 * (src/data/game-catalog.ts, box art for every entry); people can also add a
 * game that isn't there ("Other"), stored as typed and shown as a lettered
 * tile until the catalog gains it. Stored on users.favorite_games as text[].
 */

import { GAME_CATALOG, boxArt, catalogGame } from "@/data/game-catalog";

export interface CatalogGame {
  name: string;
  image: string;
}

/** Wide key art kept for the original picker games (profile headers and wide tiles use it). */
const KEY_ART: Record<string, string> = {
  "mario-kart-world": "https://cdn.empac.co/gameshuffle/images/game-artwork/mariokartworld-artwork.jpg",
  "mario-kart-8-deluxe": "https://cdn.empac.co/gameshuffle/images/game-artwork/mk8dx-artwork.jpg",
  "pokemon-tcg": "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
  "super-smash-bros-ultimate": "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg",
  "mario-party-series": "https://cdn.empac.co/gameshuffle/images/standard/mario-party-full-cast-artwork.jpg",
  "jackbox": "https://cdn.empac.co/gameshuffle/images/standard/jackbox-games-artwork.jpg",
};

/** Every catalog game with art (key art where we have it, else box art), A to Z. */
export const FAVORITE_GAME_CATALOG: CatalogGame[] = GAME_CATALOG
  .flatMap((g) => {
    const image = KEY_ART[g.slug] ?? boxArt(g);
    return image ? [{ name: g.name, image }] : [];
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** The games GameShuffle has tools for (listed first in pickers). */
export const LIVE_GAME_NAMES = new Set(GAME_CATALOG.filter((g) => g.status === "live").map((g) => g.name));

/** Most favorites a profile shows. */
export const MAX_FAVORITE_GAMES = 12;

/** Wide art for a stored favorite-game name (key art, else box art), or null for a game not in the catalog. */
export function gameArt(name: string): string | null {
  const g = catalogGame(name);
  return g ? KEY_ART[g.slug] ?? boxArt(g) : null;
}

/** Whether a stored name is a custom ("Other") game the catalog doesn't know yet. */
export function isCustomGame(name: string): boolean {
  return !catalogGame(name);
}
