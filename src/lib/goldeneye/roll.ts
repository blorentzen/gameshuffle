/**
 * GoldenEye 007 multiplayer rolls (client-safe, pure). Scenario first, because it
 * decides the rest: team scenarios need an exact player count, Golden Gun forces
 * its weapon set, You Only Live Twice is Last Alive, and Flag Tag only takes
 * time limits. Then a map that fits the player count, a weapon set, a game
 * length, and a different character for each player.
 */

import {
  GOLDENEYE_CHARACTERS, GOLDENEYE_CHEATS, GOLDENEYE_HANDICAPS, GOLDENEYE_LENGTHS, GOLDENEYE_MAPS, GOLDENEYE_SCENARIOS, GOLDENEYE_WEAPON_SETS,
  type GoldenEyeLength, type GoldenEyeMap, type GoldenEyeScenario, type GoldenEyeWeaponSet,
} from "@/data/goldeneye/multiplayer";

export interface GoldenEyeOptions {
  players: number;
  /** Only what's open on a new save (6 maps, the 8 starting characters). */
  freshSave: boolean;
  /** Leave Oddjob out: he's short enough that auto-aim shoots over his head. */
  noOddjob: boolean;
  allowTeams: boolean;
  handicaps: boolean;
  cheat: boolean;
}

export interface GoldenEyeMatch {
  scenario: GoldenEyeScenario;
  map: GoldenEyeMap;
  weaponSet: GoldenEyeWeaponSet;
  length: GoldenEyeLength;
  /** Team number per player (team scenarios only). */
  teams: number[] | null;
  characters: string[];
  handicaps: (string | null)[];
  cheat: string | null;
}

const pick = <T,>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];
function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function scenarioPool(opts: Pick<GoldenEyeOptions, "players" | "allowTeams">): GoldenEyeScenario[] {
  return GOLDENEYE_SCENARIOS.filter((s) => opts.players >= s.minPlayers && opts.players <= s.maxPlayers && (opts.allowTeams || !s.teams));
}

export function mapPool(opts: Pick<GoldenEyeOptions, "players" | "freshSave">): GoldenEyeMap[] {
  return GOLDENEYE_MAPS.filter((m) => m.maxPlayers >= opts.players && (!opts.freshSave || m.freshSave));
}

export function characterPool(opts: Pick<GoldenEyeOptions, "freshSave" | "noOddjob">): string[] {
  return GOLDENEYE_CHARACTERS.filter((c) => (!opts.freshSave || c.start) && !(opts.noOddjob && c.name === "Oddjob")).map((c) => c.name);
}

export function lengthPool(scenario: GoldenEyeScenario): GoldenEyeLength[] {
  if (scenario.lengths === "lastAlive") return GOLDENEYE_LENGTHS.filter((l) => l.id === "last-alive");
  if (scenario.lengths === "timeOnly") return GOLDENEYE_LENGTHS.filter((l) => l.id === "unlimited" || l.minutes);
  return GOLDENEYE_LENGTHS.filter((l) => l.id !== "last-alive");
}

export function rollCharacters(count: number, opts: Pick<GoldenEyeOptions, "freshSave" | "noOddjob">, rng: () => number = Math.random): string[] {
  return shuffle(characterPool(opts), rng).slice(0, count);
}

export function rollMatch(opts: GoldenEyeOptions, rng: () => number = Math.random): GoldenEyeMatch {
  const players = Math.max(2, Math.min(4, opts.players));
  const scenario = pick(scenarioPool({ players, allowTeams: opts.allowTeams }), rng);
  const map = pick(mapPool({ players, freshSave: opts.freshSave }), rng);
  const weaponSet = scenario.forcesWeaponSet
    ? GOLDENEYE_WEAPON_SETS.find((w) => w.id === scenario.forcesWeaponSet)!
    : pick(GOLDENEYE_WEAPON_SETS.filter((w) => w.id !== "golden-gun"), rng);
  const length = pick(lengthPool(scenario), rng);
  let teams: number[] | null = null;
  if (scenario.split) {
    const seats = scenario.split.flatMap((size, team) => Array(size).fill(team + 1));
    teams = shuffle(seats, rng);
  }
  // License to Kill locks handicaps off in the game.
  const handicaps = Array.from({ length: players }, () => (opts.handicaps && scenario.id !== "ltk" ? pick(GOLDENEYE_HANDICAPS, rng) : null));
  return {
    scenario, map, weaponSet, length, teams,
    characters: rollCharacters(players, opts, rng),
    handicaps,
    cheat: opts.cheat ? pick(GOLDENEYE_CHEATS, rng) : null,
  };
}

/** A different map that still fits the player count. */
export function rerollMap(m: GoldenEyeMatch, opts: GoldenEyeOptions, rng: () => number = Math.random): GoldenEyeMatch {
  const pool = mapPool(opts);
  const others = pool.filter((x) => x.name !== m.map.name);
  return { ...m, map: pick(others.length ? others : pool, rng) };
}

/** A different weapon set (Golden Gun stays locked to its own scenario). */
export function rerollWeapons(m: GoldenEyeMatch, rng: () => number = Math.random): GoldenEyeMatch {
  if (m.scenario.forcesWeaponSet) return m;
  const sets = GOLDENEYE_WEAPON_SETS.filter((w) => w.id !== "golden-gun" && w.id !== m.weaponSet.id);
  return { ...m, weaponSet: pick(sets, rng) };
}

/** One line per part, for pasting into chat or Discord. */
export function matchText(m: GoldenEyeMatch, names: string[]): string {
  const lines = [
    `GoldenEye 007: ${m.scenario.name} on ${m.map.name}`,
    `Weapons: ${m.weaponSet.name} · ${m.length.label}${m.cheat ? ` · Cheat: ${m.cheat}` : ""}`,
    ...m.characters.map((c, i) => `${names[i]}: ${c}${m.teams ? ` (Team ${m.teams[i]})` : ""}${m.handicaps[i] ? `, ${m.handicaps[i]}` : ""}`),
  ];
  return lines.join("\n");
}
