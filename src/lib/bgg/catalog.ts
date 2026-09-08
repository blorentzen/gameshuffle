import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { bggSearch, bggThings } from "./client";
import { computeStaleAfter, lengthBucket, SEARCH_CACHE_MAX } from "./config";
import type { BggGame } from "./parse";

/**
 * Cache-first BGG catalog (the Scrydex `catalog.ts` analogue). Reads from
 * `bgg_games`; only on a miss/stale read does it call BGG, then upserts. No
 * bulk ingest — the cache grows lazily from what people actually add.
 */

export interface BoardGameRow {
  id: number;
  name: string;
  year: number | null;
  thumbnail_url: string | null;
  image_url: string | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
  min_playtime: number | null;
  max_playtime: number | null;
  weight: number | null;
  length_bucket: string | null;
}

function toRow(g: BggGame) {
  return {
    id: g.id,
    name: g.name,
    year: g.year,
    thumbnail_url: g.thumbnailUrl,
    image_url: g.imageUrl,
    min_players: g.minPlayers,
    max_players: g.maxPlayers,
    playing_time: g.playingTime,
    min_playtime: g.minPlaytime,
    max_playtime: g.maxPlaytime,
    weight: g.weight,
    length_bucket: lengthBucket(g.playingTime),
    fetched_at: new Date().toISOString(),
    stale_after: computeStaleAfter(),
  };
}

/** Fetch + cache full details for the given ids (cache-first, order-preserving). */
export async function getBoardGames(ids: number[]): Promise<BoardGameRow[]> {
  if (!ids.length) return [];
  const svc = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: cached } = await svc.from("bgg_games").select("*").in("id", ids);
  const cachedById = new Map<number, BoardGameRow & { stale_after: string }>(
    (cached ?? []).map((r) => [r.id as number, r as BoardGameRow & { stale_after: string }]),
  );

  const fresh = new Map<number, BoardGameRow>();
  const stale: number[] = [];
  for (const id of ids) {
    const row = cachedById.get(id);
    if (row && row.stale_after > nowIso) fresh.set(id, row);
    else stale.push(id);
  }

  if (stale.length) {
    const games = await bggThings(stale);
    if (games.length) {
      const rows = games.map(toRow);
      await svc.from("bgg_games").upsert(rows);
      for (const r of rows) fresh.set(r.id, r);
    }
  }

  return ids.map((id) => fresh.get(id)).filter((r): r is BoardGameRow => !!r);
}

/**
 * Search our own seeded cache by name — the reliable, prod-safe path (no live
 * BGG call). Populate the cache with `scripts/populate-bgg.ts` from an
 * environment BGG answers; prod reads only this table.
 */
export async function searchLocalBoardGames(
  query: string,
  limit = 12,
): Promise<BoardGameRow[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("bgg_games")
    .select("*")
    .ilike("name", `%${query}%`)
    .order("name", { ascending: true })
    .limit(limit);
  return (data as BoardGameRow[] | null) ?? [];
}

/** Search BGG by name, then hydrate the top hits to full (cached) details. */
export async function searchBoardGames(query: string): Promise<BoardGameRow[]> {
  const hits = await bggSearch(query);
  if (!hits.length) return [];
  const ids = [...new Set(hits.map((h) => h.id))].slice(0, SEARCH_CACHE_MAX);
  return getBoardGames(ids);
}
