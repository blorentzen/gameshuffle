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

/** Teams and handicaps follow the scenario (License to Kill locks handicaps off in the game). */
function seatsFor(scenario: GoldenEyeScenario, players: number, opts: GoldenEyeOptions, rng: () => number) {
  const teams = scenario.split ? shuffle(scenario.split.flatMap((size, team) => Array(size).fill(team + 1)), rng) : null;
  const handicaps = Array.from({ length: players }, () => (opts.handicaps && scenario.id !== "ltk" ? pick(GOLDENEYE_HANDICAPS, rng) : null));
  return { teams, handicaps };
}

/** The match itself: scenario, map, weapons, length (characters roll on their own). */
export function rollMatch(opts: GoldenEyeOptions, rng: () => number = Math.random): GoldenEyeMatch {
  const players = Math.max(2, Math.min(4, opts.players));
  const scenario = pick(scenarioPool({ players, allowTeams: opts.allowTeams }), rng);
  const map = pick(mapPool({ players, freshSave: opts.freshSave }), rng);
  const weaponSet = scenario.forcesWeaponSet
    ? GOLDENEYE_WEAPON_SETS.find((w) => w.id === scenario.forcesWeaponSet)!
    : pick(GOLDENEYE_WEAPON_SETS.filter((w) => w.id !== "golden-gun"), rng);
  const length = pick(lengthPool(scenario), rng);
  return { scenario, map, weaponSet, length, ...seatsFor(scenario, players, opts, rng), cheat: opts.cheat ? pick(GOLDENEYE_CHEATS, rng) : null };
}

/** A different scenario; weapons and length change only if the new one needs it. */
export function rerollScenario(m: GoldenEyeMatch, opts: GoldenEyeOptions, rng: () => number = Math.random): GoldenEyeMatch {
  const players = Math.max(2, Math.min(4, opts.players));
  const pool = scenarioPool({ players, allowTeams: opts.allowTeams });
  const others = pool.filter((x) => x.id !== m.scenario.id);
  const scenario = pick(others.length ? others : pool, rng);
  const weaponSet = scenario.forcesWeaponSet
    ? GOLDENEYE_WEAPON_SETS.find((w) => w.id === scenario.forcesWeaponSet)!
    : m.scenario.forcesWeaponSet ? pick(GOLDENEYE_WEAPON_SETS.filter((w) => w.id !== "golden-gun"), rng) : m.weaponSet;
  const lengths = lengthPool(scenario);
  const length = lengths.some((l) => l.id === m.length.id) ? m.length : pick(lengths, rng);
  return { ...m, scenario, weaponSet, length, ...seatsFor(scenario, players, opts, rng) };
}

/** A different game length that the scenario allows. */
export function rerollLength(m: GoldenEyeMatch, rng: () => number = Math.random): GoldenEyeMatch {
  const pool = lengthPool(m.scenario);
  const others = pool.filter((l) => l.id !== m.length.id);
  return { ...m, length: pick(others.length ? others : pool, rng) };
}

/** A different weapon set (Golden Gun stays locked to its own scenario). */
export function rerollWeapons(m: GoldenEyeMatch, rng: () => number = Math.random): GoldenEyeMatch {
  if (m.scenario.forcesWeaponSet) return m;
  const sets = GOLDENEYE_WEAPON_SETS.filter((w) => w.id !== "golden-gun" && w.id !== m.weaponSet.id);
  return { ...m, weaponSet: pick(sets, rng) };
}

/** A different map that still fits the player count. */
export function rerollMap(m: GoldenEyeMatch, opts: GoldenEyeOptions, rng: () => number = Math.random): GoldenEyeMatch {
  const pool = mapPool(opts);
  const others = pool.filter((x) => x.name !== m.map.name);
  return { ...m, map: pick(others.length ? others : pool, rng) };
}

/** One seat's character, different from everyone else's. */
export function rerollCharacter(characters: (string | null)[], seat: number, opts: Pick<GoldenEyeOptions, "freshSave" | "noOddjob">, rng: () => number = Math.random): (string | null)[] {
  const taken = new Set(characters.filter((c, i) => c && i !== seat));
  const pool = characterPool(opts).filter((c) => !taken.has(c) && c !== characters[seat]);
  const next = pool.length ? pick(pool, rng) : characters[seat];
  return characters.map((c, i) => (i === seat ? next : c));
}

/** One line per part, for pasting into chat or Discord. */
export function matchText(m: GoldenEyeMatch | null, characters: (string | null)[], names: string[]): string {
  const lines = [
    ...(m ? [
      `GoldenEye 007: ${m.scenario.name} on ${m.map.name}`,
      `Weapons: ${m.weaponSet.name} · ${m.length.label}${m.cheat ? ` · Cheat: ${m.cheat}` : ""}`,
    ] : ["GoldenEye 007"]),
    ...names.map((n, i) => `${n}: ${characters[i] ?? "?"}${m?.teams ? ` (Team ${m.teams[i]})` : ""}${m?.handicaps[i] ? `, ${m.handicaps[i]}` : ""}`),
  ];
  return lines.join("\n");
}
