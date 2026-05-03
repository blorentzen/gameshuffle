/**
 * Pure aggregation helpers for picks/bans rounds. Server actions and
 * the live-view client both compute counts the same way; this module
 * is the single source of truth for "how do we tally a round?"
 *
 * Visibility option B (Britton's pick): in-progress + locked counts are
 * both visible. The aggregator accepts a `lockedOnly` flag so the apply-
 * top-N path can compute on locked ballots only when the streamer
 * applies — preventing in-progress noise from inflating the result.
 */

import type {
  PicksBansBallot,
  PicksBansResults,
  Pool,
  PoolResults,
} from "./types";

/**
 * Aggregate a list of ballots into per-pool counts.
 *
 * @param ballots    Raw ballots from the DB.
 * @param lockedOnly When true, only ballots with `locked_at !== null`
 *                   contribute. Default false (matches the live-view
 *                   running counts).
 */
export function aggregateBallots(
  ballots: PicksBansBallot[],
  opts: { lockedOnly?: boolean } = {}
): PicksBansResults {
  const filtered = opts.lockedOnly
    ? ballots.filter((b) => b.locked_at != null)
    : ballots;
  return {
    tracks: aggregatePool(filtered, "tracks"),
    itemModes: aggregatePool(filtered, "itemModes"),
    itemLiteral: aggregatePool(filtered, "itemLiteral"),
  };
}

function aggregatePool(ballots: PicksBansBallot[], pool: Pool): PoolResults {
  const picksMap = new Map<string, number>();
  const bansMap = new Map<string, number>();
  let totalPicks = 0;
  let totalBans = 0;
  for (const ballot of ballots) {
    const picks = readField(ballot, pool, "picks");
    const bans = readField(ballot, pool, "bans");
    for (const id of picks) {
      picksMap.set(id, (picksMap.get(id) ?? 0) + 1);
      totalPicks += 1;
    }
    for (const id of bans) {
      bansMap.set(id, (bansMap.get(id) ?? 0) + 1);
      totalBans += 1;
    }
  }
  return {
    topPicks: sortByCount(picksMap),
    topBans: sortByCount(bansMap),
    totals: { picks: totalPicks, bans: totalBans },
  };
}

function readField(
  ballot: PicksBansBallot,
  pool: Pool,
  field: "picks" | "bans"
): string[] {
  if (pool === "tracks") {
    return field === "picks" ? ballot.picks_tracks : ballot.bans_tracks;
  }
  if (pool === "itemModes") {
    return field === "picks" ? ballot.picks_item_modes : ballot.bans_item_modes;
  }
  return field === "picks"
    ? ballot.picks_item_literal
    : ballot.bans_item_literal;
}

function sortByCount(
  map: Map<string, number>
): Array<{ id: string; count: number }> {
  return Array.from(map.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Take the top-N picks/bans from an aggregate result. Used at apply
 * time when the streamer wants to cap the recommendation.
 */
export function topN(
  results: PoolResults,
  n: number
): { picks: string[]; bans: string[] } {
  return {
    picks: results.topPicks.slice(0, n).map((r) => r.id),
    bans: results.topBans.slice(0, n).map((r) => r.id),
  };
}
