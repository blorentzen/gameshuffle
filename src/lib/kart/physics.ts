/**
 * Shuffle Kart driving (pure, client-safe). One fixed step of 1/60 s, decoupled
 * from drawing, so a run is the same every time from the same inputs.
 *
 * TUNING holds every number that shapes how the karts feel. Feedback like
 * "light karts slide too much" or "drifts take too long to charge" is a one-line
 * change here. Speeds are world units a second (the first track is about 5,900 units
 * around), turns are radians a second, and "rates" are how quickly something
 * closes its gap each second.
 */

import { groundAt, inSlick, nearest, tangentAngle, type Surface, type Track } from "./track";

export const TUNING = {
  /** The fixed physics step. Never change it without rerecording ghosts. */
  dt: 1 / 60,

  /** Every kart starts from its driver's weight class. */
  weight: {
    light: { top: 236, accel: 2, turn: 2.6, grip: 10.5, mass: 0.8 },
    medium: { top: 242, accel: 1.75, turn: 2.35, grip: 10, mass: 1 },
    heavy: { top: 248, accel: 1.5, turn: 2.1, grip: 8.4, mass: 1.25 },
  },
  /** Then the kart's body and its wheels add to it (charge = how fast drifts charge, +0.1 = 10% faster). */
  parts: {
    // Bodies (content.ts names them)
    box: { top: 6, accel: -0.15, mass: 0.15, grip: -0.4 },
    round: { top: -5, accel: 0.22, turn: 0.1, mass: -0.1 },
    low: { turn: 0.04, grip: -0.3, charge: 0.1 },
    // Wheels
    chunky: { grip: 1, top: -3 },
    slim: { top: 5, grip: -0.6 },
    small: { accel: 0.15, turn: 0.05 },
  } as Record<string, Partial<Record<"top" | "accel" | "turn" | "grip" | "mass" | "charge", number>>>,

  // Steering
  /** How fast the steering moves toward what you're pressing. */
  steerRate: 7,
  /** How fast it eases back to center when you let go (gentle auto-centering). */
  steerReturn: 9,
  /** Below this speed turning is gentler... */
  turnFullSpeed: 70,
  /** ...but never less than this share while you press gas or brake, so you can always turn away from a wall. */
  turnLowFloor: 0.4,
  /** Turning eases off by this share at top speed. */
  turnTopLoss: 0.18,
  /** Phones: a light pull toward the track's direction when you're not steering (radians a second, and the widest angle it helps with). */
  assistRate: 0.45,
  assistWindow: 0.55,
  assistMinSpeed: 60,

  // Speed
  brake: 520,
  reverseTop: 80,
  /** Slowing down with no gas (rate). */
  coast: 0.7,
  /** How fast speed above the top (a boost wearing off) fades (rate). */
  overspeedDecay: 1.1,

  // Off the road (the grass)
  /** Top speed off the road, as a share of the kart's top... */
  offroadTop: 0.55,
  /** ...plus this much for each step of weight above medium (heavy karts plough through a little better). */
  offroadMass: 0.06,
  /** How fast you slow to that speed (rate). */
  offroadDecay: 3.2,

  // The wet patch
  slickGrip: 1.6,
  slickSteer: 0.6,

  // Drifting
  driftMinSpeed: 110,
  /** How far you must be steering when you press Drift to start one. */
  driftSteer: 0.35,
  /** While drifting the kart always turns this much into the drift... */
  driftBase: 0.62,
  /** ...plus or minus this much as you steer in or out. */
  driftRange: 0.48,
  /** Drift turning, as a share of the kart's normal turning. */
  driftTurn: 1.05,
  /** Sideways grip while drifting (lower = more slide). */
  driftGrip: 2.6,
  /** Seconds of drifting for the first (blue) and second (orange) spark. */
  charge1: 0.85,
  charge2: 1.9,
  /** Charge per second, plus extra for steering into the drift. */
  chargeBase: 0.65,
  chargeTight: 0.55,

  // Boosts
  /** Boost seconds after a blue-spark and an orange-spark drift. */
  boost1: 0.6,
  boost2: 1.1,
  /** Boost seconds after landing a jump. */
  landBoost: 0.35,
  /** Top speed while boosting, as a share of the kart's top. */
  boostTop: 1.32,
  /** How fast a boost gets you up to speed (rate). */
  boostAccel: 5,
  /** Instant speed added when a boost starts. */
  boostKick: 30,

  // Walls
  kartRadius: 8,
  /** Bounce off a wall (0 = stop dead, 1 = full bounce), divided by the kart's mass. */
  wallBounce: 0.32,
  /** Speed along the wall kept after a hit. */
  wallFriction: 0.88,
  /** Facing into a wall, the kart swings along it at this rate so it never sticks. */
  wallTurn: 2.4,
  /** Hits harder than this shake the screen and end a drift. */
  bumpMin: 45,

  // Jumps (the ramp)
  gravity: 620,
  /** Upward speed at the lip: the ramp's climb rate times this, plus the kick. */
  launchMul: 1.5,
  launchKick: 95,
  /** Steering in the air, as a share. */
  airTurn: 0.35,
};

