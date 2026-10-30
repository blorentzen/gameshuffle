import "server-only";

/**
 * Short names players teach the import reader (pasting picks 2026-10-30, 2A). When a player picks a
 * track for a name the reader didn't know, it's remembered for them; once three different players
 * pick the same track for a name, everyone's pastes read it. Staff can block a learned name.
 * Missing tables (before time-trials-m3.sql) read as nothing learned.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { TT_GAME_ORDER, TT_GAMES, ttTracks, type TtGame } from "./tracks";
import type { Learned } from "./quaxly";

export const COMMUNITY_MIN = 3;
const norm = (alias: string) => alias.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /tt_alias/.test(e.message ?? ""));

type Row = { player: string; alias: string; track_id: string };

type Community = { alias: string; trackId: string; players: number }[];
// Every paste asks for these, so each server keeps them a minute (a block clears it).
const cache = new Map<TtGame, { at: number; list: Community }>();
const CACHE_MS = 60_000;

/** Community names: a name at least three players mapped to one track, minus blocked ones. */
export async function communityAliases(game: TtGame): Promise<Community> {
  const hit = cache.get(game);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const db = createServiceClient();
  const [{ data, error }, { data: blocks }] = await Promise.all([
    readAllPages<Row>((from, to) => db.from("tt_aliases").select("player, alias, track_id").eq("game", game).order("alias").order("player").range(from, to)),
    db.from("tt_alias_blocks").select("alias, track_id").eq("game", game),
  ]);
  if (error) { if (!missing(error)) console.error("[tt] aliases:", error.message); return []; }
  const blocked = new Set(((blocks ?? []) as { alias: string; track_id: string }[]).map((b) => `${b.alias}|${b.track_id}`));
  const count = new Map<string, Set<string>>();
  for (const r of (data ?? []) as Row[]) {
    const k = `${r.alias}|${r.track_id}`;
    if (!count.has(k)) count.set(k, new Set());
    count.get(k)!.add(r.player);
  }
  const valid = new Set(ttTracks(game).map((t) => t.id));
  const list = [...count.entries()].filter(([k, ps]) => ps.size >= COMMUNITY_MIN && !blocked.has(k) && valid.has(k.split("|")[1]))
    .map(([k, ps]) => ({ alias: k.split("|")[0], trackId: k.split("|")[1], players: ps.size }))
    .sort((a, b) => b.players - a.players);
  cache.set(game, { at: Date.now(), list });
  return list;
}

/** What the reader should know for this player: community names, then the player's own (which win). */
export async function learnedFor(player: string | null, game: TtGame): Promise<Learned> {
  const out: Learned = new Map();
  for (const c of await communityAliases(game)) if (!out.has(c.alias)) out.set(c.alias, c.trackId);
  if (player) {
    const { data, error } = await createServiceClient().from("tt_aliases").select("alias, track_id").eq("game", game).eq("player", player);
    if (!error) for (const r of (data ?? []) as Row[]) out.set(r.alias, r.track_id);
  }
  return out;
}

/** Remembers the tracks a player picked for names the reader didn't know. */
export async function rememberAliases(player: string, game: TtGame, picks: { alias: string; trackId: string }[]): Promise<void> {
  const valid = new Set(ttTracks(game).map((t) => t.id));
  const rows = picks.map((p) => ({ player, game, alias: norm(p.alias), track_id: p.trackId }))
    .filter((r) => r.alias.length >= 1 && valid.has(r.track_id) && !/\d{1,2}[:'.]\d{2}/.test(r.alias));
  if (!rows.length) return;
  const { error } = await createServiceClient().from("tt_aliases").upsert(rows.slice(0, 100), { onConflict: "player,game,alias" });
  if (error && !missing(error)) console.error("[tt] remember aliases:", error.message);
}

export type CommunityAlias = { game: TtGame; gameLabel: string; alias: string; trackId: string; trackName: string; players: number };

/** Staff: every name that reads for everyone, in both games, for the review screen's Short names tab. */
export async function communityAliasList(): Promise<CommunityAlias[]> {
  const out: CommunityAlias[] = [];
  for (const game of TT_GAME_ORDER) {
    const names = new Map(ttTracks(game).map((t) => [t.id, t.name]));
    for (const a of await communityAliases(game)) out.push({ game, gameLabel: TT_GAMES[game].label, alias: a.alias, trackId: a.trackId, trackName: names.get(a.trackId) ?? a.trackId, players: a.players });
  }
  return out;
}

/** Staff: stop a learned name reading for everyone (players' own picks still read for them). */
export async function blockAlias(game: TtGame, alias: string, trackId: string, by: string): Promise<boolean> {
  const { error } = await createServiceClient().from("tt_alias_blocks").upsert({ game, alias: norm(alias), track_id: trackId, blocked_by: by }, { onConflict: "game,alias,track_id" });
  cache.delete(game);
  return !error;
}
