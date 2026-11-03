import "server-only";

/**
 * Lounge ladders in the database (supabase/ladders-m1.sql). Tables go in pending; verifying works out every player's
 * change from their current numbers and writes it in one call (`ladder_apply`), which refuses when anyone's MMR moved
 * in between (another table verified at the same moment), and then the changes are worked out again. Undo moves each
 * player back by what the table gave them. Histories read verified tables only.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { getPlatformFlag } from "@/lib/platform/flags";
import { divisionFor, divisionMoves, nameKey, parseRoom, placedFor, roomChanges, type Change, type PlayerBefore, type Room } from "./rules";
import { applyReducedLoss } from "./discipline";
import { cleanSettings, defaultSettings, roomSize, type Ladder, type LadderGame, type LadderKind, type LadderSettings, type LadderStatus } from "./types";

type LadderRow = {
  id: string; slug: string; name: string; game: LadderGame; kind: LadderKind; guild_id: string; results_channel_id: string | null;
  updater_roles: string[] | null; reporter_roles: string[] | null; settings: unknown; season: number; status: LadderStatus; table_count: number; created_by: string;
};
const LADDER_COLS = "id, slug, name, game, kind, guild_id, results_channel_id, updater_roles, reporter_roles, settings, season, status, table_count, created_by";
const toLadder = (r: LadderRow): Ladder => ({
  id: r.id, slug: r.slug, name: r.name, game: r.game, kind: r.kind, guildId: r.guild_id, resultsChannelId: r.results_channel_id,
  updaterRoles: r.updater_roles ?? [], reporterRoles: r.reporter_roles ?? [], settings: cleanSettings(r.settings, r.game, r.kind),
  season: r.season, status: r.status, tableCount: r.table_count, createdBy: r.created_by,
});

export type TableStatus = "pending" | "verified" | "denied" | "undone";
export interface LadderTable {
  id: string; ladderId: string; season: number; number: number; format: number; size: number; tier: string | null; body: string;
  status: TableStatus; submittedBy: string; submittedByName: string | null; verifiedBy: string | null; verifiedByName: string | null;
  note: string | null; channelId: string | null; messageId: string | null; createdAt: string; verifiedAt: string | null;
  /** The results screenshot (kept for the staff page), what we read from it, players who missed races, the checks'
   *  reasons, and when a clean table verifies on its own (ranked-m1.sql). */
  shotUrl: string | null; readBody: string | null; missed: { key: string; races: number }[]; autoAt: string | null; checkReasons: string[]; autoVerified: boolean;
}
type TableRow = {
  id: string; ladder_id: string; season: number; number: number; format: number; size: number; tier: string | null; body: string; status: TableStatus;
  submitted_by: string; submitted_by_name: string | null; verified_by: string | null; verified_by_name: string | null; note: string | null;
  channel_id: string | null; message_id: string | null; created_at: string; verified_at: string | null;
  shot_url: string | null; read_body: string | null; missed: { key: string; races: number }[] | null; auto_at: string | null; check_reasons: string[] | null; auto_verified: boolean | null;
};
const TABLE_COLS = "id, ladder_id, season, number, format, size, tier, body, status, submitted_by, submitted_by_name, verified_by, verified_by_name, note, channel_id, message_id, created_at, verified_at, shot_url, read_body, missed, auto_at, check_reasons, auto_verified";
const toTable = (r: TableRow): LadderTable => ({
  id: r.id, ladderId: r.ladder_id, season: r.season, number: r.number, format: r.format, size: r.size, tier: r.tier, body: r.body, status: r.status,
  submittedBy: r.submitted_by, submittedByName: r.submitted_by_name, verifiedBy: r.verified_by, verifiedByName: r.verified_by_name, note: r.note,
  channelId: r.channel_id, messageId: r.message_id, createdAt: r.created_at, verifiedAt: r.verified_at,
  shotUrl: r.shot_url, readBody: r.read_body, missed: Array.isArray(r.missed) ? r.missed : [], autoAt: r.auto_at, checkReasons: r.check_reasons ?? [], autoVerified: r.auto_verified === true,
});

const db = () => createServiceClient();

let ready: { at: number; ok: boolean } | null = null;
/** Whether GS Ranked's tables are in (ladders-m1, ladders-m2 and ranked-m1 together; kept for a minute either way). */
export async function laddersReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await db().from("ladder_tables").select("id, auto_at, import_id").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

