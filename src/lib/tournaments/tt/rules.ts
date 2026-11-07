/**
 * Time trial tournaments: the pure rules (picks 2026-11-05, all A: events G5Rqz1idSprhNCVMap3fku, builder
 * RqeBAMk9cWToCPdcSryWL4, shapes VKDWHSS2s8UbNQhoTqodAz). Client-safe, no database.
 *
 * A time trial decides matches by time on the event's tracks, so it plugs into every shape:
 *   - the leaderboard event: everyone, every track, one window (points across rounds);
 *   - groups: rounds of groups of 2 to 12, each round with its own size and cut, re-spread by seed every round
 *     (a group of 2 with 1 moving on is a 1v1 knockout);
 *   - matches: a 1v1 over 1 or 3 tracks, for double elimination and Swiss (`matchResult`).
 * Ranking a set of players on a set of tracks is one function (`rankOn`) whichever shape asks.
 */

export type TtScoring = "total" | "points";

/** One time a player added during the event. Rejected runs never count. */
export interface TtRun {
  player: string;
  track: string;
  ms: number;
  /** False once a verifier turned its proof down. */
  counts?: boolean;
}

/**
 * Points by place on each track (15, 12, 10, then down by one to 1 at 12th). Everyone below 12th who set a time
 * still scores 1, so a time always beats no time; a missing track scores nothing.
 */
export const PLACE_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export const pointsForPlace = (place: number): number => (place >= 1 ? PLACE_POINTS[place - 1] ?? 1 : 0);

/** The fastest counting time per player on each track: best[track][player] = ms. */
export function bestTimes(runs: TtRun[], players?: Iterable<string>): Map<string, Map<string, number>> {
  const only = players ? new Set(players) : null;
  const out = new Map<string, Map<string, number>>();
  for (const r of runs) {
    if (r.counts === false || !(r.ms > 0)) continue;
    if (only && !only.has(r.player)) continue;
    const t = out.get(r.track) ?? new Map<string, number>();
    const had = t.get(r.player);
    if (had === undefined || r.ms < had) t.set(r.player, r.ms);
    out.set(r.track, t);
  }
  return out;
}

/** Places on one track among the players who have a time there (equal times share a place). */
export function trackPlaces(best: Map<string, number> | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!best) return out;
  const sorted = [...best.entries()].sort((a, b) => a[1] - b[1]);
  let place = 0;
  sorted.forEach(([p, ms], i) => {
    if (i === 0 || ms !== sorted[i - 1][1]) place = i + 1;
    out.set(p, place);
  });
  return out;
}

export interface TtRow {
  player: string;
  /** 1 = first. Players who can't be told apart share a place (`tied`). */
  place: number;
  tied: boolean;
  /** Sum of the best times when every track has one, else null. */
  total: number | null;
  points: number;
  /** Tracks with a time. */
  done: number;
  complete: boolean;
  /** The player's best time and place on each track (null = no time). */
  times: Record<string, number | null>;
  places: Record<string, number | null>;
  /** Their best place on any one track: the tiebreak. */
  bestPlace: number | null;
}

/**
 * Ranks `players` on `tracks`. Total time: everyone with a time on every track by their total, then players with
 * fewer tracks done (more tracks first, then points). Points: by points. Ties then go to the better best single-track
 * place; players still level share a place and are `tied` (a run-off decides it when it matters for a cut).
 * Players with no time at all come last together.
 */
