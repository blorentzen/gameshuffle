import "server-only";

/**
 * The hourly copy of MKCentral's verified lounge tables into `lounge_tables` and
 * `lounge_table_players` (supabase/lounge-m2.sql; dashboard additions picks, 2026-10-20).
 * Each run reads forward from where the last one stopped, a week per request, starting two
 * days back each time because a table is listed by when it was made and verified later.
 * The first run of a game reaches back `FIRST_DAYS`. Seasons older than the previous one
 * are pruned.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { loungeTables, type LoungeTable } from "@/lib/mmr/mkcentral";
import { MMR_GAME_IDS, type MmrGame } from "@/lib/mmr/rules";

const DAY = 86_400_000;
const CHUNK_DAYS = 7;
const OVERLAP_DAYS = 2;
const FIRST_DAYS = 140;

async function upsertTables(tables: LoungeTable[]): Promise<number> {
  const verified = tables.filter((t) => t.verifiedOn);
  if (!verified.length) return 0;
  const db = createServiceClient();
  for (let i = 0; i < verified.length; i += 500) {
    const { error } = await db.from("lounge_tables").upsert(verified.slice(i, i + 500).map((t) => ({
      id: t.id, game: t.game, season: t.season, created_at: t.createdOn, verified_at: t.verifiedOn, tier: t.tier, format: t.format,
      num_teams: t.numTeams, num_players: t.numPlayers,
    })), { onConflict: "id" });
    if (error) throw new Error(`lounge_tables: ${error.message}`);
  }
  const rows = verified.flatMap((t) => t.teams.flatMap((team, teamIndex) => team.scores.map((s) => ({
    table_id: t.id, game: t.game, player_id: s.playerId, name: s.name, team_index: teamIndex, team_rank: team.rank,
    score: s.score, prev_mmr: s.prevMmr, new_mmr: s.newMmr, delta: s.delta, multiplier: s.multiplier,
  }))));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("lounge_table_players").upsert(rows.slice(i, i + 500), { onConflict: "table_id,player_id" });
    if (error) throw new Error(`lounge_table_players: ${error.message}`);
  }
  return verified.length;
}

/** Copy one game forward by up to `maxChunks` weeks. */
export async function syncGame(game: MmrGame, maxChunks = 3): Promise<{ game: MmrGame; tables: number; syncedTo: string | null; error?: string }> {
  const db = createServiceClient();
  const { data, error } = await db.from("lounge_sync").select("synced_to").eq("game", game).maybeSingle();
  if (error) return { game, tables: 0, syncedTo: null, error: error.message };
  const last = (data as { synced_to: string | null } | null)?.synced_to;
  const now = Date.now();
  let from = last ? Date.parse(last) - OVERLAP_DAYS * DAY : now - FIRST_DAYS * DAY;
  let copied = 0, reached: number | null = null;
  try {
    for (let i = 0; i < maxChunks && from < now; i++) {
      const to = Math.min(now, from + CHUNK_DAYS * DAY);
      copied += await upsertTables(await loungeTables(game, new Date(from).toISOString(), new Date(to).toISOString()));
      reached = to;
      from = to;
    }
  } catch (e) {
    return { game, tables: copied, syncedTo: reached ? new Date(reached).toISOString() : last ?? null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (reached) await db.from("lounge_sync").upsert({ game, synced_to: new Date(reached).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "game" });
  }
  return { game, tables: copied, syncedTo: reached ? new Date(reached).toISOString() : last ?? null };
}

/** Drop seasons older than the previous one (per game). */
export async function pruneOldSeasons(): Promise<void> {
  const db = createServiceClient();
  for (const game of MMR_GAME_IDS) {
    const { data } = await db.from("lounge_tables").select("season").eq("game", game).order("season", { ascending: false }).limit(1).maybeSingle();
    const top = (data as { season: number | null } | null)?.season;
    if (top == null) continue;
    await db.from("lounge_tables").delete().eq("game", game).lt("season", top - 1);
  }
}

export async function syncAllTables(maxChunks = 3) {
  const results = [];
  for (const game of MMR_GAME_IDS) results.push(await syncGame(game, maxChunks));
  await pruneOldSeasons().catch((e) => console.error("[lounge] prune:", e));
  return results;
}
