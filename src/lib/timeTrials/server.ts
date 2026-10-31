import "server-only";

/**
 * One Discord server's time trials (the time trial panel, picks 2026-10-30 Nn8Qv4EVRDL6zojwHVCcdN): every time
 * set by the players that server has seen (tt_guild_players), whichever server or site they were added on.
 * Feeds the panel's numbers and newest records, and the server board page (/time-trials/servers/<id>).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { gsDayStart, gsMonthStart } from "@/lib/time/gsClock";
import { guildPlayers, ttReady, type TtTrackSummary } from "./store";
import { ttTrack, type TtClass, type TtGame } from "./tracks";
import type { TtItems, TtVehicle } from "./categories";
import type { VideoState } from "./rules";

export interface ServerTime {
  id: string;
  player: string;
  track: string;
  cc: TtClass;
  items: TtItems;
  vehicle: TtVehicle;
  timeMs: number;
  video: VideoState;
  at: string;
}

type Raw = { id: string; player: string; track: string; cc: number; items: TtItems; vehicle: TtVehicle; time_ms: number; video_status: VideoState | null; created_at: string };

/** Players per request: the list goes in the address, so it stays short. */
const CHUNK = 80;
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; rows: ServerTime[] }>();

/** Every standing time in one game by the server's players (cached half a minute). */
export async function serverTimes(guildId: string, game: TtGame, fresh = false): Promise<ServerTime[]> {
  const key = `${guildId}|${game}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  if (!(await ttReady())) return [];
  const players = await guildPlayers(guildId);
  const db = createServiceClient();
  const rows: ServerTime[] = [];
  for (let i = 0; i < players.length; i += CHUNK) {
    const part = players.slice(i, i + CHUNK);
    const { data, error } = await readAllPages<Raw>((from, to) =>
      db.from("tt_times").select("id, player, track, cc, items, vehicle, time_ms, video_status, created_at")
        .eq("game", game).eq("status", "ok").in("player", part).order("id").range(from, to));
    if (error) { console.error("[tt] server times failed:", error.message); return hit?.rows ?? []; }
    for (const r of data) {
      if (!ttTrack(game, r.track)) continue;
      rows.push({ id: r.id, player: r.player, track: r.track, cc: Number(r.cc) as TtClass, items: r.items, vehicle: r.vehicle ?? "any", timeMs: r.time_ms, video: r.video_status ?? "none", at: r.created_at });
    }
  }
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

const faster = (a: ServerTime, b: ServerTime) => a.timeMs - b.timeMs || a.at.localeCompare(b.at);

/** Each board's best time in the server, keyed "track|cc|items" (the open board: any vehicle counts). */
function bestPerBoard(rows: ServerTime[], vehicle: TtVehicle = "any"): Map<string, { best: ServerTime; players: number }> {
  const groups = new Map<string, ServerTime[]>();
  for (const r of rows) {
    if (vehicle !== "any" && r.vehicle !== vehicle) continue;
    const k = `${r.track}|${r.cc}|${r.items}`;
    const list = groups.get(k);
    if (list) list.push(r); else groups.set(k, [r]);
  }
  const out = new Map<string, { best: ServerTime; players: number }>();
  for (const [k, list] of groups) out.set(k, { best: [...list].sort(faster)[0], players: new Set(list.map((r) => r.player)).size });
  return out;
}

/** The server board page's rows: per track and class, the server's record and how many of its players have a time. */
export async function serverSummary(guildId: string, game: TtGame, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): Promise<TtTrackSummary[]> {
  const v = game === "mk8dx" ? vehicle : "any";
  const rows = (await serverTimes(guildId, game)).filter((r) => r.items === items);
  return [...bestPerBoard(rows, v).values()].map(({ best, players }) => ({
    track: best.track, cc: best.cc, recordMs: best.timeMs, recordPlayer: best.player, players, recordChecked: best.video === "checked",
  }));
}

export interface PanelFacts {
  /** Times added this month (Pacific) by the server's players, and how many players added them. */
  monthTimes: number;
  monthPlayers: number;
  /** The players behind monthPlayers (a both-games panel counts each person once). */
  monthPlayerKeys: string[];
  /** The server's records, newest first (open boards, mushrooms and no mushrooms). */
  records: ServerTime[];
}

/** What the time trial panel shows for one game. */
export async function panelFacts(guildId: string, game: TtGame, fresh = false): Promise<PanelFacts> {
  const rows = await serverTimes(guildId, game, fresh);
  const since = gsDayStart(gsMonthStart()).toISOString();
  const month = rows.filter((r) => r.at >= since);
  const records = [...bestPerBoard(rows).values()].map((b) => b.best).sort((a, b) => b.at.localeCompare(a.at));
  const keys = [...new Set(month.map((r) => r.player))];
  return { monthTimes: month.length, monthPlayers: keys.length, monthPlayerKeys: keys, records };
}

/** The server's record on one open board before a new time lands (for "Was 1:25.118 by Kai"), or null. */
export async function serverRecord(guildId: string, game: TtGame, track: string, cc: TtClass, items: TtItems): Promise<ServerTime | null> {
  const rows = (await serverTimes(guildId, game, true)).filter((r) => r.track === track && r.cc === cc && r.items === items);
  return rows.sort(faster)[0] ?? null;
}

/** The server's name, from the players it has seen or the competitive app's row. */
export async function serverName(guildId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("tt_guild_players").select("guild_name").eq("guild_id", guildId).not("guild_name", "is", null).order("seen_at", { ascending: false }).limit(1).maybeSingle();
  const name = (data as { guild_name: string | null } | null)?.guild_name;
  if (name) return name;
  const { data: app } = await db.from("discord_app_guilds").select("guild_name").eq("guild_id", guildId).limit(1).maybeSingle();
  return (app as { guild_name: string | null } | null)?.guild_name ?? null;
}
