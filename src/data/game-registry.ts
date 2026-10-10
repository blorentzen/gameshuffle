import { findGame } from "@/data/game-catalog";

export const GAME_NAMES: Record<string, string> = {
  "mario-kart-8-deluxe": "Mario Kart 8 Deluxe",
  "mario-kart-world": "Mario Kart World",
  "super-mario-party-jamboree": "Super Mario Party Jamboree",
  "mario-party-superstars": "Mario Party Superstars",
  "mario-party": "Mario Party",
  "mario-party-2": "Mario Party 2",
  "mario-party-3": "Mario Party 3",
  "super-smash-bros-ultimate": "Super Smash Bros. Ultimate",
  "splatoon-3": "Splatoon 3",
  "kirby-air-riders": "Kirby Air Riders",
  "pokemon-stadium": "Pokémon Stadium",
  "pokemon-stadium-2": "Pokémon Stadium 2",
  "goldeneye-007": "GoldenEye 007",
  "pokemon-firered-leafgreen": "Pokémon Fire Red & Leaf Green",
  "mario-kart-64": "Mario Kart 64",
  "perfect-dark": "Perfect Dark",
  "overwatch": "Overwatch",
  "marvel-rivals": "Marvel Rivals",
  "street-fighter-6": "Street Fighter 6",
  "tekken-8": "Tekken 8",
};

/** A game's display name: our own list, then the game catalog (any game a
 *  tournament or night can name, e.g. a typed "Rocket League" stored as
 *  `rocket-league`), then the slug turned back into words. Never the raw slug. */
export function getGameName(slug: string): string {
  if (GAME_NAMES[slug]) return GAME_NAMES[slug];
  const entry = findGame(slug);
  if (entry) return entry.name;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