/** Ladders open to everyone: the switch (Platform ▸ Switches ▸ Discord), or always in development. */
export async function laddersOpen(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  return getPlatformFlag("comp_ladders", false);
}

// ── Ladders ────────────────────────────────────────────────────────────────────────────────────

export async function getLadder(by: { id?: string; slug?: string }): Promise<Ladder | null> {
  let q = db().from("ladders").select(LADDER_COLS);
  if (by.id) { if (!/^[0-9a-f-]{36}$/.test(by.id)) return null; q = q.eq("id", by.id); }
  else if (by.slug) q = q.eq("slug", by.slug.toLowerCase());
  else return null;
  const { data } = await q.maybeSingle();
  return data ? toLadder(data as LadderRow) : null;
}

export async function laddersInGuild(guildId: string): Promise<Ladder[]> {
  const { data } = await db().from("ladders").select(LADDER_COLS).eq("guild_id", guildId).neq("status", "archived").order("created_at");
  return ((data ?? []) as LadderRow[]).map(toLadder);
}

export interface LadderInput {
  guildId: string; slug: string; name: string; game: LadderGame; kind: LadderKind; resultsChannelId: string | null;
  updaterRoles: string[]; reporterRoles: string[]; by: string;
  /** The settings a new ladder starts with (its mode's, modes.ts); else the game and kind's defaults. */
  settings?: LadderSettings;
}

/** Makes a ladder, or changes this server's ladder at that address. The address is unique across GameShuffle. */
export async function saveLadder(input: LadderInput): Promise<{ ok: true; ladder: Ladder; created: boolean } | { ok: false; error: "slug_taken" | "failed" }> {
  const existing = await getLadder({ slug: input.slug });
  if (existing && existing.guildId !== input.guildId) return { ok: false, error: "slug_taken" };
  const row = {
    name: input.name.slice(0, 60), game: input.game, kind: input.kind, results_channel_id: input.resultsChannelId,
    updater_roles: input.updaterRoles.slice(0, 10), reporter_roles: input.reporterRoles.slice(0, 10), updated_at: new Date().toISOString(),
  };
  if (existing) {
    // A game or kind change resets settings that only fit the old one (divisions, pay).
    const settings = existing.game === input.game && existing.kind === input.kind ? existing.settings : input.settings ?? defaultSettings(input.game, input.kind);
    const { data, error } = await db().from("ladders").update({ ...row, settings }).eq("id", existing.id).select(LADDER_COLS).single();
    if (error) { console.error("[ladders] update failed:", error.message); return { ok: false, error: "failed" }; }
    return { ok: true, ladder: toLadder(data as LadderRow), created: false };
  }
  const { data, error } = await db().from("ladders").insert({
    ...row, slug: input.slug, guild_id: input.guildId, settings: input.settings ?? defaultSettings(input.game, input.kind), created_by: input.by,
  }).select(LADDER_COLS).single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "slug_taken" };
    console.error("[ladders] create failed:", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, ladder: toLadder(data as LadderRow), created: true };
}

// ── Players ────────────────────────────────────────────────────────────────────────────────────

export interface LadderPlayer { id: string; name: string; key: string; discordId: string | null; country: string | null }
type PlayerRow = { id: string; name: string; name_key: string; discord_id: string | null; country: string | null };
const PLAYER_COLS = "id, name, name_key, discord_id, country";
const toPlayer = (r: PlayerRow): LadderPlayer => ({ id: r.id, name: r.name, key: r.name_key, discordId: r.discord_id, country: r.country });

export async function playersByKeys(ladderId: string, keys: string[]): Promise<Map<string, LadderPlayer>> {
  const uniq = [...new Set(keys)].slice(0, 48);
  if (!uniq.length) return new Map();
  const { data } = await db().from("ladder_players").select(PLAYER_COLS).eq("ladder_id", ladderId).in("name_key", uniq);
  return new Map(((data ?? []) as PlayerRow[]).map((r) => [r.name_key, toPlayer(r)]));
}

/** Every player's name on a ladder (for "did you mean"). */
export async function playerNames(ladderId: string): Promise<string[]> {
  const { data } = await readAllPages<{ name: string }>((from, to) => db().from("ladder_players").select("name").eq("ladder_id", ladderId).order("id").range(from, to), 10_000);
  return data.map((r) => r.name);
}