export type WeightClass = keyof typeof TUNING.weight;

export interface KartStats {
  top: number;
  accel: number;
  turn: number;
  grip: number;
  mass: number;
  /** Drift charge multiplier. */
  charge: number;
}

export function kartStats(weight: WeightClass, partIds: string[]): KartStats {
  const base = TUNING.weight[weight];
  const out: KartStats = { ...base, charge: 1 };
  for (const id of partIds) {
    const p = TUNING.parts[id];
    if (!p) continue;
    out.top += p.top ?? 0;
    out.accel += p.accel ?? 0;
    out.turn += p.turn ?? 0;
    out.grip += p.grip ?? 0;
    out.mass += p.mass ?? 0;
    out.charge += p.charge ?? 0;
  }
  return out;
}

export interface KartInput {
  /** -1 (left) to 1 (right). */
  steer: number;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  /** Phones: the light pull toward the track's direction. */
  assist: boolean;
}

export const NO_INPUT: KartInput = { steer: 0, gas: false, brake: false, drift: false, assist: false };

export interface KartState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Heading in radians (0 = east, positive = clockwise on the map). */
  h: number;
  /** Smoothed steering, -1..1. */
  steer: number;
  grounded: boolean;
  /** Ground height under the kart last step, and how fast it was rising (for the ramp's launch). */
  ground: number;
  groundVz: number;
  /** 0, or the drift's direction. */
  drift: -1 | 0 | 1;
  charge: number;
  tier: 0 | 1 | 2;
  /** Boost seconds left. */
  boost: number;
  surface: Surface;
  /** Forward speed (negative when reversing). */
  speed: number;
  /** Steps the wall-bump event waits before it can fire again. */
  bumpWait: number;
  /** Which way the kart is swinging off a wall it faces into (kept until it's free, so corners can't trap it). */
  swing: -1 | 0 | 1;
  /** The item held (items come after the prototype; always null for now). */
  item: string | null;
}

export interface KartEvents {
  /** Speed of a hard wall hit. */
  wall: number;
  /** A boost started: 1 or 2 from a drift, 3 from a landing. */
  boost: 0 | 1 | 2 | 3;
  /** A drift reached a new spark color. */
  tier: 0 | 1 | 2;
  driftStart: boolean;
  /** Speed you came down at. */
  land: number;
  launch: boolean;
}

/**
 * A kart on the start grid. Slot 0 is the pole; more racers line up in pairs
 * behind it (ready for computer drivers and live races).
 */
