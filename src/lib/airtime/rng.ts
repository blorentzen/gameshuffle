/**
 * Airtime's seeded random numbers (pure, client-safe). A level is built from a
 * seed and its number, so the same seed always builds the same run.
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

/** A level's own seed from the run's seed and the level number. */
export function levelSeed(seed: number, level: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (level * 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0 || 1;
}

/** A fresh seed for a new run. Call it from an event handler or the server, never during render. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}
