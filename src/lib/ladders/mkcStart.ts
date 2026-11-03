import "server-only";

/**
 * Starting a player from their MKCentral record (lounge system picks 15A to 19A). MKCentral keeps each lounge player's
 * Discord id, so a player who ties their Discord to a GS Ranked lounge is looked up with nothing to type: at
 * /ranked join, when they claim their name on the web, and before their first table is verified. The rules are in
 * mkcMatch.ts (same scale: their number; another scale: their rank matched to the same share of this lounge's players).
 * The start is this season's rating, marked to settle (its first 2 tables move double), and the line saying where it
 * came from shows on the player's page and in the staff log.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { loungeBasic, loungePlayer, loungeStats } from "@/lib/mmr/mkcentral";
import type { MmrGame } from "@/lib/mmr/rules";
import { matchStart, type MatchResult, type MkcRecord } from "./mkcMatch";
import type { MkcProfile } from "./playerChecks";
import { MODES, modeOf } from "./modes";
import { logAction, BOT_ACTOR } from "./staffStore";
import type { LadderPlayer } from "./store";
import type { Ladder } from "./types";

const db = () => createServiceClient();

const MKC_LABEL: Record<MmrGame, string> = { mk8dx: "MKCentral's 150cc lounge", mkworld12p: "MKCentral's MK World lounge", mkworld24p: "MKCentral's 24-player lounge" };

/** A player's MKCentral record by Discord id: this season and last season's final, with ranks. Null when there's none or MKCentral doesn't answer. */
export async function mkcRecordFor(discordId: string, game: MmrGame): Promise<MkcRecord | null> {
  try {
    const basic = await loungeBasic({ discordId }, game);
    if (!basic) return null;
    const [cur, stats] = await Promise.all([loungePlayer({ id: basic.playerId }, game), loungeStats(game)]);
    const season = cur?.season ?? stats.season;
    const prevSeason = season && season > 1 ? season - 1 : null;
    const [prev, prevStats] = prevSeason
      ? await Promise.all([loungePlayer({ id: basic.playerId }, game, { season: prevSeason, final: true }).catch(() => null), loungeStats(game, { season: prevSeason, final: true }).catch(() => null)])
      : [null, null];
    return {
      name: basic.name,
      division: cur?.division ?? null,
      current: cur && season ? { season, mmr: cur.mmr, events: cur.eventsPlayed, rank: cur.worldRank, total: stats.totalPlayers } : null,
      previous: prev && prevSeason ? { season: prevSeason, mmr: prev.mmr, events: prev.eventsPlayed, rank: prev.worldRank, total: prevStats?.totalPlayers ?? null } : null,
    };
  } catch (err) {
    console.warn("[ranked] MKCentral lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type StartOutcome = { started: true; start: number; line: string } | { started: false; line: string | null };

/**
 * Starts a player from MKCentral when they have no number this season and a Discord id. Leaves anyone already rated
 * alone. Returns the line for the reply (null when there was nothing to look up).
 */
export async function startFromMkc(ladder: Ladder, player: Pick<LadderPlayer, "id" | "name" | "discordId">): Promise<StartOutcome> {
  if (!player.discordId) return { started: false, line: null };
  const { data: had } = await db().from("ladder_ratings").select("player_id").eq("ladder_id", ladder.id).eq("season", ladder.season).eq("player_id", player.id).maybeSingle();
  if (had) return { started: false, line: null };
  const mode = MODES[modeOf(ladder)];
  const record = await mkcRecordFor(player.discordId, mode.mkcGame);
  let ladderMmrs: number[] = [];
  if (!mode.sameScaleAsMkc && record) {
    const { data } = await readAllPages<{ mmr: number; player_id: string }>((from, to) => db().from("ladder_ratings").select("mmr, player_id").eq("ladder_id", ladder.id).eq("season", ladder.season).order("mmr", { ascending: false }).order("player_id").range(from, to));
    ladderMmrs = data.map((r) => r.mmr);
  }
  const result: MatchResult = matchStart(record, { sameScale: mode.sameScaleAsMkc, ladderMmrs, ladderName: ladder.name, mkcLabel: MKC_LABEL[mode.mkcGame] });
  if (result.how === "none") return { started: false, line: result.line };
  const from = `${MKC_LABEL[mode.mkcGame]}: ${result.how === "share" ? `#${result.from.rank?.toLocaleString("en-US")} of ${result.from.total?.toLocaleString("en-US")}` : result.from.mmr?.toLocaleString("en-US")} (Season ${result.from.season})`;
  const { error } = await db().from("ladder_ratings").insert({
    ladder_id: ladder.id, season: ladder.season, player_id: player.id, mmr: result.start, peak: result.start, events: 0, wins: 0, carried: true, started_from: from.slice(0, 200),
  });
  if (error) return { started: false, line: null };
  await logAction(ladder, BOT_ACTOR, "mkc_match", { playerId: player.id, detail: { how: result.how, start: result.start, from } });
  return { started: true, start: result.start, line: result.line };
}

/** A Discord account's MKCentral lounge profile, for verifying a new player (null: none; throws when MKCentral is down). */
export async function mkcProfileFor(discordId: string, game: MmrGame): Promise<MkcProfile | null> {
  const res = await fetch(`https://lounge.mkcentral.com/api/player?discordId=${encodeURIComponent(discordId)}&game=${game}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MKCentral answered ${res.status}`);
  const raw = (await res.json().catch(() => null)) as { id?: number; mkcId?: number; name?: string; switchFc?: string | null; isHidden?: boolean; countryCode?: string | null } | null;
  if (!raw?.name) return null;
  return { id: Number(raw.mkcId ?? raw.id ?? 0), name: raw.name, banned: raw.isHidden === true, switchCodes: raw.switchFc ? 1 : 0, country: raw.countryCode ?? null };
}
