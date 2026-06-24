/**
 * Curated catalog for the profile "Favorite games" picker. Names + cover art
 * (reusing the marketing showcase imagery). Stored on users.favorite_games as
 * a text[] of names; /u matches each back to art via gameArt(). Legacy/free
 * names with no match still render as a plain chip.
 */

export interface CatalogGame {
  name: string;
  image: string;
}

export const FAVORITE_GAME_CATALOG: CatalogGame[] = [
  {
    name: "Mario Kart World",
    image:
      "https://cdn.empac.co/gameshuffle/images/game-artwork/mariokartworld-artwork.jpg",
  },
  {
    name: "Mario Kart 8 Deluxe",
    image: "https://cdn.empac.co/gameshuffle/images/game-artwork/mk8dx-artwork.jpg",
  },
  {
    name: "Pokémon TCG",
    image: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
  },
  {
    name: "Super Smash Bros. Ultimate",
    image:
      "https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg",
  },
  {
    name: "Mario Party",
    image:
      "https://cdn.empac.co/gameshuffle/images/standard/mario-party-full-cast-artwork.jpg",
  },
  {
    name: "Jackbox",
    image: "https://cdn.empac.co/gameshuffle/images/standard/jackbox-games-artwork.jpg",
  },
];

/** Cover art for a stored favorite-game name, or null if not in the catalog. */
export function gameArt(name: string): string | null {
  const n = name.trim().toLowerCase();
  const hit = FAVORITE_GAME_CATALOG.find((g) => g.name.toLowerCase() === n);
  return hit?.image ?? null;
}
