/**
 * One showcase TCG card per Pokémon (dex → Scrydex card id), picked by
 * scripts/populate-pokemon-showcase.ts: the best English Special Illustration /
 * Illustration Rare, else another English printing. The cards live in
 * tcg_cards; pages read them with getCatalogCards (0 credits). Generated: edit
 * by re-running the script with --only.
 */
export const SHOWCASE_CARDS: Record<number, string> = {
  1: "sv3pt5-166",
  3: "sv3pt5-198",
  4: "sv3pt5-168",
  6: "sv3pt5-199",
  9: "sv3pt5-200",
  25: "me2pt5-277",
  35: "me3-94",
  54: "sv3pt5-175",
  65: "sv3pt5-201",
  80: "me5-90",
  118: "me5-87",
  145: "sv3pt5-202",
  148: "sv3pt5-181",
  151: "sv4pt5-232",
  183: "me2pt5-232",
  197: "sv8pt5-161",
  208: "sv4-208",
  237: "me2pt5-240",
};
