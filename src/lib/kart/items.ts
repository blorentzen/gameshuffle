/**
 * Shuffle Kart items (pure, client-safe): what the nine items do, in numbers,
 * and the odds an Item Box deals them by place. Names and lines live in
 * content.ts (ITEMS); this file is the rules. "The Heat Seeker comes up too
 * often" or "a hit costs too much time" is a one-line change here.
 *
 * Times are in seconds, distances in world units (the first track is about
 * 5,900 units round; a kart tops out near 240 units a second).
 */

import { ITEMS } from "./content";

export type ItemId =
  | "heat-seeker"
  | "homing-missile"
  | "dart-blaster"
  | "oil-slick"
  | "coffee"
  | "energy-drink"
  | "shield"
  | "shockwave"
  | "smoke-bomb";

/** Every item, in content.ts's order. */
export const ITEM_IDS = ITEMS.map((i) => i.id) as ItemId[];

/** What spins a kart out (the hit kinds). A splash is a Heat Seeker's blast catching someone beside the leader. */
export type HitKind = "missile" | "dart" | "heat" | "splash" | "slick";

export const ITEM_TUNING = {
  /** The roulette after you drive through a box, before the item is ready. */
  roll: 1,
  /** A box comes back this long after it's taken. */
  boxRespawn: 2,
  /** A box's size (a kart takes it when their circles touch). */
  boxRadius: 10,

  coffee: { boost: 0.9, kick: 40 },
  energyDrink: { boost: 2.2, kick: 40 },
  /** A raised Shield lasts this long or until it blocks a hit; a Shield still in the slot blocks the next hit too. */
  shield: { bubble: 8 },
  oilSlick: {
    radius: 12,
    /** Dropped this far behind the kart. */
    behind: 24,
    life: 30,
    /** The one who dropped it can't slip on it for this long. */
    grace: 1,
    /** At most this many on the track (the oldest dries up). */
    max: 12,
  },
  homingMissile: {
    speed: 380,
    life: 7,
    radius: 9,
    /** It closes on its target's line once this close (along the track). */
    home: 260,
    /** How fast it moves across the road toward the target (units a second). */
    turn: 260,
    /** The one who fired it can't be hit by it for this long. */
    grace: 0.5,
  },
  dartBlaster: { speed: 560, life: 4, radius: 7, bounces: 4, grace: 0.35 },
  heatSeeker: {
    speed: 540,
    life: 25,
    /** Anyone this close to the leader when it lands is caught in the blast. */
    splash: 45,
  },
  shockwave: {
    /** How long everyone ahead is slowed, the top speed they keep, and the speed they keep at the moment it hits. */
    slow: 1.2,
    top: 0.6,
    keep: 0.65,
    /** No new Shockwave comes out of a box for this long after one is used. */
    cooldown: 12,
  },
  smokeBomb: { time: 2 },

  /** Spin-outs: how long the kart is out of control and the share of its speed it keeps. */
  hits: {
    missile: { spin: 0.9, keep: 0.4 },
    dart: { spin: 0.9, keep: 0.4 },
    heat: { spin: 1.5, keep: 0.15 },
    splash: { spin: 0.8, keep: 0.5 },
    slick: { spin: 0.8, keep: 0.5 },
  } as Record<HitKind, { spin: number; keep: number }>,
  /** A Heat Seeker that pops a Shield still jolts the leader: the speed they keep. */
  staggerKeep: 0.6,
  /** After a spin-out, nothing can hit you again for this long. */
  invulnerable: 1,
  /** While spinning the kart slows down at this rate (on top of coasting). */
  spinDrag: 2.5,
};

/**
 * Odds out of 100 by place in a field of eight (index 0 = first place).
 * Leaders mostly get defensive or small items, the back gets boosts and the
 * rare ones (Heat Seeker, Shockwave). Each column adds up to 100.
 */
export const ITEM_ODDS: Record<ItemId, number[]> = {
  //               1st 2nd 3rd 4th 5th 6th 7th 8th
  shield:         [30, 22, 15, 10, 6, 4, 2, 0],
  "oil-slick":    [30, 22, 16, 11, 7, 4, 2, 0],
  "dart-blaster": [18, 20, 20, 18, 14, 10, 6, 4],
  coffee:         [16, 18, 18, 16, 14, 12, 10, 8],
  "homing-missile": [4, 12, 18, 22, 24, 24, 22, 20],
  "smoke-bomb":   [2, 4, 8, 10, 12, 12, 12, 10],
  "energy-drink": [0, 2, 5, 11, 17, 24, 32, 40],
  "heat-seeker":  [0, 0, 0, 1, 3, 5, 7, 9],
  shockwave:      [0, 0, 0, 1, 3, 5, 7, 9],
};

/**
 * How strong an item is, read off the odds: where in the field it mostly comes
 * up (0 = only ever in first, 7 = only ever in last). The items the back of the
 * pack gets are the strong ones, so this ranks them without a separate list.
 */
export const ITEM_VALUE: Record<ItemId, number> = Object.fromEntries(
  (Object.keys(ITEM_ODDS) as ItemId[]).map((id) => {
    const col = ITEM_ODDS[id];
    const total = col.reduce((a, b) => a + b, 0) || 1;
    return [id, col.reduce((a, w, c) => a + w * c, 0) / total];
  }),
) as Record<ItemId, number>;

/** The rare items: they come up less, mostly near the back, and only one Heat Seeker is ever out at a time. */
export const RARE_ITEMS: ItemId[] = ITEMS.filter((i) => i.rare).map((i) => i.id as ItemId);

export function isItemId(id: string): id is ItemId {
  return (ITEM_IDS as string[]).includes(id);
}

/** Which column of ITEM_ODDS a place reads in a field of any size, pushed `shift` places further back (Felix). */
export function oddsColumn(place: number, field: number, shift = 0): number {
  const n = Math.max(2, field);
  const p = Math.min(n, Math.max(1, place + shift));
  return Math.round(((p - 1) * 7) / (n - 1));
}

export interface ItemChance { id: ItemId; weight: number }

/** The odds a box deals at this place (items in `blocked` can't come up right now). */
export function itemOdds(place: number, field: number, shift = 0, blocked: ItemId[] = []): ItemChance[] {
  const col = oddsColumn(place, field, shift);
  return ITEM_IDS.map((id) => ({ id, weight: blocked.includes(id) ? 0 : ITEM_ODDS[id][col] }));
}

/** Picks from the odds with a number in [0, 1). Falls back to Coffee if nothing can come up. */
export function pickItem(odds: ItemChance[], u: number): ItemId {
  let total = 0;
  for (const o of odds) total += o.weight;
  if (total <= 0) return "coffee";
  let at = u * total;
  for (const o of odds) {
    if (o.weight <= 0) continue;
    if (at < o.weight) return o.id;
    at -= o.weight;
  }
  for (let i = odds.length - 1; i >= 0; i--) if (odds[i].weight > 0) return odds[i].id;
  return "coffee";
}

/** Seconds to fixed steps. */
export function ticks(seconds: number): number {
  return Math.round(seconds * 60);
}