export async function playerByName(ladderId: string, name: string): Promise<LadderPlayer | null> {
  const { data } = await db().from("ladder_players").select(PLAYER_COLS).eq("ladder_id", ladderId).eq("name_key", nameKey(name)).maybeSingle();
  return data ? toPlayer(data as PlayerRow) : null;
}

export async function playerForDiscord(ladderId: string, discordId: string): Promise<LadderPlayer | null> {
  const { data } = await db().from("ladder_players").select(PLAYER_COLS).eq("ladder_id", ladderId).eq("discord_id", discordId).maybeSingle();
  return data ? toPlayer(data as PlayerRow) : null;
}

/** The ladders a Discord account plays on, with its name on each, oldest first (archived ladders left out). */
export async function laddersForDiscord(discordId: string): Promise<{ ladder: Ladder; player: LadderPlayer }[]> {
  if (!/^[0-9]{5,25}$/.test(discordId)) return [];
  const { data } = await db().from("ladder_players").select(`${PLAYER_COLS}, ladder_id`).eq("discord_id", discordId).limit(20);
  const rows = (data ?? []) as (PlayerRow & { ladder_id: string })[];
  if (!rows.length) return [];
  const { data: ls } = await db().from("ladders").select(LADDER_COLS).in("id", rows.map((r) => r.ladder_id)).neq("status", "archived").order("created_at");
  const byId = new Map(rows.map((r) => [r.ladder_id, toPlayer(r)]));
  return ((ls ?? []) as LadderRow[]).map((l) => ({ ladder: toLadder(l), player: byId.get(l.id)! }));
}

