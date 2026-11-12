/**
 * Pure draws for Mario Kart DS (Retro Mario Kart picks 2026-11-12): a character and a kart for each player, with the
 * karts the save has opened; a cup in its order; races from every cup; battles; and Mission Mode missions. No React
 * or I/O; `rng` is injectable for tests.
 *
 * The kart rule, from the game: each character starts with a signature kart and a standard kart; gold in every 100cc
 * Nitro cup adds a second signature kart; gold in every 150cc Nitro or Retro cup adds four other characters'
 * signature karts (seven each); gold in all eight Mirror cups lets anyone take any of the 36 karts. Characters can
 * repeat across the room, as in the game (two players can both be Mario); "Everyone a different character" turns that
 * off.
 */

import { pick, type Rng } from "@/lib/party/roll";
import { rollBattleList, rollEngineFrom, rollRaceList, type BattleRoll } from "@/lib/randomizers/raceLists";
import type { DsBattleMode, DsCharacter, DsClass, DsCourse, DsCup, DsGame, DsKart, DsKartLevel, DsMission } from "@/lib/mario-kart-ds/types";

export const DS_CLASSES: DsClass[] = ["Light", "Medium", "Heavy"];

/** The kart setting's steps, in the game's order, with what each one opens. */
export const KART_LEVELS: { id: DsKartLevel; label: string; line: string; each: number | null }[] = [
  { id: "start", label: "Starting karts", line: "Each character's signature kart and standard kart, as on a new save.", each: 2 },
  { id: "own", label: "Each character's own karts", line: "Their second signature kart too, from gold in every 100cc Nitro cup.", each: 3 },
  { id: "borrowed", label: "Own karts and four borrowed", line: "Four other characters' signature karts too, from gold in every 150cc Nitro or Retro cup.", each: 7 },
  { id: "all", label: "Every kart", line: "Anyone in any of the 36 karts, from gold in all eight Mirror cups.", each: null },
];
export const DEFAULT_KART_LEVEL: DsKartLevel = "own";
export const kartLevel = (id: string | null | undefined): DsKartLevel => (KART_LEVELS.some((l) => l.id === id) ? (id as DsKartLevel) : DEFAULT_KART_LEVEL);

export interface DsOptions {
  /** Weight classes to roll. Empty = every class. */
  classes?: DsClass[];
  /** Daisy, Dry Bones, Waluigi and R.O.B. Default on. */
  unlockables?: boolean;
  /** Which karts the save has opened. Default "own". */
  level?: DsKartLevel;
  /** Everyone a different character (the game allows repeats). Default off. */
  unique?: boolean;
}

/** A player's roll: a character and a kart they can take. */
export interface DsRacer {
  character: string;
  kart: string;
}

export function characterPool(game: DsGame, o: Pick<DsOptions, "classes" | "unlockables"> = {}): DsCharacter[] {
  return game.characters.filter((c) => (o.unlockables !== false || !c.unlock) && (!o.classes?.length || o.classes.includes(c.weight)));
}

/** The karts this character can take at this step, in the game's order. */
export function kartsFor(game: DsGame, character: string, level: DsKartLevel = DEFAULT_KART_LEVEL): DsKart[] {
  if (level === "all") return game.karts;
  const c = game.characters.find((x) => x.name === character);
  if (!c) return [];
  return game.karts.filter((k) => {
    if (k.owner === c.name) return k.kind !== "second" || level !== "start";
    return level === "borrowed" && c.borrows.includes(k.name);
  });
}

/** Can this character take this kart at this step? (The randomizer only ever rolls ones that can.) */
export function kartFits(game: DsGame, racer: DsRacer, level: DsKartLevel = DEFAULT_KART_LEVEL): boolean {
  return kartsFor(game, racer.character, level).some((k) => k.name === racer.kart);
}

/**
 * One player: a character from the options, then one of the karts they can take, every kart as likely as any other.
 * With `unique`, characters another player holds are left out; when the room has used up what the options allow, the
 * class filter gives way first, then repeats come back.
 */
export function rollRacer(game: DsGame, o: DsOptions = {}, taken: readonly string[] = [], rng: Rng = Math.random): DsRacer {
  const level = o.level ?? DEFAULT_KART_LEVEL;
  const pool = characterPool(game, o);
  let from = pool.length ? pool : characterPool(game, { unlockables: o.unlockables });
  if (o.unique) {
    const free = from.filter((c) => !taken.includes(c.name));
    const wider = characterPool(game, { unlockables: o.unlockables }).filter((c) => !taken.includes(c.name));
    from = free.length ? free : wider.length ? wider : from;
  }
  const c = pick(from, rng)!;
  return { character: c.name, kart: pick(kartsFor(game, c.name, level), rng)!.name };
}

/** A character and kart for everyone. */
export function drawRacers(game: DsGame, count: number, o: DsOptions = {}, rng: Rng = Math.random): DsRacer[] {
  const out: DsRacer[] = [];
  for (let i = 0; i < count; i++) out.push(rollRacer(game, o, out.map((r) => r.character), rng));
  return out;
}

const KIND_LABEL: Record<DsKart["kind"], string> = { signature: "signature kart", standard: "standard kart", second: "second signature kart" };

/** What the kart is to this character: "Signature kart", "Standard kart", or another character's ("Peach's signature kart"). */
export function kartNote(game: DsGame, racer: DsRacer): string {
  const k = game.karts.find((x) => x.name === racer.kart);
  if (!k) return "";
  const what = KIND_LABEL[k.kind];
  return k.owner === racer.character ? what[0].toUpperCase() + what.slice(1) : `${k.owner}'s ${what}`;
}

