/**
 * Tournament scoring — cumulative standings from per-race placements. Points
 * come from the tournament's `scoring_table` (points by finishing position,
 * index 0 = 1st). Game-agnostic: works for MK8DX and Mario Kart World. Used by
 * the manage page (live standings + finalize) and the public page (live view).
 */

export const DEFAULT_SCORING_TABLE = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export interface TournamentRace {
  id: string;
  race_number: number;
  placements: Record<string, number>; // participant_id -> finishing position (1-based)
}

export interface StandingRow {
  participantId: string;
  name: string;
  team: number | null;
  points: number;
  racesPlayed: number;
  wins: number;
  avgPosition: number | null;
}

export interface TeamStandingRow {
  team: number;
  points: number;
  racesPlayed: number;
  members: string[];
}

export function pointsForPosition(table: number[], position: number): number {
  return table[position - 1] ?? 0;
}

/** Individual standings across all races, sorted points → wins → avg position. */
export function computeStandings(
  participants: { id: string; display_name: string; team: number | null }[],
  races: TournamentRace[],
  scoringTable: number[] = DEFAULT_SCORING_TABLE,
): StandingRow[] {
  const rows: StandingRow[] = participants.map((p) => {
    let points = 0;
    let racesPlayed = 0;
    let wins = 0;
    let posSum = 0;
    for (const race of races) {
      const pos = race.placements?.[p.id];
      if (pos == null) continue;
      racesPlayed += 1;
      points += pointsForPosition(scoringTable, pos);
      posSum += pos;
      if (pos === 1) wins += 1;
    }
    return {
      participantId: p.id,
      name: p.display_name,
      team: p.team,
      points,
      racesPlayed,
      wins,
      avgPosition: racesPlayed ? posSum / racesPlayed : null,
    };
  });
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (a.avgPosition ?? 99) - (b.avgPosition ?? 99),
  );
  return rows;
}

/** Team standings (team modes) — sum member points per team, sorted desc. */
export function computeTeamStandings(rows: StandingRow[]): TeamStandingRow[] {
  const byTeam = new Map<number, TeamStandingRow>();
  for (const r of rows) {
    if (r.team == null) continue;
    const cur = byTeam.get(r.team) ?? { team: r.team, points: 0, racesPlayed: 0, members: [] };
    cur.points += r.points;
    cur.racesPlayed = Math.max(cur.racesPlayed, r.racesPlayed);
    cur.members.push(r.name);
    byTeam.set(r.team, cur);
  }
  return [...byTeam.values()].sort((a, b) => b.points - a.points);
}
