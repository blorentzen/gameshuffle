/**
 * Pure draws for Mario Kart 7 (Retro Mario Kart picks 2026-11-12): a character and a body, tires and glider for
 * each player, from the parts the save has (the seven from the start, or every part); a cup in its order; races from
 * every cup; battles. No React or I/O; `rng` is injectable for tests. Characters can repeat across the room unless
 * `unique` is on; parts always can (the game lets anyone take any part).
 */

import { pick, type Rng } from "@/lib/party/roll";
import { rollBattleList, rollEngineFrom, rollRaceList, type BattleRoll } from "@/lib/randomizers/raceLists";
import type { GameData, KartCombo } from "@/data/types";
import type { Mk7BattleMode, Mk7Character, Mk7Class, Mk7Course, Mk7Cup, Mk7Game, Mk7Part, Mk7PartsLevel } from "@/lib/mario-kart-7/types";

export const MK7_CLASSES: Mk7Class[] = ["Feather", "Light", "Medium", "Cruiser", "Heavy"];

/** The parts setting's two steps. */
export const PARTS_LEVELS: { id: Mk7PartsLevel; label: string; line: string }[] = [
  { id: "start", label: "Starting parts", line: "The Standard, Birthday Girl and Bolt Buggy bodies, the Standard, Roller and Monster tires and the Super Glider, as on a new save." },
  { id: "all", label: "Every part", line: "All 17 bodies, 10 tires and 7 gliders, the gold parts included: 1,190 combinations." },
];
export const DEFAULT_PARTS: Mk7PartsLevel = "all";
export const partsLevel = (id: string | null | undefined): Mk7PartsLevel => (id === "start" || id === "all" ? id : DEFAULT_PARTS);

export interface Mk7Options {
  /** Weight classes to roll. Empty = every class. */
  classes?: Mk7Class[];
  /** The nine unlockable characters (Mii included). Default on. */
  unlockables?: boolean;
  /** Which parts the save has. Default every part. */
  parts?: Mk7PartsLevel;
  /** Everyone a different character. Default off. */
  unique?: boolean;
}

/** A player's roll. */
export interface Mk7Combo {
  character: string;
  body: string;
  tires: string;
  glider: string;
}

export function characterPool(game: Mk7Game, o: Pick<Mk7Options, "classes" | "unlockables"> = {}): Mk7Character[] {
  return game.characters.filter((c) => (o.unlockables !== false || !c.unlock) && (!o.classes?.length || o.classes.includes(c.weight)));
}

/** The parts of one kind the save has. */
export function partPool(parts: Mk7Part[], level: Mk7PartsLevel = DEFAULT_PARTS): Mk7Part[] {
  return level === "start" ? parts.filter((p) => !p.unlock) : parts;
}

/** Is every part of this combo one the save has? (The randomizer only rolls ones that are.) */
export function comboFits(game: Mk7Game, c: Mk7Combo, level: Mk7PartsLevel = DEFAULT_PARTS): boolean {
  const has = (parts: Mk7Part[], name: string) => partPool(parts, level).some((p) => p.name === name);
  return game.characters.some((x) => x.name === c.character) && has(game.bodies, c.body) && has(game.tires, c.tires) && has(game.gliders, c.glider);
}

/**
 * One player: a character from the options, then a body, tires and glider, each part as likely as any other. With
 * `unique`, characters another player holds are left out; when the room has used up what the options allow, the
 * class filter gives way first, then repeats come back.
 */
export function rollCombo(game: Mk7Game, o: Mk7Options = {}, taken: readonly string[] = [], rng: Rng = Math.random): Mk7Combo {
  const level = o.parts ?? DEFAULT_PARTS;
  const pool = characterPool(game, o);
  let from = pool.length ? pool : characterPool(game, { unlockables: o.unlockables });
  if (o.unique) {
    const free = from.filter((c) => !taken.includes(c.name));
    const wider = characterPool(game, { unlockables: o.unlockables }).filter((c) => !taken.includes(c.name));
    from = free.length ? free : wider.length ? wider : from;
  }
  return {
    character: pick(from, rng)!.name,
    body: pick(partPool(game.bodies, level), rng)!.name,
    tires: pick(partPool(game.tires, level), rng)!.name,
    glider: pick(partPool(game.gliders, level), rng)!.name,
  };
}

