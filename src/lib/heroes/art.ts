/**
 * Where a hero's portrait lives: public/images/<game>/heroes/<slug>.webp,
 * pulled from the official portraits by scripts/pull-hero-art.ts (sources in
 * scripts/data/hero-art.json). Client-safe.
 */

/** "Soldier: 76" → "soldier-76", "D.Va" → "d-va", "Cloak & Dagger" → "cloak-and-dagger". */
export function heroSlug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function heroArt(gameSlug: string, name: string): string {
  return `/images/${gameSlug}/heroes/${heroSlug(name)}.webp`;
}
