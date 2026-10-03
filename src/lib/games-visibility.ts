/**
 * Games that are built but not public yet. A hidden game keeps all its code
 * and data; it's just left out of navigation, the sitemap, pickers (tournaments,
 * live nights, My Games, decks) and its pages return 404. Flip to true to launch.
 */
export const SMASH_PUBLIC = false;
export const SPLATOON_PUBLIC = false;
export const KIRBY_PUBLIC = false;

/** Hidden randomizers by slug, for lists that loop over every randomizer. */
const HIDDEN_RANDOMIZERS: Record<string, boolean> = {
  "super-smash-bros-ultimate": !SMASH_PUBLIC,
  "splatoon-3": !SPLATOON_PUBLIC,
  "kirby-air-riders": !KIRBY_PUBLIC,
};
export function randomizerPublic(slug: string): boolean {
  return !HIDDEN_RANDOMIZERS[slug];
}
