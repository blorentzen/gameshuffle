/**
 * The field for a race against the cast (pure, client-safe): who races, in
 * what, from which grid slot, and how their 1-5 stats change their kart. All
 * of it comes from the roll's seed, so the same roll always lines up the same
 * race.
 *
 * - Eight racers. If the roll made you a cast member, the other seven are the
 *   rest of the cast; if you race as yourself, seven of the eight are picked.
 * - Each computer racer gets a ride and wheels from the seed.
 * - The grid is shuffled from the seed, with you on the back row.
 */

import { BODIES, CAST, weightClassOf, WHEELS, type BodyId, type RacerStats, type WheelId } from "./content";
import type { KartStats, WeightClass } from "./physics";
import { quirkOf } from "./quirks";
import type { Roll } from "./roll";
import { seeded } from "./rng";
import { driverFor, statsFor, YOU, type DriverId } from "./roster";

export const FIELD_SIZE = 8;

/** How the 1-5 stats move a kart, per point away from 3 (the middle). */
export const FIELD_TUNING = {
  /** Speed: top speed (units a second). */
  topPerSpeed: 2.5,
  /**
   * Top speed by weight class, added in these races only: the time trial's
   * classes are 12 units apart, which here would decide races before the Speed
   * stat does. This halves the gap; light karts keep their quicker getaway and
   * turning, heavy ones their push in bumps.
   */
  classTop: { light: 3, medium: 0, heavy: -3 } as Record<WeightClass, number>,
  /** Start: how fast the kart gets going, and the perfect-start boost (seconds). */
  accelPerStart: 0.06,
  startBoost: 0.9,
  startBoostPerStart: 0.1,
  /** Handling: turning and grip. */
  turnPerHandling: 0.05,
  gripPerHandling: 0.35,
  /** Weight: mass inside the weight class (bumps and walls), from the class's middle. */
  massPerWeight: 0.05,
};

/** Racing as yourself: the middle of every stat. */
export const YOU_STATS: RacerStats = { speed: 3, start: 3, handling: 3, weight: 3 };

export interface Contender {
  /** Unique in the race: "you" or the cast id (racer 0 is always you). */
  id: string;
  driver: DriverId;
  name: string;
  body: BodyId;
  wheels: WheelId;
  human: boolean;
  /** Grid slot, 0 = pole. */
  grid: number;
  stats: RacerStats;
  /** The kart as it drives in this race (statsFor plus the 1-5 stats and quirks). */
  kart: KartStats;
}

export function racerStatsOf(driver: DriverId): RacerStats {
  return driverFor(driver).cast?.stats ?? YOU_STATS;
}

function classMiddle(weight: number): number {
  return weight <= 2 ? 1.5 : weight >= 4 ? 4.5 : 3;
}

/**
 * The kart for a race against the cast: the time trial's kart (weight class,
 * ride and wheels) moved a little by the driver's 1-5 stats, and Skip's quick
 * drift charge. The time trial itself never reads these.
 */
export function gpStats(driver: DriverId, body: BodyId, wheels: WheelId): KartStats {
  const T = FIELD_TUNING;
  const s = racerStatsOf(driver);
  const k = statsFor(driver, body, wheels);
  k.top += (s.speed - 3) * T.topPerSpeed + T.classTop[weightClassOf(s.weight)];
  k.accel += (s.start - 3) * T.accelPerStart;
  k.turn += (s.handling - 3) * T.turnPerHandling;
  k.grip += (s.handling - 3) * T.gripPerHandling;
  k.mass += (s.weight - classMiddle(s.weight)) * T.massPerWeight;
  k.charge *= quirkOf(driver).charge ?? 1;
  return k;
}

/** Seconds of boost for a perfect start. */
export function startBoostFor(stats: RacerStats): number {
  return FIELD_TUNING.startBoost + (stats.start - 3) * FIELD_TUNING.startBoostPerStart;
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The seed the field draws from (kept apart from the roll's own draws). */
export function fieldSeed(roll: Pick<Roll, "seed">): number {
  return (Math.imul(roll.seed >>> 0, 2654435761) ^ 0x5bd1e995) >>> 0;
}

/** The eight (or `size`) racers for a roll. Index 0 is you. */
export function dealField(roll: Roll, size = FIELD_SIZE): Contender[] {
  const rnd = seeded(fieldSeed(roll));
  const me = driverFor(roll.driver);
  const others = shuffle(CAST.filter((c) => c.id !== me.id), rnd).slice(0, Math.max(1, Math.min(CAST.length, size - 1)));
  const n = others.length + 1;
  const bodies = Object.keys(BODIES) as BodyId[];
  const wheelIds = Object.keys(WHEELS) as WheelId[];
  // You start on the back row: the last slot or the one beside it.
  const mySlot = n >= 3 ? n - 1 - (rnd() < 0.5 ? 1 : 0) : n - 1;
  const slots = shuffle(Array.from({ length: n }, (_, i) => i).filter((s) => s !== mySlot), rnd);
  const list: Contender[] = [
    {
      id: me.id === YOU ? YOU : me.id,
      driver: me.id,
      name: me.name,
      body: roll.body,
      wheels: roll.wheels,
      human: true,
      grid: mySlot,
      stats: racerStatsOf(me.id),
      kart: gpStats(me.id, roll.body, roll.wheels),
    },
  ];
  others.forEach((c, k) => {
    const body = bodies[Math.floor(rnd() * bodies.length) % bodies.length];
    const wheels = wheelIds[Math.floor(rnd() * wheelIds.length) % wheelIds.length];
    list.push({
      id: c.id,
      driver: c.id,
      name: c.name,
      body,
      wheels,
      human: false,
      grid: slots[k],
      stats: c.stats,
      kart: gpStats(c.id, body, wheels),
    });
  });
  return list;
}