/** Players with at least one table this season. */
export async function ratedCount(ladder: Ladder): Promise<number> {
  const { count } = await db().from("ladder_ratings").select("player_id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("season", ladder.season);
  return count ?? 0;
}

/** Players from one country rated above `mmr` this season. */
export async function countryAbove(ladder: Ladder, country: string, mmr: number): Promise<number> {
  const { data } = await db().from("ladder_players").select("id").eq("ladder_id", ladder.id).eq("country", country.toLowerCase()).limit(1000);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return 0;
  const { count } = await db().from("ladder_ratings").select("player_id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("season", ladder.season).gt("mmr", mmr).in("player_id", ids);
  return count ?? 0;
}

/** Tables waiting to be verified this season, newest first (optionally only those sent in since a time). */
export async function pendingTables(ladder: Ladder, opts: { since?: string | null; limit?: number } = {}): Promise<LadderTable[]> {
  let q = db().from("ladder_tables").select(TABLE_COLS).eq("ladder_id", ladder.id).eq("season", ladder.season).eq("status", "pending");
  if (opts.since) q = q.gte("created_at", opts.since);
  const { data } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 25);
  return ((data ?? []) as TableRow[]).map(toTable);
}

/** When a player's newest verified table this season was verified (null: none since `since`). */
export async function lastVerifiedAt(ladder: Ladder, playerId: string, since: string | null): Promise<string | null> {
  let q = db().from("ladder_changes").select("ladder_tables!inner(verified_at, status)").eq("player_id", playerId).eq("season", ladder.season).eq("ladder_tables.status", "verified");
  if (since) q = q.gte("ladder_tables.verified_at", since);
  const { data } = await q.order("table_id", { ascending: false }).limit(5);
  const times = ((data ?? []) as unknown as { ladder_tables: { verified_at: string | null } }[]).map((r) => r.ladder_tables.verified_at).filter((t): t is string => !!t);
  return times.sort().pop() ?? null;
}

/** Ties a Discord account to a ladder name. A name already tied to someone else, or an account tied to another name, is refused. */
export async function linkDiscord(ladderId: string, discordId: string, name: string): Promise<"ok" | "unknown" | "taken" | "has_other"> {
  const player = await playerByName(ladderId, name);
  if (!player) return "unknown";
  if (player.discordId === discordId) return "ok";
  if (player.discordId) return "taken";
  if (await playerForDiscord(ladderId, discordId)) return "has_other";
  const { error } = await db().from("ladder_players").update({ discord_id: discordId }).eq("id", player.id).is("discord_id", null);
  return error ? "taken" : "ok";
}

/** Makes any players a room names who aren't on the ladder yet (as typed), and returns everyone by name key. */
async function ensurePlayers(ladderId: string, room: Room): Promise<Map<string, LadderPlayer>> {
  const players = room.teams.flatMap((t) => t.players);
  const have = await playersByKeys(ladderId, players.map((p) => p.key));
  const missing = players.filter((p) => !have.has(p.key));
  if (missing.length) {
    await db().from("ladder_players").upsert(
      missing.map((p) => ({ ladder_id: ladderId, name: p.name.slice(0, 32), name_key: p.key, country: p.flag && /^[a-z]{2}$/.test(p.flag) ? p.flag : null })),
      { onConflict: "ladder_id,name_key", ignoreDuplicates: true },
    );
    return playersByKeys(ladderId, players.map((p) => p.key));
  }
  return have;
}

/** Each player's current numbers this season, by name key (players without a rating are left out). */
export async function beforeFor(ladder: Ladder, room: Room): Promise<Map<string, PlayerBefore>> {
  const players = await playersByKeys(ladder.id, room.teams.flatMap((t) => t.players.map((p) => p.key)));
  const ids = [...players.values()].map((p) => p.id);
  if (!ids.length) return new Map();
  const { data } = await db().from("ladder_ratings").select("player_id, mmr, events, carried").eq("ladder_id", ladder.id).eq("season", ladder.season).in("player_id", ids);
  const byId = new Map(((data ?? []) as { player_id: string; mmr: number; events: number; carried: boolean | null }[]).map((r) => [r.player_id, { mmr: r.mmr, events: r.events, settle: !!r.carried }]));
  const out = new Map<string, PlayerBefore>();
  for (const [key, p] of players) { const b = byId.get(p.id); if (b) out.set(key, b); }
  return out;
}

// ── Tables ─────────────────────────────────────────────────────────────────────────────────────

export async function createTable(ladder: Ladder, input: { format: number; tier: string | null; body: string; by: { id: string; name: string }; channelId: string | null }): Promise<LadderTable | null> {
  const { data: n, error: nErr } = await db().rpc("ladder_next_number", { p_ladder: ladder.id });
  if (nErr || typeof n !== "number") { console.error("[ladders] number failed:", nErr?.message); return null; }
  const { data, error } = await db().from("ladder_tables").insert({
    ladder_id: ladder.id, season: ladder.season, number: n, format: ladder.kind === "knockout" ? 1 : input.format, size: roomSize(ladder.kind),
    tier: input.tier?.slice(0, 12) || null, body: input.body.slice(0, 4000), submitted_by: input.by.id, submitted_by_name: input.by.name.slice(0, 32),
    channel_id: input.channelId,
  }).select(TABLE_COLS).single();
  if (error) { console.error("[ladders] table insert failed:", error.message); return null; }
  return toTable(data as TableRow);
}

export async function getTable(id: string): Promise<LadderTable | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db().from("ladder_tables").select(TABLE_COLS).eq("id", id).maybeSingle();
  return data ? toTable(data as TableRow) : null;
}

export async function tableByNumber(ladderId: string, number: number): Promise<LadderTable | null> {
  if (!Number.isInteger(number) || number < 1) return null;
  const { data } = await db().from("ladder_tables").select(TABLE_COLS).eq("ladder_id", ladderId).eq("number", number).maybeSingle();
  return data ? toTable(data as TableRow) : null;
}

export async function updateTable(id: string, patch: Partial<{ body: string; format: number; tier: string | null; channelId: string | null; messageId: string | null; shotUrl: string | null; readBody: string | null; missed: { key: string; races: number }[]; autoAt: string | null; checkReasons: string[] }>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.shotUrl !== undefined) row.shot_url = patch.shotUrl;
  if (patch.readBody !== undefined) row.read_body = patch.readBody ? patch.readBody.slice(0, 4000) : null;
  if (patch.missed !== undefined) row.missed = patch.missed.slice(0, 12);
  if (patch.autoAt !== undefined) row.auto_at = patch.autoAt;
  if (patch.checkReasons !== undefined) row.check_reasons = patch.checkReasons.slice(0, 20).map((r) => r.slice(0, 200));
  if (patch.body !== undefined) row.body = patch.body.slice(0, 4000);
  if (patch.format !== undefined) row.format = patch.format;
  if (patch.tier !== undefined) row.tier = patch.tier;
  if (patch.channelId !== undefined) row.channel_id = patch.channelId;
  if (patch.messageId !== undefined) row.message_id = patch.messageId;
  await db().from("ladder_tables").update(row).eq("id", id);
}

