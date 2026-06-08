/**
 * Crypto-secure RNG for the Companion's coin + dice.
 *
 * `Math.random()` is good enough for randomizers where nobody is
 * betting anything, but the Companion's coin/dice replace physical
 * RNG at a table where players settle disputes with it — fairness
 * has to be defensible. Uses `crypto.getRandomValues` (available
 * in modern browsers + Node 19+) with rejection sampling to avoid
 * modulo bias for arbitrary die sizes.
 */

/** Returns 0 or 1 with equal probability. */
export function flipCoin(): 0 | 1 {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] & 1) as 0 | 1;
}

/**
 * Roll a die with `faces` sides. Uses rejection sampling on a
 * uint32 to remove modulo bias — important for d-not-power-of-2
 * (d6 included).
 *
 * Returns an integer in [1, faces].
 */
export function rollDie(faces: number): number {
  if (!Number.isInteger(faces) || faces < 2) {
    throw new Error(`rollDie: faces must be an integer >= 2, got ${faces}`);
  }
  const buf = new Uint32Array(1);
  // Largest multiple of `faces` that fits in uint32 — anything above
  // is rejected so each face has exactly equal probability.
  const limit = Math.floor(0x1_0000_0000 / faces) * faces;
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return (n % faces) + 1;
}