export function startState(track: Track, slot = 0, of = 1): KartState {
  const row = Math.floor(slot / 2);
  const side = of === 1 ? 0 : slot % 2 === 0 ? -1 : 1;
  const fx = Math.cos(track.start.h);
  const fy = Math.sin(track.start.h);
  const back = row * 30;
  const across = side * 24;
  return {
    x: track.start.x - fx * back - fy * across,
    y: track.start.y - fy * back + fx * across,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    h: track.start.h,
    steer: 0,
    grounded: true,
    ground: 0,
    groundVz: 0,
    drift: 0,
    charge: 0,
    tier: 0,
    boost: 0,
    surface: "road",
    speed: 0,
    bumpWait: 0,
    swing: 0,
    item: null,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Moves the kart one step. Mutates `s` and returns what happened. */
export function stepKart(s: KartState, inp: KartInput, track: Track, stats: KartStats): KartEvents {
  const T = TUNING;
  const dt = T.dt;
  const ev: KartEvents = { wall: 0, boost: 0, tier: 0, driftStart: false, land: 0, launch: false };

  const near = nearest(track, s.x, s.y);
  const slick = inSlick(track, s.x, s.y);
  s.surface = slick ? "slick" : near.dist <= near.hw ? "road" : "grass";

  // Steering eases toward the input, and back to center when let go.
  const want = clamp(Number.isFinite(inp.steer) ? inp.steer : 0, -1, 1);
  const rate = Math.abs(want) < 0.01 ? T.steerReturn : T.steerRate;
  s.steer += clamp(want - s.steer, -rate * dt, rate * dt);

  let fx = Math.cos(s.h);
  let fy = Math.sin(s.h);
  let vf = s.vx * fx + s.vy * fy;

  if (s.grounded) {
    // Drifting starts with Drift held while steering at speed, and ends when it's let go.
    if (!s.drift && inp.drift && Math.abs(want) >= T.driftSteer && vf > T.driftMinSpeed) {
      s.drift = want > 0 ? 1 : -1;
      s.charge = 0;
      s.tier = 0;
      ev.driftStart = true;
    } else if (s.drift && (!inp.drift || vf < T.driftMinSpeed * 0.6)) {
      if (inp.drift === false && vf >= T.driftMinSpeed * 0.6 && s.tier > 0) {
        s.boost = Math.max(s.boost, s.tier === 2 ? T.boost2 : T.boost1);
        vf += T.boostKick;
        ev.boost = s.tier;
      }
      s.drift = 0;
      s.charge = 0;
      s.tier = 0;
    }

    let steerEff: number;
    let turn = stats.turn;
    if (s.drift) {
      const tight = clamp(want * s.drift, -1, 1);
      steerEff = s.drift * (T.driftBase + T.driftRange * tight);
      turn *= T.driftTurn;
      s.charge += dt * (T.chargeBase + T.chargeTight * Math.max(0, tight)) * stats.charge;
      const tier = s.charge >= T.charge2 ? 2 : s.charge >= T.charge1 ? 1 : 0;
      if (tier > s.tier) {
        s.tier = tier;
        ev.tier = tier;
      }
    } else {
      steerEff = s.steer;
    }
    if (s.surface === "slick") steerEff *= T.slickSteer;

    const absV = Math.abs(vf);
    let sf = absV / T.turnFullSpeed;
    if ((inp.gas || inp.brake) && sf < T.turnLowFloor) sf = T.turnLowFloor;
    if (sf > 1) sf = 1;
    sf *= 1 - T.turnTopLoss * clamp(absV / stats.top, 0, 1);
    s.h += steerEff * turn * sf * (vf < -1 ? -1 : 1) * dt;

    // Phones: a light pull along the track when not steering.
    if (inp.assist && !s.drift && Math.abs(want) < 0.05 && s.surface === "road" && vf > T.assistMinSpeed) {
      const diff = wrapAngle(tangentAngle(track, near) - s.h);
      if (Math.abs(diff) < T.assistWindow) s.h += clamp(diff, -T.assistRate * dt, T.assistRate * dt);
    }
    s.h = wrapAngle(s.h);

    fx = Math.cos(s.h);
    fy = Math.sin(s.h);
    vf = s.vx * fx + s.vy * fy;
    let vl = -s.vx * fy + s.vy * fx;

    // Speed along the heading.
    const boosting = s.boost > 0;
    let top = stats.top;
    let decayOver = T.overspeedDecay;
    if (boosting) top = stats.top * T.boostTop;
    else if (s.surface === "grass") {
      top = stats.top * (T.offroadTop + T.offroadMass * (stats.mass - 1) / 0.25);
      decayOver = T.offroadDecay;
    }
    if (inp.brake && vf > 0) {
      vf = Math.max(0, vf - T.brake * dt);
    } else if (inp.gas || inp.brake) {
      const target = inp.gas ? top : -T.reverseTop;
      let r = boosting ? T.boostAccel : stats.accel;
      if (inp.gas && vf > target) r = decayOver;
      vf += (target - vf) * (1 - Math.exp(-r * dt));
    } else {
      vf *= Math.exp(-T.coast * dt);
      if (vf > top) vf += (top - vf) * (1 - Math.exp(-decayOver * dt));
    }

    // Sideways grip.
    let grip = s.drift ? T.driftGrip : stats.grip;
    if (s.surface === "slick") grip = Math.min(grip, T.slickGrip * Math.sqrt(stats.mass));
    vl *= Math.exp(-grip * dt);

    s.vx = vf * fx - vl * fy;
    s.vy = vf * fy + vl * fx;
  } else {
    // In the air: a little steering, no grip, gravity.
    s.h = wrapAngle(s.h + s.steer * stats.turn * T.airTurn * dt);
    s.vz -= T.gravity * dt;
    s.z += s.vz * dt;
  }

  if (s.boost > 0) s.boost = Math.max(0, s.boost - dt);

  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // Ground: follow the ramp, launch off its lip, land.
  const g = groundAt(track, s.x, s.y);
  if (s.grounded) {
    // Only a real drop (the board's lip) launches; rolling down the board the wrong way doesn't.
    if (g < s.ground - 3) {
      s.grounded = false;
      s.vz = clamp(s.groundVz, 0, 60) * T.launchMul + T.launchKick;
      s.z = s.ground;
      ev.launch = true;
      if (s.drift) {
        s.drift = 0;
        s.charge = 0;
        s.tier = 0;
      }
    } else {
      s.groundVz = (g - s.ground) / dt;
      s.z = g;
    }
  } else if (s.z <= g) {
    ev.land = -s.vz;
    s.z = g;
    s.vz = 0;
    s.grounded = true;
    s.groundVz = 0;
    s.boost = Math.max(s.boost, T.landBoost);
    ev.boost = 3;
  }
  s.ground = g;

  // Walls: the boundary and every solid prop.
  const r = T.kartRadius;
  const b = track.bounds;
  const push = { x: 0, y: 0 };
  if (s.x < b.x0 + r) { s.x = b.x0 + r; hitWall(s, 1, 0, stats, ev, push); }
  if (s.x > b.x1 - r) { s.x = b.x1 - r; hitWall(s, -1, 0, stats, ev, push); }
  if (s.y < b.y0 + r) { s.y = b.y0 + r; hitWall(s, 0, 1, stats, ev, push); }
  if (s.y > b.y1 - r) { s.y = b.y1 - r; hitWall(s, 0, -1, stats, ev, push); }
  for (const c of track.solids) {
    const dx = s.x - c.x;
    const dy = s.y - c.y;
    const min = c.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    // Dead center (never happens in play): push out the way the kart faces.
    const nx = d > 1e-6 ? dx / d : -Math.cos(s.h);
    const ny = d > 1e-6 ? dy / d : -Math.sin(s.h);
    s.x = c.x + nx * min;
    s.y = c.y + ny * min;
    hitWall(s, nx, ny, stats, ev, push);
  }
  if (push.x !== 0 || push.y !== 0) swingAlong(s, push.x, push.y);
  else s.swing = 0;

  s.speed = s.vx * Math.cos(s.h) + s.vy * Math.sin(s.h);
  if (s.bumpWait > 0) s.bumpWait--;
  return ev;
}

/** Soft bounce off a wall whose normal (pointing away from it) is (nx, ny). */
function hitWall(s: KartState, nx: number, ny: number, stats: KartStats, ev: KartEvents, push: { x: number; y: number }): void {
  const T = TUNING;
  push.x += nx;
  push.y += ny;
  const vn = s.vx * nx + s.vy * ny;
  if (vn >= 0) return;
  // Speed along the wall is kept, less a share that grows with how hard the hit was.
  const keep = 1 - (1 - T.wallFriction) * clamp(-vn / 120, 0, 1);
  const tx = (s.vx - vn * nx) * keep;
  const ty = (s.vy - vn * ny) * keep;
  const e = T.wallBounce / stats.mass;
  s.vx = tx - vn * e * nx;
  s.vy = ty - vn * e * ny;
  if (-vn > T.bumpMin) {
    if (s.bumpWait === 0) ev.wall = Math.max(ev.wall, -vn);
    s.bumpWait = 12;
    if (s.drift) {
      s.drift = 0;
      s.charge = 0;
      s.tier = 0;
    }
  }
}

/**
 * Facing into a wall (or a corner: the walls' normals added up), the kart swings
 * to run along it, toward whichever way is closer to where it faces. The way it
 * picks is kept until it's free, so two walls can't argue it to a standstill.
 */
function swingAlong(s: KartState, px: number, py: number): void {
  const T = TUNING;
  const len = Math.hypot(px, py);
  if (len < 1e-6) return;
  const nx = px / len;
  const ny = py / len;
  const fx = Math.cos(s.h);
  const fy = Math.sin(s.h);
  if (fx * nx + fy * ny > -0.05) {
    s.swing = 0;
    return;
  }
  if (s.swing === 0) {
    const side = fx * -ny + fy * nx >= 0 ? 1 : -1;
    const tAng = Math.atan2(nx * side, -ny * side);
    s.swing = wrapAngle(tAng - s.h) >= 0 ? 1 : -1;
  }
  s.h = wrapAngle(s.h + s.swing * T.wallTurn * T.dt);
}

/** A copy of the state (tests and the renderer's smoothing use it). */
export function copyState(s: KartState): KartState {
  return { ...s };
}
