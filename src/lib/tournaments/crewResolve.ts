import "server-only";

/**
 * Resolve a tournament's multi-crew standings with community names — the single
 * server-side source of truth shared by the OBS overlay broadcast
 * (`crewOverlay.ts`) and the `!crews` chat command. Prefers finalized results,
 * else the live per-race board (same precedence the public + manage individual
 * standings use). Guarded so an unmigrated `community_id` column just yields no
 * crews.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { computeStandings, DEFAULT_SCORING_TABLE } from "./scoring";
import { computeCrewStandings } from "./crewStandings";

export interface ResolvedCrew {
  communityId: string;
  name: string;
  points: number;
  memberCount: number;
  bestPlacement: number | null;
}

export interface ResolvedCrewStandings {
  tournamentId: string;
  tournamentTitle: string;
  organizerId: string;
  crews: ResolvedCrew[];
}

export async function resolveCrewStandings(tournamentId: string): Promise<ResolvedCrewStandings | null> {
  const admin = createServiceClient();

  // select("*") so an unmigrated column never errors the read.
  const { data: t } = await admin.from("tournaments").select("*").eq("id", tournamentId).maybeSingle();
  const tour = t as { id: string; title: string; organizer_id: string; scoring_table?: number[] | null } | null;
  if (!tour) return null;

  const { data: pRows } = await admin
    .from("tournament_participants")
    .select("*")
    .eq("tournament_id", tournamentId);
  const participants = (pRows ?? []) as Array<{
    id: string; display_name?: string | null; team?: number | null;
    status?: string | null; community_id?: string | null;
  }>;

  const base = { tournamentId: tour.id, tournamentTitle: tour.title, organizerId: tour.organizer_id };

  // Fewer than 2 crews → nothing to rank.
  if (new Set(participants.map((p) => p.community_id).filter(Boolean)).size < 2) {
    return { ...base, crews: [] };
  }

  // Result source — prefer finalized results, else live per-race scoring.
  const { data: rRows } = await admin
    .from("tournament_results")
    .select("participant_id, placement, points")
    .eq("tournament_id", tournamentId);
  const finalized = ((rRows ?? []) as Array<{ participant_id: string; placement: number | null; points: number | null }>)
    .filter((r) => r.placement != null || r.points != null);

  let resultSource: Array<{ participant_id: string; placement: number | null; points: number | null }>;
  if (finalized.length > 0) {
    resultSource = finalized;
  } else {
    const { data: raceRows } = await admin
      .from("tournament_races")
      .select("id, race_number, placements")
      .eq("tournament_id", tournamentId)
      .order("race_number");
    const table = Array.isArray(tour.scoring_table) && tour.scoring_table.length ? tour.scoring_table : DEFAULT_SCORING_TABLE;
    const live = computeStandings(
      participants
        .filter((p) => p.status !== "dropped")
        .map((p) => ({ id: p.id, display_name: p.display_name ?? "Player", team: p.team ?? null })),
      (raceRows ?? []) as Array<{ id: string; race_number: number; placements: Record<string, number> }>,
      table,
    );
    resultSource = live.map((s, i) => ({ participant_id: s.participantId, placement: i + 1, points: s.points }));
  }

  const standings = computeCrewStandings(
    participants.map((p) => ({ id: p.id, community_id: p.community_id })),
    resultSource,
  );
  if (standings.length < 2) return { ...base, crews: [] };

  const { data: comms } = await admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .in("id", standings.map((c) => c.communityId));
  const nameById = new Map<string, string>();
  for (const c of (comms ?? []) as Array<{ id: string; slug: string; display_name: string | null }>) {
    nameById.set(c.id, c.display_name || `@${c.slug}`);
  }

  return {
    ...base,
    crews: standings.map((c) => ({
      communityId: c.communityId,
      name: nameById.get(c.communityId) ?? "Crew",
      points: c.points,
      memberCount: c.memberCount,
      bestPlacement: c.bestPlacement,
    })),
  };
}
