export const GAME_NAMES: Record<string, string> = {
  "mario-kart-8-deluxe": "Mario Kart 8 Deluxe",
  "mario-kart-world": "Mario Kart World",
  "super-mario-party-jamboree": "Super Mario Party Jamboree",
  "mario-party-superstars": "Mario Party Superstars",
};

export function getGameName(slug: string): string {
  return GAME_NAMES[slug] || slug;
}
