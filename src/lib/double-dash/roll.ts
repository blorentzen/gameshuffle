/**
 * Pure draws for Mario Kart: Double Dash!! (Retro Mario Kart picks 2026-11-12): a pair and a kart per kart in the
 * room, people paired two to a kart, a cup, the All Cup Tour, races, battles and the engine class. No React or I/O;
 * `rng` is injectable for tests.
 *
 * The kart rule, from the game's instruction booklet: a pair drives a kart of the heavier character's class, exactly
 * (Light + Light = light, Light/Medium + Medium = medium, anyone + Heavy = heavy). The Parade Kart takes any pair.
 * Characters stay different across the room, as on the game's select screen; karts can repeat.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import { rollBattleList, rollEngineFrom, rollRaceList, type BattleRoll } from "@/lib/randomizers/raceLists";
import type { DdBattleCourse, DdBattleMode, DdCharacter, DdClass, DdCourse, DdCup, DdGame, DdKart, DdSpecialInfo } from "@/lib/double-dash/types";

export const DD_CLASSES: DdClass[] = ["Light", "Medium", "Heavy"];
const RANK: Record<DdClass, number> = { Light: 0, Medium: 1, Heavy: 2 };

/** The class of kart a pair drives: the heavier of the two. */
export function kartClass(a: DdClass, b: DdClass): DdClass {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface DdOptions {
  /** Kart classes to roll. Empty = every class. */
  classes?: DdClass[];
  /** Toad and Toadette (win the 100cc Special Cup). Default on. */
  toads?: boolean;
  /** Petey Piranha and King Boo (win the Mirror Star Cup). Default on. */
  bosses?: boolean;
  /** Karts that unlock by playing, the Parade Kart aside. Default on. */
  unlockKarts?: boolean;
  /** The Parade Kart, which any pair can drive. Default on. */
  parade?: boolean;
  /** Only the game's own pairs (Mario and Luigi, Peach and Daisy...). Default off. */
  teams?: boolean;
}

/** A kart in the room: who drives, who throws, and the kart. */
export interface DdPair {
  driver: string;
  thrower: string;
  kart: string;
}

export function characterPool(game: DdGame, o: DdOptions = {}): DdCharacter[] {
  return game.characters.filter((c) => {
    if (c.team === "toad") return o.toads !== false;
    if (c.team === "petey") return o.bosses !== false;
    return true;
  });
}

/** The karts a pair of this class can drive, as the options allow. */
export function kartsFor(game: DdGame, cls: DdClass, o: DdOptions = {}): DdKart[] {
  const fits = game.karts.filter((k) => (k.weight === null ? o.parade !== false : k.weight === cls && (o.unlockKarts !== false || !k.unlock)));
  return fits.length ? fits : game.karts.filter((k) => k.weight === cls && !k.unlock);
}

/** Does this kart take this pair? (The randomizer only ever rolls ones that do.) */
export function kartFits(game: DdGame, pair: DdPair): boolean {
  const a = game.characters.find((c) => c.name === pair.driver);
  const b = game.characters.find((c) => c.name === pair.thrower);
  const k = game.karts.find((x) => x.name === pair.kart);
  if (!a || !b || !k || a.name === b.name) return false;
  return k.weight === null || k.weight === kartClass(a.weight, b.weight);
}

export function pairClass(game: DdGame, pair: Pick<DdPair, "driver" | "thrower">): DdClass | null {
  const a = game.characters.find((c) => c.name === pair.driver);
  const b = game.characters.find((c) => c.name === pair.thrower);
  return a && b ? kartClass(a.weight, b.weight) : null;
}

/** Every pair the options allow, from characters nobody else in the room has. */
function pairsFrom(chars: DdCharacter[], o: DdOptions): [DdCharacter, DdCharacter][] {
  const out: [DdCharacter, DdCharacter][] = [];
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i], b = chars[j];
      if (o.teams && a.team !== b.team) continue;
      if (o.classes?.length && !o.classes.includes(kartClass(a.weight, b.weight))) continue;
      out.push([a, b]);
    }
  }
  return out;
}

/**
 * One kart: a pair of different characters from the options (none another kart already has), who drives and who
 * throws at random, and a kart of the pair's class. Every allowed pair is as likely as any other, like the game's own
 * random pick. When the room has used up what the options allow, the options give way before the room does: first
 * the class and team filters, then characters another kart holds.
 */
export function rollPair(game: DdGame, o: DdOptions = {}, taken: readonly string[] = [], rng: Rng = Math.random): DdPair {
  const all = characterPool(game, o);
  const free = all.filter((c) => !taken.includes(c.name));
  const pairs = pairsFrom(free, o);
  const pool = pairs.length ? pairs : pairsFrom(free, {}).length ? pairsFrom(free, {}) : pairsFrom(all, {});
  const [a, b] = pick(pool, rng)!;
  const [driver, thrower] = rng() < 0.5 ? [a, b] : [b, a];
  const kart = pick(kartsFor(game, kartClass(a.weight, b.weight), o), rng)!;
  return { driver: driver.name, thrower: thrower.name, kart: kart.name };
}