export const tableRoom = (ladder: Ladder, t: Pick<LadderTable, "body" | "format">): Room => parseRoom(ladder.kind, t.body, t.format);

/**
 * Events as divisions see them: a player who started from a carried or matched number (ranked-m1.sql's `carried`) is
 * already placed, so their division shows straight away (their first tables still move double: rules.ts `settle`).
 */
export const placedEvents = (r: { events: number; carried?: boolean | null }, s: Pick<Ladder["settings"], "placementEvents">) => (r.carried ? Math.max(r.events, s.placementEvents, 1) : r.events);

export interface Verified { changes: (Change & { multiplier?: number | null })[]; moves: { name: string; to: string; up: boolean }[] }

/**
 * Verifies a pending table. Works the changes out again when another table moved someone's MMR in between. Players
 * marked as missing races shrink their teammates' losses by the lounge's rule (discipline.ts).
 */
export async function verifyTable(ladder: Ladder, table: LadderTable, by: { id: string; name: string }, opts: { auto?: boolean } = {}): Promise<{ ok: true; result: Verified } | { ok: false; error: "not_pending" | "failed" }> {
  const room = tableRoom(ladder, table);
  for (let attempt = 0; attempt < 4; attempt++) {
    const players = await ensurePlayers(ladder.id, room);
    let before = await beforeFor(ladder, room);
    // Players with a Discord id and no number this season start from MKCentral before their first table (pick 15A).
    const unrated = [...players.entries()].filter(([key, p]) => p.discordId && !before.has(key));
    if (unrated.length && attempt === 0) {
      const { startFromMkc } = await import("./mkcStart");
      let started = false;
      for (const [, p] of unrated) started = (await startFromMkc(ladder, p).catch(() => null))?.started || started;
      if (started) before = await beforeFor(ladder, room);
    }
    const raw = roomChanges(room, before, ladder.settings, { tier: table.tier });
    const changes = table.missed.length ? applyReducedLoss(raw, table.missed, ladder.settings.discipline.reducedLoss) : raw.map((c) => ({ ...c, multiplier: null }));
    if (changes.some((c) => !players.has(c.key))) return { ok: false, error: "failed" };
    const payload = changes.map((c) => ({ player_id: players.get(c.key)!.id, team: c.team, place: c.place, score: c.score, before: c.before, delta: c.delta, after: c.after }));
    const { data, error } = await db().rpc("ladder_apply", { p_table: table.id, p_changes: payload, p_by: by.id, p_by_name: by.name.slice(0, 32) });
    if (!error && data === "ok") {
      const reduced = changes.filter((c) => c.multiplier != null);
      for (const c of reduced) await db().from("ladder_changes").update({ multiplier: c.multiplier }).eq("table_id", table.id).eq("player_id", players.get(c.key)!.id);
      if (opts.auto) await db().from("ladder_tables").update({ auto_verified: true }).eq("id", table.id);
      const eventsBefore = new Map([...before].map(([k, v]) => [k, placedFor(v, ladder.settings)]));
      if (ladder.settings.roles.on) { const { rolesAfter } = await import("./roles"); await rolesAfter(ladder, changes.map((c) => players.get(c.key)!.id)); }
      return { ok: true, result: { changes, moves: divisionMoves(changes, eventsBefore, ladder.settings) } };
    }
    if (!error && (data === "not_pending" || data === "missing")) return { ok: false, error: "not_pending" };
    if (error) console.warn("[ladders] apply retry:", error.message);
  }
  return { ok: false, error: "failed" };
}

export async function denyTable(table: LadderTable, by: { id: string; name: string }, note: string | null): Promise<boolean> {
  const { data } = await db().from("ladder_tables").update({
    status: "denied", note: note?.slice(0, 300) || null, verified_by: by.id, verified_by_name: by.name.slice(0, 32), updated_at: new Date().toISOString(),
  }).eq("id", table.id).eq("status", "pending").select("id");
  return !!data?.length;
}