export function rankOn(players: string[], tracks: string[], runs: TtRun[], scoring: TtScoring): TtRow[] {
  const best = bestTimes(runs, players);
  const places = new Map(tracks.map((t) => [t, trackPlaces(best.get(t))] as const));
  const rows: Omit<TtRow, "place" | "tied">[] = players.map((player) => {
    const times: Record<string, number | null> = {};
    const pl: Record<string, number | null> = {};
    let total = 0, points = 0, done = 0, bestPlace: number | null = null;
    for (const t of tracks) {
      const ms = best.get(t)?.get(player) ?? null;
      const place = ms === null ? null : places.get(t)!.get(player)!;
      times[t] = ms;
      pl[t] = place;
      if (ms !== null && place !== null) {
        total += ms;
        points += pointsForPlace(place);
        done++;
        if (bestPlace === null || place < bestPlace) bestPlace = place;
      }
    }
    const complete = tracks.length > 0 && done === tracks.length;
    return { player, total: complete ? total : null, points, done, complete, times, places: pl, bestPlace };
  });
  // Lower key sorts first; equal keys share a place.
  const key = (r: Omit<TtRow, "place" | "tied">): number[] => {
    if (r.done === 0) return [3, 0, 0, 0];
    const tie = r.bestPlace ?? 9999;
    if (scoring === "total") return r.complete ? [0, r.total!, tie, 0] : [1, -r.done, -r.points, tie];
    return [0, -r.points, tie, 0];
  };
  const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const sorted = rows.map((r) => ({ r, k: key(r) })).sort((a, b) => cmp(a.k, b.k) || a.r.player.localeCompare(b.r.player));
  const out: TtRow[] = [];
  sorted.forEach(({ r, k }, i) => {
    const same = i > 0 && cmp(k, sorted[i - 1].k) === 0;
    const place = same ? out[i - 1].place : i + 1;
    out.push({ ...r, place, tied: false });
  });
  // Mark shared places.
  for (let i = 0; i < out.length; i++) {
    const shared = (i > 0 && out[i - 1].place === out[i].place) || (i + 1 < out.length && out[i + 1].place === out[i].place);
    out[i].tied = shared && out[i].done > 0;
  }
  return out;
}

// ── Groups ───────────────────────────────────────────────────────────────────────────────────────────────

/** One round: groups of `size`, the top `advance` of each move on. The final has advance 0 (it crowns the winner). */
export interface TtRoundPlan { size: number; advance: number }

export const GROUP_MIN = 2;
export const GROUP_MAX = 12;
export const GROUP_PRESETS = [2, 4, 6, 8] as const;

/**
 * Spreads players over groups by seed so every group is even: seeds go 1 to N across the groups, then back
 * (snake). There are ceil(players / size) groups, so sizes differ by one at most.
 */
export function spreadGroups(seeds: string[], size: number): string[][] {
  const s = Math.max(GROUP_MIN, Math.min(GROUP_MAX, Math.round(size)));
  if (!seeds.length) return [];
  const count = Math.ceil(seeds.length / s);
  const groups: string[][] = Array.from({ length: count }, () => []);
  seeds.forEach((p, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    groups[row % 2 === 0 ? col : count - 1 - col].push(p);
  });
  return groups;
}

export interface TtCut {
  /** Moving on, in seed order for the next round (group winners first, then seconds, and so on, then fill-ins). */
  through: string[];
  /** Players tied across a group's cut line: a one-track run-off decides `spots` of them. */
  runoffs: { group: number; players: string[]; spots: number }[];
  /** Players just under the cut who filled spots left open (a group with too few times). */
  fillIns: string[];
}

/**
 * The cut after a round. Each group sends its top `advance`. A tie across the line waits for a run-off. Spots a
 * group can't fill (fewer players with a time than `advance`) go to the fastest players just under the cut in the
 * whole round, ranked together on the round's tracks.
 */
export function cutRound(groups: TtRow[][], advance: number, tracks: string[], runs: TtRun[], scoring: TtScoring): TtCut {
  const byRank: string[][] = [];
  const runoffs: TtCut["runoffs"] = [];
  const under: string[] = [];
  let open = 0;
  groups.forEach((rows, g) => {
    const timed = rows.filter((r) => r.done > 0);
    let taken = 0;
    let i = 0;
    while (i < timed.length && taken < advance) {
      const place = timed[i].place;
      const same = timed.filter((r) => r.place === place);
      if (taken + same.length <= advance) {
        same.forEach((r, k) => { (byRank[taken + k] ??= []).push(r.player); });
        taken += same.length;
        i += same.length;
      } else {
        runoffs.push({ group: g, players: same.map((r) => r.player), spots: advance - taken });
        taken = advance;
        i += same.length;
      }
    }
    if (taken < advance) open += advance - taken;
    timed.slice(i).forEach((r) => under.push(r.player));
  });
  const ranked = open > 0 ? rankOn(under, tracks, runs, scoring).filter((r) => r.done > 0) : [];
  const fillIns = ranked.slice(0, open).map((r) => r.player);
  return { through: [...byRank.flat(), ...fillIns], runoffs, fillIns };
}

