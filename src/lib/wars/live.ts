import "server-only";

/** The war an overlay link shows: the channel's live war, or its last one for a few hours after it ends. */

import { raceScore, standing, trackLabel } from "./rules";
import { channelByToken, latestWar } from "./store";
import type { WarLiveResult } from "./types";
import { teamColor } from "./teamColor";
import { resolveLook } from "./looks";

/** How long a finished war stays on the overlay. */
const KEEP_MS = 3 * 3600_000;

export async function warLive(token: string, lookId: string | null = null): Promise<WarLiveResult | null> {
  const channel = await channelByToken(token);
  if (!channel) return null;
  const [war, saved] = await Promise.all([latestWar(channel.guildId, channel.channelId), lookId ? resolveLook(lookId).catch(() => null) : Promise.resolve(null)]);
  const look = saved?.look ?? null;
  if (!war) return { ok: true, war: null, look };
  if (war.status !== "live" && Date.now() - Date.parse(war.endedAt ?? war.updatedAt) > KEEP_MS) return { ok: true, war: null, look };
  const s = standing(war.races, war.penalties, war.racesTotal);
  const last = war.races[war.races.length - 1] ?? null;
  const pen = [...war.penalties].reverse().find((p) => !last || Date.parse(p.at) > Date.parse(last.at)) ?? null;
  const [usColor, themColor] = await Promise.all([teamColor(war.us), teamColor(war.them)]);
  return {
    ok: true,
    look,
    war: {
      id: war.id,
      status: war.status,
      game: war.game,
      racesTotal: war.racesTotal,
      us: { ...war.us, total: s.us, color: usColor },
      them: { ...war.them, total: s.them, color: themColor },
      diffs: s.diffs,
      played: s.played,
      left: s.left,
      decided: s.decided,
      need: s.need,
      last: last ? { n: last.n, track: last.track ? trackLabel(war.game, last.track) : null, diff: raceScore(last.spots).diff, spots: last.spots } : null,
      penalty: pen ? { side: pen.side, points: pen.points, reason: pen.reason } : null,
      updatedAt: war.updatedAt,
    },
  };
}