export async function undoTable(table: LadderTable, by: { id: string; name: string }): Promise<boolean> {
  const { data, error } = await db().rpc("ladder_undo", { p_table: table.id, p_by: by.id, p_by_name: by.name.slice(0, 32) });
  if (error) console.error("[ladders] undo failed:", error.message);
  if (data !== "ok") return false;
  await repairPeaks(table).catch((err) => console.error("[ladders] peaks after undo failed:", err));
  return true;
}

/**
 * After an undo: each player's peak from the tables that still count (where they started, every result since, and
 * where they are now), so a peak an undone table gave doesn't stay. Written only while the peak is what was read, so
 * a table verified at the same moment keeps its own.
 */
async function repairPeaks(table: LadderTable): Promise<void> {
  const { data: undone } = await db().from("ladder_changes").select("player_id").eq("table_id", table.id);
  const ids = ((undone ?? []) as { player_id: string }[]).map((r) => r.player_id);
  if (!ids.length) return;
  const [{ data: ratings }, { data: kept }] = await Promise.all([
    db().from("ladder_ratings").select("player_id, mmr, peak").eq("ladder_id", table.ladderId).eq("season", table.season).in("player_id", ids),
    db().from("ladder_changes").select("player_id, mmr_before, mmr_after, ladder_tables!inner(status, verified_at)")
      .eq("ladder_id", table.ladderId).eq("season", table.season).in("player_id", ids).eq("ladder_tables.status", "verified").limit(1000),
  ]);
  type K = { player_id: string; mmr_before: number; mmr_after: number; ladder_tables: { verified_at: string | null } };
  const byPlayer = new Map<string, K[]>();
  for (const k of (kept ?? []) as unknown as K[]) byPlayer.set(k.player_id, [...(byPlayer.get(k.player_id) ?? []), k]);
  for (const r of (ratings ?? []) as { player_id: string; mmr: number; peak: number }[]) {
    const list = (byPlayer.get(r.player_id) ?? []).sort((a, b) => String(a.ladder_tables.verified_at).localeCompare(String(b.ladder_tables.verified_at)));
    const peak = Math.max(r.mmr, ...(list.length ? [list[0].mmr_before, ...list.map((k) => k.mmr_after)] : []));
    if (peak !== r.peak) await db().from("ladder_ratings").update({ peak }).eq("ladder_id", table.ladderId).eq("season", table.season).eq("player_id", r.player_id).eq("peak", r.peak);
  }
}

/** A verified table's changes with names, in room order. */
export async function tableChanges(table: LadderTable): Promise<(Change & { playerId: string })[]> {
  const { data } = await db().from("ladder_changes").select("player_id, team, place, score, mmr_before, delta, mmr_after, ladder_players(name, name_key)").eq("table_id", table.id);
  type R = { player_id: string; team: number; place: number; score: number | null; mmr_before: number; delta: number; mmr_after: number; ladder_players: { name: string; name_key: string } | null };
  return ((data ?? []) as unknown as R[])
    .map((r) => ({ playerId: r.player_id, key: r.ladder_players?.name_key ?? "", name: r.ladder_players?.name ?? "?", team: r.team, place: r.place, score: r.score, before: r.mmr_before, delta: r.delta, after: r.mmr_after, placement: false }))
    .sort((a, b) => a.team - b.team || a.place - b.place);
}

// ── Boards and pages ───────────────────────────────────────────────────────────────────────────

export interface BoardRow { rank: number; playerId: string; name: string; mmr: number; peak: number; events: number; wins: number; division: string; lastEventAt: string | null; recent: number[] }

/** A ladder's standings for a season (this one by default), best first, with each player's last 10 changes (newest first). */
export async function board(ladder: Ladder, opts: { limit?: number; offset?: number; season?: number } = {}): Promise<{ rows: BoardRow[]; total: number }> {
  const limit = Math.min(100, opts.limit ?? 50);
  const offset = Math.max(0, opts.offset ?? 0);
  const season = opts.season ?? ladder.season;
  const { data, count } = await db().from("ladder_ratings")
    .select("player_id, mmr, peak, events, wins, last_event_at, carried, ladder_players(name)", { count: "exact" })
    .eq("ladder_id", ladder.id).eq("season", season)
    .order("mmr", { ascending: false }).order("player_id").range(offset, offset + limit - 1);
  type R = { player_id: string; mmr: number; peak: number; events: number; wins: number; last_event_at: string | null; carried: boolean | null; ladder_players: { name: string } | null };
  const rows = (data ?? []) as unknown as R[];
  const recent = await recentDeltas(ladder, rows.map((r) => r.player_id), season);
  return {
    total: count ?? rows.length,
    rows: rows.map((r, i) => ({
      rank: offset + i + 1, playerId: r.player_id, name: r.ladder_players?.name ?? "?", mmr: r.mmr, peak: r.peak, events: r.events, wins: r.wins,
      division: divisionFor(r.mmr, placedEvents(r, ladder.settings), ladder.settings).division, lastEventAt: r.last_event_at, recent: recent.get(r.player_id) ?? [],
    })),
  };
}

