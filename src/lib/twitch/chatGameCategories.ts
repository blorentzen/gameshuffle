/**
 * Twitch categories for every game with chat rolls, so going live in Smash or
 * Overwatch opens a session that rolls for it. Ids from Helix `GET /games`,
 * checked 2026-10-06.
 *
 * The `twitch_game_categories` table still wins when it has a row (it holds
 * the two Mario Kart games and an `active` switch per game); this list covers
 * the rest without a migration. Names match case-insensitively, as the table
 * lookup does, since Twitch sometimes changes ids.
 */

export interface ChatGameCategory {
  id: string;
  name: string;
  slug: string;
}

export const CHAT_GAME_CATEGORIES: ChatGameCategory[] = [
  { id: "941530474", name: "Mario Kart 8 Deluxe", slug: "mario-kart-8-deluxe" },
  { id: "1826300051", name: "Mario Kart World", slug: "mario-kart-world" },
  { id: "9250", name: "Mario Kart 64", slug: "mario-kart-64" },
  { id: "504461", name: "Super Smash Bros. Ultimate", slug: "super-smash-bros-ultimate" },
  { id: "1471610418", name: "Super Mario Party Jamboree", slug: "super-mario-party-jamboree" },
  { id: "1068239917", name: "Mario Party Superstars", slug: "mario-party-superstars" },
  { id: "5887", name: "Mario Party", slug: "mario-party" },
  { id: "11176", name: "Mario Party 2", slug: "mario-party-2" },
  { id: "11432", name: "Mario Party 3", slug: "mario-party-3" },
  { id: "515025", name: "Overwatch", slug: "overwatch" },
  { id: "1264310518", name: "Marvel Rivals", slug: "marvel-rivals" },
  { id: "1158884259", name: "Splatoon 3", slug: "splatoon-3" },
  { id: "2086806174", name: "Kirby Air Riders", slug: "kirby-air-riders" },
  { id: "829248383", name: "GoldenEye 007", slug: "goldeneye-007" },
  { id: "2686", name: "Perfect Dark", slug: "perfect-dark" },
  { id: "6657", name: "Pokémon Stadium", slug: "pokemon-stadium" },
  { id: "5620", name: "Pokémon Stadium 2", slug: "pokemon-stadium-2" },
];

/** The slug for a category, by id first and then by name. */
export function chatGameSlugForCategory(id: string | null, name: string | null): string | null {
  const byId = id ? CHAT_GAME_CATEGORIES.find((c) => c.id === id) : null;
  if (byId) return byId.slug;
  const lower = name?.trim().toLowerCase();
  return (lower && CHAT_GAME_CATEGORIES.find((c) => c.name.toLowerCase() === lower)?.slug) || null;
}

/** The category id for a slug (to set the streamer's category). */
export function categoryIdForChatGame(slug: string): string | null {
  return CHAT_GAME_CATEGORIES.find((c) => c.slug === slug)?.id ?? null;
}
