export const GAME_NAMES: Record<string, string> = {
  "mario-kart-8-deluxe": "Mario Kart 8 Deluxe",
  "mario-kart-world": "Mario Kart World",
  "super-mario-party-jamboree": "Super Mario Party Jamboree",
  "mario-party-superstars": "Mario Party Superstars",
  "super-smash-bros-ultimate": "Super Smash Bros. Ultimate",
  "splatoon-3": "Splatoon 3",
  "kirby-air-riders": "Kirby Air Riders",
  "pokemon-stadium": "Pokémon Stadium",
  "goldeneye-007": "GoldenEye 007",
};

export function getGameName(slug: string): string {
  return GAME_NAMES[slug] || slug;
}
