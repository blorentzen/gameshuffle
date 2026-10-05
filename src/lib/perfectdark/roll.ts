/**
 * Pure Perfect Dark Combat Simulator draws: the match (scenario, arena, weapon
 * set, limit, simulants, an optional chaos option) and a character per player.
 * Characters roll separately so re-rolling the match never changes them.
 * No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import { PERFECT_DARK } from "@/data/perfect-dark/combat-simulator";
import type { PdArena, PdMatch, PdOptions, PdScenario, PdSim } from "@/lib/perfectdark/types";

const D = PERFECT_DARK;
const open = <T extends { available: "start" | "unlock" }>(rows: T[], fresh: boolean) => (fresh ? rows.filter((r) => r.available === "start") : rows);

export function scenarioPool(o: Pick<PdOptions, "players" | "allowTeams" | "sims" | "freshSave">): PdScenario[] {
  const total = o.players + o.sims;
  const rows = open(D.scenarios, o.freshSave).filter((s) => total >= s.minPlayers && (o.allowTeams || s.teams !== "required"));
  return rows.length ? rows : D.scenarios.filter((s) => s.id === "combat");
}
export const arenaPool = (o: Pick<PdOptions, "freshSave">): PdArena[] => open(D.arenas, o.freshSave);
export const weaponSetPool = (o: Pick<PdOptions, "freshSave">) => open(D.weaponSets, o.freshSave);
/** Characters a roll can land on. A new save only has main-cast bodies open, so it always draws from them. */
export const characterPool = (o: Pick<PdOptions, "freshSave" | "cast">): string[] => {
  const rows = open(D.characters, o.freshSave).filter((c) => (o.cast === "additional" && !o.freshSave ? c.group === "additional" : c.group === "main" || o.freshSave));
  return rows.map((c) => c.name);
};
const optionPool = (o: Pick<PdOptions, "freshSave">) => open(D.options, o.freshSave).map((x) => x.name);

/** Simulants: as many as asked (capped by the game), each with a difficulty and, optionally, a special type. */
export function rollSims(o: PdOptions, rng: Rng = Math.random): PdSim[] {
  const cap = o.freshSave ? D.simulants.maxSimulantsFreshSave : D.simulants.maxSimulants;
  const room = Math.max(0, Math.min(cap, D.simulants.maxPlayersPlusSims - o.players));
  const count = Math.min(o.sims, room);
  const base = o.freshSave ? D.simulants.freshDifficulties : D.simulants.difficulties;
  const diffs = o.simDifficulties.length ? base.filter((d) => o.simDifficulties.includes(d)) : base;
  const types = open(D.simulants.specialTypes, o.freshSave);
  return Array.from({ length: count }, () => ({
    difficulty: pick(diffs.length ? diffs : base, rng)!,
    type: o.simSpecials && types.length && rng() < 0.5 ? pick(types, rng)!.name : null,
  }));
}

/** Two balanced teams across everyone in the match (players first, then simulants), for scenarios that need teams. */
function rollTeams(scenario: { teams: string }, players: number, sims: number, rng: Rng): PdMatch["teams"] {
  if (scenario.teams !== "required") return null;
  const total = players + sims;
  const seats = shuffle(Array.from({ length: total }, (_, i) => (i % 2) + 1), rng);
  return { players: seats.slice(0, players), sims: seats.slice(players) };
}

export function rollMatch(o: PdOptions, rng: Rng = Math.random): PdMatch {
  const scenario = pick(scenarioPool(o), rng)!;
  const sims = rollSims(o, rng);
  return {
    scenario,
    arena: pick(arenaPool(o), rng)!,
    weaponSet: pick(weaponSetPool(o), rng)!,
    limit: pick(D.limits.time, rng)!,
    sims,
    option: o.chaos ? pick(optionPool(o), rng) ?? null : null,
    teams: rollTeams(scenario, o.players, sims.length, rng),
  };
}

const other = <T,>(rows: T[], current: T, rng: Rng) => pick(rows.filter((r) => r !== current), rng) ?? current;

export function rerollScenario(m: PdMatch, o: PdOptions, rng: Rng = Math.random): PdMatch {
  const scenario = other(scenarioPool(o), m.scenario, rng);
  return { ...m, scenario, teams: rollTeams(scenario, o.players, m.sims.length, rng) };
}
export const rerollArena = (m: PdMatch, o: PdOptions, rng: Rng = Math.random): PdMatch => ({ ...m, arena: other(arenaPool(o), m.arena, rng) });
export const rerollWeapons = (m: PdMatch, o: PdOptions, rng: Rng = Math.random): PdMatch => ({ ...m, weaponSet: other(weaponSetPool(o), m.weaponSet, rng) });
export const rerollLimit = (m: PdMatch, rng: Rng = Math.random): PdMatch => ({ ...m, limit: other(D.limits.time, m.limit, rng) });
export function rerollSims(m: PdMatch, o: PdOptions, rng: Rng = Math.random): PdMatch {
  const sims = rollSims(o, rng);
  return { ...m, sims, teams: rollTeams(m.scenario, o.players, sims.length, rng) };
}

export function rollCharacters(count: number, o: Pick<PdOptions, "freshSave" | "cast">, rng: Rng = Math.random): string[] {
  return shuffle(characterPool(o), rng).slice(0, count);
}

/** One seat's character, different from everyone else's. */
export function rerollCharacter(characters: (string | null)[], seat: number, o: Pick<PdOptions, "freshSave" | "cast">, rng: Rng = Math.random): (string | null)[] {
  const taken = new Set(characters.filter((c, i) => c && i !== seat));
  const poolNames = characterPool(o).filter((c) => !taken.has(c) && c !== characters[seat]);
  const next = pick(poolNames, rng) ?? characters[seat];
  return characters.map((c, i) => (i === seat ? next : c));
}

export function matchText(m: PdMatch | null, characters: (string | null)[], names: string[]): string {
  const lines = m ? [
    `Perfect Dark: ${m.scenario.name} on ${m.arena.name}`,
    `Weapons: ${m.weaponSet.name} · ${m.limit}${m.option ? ` · ${m.option}` : ""}`,
    ...(m.sims.length ? [`Simulants: ${m.sims.map((s, i) => `${s.difficulty}${s.type ? ` ${s.type}` : ""}${m.teams ? ` (Team ${m.teams.sims[i]})` : ""}`).join(", ")}`] : []),
  ] : ["Perfect Dark"];
  return [...lines, ...names.map((n, i) => `${n}: ${characters[i] ?? "?"}${m?.teams ? ` (Team ${m.teams.players[i]})` : ""}`)].join("\n");
}