/** A combo for everyone. */
export function drawCombos(game: Mk7Game, count: number, o: Mk7Options = {}, rng: Rng = Math.random): Mk7Combo[] {
  const out: Mk7Combo[] = [];
  for (let i = 0; i < count; i++) out.push(rollCombo(game, o, out.map((c) => c.character), rng));
  return out;
}

// ── Races and battles ─────────────────────────────────────────────────────────

export type Mk7CupKind = "any" | "new" | "classic";

export function rollEngine(game: Mk7Game, allowed: readonly string[] = [], rng: Rng = Math.random): string {
  return rollEngineFrom(game.engines, allowed, rng);
}

/** A cup, raced in the game's order: any of the eight, a new cup or a classic cup. */
export function rollCup(game: Mk7Game, kind: Mk7CupKind = "any", rng: Rng = Math.random): Mk7Cup {
  const pool = game.cups.filter((c) => kind === "any" || c.kind === kind);
  return pick(pool.length ? pool : game.cups, rng)!;
}

/** Random races from every cup: no course twice until all 32 have come up. */
export function rollRaces(game: Mk7Game, count: number, rng: Rng = Math.random): Mk7Course[] {
  return rollRaceList(game.cups.flatMap((c) => c.courses), count, rng);
}

/** Battles: a course and a mode each, no course twice until all six have come up. */
export function rollBattles(game: Mk7Game, count: number, o: { modes?: Mk7BattleMode["id"][] } = {}, rng: Rng = Math.random): BattleRoll[] {
  const modes = game.battleModes.filter((m) => !o.modes?.length || o.modes.includes(m.id));
  return rollBattleList(game.battleCourses, modes.length ? modes : game.battleModes, count, rng);
}

/** "3 sections" for the three courses raced in sections, else nothing (three laps). */
export const courseNote = (c: Pick<Mk7Course, "sections">) => (c.sections ? "3 sections" : undefined);

// ── Art, and the shapes the shared Mario Kart card takes ──────────────────────

const art = (game: Mk7Game, dir: string, slug: string | null | undefined) => (slug ? `${game.assetBase}${dir}/${slug}.webp` : null);
export const characterArt = (game: Mk7Game, name: string) => art(game, "characters", game.characters.find((c) => c.name === name)?.slug);
export const characterColor = (game: Mk7Game, name: string) => game.characters.find((c) => c.name === name)?.color ?? null;
export const bodyArt = (game: Mk7Game, name: string) => art(game, "bodies", game.bodies.find((p) => p.name === name)?.slug);
export const tiresArt = (game: Mk7Game, name: string) => art(game, "tires", game.tires.find((p) => p.name === name)?.slug);
export const gliderArt = (game: Mk7Game, name: string) => art(game, "gliders", game.gliders.find((p) => p.name === name)?.slug);
export const courseArt = (game: Mk7Game, name: string) => art(game, "tracks", game.cups.flatMap((c) => c.courses).find((c) => c.name === name)?.slug);
export const battleArt = (game: Mk7Game, name: string) => art(game, "battle", game.battleCourses.find((c) => c.name === name)?.slug);
export const cupArt = (game: Mk7Game, slug: string) => art(game, "cups", game.cups.find((c) => c.slug === slug)?.slug);

/** A combo as the shared Mario Kart card draws it (character, vehicle, wheels, glider). */
export function toKartCombo(game: Mk7Game, c: Mk7Combo): KartCombo {
  const weight = game.characters.find((x) => x.name === c.character)?.weight;
  return {
    character: { name: c.character, img: characterArt(game, c.character) ?? "", ...(weight ? { weight } : {}) },
    vehicle: { name: c.body, img: bodyArt(game, c.body) ?? "" },
    wheels: { name: c.tires, img: tiresArt(game, c.tires) ?? "" },
    glider: { name: c.glider, img: gliderArt(game, c.glider) ?? "" },
  };
}

/** Every character and part as the shared card's reels want them. */
export function kartData(game: Mk7Game): GameData {
  return {
    characters: game.characters.map((c) => ({ name: c.name, img: characterArt(game, c.name) ?? "", weight: c.weight })),
    vehicles: game.bodies.map((p) => ({ name: p.name, img: bodyArt(game, p.name) ?? "" })),
    wheels: game.tires.map((p) => ({ name: p.name, img: tiresArt(game, p.name) ?? "" })),
    gliders: game.gliders.map((p) => ({ name: p.name, img: gliderArt(game, p.name) ?? "" })),
  };
}
