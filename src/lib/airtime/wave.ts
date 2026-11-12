/**
 * Sine and cosine from plain arithmetic (pure). The sim never calls Math.sin or
 * Math.cos: browsers may round those differently in the last bits, and a run has
 * to replay the same everywhere (a daily run checked on the server later). Only
 * +, -, * and Math.round are used here, which every engine computes alike.
 */

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;

/** sin(x) to about 1e-7 (a Taylor series on [-pi/2, pi/2] after range reduction). */
export function dsin(x: number): number {
  let a = x - TAU * Math.round(x / TAU); // [-pi, pi]
  if (a > HALF) a = Math.PI - a;
  else if (a < -HALF) a = -Math.PI - a;
  const a2 = a * a;
  return a * (1 - (a2 / 6) * (1 - (a2 / 20) * (1 - (a2 / 42) * (1 - (a2 / 72) * (1 - a2 / 110)))));
}

export function dcos(x: number): number {
  return dsin(x + HALF);
}