/** The last 10 changes for each of these players, from the season's newest 200 verified tables. */
async function recentDeltas(ladder: Ladder, playerIds: string[], season = ladder.season): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!playerIds.length) return out;
  const { data: tables } = await db().from("ladder_tables").select("id, verified_at").eq("ladder_id", ladder.id).eq("season", season).eq("status", "verified")
    .order("verified_at", { ascending: false }).limit(200);
  const order = new Map(((tables ?? []) as { id: string }[]).map((t, i) => [t.id, i]));
  if (!order.size) return out;
  const { data } = await db().from("ladder_changes").select("table_id, player_id, delta").in("table_id", [...order.keys()]).in("player_id", playerIds).limit(1000);
  const rows = ((data ?? []) as { table_id: string; player_id: string; delta: number }[]).sort((a, b) => order.get(a.table_id)! - order.get(b.table_id)!);
  for (const r of rows) {
    const list = out.get(r.player_id) ?? [];
    if (list.length < 10) list.push(r.delta);
    out.set(r.player_id, list);
  }
  return out;
}

export interface TableSummary { number: number; format: number; tier: string | null; status: TableStatus; verifiedAt: string | null; createdAt: string; players: number; imported: boolean }

/** The newest tables (one season's when given, else any). Imported tables are the lounge's own records. */
export async function recentTables(ladder: Ladder, limit = 20, season?: number): Promise<TableSummary[]> {
  let q = db().from("ladder_tables").select("number, format, tier, status, verified_at, created_at, body, submitted_by").eq("ladder_id", ladder.id).in("status", ["verified", "pending"]);
  if (season != null) q = q.eq("season", season);
  const { data } = await q.order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as { number: number; format: number; tier: string | null; status: TableStatus; verified_at: string | null; created_at: string; body: string; submitted_by: string }[])
    .map((r) => ({ number: r.number, format: r.format, tier: r.tier, status: r.status, verifiedAt: r.verified_at, createdAt: r.created_at, players: tableRoom(ladder, r).teams.reduce((a, t) => a + t.players.length, 0), imported: r.submitted_by === "import" }));
}

export interface SeasonInfo { season: number; startedAt: string | null; endedAt: string | null; imported: boolean; current: boolean }

/** A ladder's seasons, newest first: the ones with dates on record (ladders-m2.sql) and the current one. */
export async function ladderSeasons(ladder: Ladder): Promise<SeasonInfo[]> {
  const { data, error } = await db().from("ladder_seasons").select("season, started_at, ended_at, source").eq("ladder_id", ladder.id).order("season", { ascending: false });
  const rows = error ? [] : ((data ?? []) as { season: number; started_at: string | null; ended_at: string | null; source: string }[]);
  const out: SeasonInfo[] = rows.map((r) => ({ season: r.season, startedAt: r.started_at, endedAt: r.ended_at, imported: r.source === "import", current: r.season === ladder.season }));
  if (!out.some((s) => s.season === ladder.season)) out.unshift({ season: ladder.season, startedAt: null, endedAt: null, imported: false, current: true });
  return out.sort((a, b) => b.season - a.season);
}

export interface PlayerAdjustment { at: string; kind: "penalty" | "bonus"; before: number; delta: number; after: number; reason: string | null }
export interface PlayerSeasonRow { season: number; mmr: number; peak: number; events: number; wins: number; division: string }
export interface PlayerSeason {
  player: LadderPlayer;
  season: number;
  /** `startedFrom`: where this season's start came from when it was matched from MKCentral (ranked-m2.sql). */
  rating: { mmr: number; peak: number; events: number; wins: number; rank: number | null; division: string; startedFrom?: string | null } | null;
  history: { number: number; format: number; tier: string | null; at: string; place: number; score: number | null; before: number; delta: number; after: number }[];
  /** Penalties and bonuses this season, oldest first (ladders-m2.sql; empty before it runs). */
  adjustments: PlayerAdjustment[];
  /** Every season the player has numbers in, newest first. */
  seasons: PlayerSeasonRow[];
  /** Names they played under before (from an import). */
  earlierNames: string[];
}

