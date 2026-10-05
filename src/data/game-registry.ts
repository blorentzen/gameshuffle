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
  "goldeneye-007": "GoldenEye 007",
  "pokemon-firered-leafgreen": "Pokémon Fire Red & Leaf Green",
};

export function getGameName(slug: string): string {
  return GAME_NAMES[slug] || slug;
}
