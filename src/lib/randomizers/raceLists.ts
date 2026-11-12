/**
 * Race and battle lists shared by the retro Mario Kart randomizers (Double Dash, Mario Kart DS): an engine class, a
 * race list that doesn't repeat a course until every course has come up, and battles (a course and a mode each, no
 * course twice until every course has come up). Pure; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";

/** An engine class from the ones allowed (every class when none are). */
export function rollEngineFrom(engines: readonly string[], allowed: readonly string[] = [], rng: Rng = Math.random): string {
  const pool = engines.filter((e) => !allowed.length || allowed.includes(e));
  return pick(pool.length ? pool : engines, rng)!;
}

/** `count` races from the courses given: no course twice until all of them have come up. */
export function rollRaceList<T>(all: readonly T[], count: number, rng: Rng = Math.random): T[] {
  const out: T[] = [];
  if (!all.length) return out;
  while (out.length < count) out.push(...shuffle(all, rng).slice(0, Math.min(all.length, count - out.length)));
  return out;
}

export interface BattleRoll {
  course: string;
  mode: string;
}

/** Battles: a course and a mode each, no course twice until every course given has come up. */
export function rollBattleList(courses: readonly { name: string }[], modes: readonly { name: string }[], count: number, rng: Rng = Math.random): BattleRoll[] {
  const out: BattleRoll[] = [];
  if (!courses.length || !modes.length) return out;
  while (out.length < count) {
    for (const c of shuffle(courses, rng).slice(0, count - out.length)) out.push({ course: c.name, mode: pick(modes, rng)!.name });
  }
  return out;
}
