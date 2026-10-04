/**
 * Games that are built but not public yet. A hidden game keeps all its code
 * and data; it's just left out of navigation, the sitemap, pickers (tournaments,
 * live nights, My Games, decks) and its pages return 404. Flip to true to launch.
 */
export const SMASH_PUBLIC = false;
export const SPLATOON_PUBLIC = false;
export const KIRBY_PUBLIC = false;
/** Pokémon Stadium 1 & 2 rental randomizer: type cards only (no art), so it can launch whenever it's reviewed. */
export const STADIUM_PUBLIC = false;

/**
 * Guides (/guides): hidden until there are enough guides, with imagery, to
 * publish. Same treatment as a hidden game: out of the nav and sitemap, pages
 * 404 in production. Staff can still write them in Platform ▸ Guides.
 */
export const GUIDES_PUBLIC = false;

/** Hidden randomizers by slug, for lists that loop over every randomizer. */
const HIDDEN_RANDOMIZERS: Record<string, boolean> = {
  "super-smash-bros-ultimate": !SMASH_PUBLIC,
  "splatoon-3": !SPLATOON_PUBLIC,
  "kirby-air-riders": !KIRBY_PUBLIC,
  "pokemon-stadium": !STADIUM_PUBLIC,
};
export function randomizerPublic(slug: string): boolean {
  return !HIDDEN_RANDOMIZERS[slug];
}
