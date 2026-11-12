/**
 * What each cast member's quirk does, in numbers (pure, client-safe). The
 * lines players read are in content.ts (CastMember.quirk); the race reads these.
 * A quirk belongs to the driver, so it works the same for a computer racer and
 * for you when the roll makes you that cast member. Racing as yourself has none.
 */

export interface Quirk {
  /** Max: the perfect-start window is this many times as wide. */
  startWindow?: number;
  /** Gary: Oil Slicks do nothing to him (and stay where they are). */
  slickProof?: boolean;
  /** Cam: once a race, this many seconds of boost when a spin-out ends. */
  hitBoost?: number;
  /** Skip: drift sparks charge this many times as fast. */
  charge?: number;
  /** Felix: every Item Box deals him this many items and he keeps the strongest (ITEM_VALUE). */
  boxRolls?: number;
  /** Al: spin-outs last this many times as long... */
  spinMul?: number;
  /** ...then this many seconds of angry boost. */
  angryBoost?: number;
  /** Miles: top speed rises by this share for each place he's gained since the start... */
  perPlace?: number;
  /** ...counting at most this many places. */
  maxPlaces?: number;
  /** Pip: items and slicks have to come this much closer to hit him... */
  hitScale?: number;
  /** ...a Homing Missile misses him this share of the time... */
  missileMiss?: number;
  /** ...and the steering wanders this much (a share of full lock). */
  wander?: number;
}

export const QUIRKS: Record<string, Quirk> = {
  max: { startWindow: 2 },
  gary: { slickProof: true },
  cam: { hitBoost: 1 },
  skip: { charge: 1.35 },
  felix: { boxRolls: 2 },
  al: { spinMul: 1.6, angryBoost: 1.2 },
  miles: { perPlace: 0.006, maxPlaces: 4 },
  pip: { hitScale: 0.6, missileMiss: 0.35, wander: 0.07 },
};

/** The quirk for a driver (none for you or anyone unknown). */
export function quirkOf(driver: string): Quirk {
  return QUIRKS[driver] ?? {};
}

/**
 * Pip's wander at a step: a slow drift in the steering, the same every race so
 * a replay matches. Two slow waves so it never settles into a pattern you can
 * time.
 */
export function wanderAt(tick: number, amount: number): number {
  const t = tick / 60;
  return amount * (Math.sin(t * 0.9) * 0.7 + Math.sin(t * 2.3 + 1.1) * 0.3);
}
