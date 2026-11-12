/**
 * Pure draws for Super Mario Kart (Retro Mario Kart picks 2026-11-12): a different character for each of up to two
 * players, a cup in its order, races from every cup, and battle courses. No React or I/O; `rng` is injectable.
 */

import { pick, type Rng } from "@/lib/party/roll";
import { rollEngineFrom, rollRaceList } from "@/lib/randomizers/raceLists";
import type { SmkCharacter, SmkClass, SmkCourse, SmkCup, SmkGame } from "@/lib/super-mario-kart/types";

/** Two players at most: Mario Kart GP, Match Race and Battle Mode all take one or two. */
export const SMK_MAX_PLAYERS = 2;

export function characterPool(game: SmkGame, classes: readonly SmkClass[] = []): SmkCharacter[] {
  return game.characters.filter((c) => !classes.length || classes.includes(c.class));
}

/** One player's character: never one the other player holds; the class filter gives way before that would happen. */
export function rollCharacter(game: SmkGame, classes: readonly SmkClass[] = [], taken: readonly string[] = [], rng: Rng = Math.random): string {
  const free = characterPool(game, classes).filter((c) => !taken.includes(c.name));
  const wider = game.characters.filter((c) => !taken.includes(c.name));
  return pick(free.length ? free : wider.length ? wider : game.characters, rng)!.name;
}

/** A different character for each player (one or two). */
export function drawCharacters(game: SmkGame, count: number, classes: readonly SmkClass[] = [], rng: Rng = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, SMK_MAX_PLAYERS); i++) out.push(rollCharacter(game, classes, out, rng));
  return out;
}

export const classOf = (game: SmkGame, name: string) => game.classes.find((k) => k.id === game.characters.find((c) => c.name === name)?.class) ?? null;

export function rollEngine(game: SmkGame, allowed: readonly string[] = [], rng: Rng = Math.random): string {
  return rollEngineFrom(game.engines, allowed, rng);
}
export function rollCup(game: SmkGame, rng: Rng = Math.random): SmkCup {
  return pick(game.cups, rng)!;
}
/** Random races: no course twice until all 20 have come up. */
export function rollRaces(game: SmkGame, count: number, rng: Rng = Math.random): SmkCourse[] {
  return rollRaceList(game.cups.flatMap((c) => c.courses), count, rng);
}
/** Battle courses, no course twice until all four have come up. */
export function rollBattleCourses(game: SmkGame, count: number, rng: Rng = Math.random): SmkCourse[] {
  return rollRaceList(game.battleCourses, count, rng);
}

const art = (game: SmkGame, dir: string, slug: string | null | undefined) => (slug ? `${game.assetBase}${dir}/${slug}.webp` : null);
export const characterArt = (game: SmkGame, name: string) => art(game, "characters", game.characters.find((c) => c.name === name)?.slug);
export const characterColor = (game: SmkGame, name: string) => game.characters.find((c) => c.name === name)?.color ?? null;
export const courseArt = (game: SmkGame, name: string) => art(game, "tracks", game.cups.flatMap((c) => c.courses).find((c) => c.name === name)?.slug);
export const battleArt = (game: SmkGame, name: string) => art(game, "battle", game.battleCourses.find((c) => c.name === name)?.slug);
export const cupArt = (game: SmkGame, slug: string) => art(game, "cups", game.cups.find((c) => c.slug === slug)?.slug);
