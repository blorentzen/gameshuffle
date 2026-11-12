/**
 * Shuffle Kart's seeded random numbers (pure, client-safe). The roll and the
 * track's decoration both draw from a seed, so the same seed always deals the
 * same race and paints the same track.
 */

/** mulberry32: a small, fast 32-bit generator. Returns floats in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new roll. Call it from an event handler or the server, never during render. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

/**
 * The same generator with its state kept in a plain object (`{ rng }`), so a
 * race's random numbers live in the race's own data: copy the race and you copy
 * where its numbers are up to. Never seeded from the clock.
 */
export function draw(h: { rng: number }): number {
  let a = (h.rng + 0x6d2b79f5) >>> 0;
  h.rng = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  a = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return a;
}

/** Mixes two numbers into a new seed (for a racer's own stream of numbers). */
export function mixSeed(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) >>> 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}
