/**
 * A simple driver that follows the centerline (pure, client-safe). The tests
 * drive every kart around the track with it, and it's the seed of the computer
 * drivers to come: look ahead along the loop, steer at that point, swing wide
 * of anything solid in the way, and optionally drift through the tighter bends.
 */

import type { KartInput, KartState } from "./physics";
import { nearest, SPACING, type Nearest, type Track } from "./track";

export interface AutopilotOpts {
  /** Drift through tight bends. */
  drift?: boolean;
  /** Units ahead to aim at, plus a share of speed. */
  look?: number;
  /** Steer harder (1 = normal). */
  gain?: number;
  /** Aim this many units right of the centerline (negative = left): computer drivers pick their own lines. */
  offset?: number;
  /** Where the kart is on the loop, if already known (racers keep their own spot; see nearestFrom). */
  near?: Nearest;
}

function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function autopilot(track: Track, k: KartState, opts: AutopilotOpts = {}): KartInput {
  const near = opts.near ?? nearest(track, k.x, k.y);
  const ahead = (opts.look ?? 56) + Math.max(0, k.speed) * 0.3;
  const steps = ahead / (track.length / track.n);
  const fi = near.i + near.t + steps;
  const i0 = Math.floor(fi) % track.n;
  const i1 = (i0 + 1) % track.n;
  const u = fi - Math.floor(fi);
  let tx = track.xs[i0] + (track.xs[i1] - track.xs[i0]) * u;
  let ty = track.ys[i0] + (track.ys[i1] - track.ys[i0]) * u;
  const nx = -track.ty[i0];
  const ny = track.tx[i0];
  if (opts.offset) {
    tx += nx * opts.offset;
    ty += ny * opts.offset;
  }

  // Swing wide of solid things between here and the aim point (the fruit bowl sits on the road).
  for (const c of track.solids) {
    const ex = tx - k.x;
    const ey = ty - k.y;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((c.x - k.x) * ex + (c.y - k.y) * ey) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = k.x + ex * t - c.x;
    const py = k.y + ey * t - c.y;
    const clear = c.r + 22;
    if (px * px + py * py < clear * clear) {
      const side = (k.x - c.x) * nx + (k.y - c.y) * ny >= 0 ? 1 : -1;
      tx = c.x + nx * side * (c.r + 34) + track.tx[i0] * c.r;
      ty = c.y + ny * side * (c.r + 34) + track.ty[i0] * c.r;
    }
  }

  const want = Math.atan2(ty - k.y, tx - k.x);
  const diff = wrap(want - k.h);
  const steer = Math.max(-1, Math.min(1, diff * 2.6 * (opts.gain ?? 1)));

  let drift = false;
  if (opts.drift) {
    if (k.drift !== 0) drift = Math.sign(diff) === k.drift && Math.abs(diff) > 0.1;
    else drift = Math.abs(diff) > 0.38 && k.speed > 150;
  }
  const brake = Math.abs(diff) > 1.3 && k.speed > 120;
  return { steer, gas: !brake, brake, drift, assist: false };
}

/** Grid spacing of the centerline (re-exported for scripts that step along it). */
export const CENTERLINE_SPACING = SPACING;
