/**
 * Multi-crew tournament standings — roll individual results up per crew
 * (community). Pure + dependency-free so it runs on the client (the tournament
 * page already holds participants + results) and is easy to test.
 */

export interface CrewStandingRow {
  communityId: string;
  points: number;
  /** Best (lowest) individual placement any member achieved. */
  bestPlacement: number | null;
  memberCount: number;
}

export function computeCrewStandings(
  participants: Array<{ id: string; community_id?: string | null }>,
  results: Array<{ participant_id: string; placement: number | null; points: number | null }>,
): CrewStandingRow[] {
  const communityByParticipant = new Map<string, string>();
  const members = new Map<string, number>();
  for (const p of participants) {
    if (!p.community_id) continue;
    communityByParticipant.set(p.id, p.community_id);
    members.set(p.community_id, (members.get(p.community_id) ?? 0) + 1);
  }
  if (members.size === 0) return [];

  const points = new Map<string, number>();
  const best = new Map<string, number>();
  for (const r of results) {
    const cid = communityByParticipant.get(r.participant_id);
    if (!cid) continue;
    if (typeof r.points === "number") points.set(cid, (points.get(cid) ?? 0) + r.points);
    if (typeof r.placement === "number") {
      const cur = best.get(cid);
      best.set(cid, cur == null ? r.placement : Math.min(cur, r.placement));
    }
  }

  return [...members.entries()]
    .map(([communityId, memberCount]) => ({
      communityId,
      memberCount,
      points: points.get(communityId) ?? 0,
      bestPlacement: best.get(communityId) ?? null,
    }))
    // Most points first; then best placement; then bigger roster.
    .sort((a, b) =>
      b.points - a.points ||
      (a.bestPlacement ?? 999) - (b.bestPlacement ?? 999) ||
      b.memberCount - a.memberCount,
    );
}
