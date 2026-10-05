/**
 * Pokémon Stadium 1 & 2 rental teams (client-safe, pure).
 *
 * On Nintendo Switch Online the Transfer Pak doesn't work, so rental Pokémon are
 * how most people battle. Each cup has its own rental list, one entry per
 * species, with a fixed level and moveset. Rentals sit at the bottom of their
 * cup's level range, so any 6 different species from a cup's list make a legal
 * team, and any 3 of them stay under the cup's level-sum cap.
 *
 * Data: src/data/pokemon/stadium.json (trimmed from
 * specs/research/2026-10-04-randomizers, Serebii cross-checked with Bulbapedia).
 */

import data from "@/data/pokemon/stadium.json";

export interface Rental { dex: number; name: string; level: number; types: string[]; moves: string[]; round2?: boolean }
export interface StadiumCup { id: string; name: string; rule: string; rentals: Rental[] }
export interface StadiumGame { slug: string; label: string; cups: StadiumCup[] }

/**
 * Free Battle with the "Anything Goes" ruleset: no cup rules (Lv 1 to 100, bring
 * 1 to 6). Stadium 2 uses its Prime Cup / Anything Goes rental list (Lv 100);
 * Stadium 1 most likely uses the Prime Cup list too (Bulbapedia + Serebii,
 * researched 2026-10-04; the Stadium 1 list isn't stated outright).
 */
function withFreeBattle(g: StadiumGame): StadiumGame {
  const prime = g.cups.find((c) => c.id === "prime");
  if (!prime) return g;
  return { ...g, cups: [...g.cups, { id: "anything-goes", name: "Free Battle: Anything Goes", rule: "No cup rules: Lv 100 rentals, bring 1 to 6", rentals: prime.rentals }] };
}

export const STADIUM_GAMES: StadiumGame[] = (data as { games: StadiumGame[] }).games.map(withFreeBattle);
export const TEAM_SIZE = 6;
export const PICK_SIZE = 3;
export const MAX_PLAYERS = 4;

export function stadiumGame(slug: string): StadiumGame {
  return STADIUM_GAMES.find((g) => g.slug === slug) ?? STADIUM_GAMES[0];
}

export function stadiumCup(game: StadiumGame, cupId: string): StadiumCup {
  return game.cups.find((c) => c.id === cupId) ?? game.cups[0];
}

/** Round 2 rentals (Mew; Celebi and Surfing Pikachu in Stadium 2) only when asked for. */
export function rentalPool(cup: StadiumCup, round2: boolean): Rental[] {
  return cup.rentals.filter((r) => round2 || !r.round2);
}

/** Does any rental in this cup unlock in Round 2? */
export function cupHasRound2(cup: StadiumCup): boolean {
  return cup.rentals.some((r) => r.round2);
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw one team of `size` different species from `pool`, skipping species in
 * `avoid` (other players' Pokémon when no-repeats is on). If there aren't
 * enough left, repeats across players are allowed rather than a short team;
 * a team never repeats a species within itself.
 */
function drawTeam(pool: Rental[], avoid: Set<number>, size: number, rng: () => number): Rental[] {
  const team: Rental[] = [];
  const mine = new Set<number>();
  for (const pass of [true, false]) {
    for (const r of shuffle(pool, rng)) {
      if (team.length >= size) break;
      if (mine.has(r.dex) || (pass && avoid.has(r.dex))) continue;
      team.push(r);
      mine.add(r.dex);
    }
    if (team.length >= size) break;
  }
  return team;
}

export interface RollOptions { players: number; noRepeat: boolean; round2: boolean; rng?: () => number }

/** A team of 6 for every player. */
export function rollTeams(cup: StadiumCup, opts: RollOptions): Rental[][] {
  const rng = opts.rng ?? Math.random;
  const pool = rentalPool(cup, opts.round2);
  const used = new Set<number>();
  return Array.from({ length: Math.max(1, Math.min(MAX_PLAYERS, opts.players)) }, () => {
    const team = drawTeam(pool, opts.noRepeat ? used : new Set(), TEAM_SIZE, rng);
    team.forEach((r) => used.add(r.dex));
    return team;
  });
}

/** Re-roll one player's team, keeping clear of everyone else's when no-repeats is on. */
export function rerollTeam(cup: StadiumCup, teams: Rental[][], seat: number, opts: Omit<RollOptions, "players">): Rental[] {
  const rng = opts.rng ?? Math.random;
  const avoid = new Set<number>();
  if (opts.noRepeat) teams.forEach((t, i) => { if (i !== seat) t.forEach((r) => avoid.add(r.dex)); });
  return drawTeam(rentalPool(cup, opts.round2), avoid, TEAM_SIZE, rng);
}

/**
 * Re-roll one player's team but keep the slots they chose themselves (`keep`,
 * indexes into their current team). New picks avoid the kept species and, with
 * no-repeats on, everyone else's.
 */
export function rerollTeamKeeping(cup: StadiumCup, teams: Rental[][], seat: number, keep: number[], opts: Omit<RollOptions, "players">): Rental[] {
  const rng = opts.rng ?? Math.random;
  const current = teams[seat] ?? [];
  const kept = new Map(keep.filter((i) => current[i]).map((i) => [i, current[i]]));
  // Kept species are out of the pool entirely (a team never repeats one);
  // other players' picks are only avoided when there's enough to go round.
  const keptDex = new Set([...kept.values()].map((r) => r.dex));
  const avoid = new Set<number>();
  if (opts.noRepeat) teams.forEach((t, i) => { if (i !== seat) t.forEach((r) => avoid.add(r.dex)); });
  const fresh = drawTeam(rentalPool(cup, opts.round2).filter((r) => !keptDex.has(r.dex)), avoid, TEAM_SIZE - kept.size, rng);
  return Array.from({ length: TEAM_SIZE }, (_, i) => kept.get(i) ?? fresh.shift()!).filter(Boolean);
}

/** The randomizer's pick of 3 from a team (indexes), for players who want every choice made for them. */
export function suggestPick(team: Rental[], rng: () => number = Math.random): number[] {
  return shuffle(team.map((_, i) => i), rng).slice(0, PICK_SIZE).sort((a, b) => a - b);
}
