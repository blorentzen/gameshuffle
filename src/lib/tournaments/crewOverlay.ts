import "server-only";

/**
 * Crew-standings overlay broadcast — recompute the per-crew (community) roll-up
 * for a multi-crew tournament and push it to the organizer's OBS overlay as a
 * persistent event. Mirrors `currentRace.ts`'s broadcast pattern: owner-keyed
 * (organizer_id), best-effort, and a no-op for the streamer who isn't connected.
 * Records a `cleared` payload when fewer than 2 crews are represented so the
 * board disappears rather than going stale. Shares one resolver with the
 * `!crews` chat command (`crewResolve.ts`).
 */

import { recordOverlayEvent } from "@/lib/overlay/events";
import { resolveCrewStandings } from "./crewResolve";

export async function broadcastCrewStandings(tournamentId: string): Promise<void> {
  const resolved = await resolveCrewStandings(tournamentId);
  if (!resolved) return;

  await recordOverlayEvent({
    ownerUserId: resolved.organizerId,
    type: "tournament_crew_standings",
    payload: {
      tournamentTitle: resolved.tournamentTitle,
      crews: resolved.crews.map((c) => ({ name: c.name, points: c.points, memberCount: c.memberCount })),
      cleared: resolved.crews.length < 2,
    },
    ttlMs: null,
  });
}
