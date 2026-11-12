/**
 * Airtime's autopilot (pure): a simple bot that plays the way a steady player
 * would. It flies each crossing's lane (starting its climb a little before the
 * edge), hops walkers and turrets still standing in its way, reaches for pickups
 * when nothing else needs doing, ducks or rises out of a turret shot's path, and
 * aims at the nearest enemy ahead (a little ahead of where it's going) and fires.
 * Used for checks and filming (?autopilot=1); the gap tests fly the same lanes
 * with enemies taken out.
 */

import { NO_INPUT, normAim, type Input, type Run } from "./sim";
import { TUNING } from "./tuning";

/** The gap tests start climbing this many seconds before a crossing, from a standing start. */
export const LEAD_SECONDS = 0.5;
/** Flying a whole level, look this far ahead (you may still be coming down from the last gap). */
export const FLY_LEAD_SECONDS = 0.8;

/**
 * Hold to reach `target` (feet height) and hover there: going up, let go once the
 * rise would coast to the target on its own; coming down, hold once stopping
 * would take the rest of the way.
 */
export function holdFor(run: Run, target: number): Input {
  const p = run.player;
  if (p.vy >= 0) return { ...NO_INPUT, hold: p.y + (p.vy * p.vy) / (2 * TUNING.gravity) < target };
  const brake = TUNING.thrust * TUNING.thrustCatch - TUNING.gravity;
  return { ...NO_INPUT, hold: p.y - (p.vy * p.vy) / (2 * brake) < target + 0.05 };
}

/** Aim and fire at the nearest enemy ahead within reach, leading it a little; or hold fire. */
export function aimFor(run: Run): { fire: boolean; aim: number } {
  const p = run.player;
  const sx = p.x + TUNING.gunX;
  const sy = p.y + TUNING.gunY;
  let best: { aim: number; d: number } | null = null;
  for (const e of run.enemies) {
    if (!e.alive || e.gone) continue;
    let dx = e.x - sx;
    const dy = e.y + e.h / 2 - sy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (dx < 0.3 || d > TUNING.assistRange - 1) continue;
    // Lead: where it will be when the shot gets there (flyers drift toward you, walkers patrol).
    const t = d / TUNING.shotSpeed;
    if (e.kind === "flyer" && e.awake) dx -= TUNING.flyer.drift * t;
    if (e.kind === "walker" && e.awake) dx += e.dir * TUNING.walker.speed * t;
    if (best && d >= best.d) continue;
    best = { aim: normAim((Math.atan2(dy, dx) * 180) / Math.PI), d };
  }
  return best ? { fire: true, aim: best.aim } : { fire: false, aim: 0 };
}

/** The lane to fly at right now (null = nothing to clear: stay down). */
export function laneTarget(run: Run, leadSeconds = FLY_LEAD_SECONDS): number | null {
  const p = run.player;
  const L = run.level;
  const lead = L.speed * leadSeconds;
  let target: number | null = null;
  for (const c of L.crossings) {
    if (p.x >= c.fromX - lead && p.x <= c.toX + 1.0) target = target === null ? c.lane : Math.max(target, c.lane);
  }
  return target;
}

/** The bot. */
export function autopilot(run: Run): Input {
  if (run.phase !== "play") return NO_INPUT;
  const p = run.player;
  const lead = run.level.speed * FLY_LEAD_SECONDS;
  let target = laneTarget(run, FLY_LEAD_SECONDS);

  // Walkers and turrets still standing in the way: go over them.
  for (const e of run.enemies) {
    if (!e.alive || e.gone || e.kind === "flyer") continue;
    const front = e.x - e.w / 2;
    if (front > p.x - 0.6 && front < p.x + lead * 0.8 && e.y + e.h > p.y - 0.2) {
      const over = e.y + e.h + 0.6;
      target = target === null ? over : Math.max(target, over);
    }
  }

  // Nothing to clear: pick up what's close (weapons and hearts first, then stars).
  if (target === null) {
    let best: number | null = null;
    let bestScore = Infinity;
    for (const k of run.pickups) {
      if (k.taken) continue;
      const dx = k.x - p.x;
      if (dx < 0.5 || dx > 8) continue;
      const score = dx + (k.kind === "star" ? 3 : 0);
      if (k.y > p.y + 0.9 && score < bestScore) {
        best = k.y - 0.8;
        bestScore = score;
      }
    }
    if (best !== null) target = Math.min(best, TUNING.ceiling - TUNING.playerH - 0.4);
  }

  // A turret shot coming at you: move out of its way.
  for (const s of run.shots) {
    if (!s.foe) continue;
    for (let k = 1; k <= 8; k++) {
      const t = k * 0.1;
      const sx = s.x + s.vx * t;
      const sy = s.y + s.vy * t;
      const px = p.x + run.level.speed * t;
      const py = p.y + 0.8;
      if (Math.abs(sx - px) < 1.0 && Math.abs(sy - py) < 1.3) {
        const up = sy <= py;
        const dodge = up ? p.y + 2.6 : p.y - 2.2;
        target = up ? Math.max(target ?? dodge, dodge) : Math.min(target ?? p.y, dodge);
        break;
      }
    }
  }

  const gun = aimFor(run);
  if (target === null) return { ...gun, hold: false };
  return { ...gun, hold: holdFor(run, target).hold };
}