/** One player's season (this one by default): their numbers, rank, every verified table (newest first) and penalties. */
export async function playerSeason(ladder: Ladder, player: LadderPlayer, opts: { season?: number } = {}): Promise<PlayerSeason> {
  const season = opts.season ?? ladder.season;
  const [{ data: r }, { data: hist }, adj, all, earlier] = await Promise.all([
    db().from("ladder_ratings").select("mmr, peak, events, wins, carried").eq("ladder_id", ladder.id).eq("season", season).eq("player_id", player.id).maybeSingle(),
    readAllPages<unknown>((from, to) => db().from("ladder_changes")
      .select("place, score, mmr_before, delta, mmr_after, ladder_tables!inner(number, format, tier, verified_at, status)")
      .eq("player_id", player.id).eq("season", season).eq("ladder_tables.status", "verified").order("table_id").range(from, to), 5000),
    db().from("ladder_adjustments").select("at, kind, mmr_before, delta, mmr_after, reason").eq("ladder_id", ladder.id).eq("season", season).eq("player_id", player.id).order("at").limit(500),
    db().from("ladder_ratings").select("season, mmr, peak, events, wins, carried").eq("ladder_id", ladder.id).eq("player_id", player.id).order("season", { ascending: false }).limit(100),
    db().from("ladder_players").select("earlier_names").eq("id", player.id).maybeSingle(),
  ]);
  const got = r as { mmr: number; peak: number; events: number; wins: number; carried: boolean | null } | null;
  const rating = got ? { mmr: got.mmr, peak: got.peak, events: got.events, wins: got.wins, placed: placedEvents(got, ladder.settings) } : null;
  let rank: number | null = null;
  // Read on its own so a database without ranked-m2.sql still shows the page.
  const startedFrom = rating ? (((await db().from("ladder_ratings").select("started_from").eq("ladder_id", ladder.id).eq("season", season).eq("player_id", player.id).maybeSingle()).data as { started_from?: string | null } | null)?.started_from ?? null) : null;
  if (rating) {
    const { count } = await db().from("ladder_ratings").select("player_id", { count: "exact", head: true }).eq("ladder_id", ladder.id).eq("season", season).gt("mmr", rating.mmr);
    rank = (count ?? 0) + 1;
  }
  type A = { at: string; kind: "penalty" | "bonus"; mmr_before: number; delta: number; mmr_after: number; reason: string | null };
  const adjustments = adj.error ? [] : ((adj.data ?? []) as A[]).map((a) => ({ at: a.at, kind: a.kind, before: a.mmr_before, delta: a.delta, after: a.mmr_after, reason: a.reason }));
  const seasons = ((all.data ?? []) as { season: number; mmr: number; peak: number; events: number; wins: number; carried: boolean | null }[])
    .map(({ carried, ...x }) => ({ ...x, division: divisionFor(x.mmr, placedEvents({ events: x.events, carried }, ladder.settings), ladder.settings).division }));
  const earlierNames = earlier.error ? [] : ((earlier.data as { earlier_names: string[] | null } | null)?.earlier_names ?? []);
  type H = { place: number; score: number | null; mmr_before: number; delta: number; mmr_after: number; ladder_tables: { number: number; format: number; tier: string | null; verified_at: string | null } };
  const history = (hist as H[])
    .map((h) => ({ number: h.ladder_tables.number, format: h.ladder_tables.format, tier: h.ladder_tables.tier, at: h.ladder_tables.verified_at ?? "", place: h.place, score: h.score, before: h.mmr_before, delta: h.delta, after: h.mmr_after }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.number - a.number));
  return {
    player,
    season,
    rating: rating ? { mmr: rating.mmr, peak: rating.peak, events: rating.events, wins: rating.wins, rank, division: divisionFor(rating.mmr, rating.placed, ladder.settings).division, startedFrom } : null,
    history,
    adjustments,
    seasons,
    earlierNames,
  };
}
