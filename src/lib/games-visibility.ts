/**
 * Games that are built but not public yet. A hidden game keeps all its code
 * and data; it's just left out of navigation, the sitemap, pickers (tournaments,
 * live nights, My Games, decks) and its pages return 404. Flip to true to launch.
 */
export const SMASH_PUBLIC = true;
export const SPLATOON_PUBLIC = false;
export const KIRBY_PUBLIC = false;
/** Pokémon Stadium 1 & 2 rental randomizer: type cards only (no art), so it can launch whenever it's reviewed. */
export const STADIUM_PUBLIC = true;
/** GoldenEye 007 multiplayer randomizer (beta; names only, "Image coming soon" slots). */
export const GOLDENEYE_PUBLIC = true;
/** Pokémon Fire Red/Leaf Green run challenge (beta; type cards). */
export const FRLG_PUBLIC = true;
/** Mario Kart 64 (N64 on Switch Online) on the Mario Kart randomizer (beta; no art yet). Hidden until reviewed. */
export const MK64_PUBLIC = true;
/** Perfect Dark Combat Simulator randomizer (beta). Hidden until reviewed. */
export const PERFECT_DARK_PUBLIC = true;
/** Hero roulettes (names only). Hidden until reviewed. */
export const OVERWATCH_PUBLIC = true;
export const MARVEL_RIVALS_PUBLIC = true;
/** Mario Party 1-3 (N64 on Switch Online) on the party randomizer (beta; no art yet). */
export const N64_PARTY_PUBLIC = true;

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
  "goldeneye-007": !GOLDENEYE_PUBLIC,
  "pokemon-firered-leafgreen": !FRLG_PUBLIC,
  "mario-party": !N64_PARTY_PUBLIC,
  "mario-party-2": !N64_PARTY_PUBLIC,
  "mario-party-3": !N64_PARTY_PUBLIC,
  "mario-kart-64": !MK64_PUBLIC,
  "perfect-dark": !PERFECT_DARK_PUBLIC,
  "overwatch": !OVERWATCH_PUBLIC,
  "marvel-rivals": !MARVEL_RIVALS_PUBLIC,
};
export function randomizerPublic(slug: string): boolean {
  return !HIDDEN_RANDOMIZERS[slug];
}
