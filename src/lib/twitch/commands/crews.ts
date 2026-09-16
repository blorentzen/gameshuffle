/**
 * `!crews` — post the current crew (community) standings for the broadcaster's
 * in-progress multi-crew tournament. Viewer-facing + read-only, so anyone in
 * chat can pull it. Shares the `resolveCrewStandings` source of truth with the
 * dashboard card + OBS overlay, so chat always matches what's on stream. Silent
 * for non-broadcasters when there's nothing to show (avoids chat noise).
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { getLiveTournamentForOrganizer } from "@/lib/tournaments/currentRace";
import { resolveCrewStandings } from "@/lib/tournaments/crewResolve";
import type { CmdContext, CmdResult } from "./registry";

const MEDALS = ["🥇", "🥈", "🥉"];

export async function handleCrewsCommand(ctx: CmdContext): Promise<CmdResult> {
  const send = (message: string) =>
    sendChatMessage({ broadcasterId: ctx.broadcasterTwitchId, senderId: ctx.botTwitchId, message });

  const t = await getLiveTournamentForOrganizer(ctx.userId);
  if (!t) {
    if (ctx.isBroadcaster) await send("🏁 No tournament is in progress right now.");
    return { ok: true };
  }

  const resolved = await resolveCrewStandings(t.id);
  if (!resolved || resolved.crews.length < 2) {
    if (ctx.isBroadcaster) {
      await send("🏁 No crews are set for this tournament yet — assign them from Manage to track crew standings.");
    }
    return { ok: true };
  }

  const line = resolved.crews
    .slice(0, 5)
    .map((c, i) => `${MEDALS[i] ?? `${i + 1}.`} ${c.name} ${c.points}`)
    .join(" · ");
  await send(`🏆 Crew standings · ${resolved.tournamentTitle}: ${line}`);
  return { ok: true };
}
