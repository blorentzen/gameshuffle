/** A request body as a duel step, or null (the Daily Duel's and Trainer Road's run routes). */

import type { DuelStep } from "./types";

const idx = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 6;

export function stepOf(body: Record<string, unknown>): DuelStep | null {
  if ("bring" in body) {
    const b = body.bring;
    return Array.isArray(b) && b.length >= 1 && b.length <= 6 && b.every(idx) && new Set(b).size === b.length ? { bring: b as number[] } : null;
  }
  if ("next" in body) return idx(body.next) ? { next: body.next } : null;
  const a = body.act as Record<string, unknown> | undefined;
  if (!idx(body.attach) || !a || typeof a !== "object") return null;
  // Rules 5: which Energy in the hand (the engine refuses one the day doesn't have).
  if (body.use != null && !(Number.isInteger(body.use) && (body.use as number) >= 0 && (body.use as number) < 3)) return null;
  const use = body.use != null ? { use: body.use as number } : {};
  if ("move" in a) return Number.isInteger(a.move) && (a.move as number) >= 0 && (a.move as number) < 8 ? { attach: body.attach, act: { move: a.move as number }, ...use } : null;
  if ("swap" in a) return idx(a.swap) ? { attach: body.attach, act: { swap: a.swap }, ...use } : null;
  if (a.wait === true) return { attach: body.attach, act: { wait: true }, ...use };
  return null;
}
