/**
 * Shuffle Kart's drivers and karts (pure, client-safe): the rules around the
 * names and looks in content.ts.
 *
 * Drivers are avatars from the generator GameShuffle already uses for profile
 * pictures (DiceBear Adventurer): a cast of named characters made from fixed
 * seeds and looks, plus you (your own profile picture, or a generated avatar
 * kept in this browser when signed out). A kart is a body and a set of wheels.
 * How each one drives lives in TUNING (physics.ts).
 */

import type { TileTone } from "@/components/ui/IconTile";
import { BODIES, CAST, CAST_RENAMED, TWISTS, WHEELS, weightClassOf, YOU_NAME, YOU_TONE, YOU_WEIGHT, type BodyId, type CastMember, type TwistId, type WheelId } from "./content";
import { kartStats, TUNING, type KartStats, type WeightClass } from "./physics";

export { BODIES, CAST, TWISTS, WHEELS };
export type { BodyId, CastMember, TwistId, WheelId };

/** A cast member's id, or "you". */
export type DriverId = string;
export const YOU = "you";

/** Tile tones and their two gradient ends (the --tile-* tokens in globals.css). */
export const TONE_COLORS: Record<string, [string, string]> = {
  blue: ["#2f66ec", "#4b5cf5"],
  violet: ["#5a3fd6", "#8b5cf6"],
  magenta: ["#5a3fd6", "#c949e9"],
  teal: ["#0b5a52", "#169a85"],
  green: ["#1d7a3a", "#2f9e44"],
  orange: ["#b4421d", "#e0861c"],
  red: ["#b42318", "#e5533c"],
};

export interface Driver {
  id: DriverId;
  name: string;
  weight: WeightClass;
  tone: TileTone;
  /** Null for you (your own picture comes from your account or this browser). */
  cast: CastMember | null;
}

/** A driver by id (an id from before the cast was renamed reads as who they became). */
export function driverFor(id: DriverId): Driver {
  const want = CAST_RENAMED[id] ?? id;
  const c = CAST.find((m) => m.id === want);
  if (c) return { id: c.id, name: c.name, weight: weightClassOf(c.stats.weight), tone: c.tone, cast: c };
  return { id: YOU, name: YOU_NAME, weight: YOU_WEIGHT, tone: YOU_TONE, cast: null };
}

/** Every driver the roll can deal: the cast and you. */
export const DRIVER_IDS: DriverId[] = [...CAST.map((c) => c.id), YOU];

export const WEIGHT_LABEL: Record<WeightClass, string> = { light: "Light", medium: "Medium", heavy: "Heavy" };

export function statsFor(driver: DriverId, body: BodyId, wheels: WheelId): KartStats {
  return kartStats(driverFor(driver).weight, [body, wheels]);
}

/**
 * How a kart drives, in a few plain words (compared with a medium driver on
 * parts that change nothing): at most three traits, the biggest first.
 */
export function kartTraits(stats: KartStats): string[] {
  const base = TUNING.weight.medium;
  const traits: { score: number; word: string }[] = [
    { score: (stats.top - base.top) / 8, word: stats.top >= base.top ? "fast" : "lower top speed" },
    { score: (stats.accel - base.accel) / 0.25, word: stats.accel >= base.accel ? "quick off the line" : "slow to get going" },
    { score: (stats.turn - base.turn) / 0.15, word: stats.turn >= base.turn ? "turns sharp" : "wide turns" },
    { score: (stats.grip - base.grip) / 0.8, word: stats.grip >= base.grip ? "grips well" : "slides more" },
  ];
  return traits
    .filter((t) => Math.abs(t.score) >= 0.6)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map((t) => t.word);
}