// ── Races ─────────────────────────────────────────────────────────────────────

export type DsCupKind = "any" | "nitro" | "retro";

/** An engine class from the ones allowed (every class when none are). */
export function rollEngine(game: DsGame, allowed: readonly string[] = [], rng: Rng = Math.random): string {
  return rollEngineFrom(game.engines, allowed, rng);
}

/** A cup, raced in the game's order: any of the eight, a Nitro cup or a Retro cup. */
export function rollCup(game: DsGame, kind: DsCupKind = "any", rng: Rng = Math.random): DsCup {
  const pool = game.cups.filter((c) => kind === "any" || c.kind === kind);
  return pick(pool.length ? pool : game.cups, rng)!;
}

/** Random races from every cup: no course twice until all 32 have come up. */
export function rollRaces(game: DsGame, count: number, rng: Rng = Math.random): DsCourse[] {
  return rollRaceList(game.cups.flatMap((c) => c.courses), count, rng);
}

/** The cup a course is in. */
export function cupOf(game: DsGame, course: string): DsCup | null {
  return game.cups.find((c) => c.courses.some((x) => x.name === course)) ?? null;
}

// ── Battle ────────────────────────────────────────────────────────────────────

export type DsBattle = BattleRoll;

export function modePool(game: DsGame, modes: readonly DsBattleMode["id"][] = []): DsBattleMode[] {
  const pool = game.battleModes.filter((m) => !modes.length || modes.includes(m.id));
  return pool.length ? pool : game.battleModes;
}

/** Battles: a course and a mode each, no course twice until all six have come up. */
export function rollBattles(game: DsGame, count: number, o: { modes?: DsBattleMode["id"][] } = {}, rng: Rng = Math.random): DsBattle[] {
  return rollBattleList(game.battleCourses, modePool(game, o.modes), count, rng);
}

// ── Mission Mode ─────────────────────────────────────────────────────────────

export interface DsMissionOptions {
  /** One level (1 to 7), or null for any. */
  level?: number | null;
  /** The levels' bosses too. Default on. */
  bosses?: boolean;
  /** Level 7, which opens with ★ on every mission in Levels 1 to 6. Default off. */
  level7?: boolean;
}

/** "1-4", or "1 boss". */
export const missionId = (m: Pick<DsMission, "level" | "number">) => (m.number === 9 ? `${m.level}-boss` : `${m.level}-${m.number}`);
/** "Mission 1-4", or "Level 1 boss". */
export const missionTitle = (m: Pick<DsMission, "level" | "number">) => (m.number === 9 ? `Level ${m.level} boss` : `Mission ${m.level}-${m.number}`);

export function missionPool(game: DsGame, o: DsMissionOptions = {}): DsMission[] {
  const pool = game.missions.filter((m) => {
    if (o.level != null) { if (m.level !== o.level) return false; }
    else if (m.level === 7 && !o.level7) return false;
    return o.bosses !== false || m.number !== 9;
  });
  return pool.length ? pool : game.missions.filter((m) => m.level !== 7);
}

/** Missions to play: no mission twice until every one the options allow has come up. */
export function rollMissions(game: DsGame, count: number, o: DsMissionOptions = {}, rng: Rng = Math.random): DsMission[] {
  return rollRaceList(missionPool(game, o), count, rng);
}

/** Where a mission is played, in words: "GCN Luigi Circuit", "DK Pass, driven the other way", "A boss arena". */
export function missionPlace(m: DsMission): string {
  if (!m.course) return "A boss arena";
  return m.reverse ? `${m.course}, driven the other way` : m.course;
}

// ── Art ───────────────────────────────────────────────────────────────────────

const art = (game: DsGame, dir: string, slug: string | null | undefined) => (slug ? `${game.assetBase}${dir}/${slug}.webp` : null);
export const characterArt = (game: DsGame, name: string) => art(game, "characters", game.characters.find((c) => c.name === name)?.slug);
export const characterColor = (game: DsGame, name: string) => game.characters.find((c) => c.name === name)?.color ?? null;
export const kartArt = (game: DsGame, name: string) => art(game, "karts", game.karts.find((k) => k.name === name)?.slug);
export const courseArt = (game: DsGame, name: string) => art(game, "tracks", game.cups.flatMap((c) => c.courses).find((c) => c.name === name)?.slug);
export const battleArt = (game: DsGame, name: string) => art(game, "battle", game.battleCourses.find((c) => c.name === name)?.slug);
export const cupArt = (game: DsGame, slug: string) => art(game, "cups", game.cups.find((c) => c.slug === slug)?.slug);
export const bossArt = (game: DsGame, name: string) => art(game, "bosses", game.bosses.find((b) => b.name === name)?.slug);
/** What a mission's picture shows, and its caption: the boss when the boss has a picture, else the course (Wiggler
 *  races on GCN Mushroom Bridge). */
export function missionShows(game: DsGame, m: DsMission): { kind: "boss" | "course"; name: string } {
  return m.boss && bossArt(game, m.boss) ? { kind: "boss", name: m.boss } : { kind: "course", name: m.course ?? m.boss ?? "" };
}
/** A mission's picture: its boss, else its course (race or battle), else none. */
export const missionArt = (game: DsGame, m: DsMission) =>
  (m.boss ? bossArt(game, m.boss) : null) ?? (m.course ? courseArt(game, m.course) ?? battleArt(game, m.course) : null);