/** A kart for everyone, characters different across the room. */
export function drawPairs(game: DdGame, count: number, o: DdOptions = {}, rng: Rng = Math.random): DdPair[] {
  const out: DdPair[] = [];
  for (let i = 0; i < count; i++) {
    const taken = out.flatMap((p) => [p.driver, p.thrower]);
    out.push(rollPair(game, o, taken, rng));
  }
  return out;
}

/** The pair's special items from Item Boxes, the driver's first; one when both share it (Mario and Luigi: Fireballs). */
export function pairSpecials(game: DdGame, pair: Pick<DdPair, "driver" | "thrower">): DdSpecialInfo[] {
  const out: DdSpecialInfo[] = [];
  for (const name of [pair.driver, pair.thrower]) {
    const c = game.characters.find((x) => x.name === name);
    if (!c) continue;
    const s = game.specials[c.special];
    if (!out.some((x) => x.name === s.name)) out.push(s);
  }
  return out;
}

/** "Fireballs", "Heart and Bob-omb", "Golden Mushroom and any special item". */
export function specialLine(game: DdGame, pair: Pick<DdPair, "driver" | "thrower">): string {
  const names = pairSpecials(game, pair).map((s, i) => (i > 0 && s.slug === null ? s.name.toLowerCase() : s.name));
  return names.join(" and ");
}

// ── Two to a kart ─────────────────────────────────────────────────────────────

/** People in karts of two, in a random order: the first of each kart drives, the second throws. An odd one out has a
 *  kart of their own (one person playing both characters, as in a normal race). */
export function pairPeople<T>(people: readonly T[], rng: Rng = Math.random): T[][] {
  const order = shuffle(people, rng);
  const out: T[][] = [];
  for (let i = 0; i < order.length; i += 2) out.push(order.slice(i, i + 2));
  return out;
}

/** People in karts of two, in the order given (before anyone has rolled). */
export function chunkPeople<T>(people: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < people.length; i += 2) out.push(people.slice(i, i + 2));
  return out;
}

// ── Races ─────────────────────────────────────────────────────────────────────

/** An engine class from the ones allowed (every class when none are). */
export function rollEngine(game: DdGame, allowed: readonly string[] = [], rng: Rng = Math.random): string {
  return rollEngineFrom(game.engines, allowed, rng);
}

/** A cup, raced in the game's order. */
export function rollCup(game: DdGame, rng: Rng = Math.random): DdCup {
  return pick(game.cups, rng)!;
}

/** The All Cup Tour: all 16 courses, Luigi Circuit first and Rainbow Road last, the rest in a random order. */
export function rollAllCupTour(game: DdGame, rng: Rng = Math.random): DdCourse[] {
  const all = game.cups.flatMap((c) => c.courses);
  const first = all.find((c) => c.slug === "luigi-circuit")!;
  const last = all.find((c) => c.slug === "rainbow-road")!;
  return [first, ...shuffle(all.filter((c) => c !== first && c !== last), rng), last];
}

/** Random races: no course twice until all 16 have come up. */
export function rollRaces(game: DdGame, count: number, rng: Rng = Math.random): DdCourse[] {
  return rollRaceList(game.cups.flatMap((c) => c.courses), count, rng);
}

/** The cup a course is in. */
export function cupOf(game: DdGame, course: string): DdCup | null {
  return game.cups.find((c) => c.courses.some((x) => x.name === course)) ?? null;
}

// ── Battle ────────────────────────────────────────────────────────────────────

export type DdBattle = BattleRoll;

export function battlePool(game: DdGame, unlockables = true): DdBattleCourse[] {
  return game.battleCourses.filter((b) => unlockables || !b.unlock);
}

export function modePool(game: DdGame, modes: readonly DdBattleMode["id"][] = []): DdBattleMode[] {
  const pool = game.battleModes.filter((m) => !modes.length || modes.includes(m.id));
  return pool.length ? pool : game.battleModes;
}

/** Battles: a course and a mode each, no course twice until every allowed course has come up. */
export function rollBattles(game: DdGame, count: number, o: { modes?: DdBattleMode["id"][]; unlockables?: boolean } = {}, rng: Rng = Math.random): DdBattle[] {
  return rollBattleList(battlePool(game, o.unlockables !== false), modePool(game, o.modes), count, rng);
}

// ── Art ───────────────────────────────────────────────────────────────────────

const art = (game: DdGame, dir: string, slug: string | null | undefined) => (slug ? `${game.assetBase}${dir}/${slug}.webp` : null);
export const characterArt = (game: DdGame, name: string) => art(game, "characters", game.characters.find((c) => c.name === name)?.slug);
export const kartArt = (game: DdGame, name: string) => art(game, "karts", game.karts.find((k) => k.name === name)?.slug);
export const courseArt = (game: DdGame, name: string) => art(game, "tracks", game.cups.flatMap((c) => c.courses).find((c) => c.name === name)?.slug);
export const battleArt = (game: DdGame, name: string) => art(game, "battle", game.battleCourses.find((c) => c.name === name)?.slug);
export const cupArt = (game: DdGame, slug: string) => art(game, "cups", slug);
export const specialArt = (game: DdGame, s: DdSpecialInfo) => art(game, "items", s.slug);
export const modeArt = (game: DdGame, name: string) => art(game, "modes", game.battleModes.find((m) => m.name === name)?.slug);
export const characterColor = (game: DdGame, name: string) => game.characters.find((c) => c.name === name)?.color ?? null;