export interface TtRoundShape { round: number; players: number; groups: number; sizes: number[]; through: number; final: boolean }

/** What a plan does to a field: each round's groups and how many move on. Stops at the first round with one group. */
export function shapeRounds(field: number, plan: TtRoundPlan[]): TtRoundShape[] {
  const out: TtRoundShape[] = [];
  let players = field;
  for (let r = 0; r < plan.length && players > 1; r++) {
    const size = Math.max(GROUP_MIN, Math.min(GROUP_MAX, plan[r].size));
    const groups = Math.ceil(players / size);
    const base = Math.floor(players / groups), extra = players % groups;
    const sizes = Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
    const final = groups === 1;
    const advance = final ? 0 : Math.max(1, Math.min(size - 1, plan[r].advance));
    const through = final ? 1 : groups * advance;
    out.push({ round: r + 1, players, groups, sizes, through, final });
    if (final) break;
    players = through;
  }
  return out;
}

/** A plan that ends in a final: groups of `size` with `advance` moving on, until the field fits one group of at most `finalMax`. */
export function suggestPlan(field: number, size: number, advance: number, finalMax = 8): TtRoundPlan[] {
  const plan: TtRoundPlan[] = [];
  let players = field;
  const s = Math.max(GROUP_MIN, Math.min(GROUP_MAX, size));
  const a = Math.max(1, Math.min(s - 1, advance));
  for (let guard = 0; guard < 12 && players > 1; guard++) {
    if (players <= Math.max(s, finalMax)) { plan.push({ size: Math.min(GROUP_MAX, Math.max(players, GROUP_MIN)), advance: 0 }); break; }
    plan.push({ size: s, advance: a });
    players = Math.ceil(players / s) * a;
  }
  return plan;
}

// ── Matches (1v1 over 1 or more tracks) ─────────────────────────────────────────────────────────────────

export type TrackWinner = "a" | "b" | "tie" | null;

export interface TtMatch {
  /** Tracks each player took. A tied track counts for neither. */
  a: number;
  b: number;
  perTrack: TrackWinner[];
  /** Every track decided, or the round closed. */
  done: boolean;
  winner: "a" | "b" | null;
  /** Level once done: the organizer or a one-track run-off decides it. */
  level: boolean;
}

/**
 * A match over `tracks`. On each track the faster time wins; a player with no time loses that track once the
 * round closes (`closed`). Best of N: the first to more than half the tracks wins; otherwise the most tracks taken.
 */
export function matchResult(a: string, b: string, tracks: string[], runs: TtRun[], closed: boolean): TtMatch {
  const best = bestTimes(runs, [a, b]);
  const perTrack: TrackWinner[] = tracks.map((t) => {
    const ta = best.get(t)?.get(a), tb = best.get(t)?.get(b);
    if (ta !== undefined && tb !== undefined) return ta < tb ? "a" : tb < ta ? "b" : "tie";
    if (!closed) return null;
    if (ta !== undefined) return "a";
    if (tb !== undefined) return "b";
    return null;
  });
  const wa = perTrack.filter((w) => w === "a").length, wb = perTrack.filter((w) => w === "b").length;
  const need = Math.floor(tracks.length / 2) + 1;
  const clinched = wa >= need || wb >= need;
  const done = clinched || closed || perTrack.every((w) => w !== null);
  const winner = !done ? null : wa > wb ? "a" : wb > wa ? "b" : null;
  return { a: wa, b: wb, perTrack, done, winner, level: done && winner === null };
}

// ── Proof ────────────────────────────────────────────────────────────────────────────────────────────────

/** Who needs a clip: 0 = nobody (screenshots only), -1 = everyone, N = the top N on each track. */
export type ClipRule = number;

export const clipNeeded = (rule: ClipRule, place: number | null): boolean =>
  place !== null && (rule === -1 || (rule > 0 && place <= rule));

/** A time counts toward an event only when it was added while that event's window (or round) was open. */
export const inWindow = (at: string | Date, opens: string | Date | null, closes: string | Date | null): boolean => {
  const t = new Date(at).getTime();
  if (opens && t < new Date(opens).getTime()) return false;
  if (closes && t > new Date(closes).getTime()) return false;
  return true;
};
