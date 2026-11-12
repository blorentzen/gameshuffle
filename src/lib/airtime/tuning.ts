/**
 * Every number Airtime plays by (pure, client-safe). Units are "meters": the
 * player is 1.6 tall, roofs sit 0.5 to 5.5 above the line the camera centers
 * on, and the screen shows about 15 of them top to bottom in landscape.
 *
 * Why these numbers (tuned by playing the autopilot and by hand at 60 Hz):
 * - Gravity 40 and thrust 76 make rising (net +36) and falling (-40) feel
 *   about as quick as each other, so holding and letting go are both a choice.
 *   A fall from the top of the screen takes under a second.
 * - Thrust is 1.6x while you're still falling, so a late hold catches you in
 *   about a sixth of a second instead of sagging into a gap.
 * - Rise is capped at 10.5 and the fall at 14: the climb from a low roof to the
 *   top of the screen takes about 1.1 s, the fall a little under 0.9 s. A
 *   faster rise felt like a spring; a slower one made tall roofs a chore.
 * - Holding on a roof lifts off at once at 5.5 (a small hop), so the first
 *   frame of a press already moves you.
 * - Run speed 7.2 at level 1 is a brisk jog: about two seconds to cross the
 *   screen's look-ahead, time to read a turret's shot. Each level is 7% faster,
 *   up to 1.5x by level 8.
 * - You aim and fire yourself (the right thumb, the mouse, a stick), so shots are
 *   quick (30 m/s), reach further than a turret (18 m against 15), and bend up to
 *   6 degrees toward an enemy near your line.
 */

export const TUNING = {
  /** One fixed step: 60 a second. */
  dt: 1 / 60,

  // ── The player ──
  playerW: 0.8,
  playerH: 1.6,
  /** The part of you that can be hit (a little smaller than you look). */
  hurtW: 0.6,
  hurtBottom: 0.1,
  hurtTop: 1.45,
  gravity: 40,
  thrust: 76,
  /** Thrust multiplier while you're still falling. */
  thrustCatch: 1.6,
  maxRise: 10.5,
  maxFall: 14,
  /** Upward speed the moment you hold on a roof. */
  liftOff: 5.5,
  /** A ledge this much higher than your feet is stepped up onto instead of stopping you. */
  stepUp: 0.7,
  /** The highest your head can go (kept below the HUD along the top of the screen). */
  ceiling: 12.6,
  /** Below this you're lost (a heart), then dropped on the next roof. */
  killY: -6,
  /** Upward speed after landing on a walker. */
  bounce: 11,

  // ── Speed and levels ──
  runSpeed: 7.2,
  speedPerLevel: 0.07,
  maxSpeedScale: 1.5,
  levelSeconds: 60,

  // ── Hearts ──
  hearts: 3,
  /** Blink after a hit: 1.6 s. */
  invulnTicks: 96,

  // ── Weapons (you aim and fire them yourself) ──
  /** Shots fly faster than when they aimed themselves, so a quick flick still lands. */
  shotSpeed: 30,
  /** Ticks a shot lives (30 * 0.6 s = an 18 meter reach, more than a turret's 15). */
  shotLife: 36,
  /** Ticks between shots while fire is held: Blaster 4.3 a second, Spread 3, Rapid 10. */
  cooldown: { blaster: 14, spread: 20, rapid: 6 },
  /** Spread's fan: 13 degrees each side, as cos and sin (no trig in the sim). */
  spreadCos: 0.9743700647852352,
  spreadSin: 0.224951054343865,
  /**
   * Aim assist: a shot bends toward an enemy within 6 degrees of where you aim (and within reach,
   * in the clear), so a near miss with a thumb still connects. cos(6 degrees).
   */
  assistDeg: 6,
  assistCos: 0.9945218953682733,
  assistRange: 18,
  /** Shots leave from your shoulder, this far along the aim (the blaster's muzzle). */
  gunX: 0.05,
  gunY: 1.0,
  muzzle: 0.8,
  /** Spread and Rapid last 20 seconds. */
  pickupTicks: 1200,

  // ── Enemies ──
  walker: { w: 1.0, h: 1.1, hp: 2, speed: 1.6, wake: 26 },
  flyer: { w: 1.15, h: 0.9, hp: 1, drift: 1.4, amp: 1.2, periodTicks: 156, wake: 23 },
  /**
   * Turrets reach 15 m, less than your 18, and take three hits: a player who aims at one as it comes
   * into view can knock it out first; one who doesn't gets a slow, glowing shot to dodge.
   */
  turret: { w: 1.3, h: 1.1, hp: 3, range: 15, firstShot: 40, cooldown: 140, charge: 36, shotSpeed: 4.6, shotR: 0.32, shotLife: 360 },
  /** Turret shots and walkers speed up 5% a level. */
  foeSpeedPerLevel: 0.05,

  // ── Score (per level number where marked) ──
  score: {
    perMeter: 2,
    walker: 100,
    flyer: 80,
    turret: 150,
    stomp: 50,
    pickup: 50,
    star: 10,
    /** A heart picked up with all three hearts full. */
    heartFull: 250,
    /** Clearing a level: this times the level number. */
    clear: 500,
    /** Clearing it without a hit: this times the level number, on top. */
    noHit: 500,
  },
} as const;

/** Run speed for a level number (1-based). */
export function levelSpeed(level: number): number {
  return TUNING.runSpeed * Math.min(TUNING.maxSpeedScale, 1 + (level - 1) * TUNING.speedPerLevel);
}

/** Turret shots and walkers get a little quicker each level. */
export function foeScale(level: number): number {
  return 1 + Math.min(8, level - 1) * TUNING.foeSpeedPerLevel;
}
