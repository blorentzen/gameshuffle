import "server-only";

/**
 * Wars in Discord channels (supabase/wars-m1.sql). One live war per channel; every change is a version-guarded
 * write of the whole row (`mutate`), retried when two people change it at once, so a race is never counted twice
 * and an undo never takes back someone else's race.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { RACES, TEAM, tapClashes, tapsToSpots, type WarEntry, type WarGame, type WarPenalty, type WarRace, type WarSide } from "./rules";

export interface WarTeamRef { tag: string; name: string | null; logo: string | null }
export interface WarTap { id: string; name: string; place: number; race: number }
export type WarStatus = "live" | "done" | "ended";

export interface War {
  id: string;
  guildId: string;
  channelId: string;
  game: WarGame;
  racesTotal: number;
  entry: WarEntry;
  us: WarTeamRef;
  them: WarTeamRef;
  races: WarRace[];
  penalties: WarPenalty[];
  taps: WarTap[];
  notes: string[];
  status: WarStatus;
  cardMessageId: string | null;
  cardVersion: number;
  version: number;
  startedBy: string;
  startedByName: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface WarChannel { guildId: string; channelId: string; team: WarTeamRef | null; game: WarGame | null; entry: WarEntry; overlayToken: string; /** The channel's saved table background. */ background: string | null }

type Row = {
  id: string; guild_id: string; channel_id: string; game: WarGame; races_total: number; entry: WarEntry;
  us_tag: string; us_name: string | null; us_logo: string | null; them_tag: string; them_name: string | null; them_logo: string | null;
  races: WarRace[]; penalties: WarPenalty[]; taps: WarTap[]; notes: string[]; status: WarStatus;
  card_message_id: string | null; card_version: number; version: number; started_by: string; started_by_name: string | null;
  created_at: string; updated_at: string; ended_at: string | null;
};
const COLS = "id, guild_id, channel_id, game, races_total, entry, us_tag, us_name, us_logo, them_tag, them_name, them_logo, races, penalties, taps, notes, status, card_message_id, card_version, version, started_by, started_by_name, created_at, updated_at, ended_at";

const toWar = (r: Row): War => ({
  id: r.id, guildId: r.guild_id, channelId: r.channel_id, game: r.game, racesTotal: r.races_total, entry: r.entry,
  us: { tag: r.us_tag, name: r.us_name, logo: r.us_logo }, them: { tag: r.them_tag, name: r.them_name, logo: r.them_logo },
  races: [...(r.races ?? [])].sort((a, b) => a.n - b.n), penalties: r.penalties ?? [], taps: r.taps ?? [], notes: r.notes ?? [],
  status: r.status, cardMessageId: r.card_message_id, cardVersion: r.card_version, version: r.version,
  startedBy: r.started_by, startedByName: r.started_by_name, createdAt: r.created_at, updatedAt: r.updated_at, endedAt: r.ended_at,
});

let ready: boolean | null = null;
/** Whether the tables exist (wars-m1.sql). */
export async function warsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("wars").select("id", { head: true, count: "exact" }).limit(1);
  ready = !error;
  return ready;
}

export async function getWar(id: string): Promise<War | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createServiceClient().from("wars").select(COLS).eq("id", id).maybeSingle();
  return data ? toWar(data as Row) : null;
}

/** A war from the start of its id (the war page's address, src/lib/wars/page.ts). */
export async function warByShort(short: string): Promise<War | null> {
  if (!/^[0-9a-f]{12}$/.test(short)) return null;
  const head = `${short.slice(0, 8)}-${short.slice(8, 12)}`;
  const { data } = await createServiceClient().from("wars").select(COLS)
    .gte("id", `${head}-0000-0000-000000000000`).lte("id", `${head}-ffff-ffff-ffffffffffff`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ? toWar(data as Row) : null;
}

export async function liveWar(guildId: string, channelId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(COLS).eq("guild_id", guildId).eq("channel_id", channelId).eq("status", "live").maybeSingle();
  return data ? toWar(data as Row) : null;
}

/** The channel's live war, else its newest one (for the overlay between wars). */
export async function latestWar(guildId: string, channelId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(COLS).eq("guild_id", guildId).eq("channel_id", channelId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toWar(data as Row) : null;
}

// ── Channels ──────────────────────────────────────────────────────────────────────────────────

type ChannelRow = { guild_id: string; channel_id: string; team_tag: string | null; team_name: string | null; team_logo: string | null; game: WarGame | null; entry: WarEntry; overlay_token: string; background_url?: string | null };
const toChannel = (r: ChannelRow): WarChannel => ({
  guildId: r.guild_id, channelId: r.channel_id, team: r.team_tag ? { tag: r.team_tag, name: r.team_name, logo: r.team_logo } : null,
  game: r.game, entry: r.entry, overlayToken: r.overlay_token, background: r.background_url ?? null,
});

const CH_COLS = "guild_id, channel_id, team_tag, team_name, team_logo, game, entry, overlay_token, background_url";

/** A server's live wars, newest change first (the War room's list when a call has more than one). */
export async function liveWarsIn(guildId: string, limit = 10): Promise<War[]> {
  const { data } = await createServiceClient().from("wars").select(COLS).eq("guild_id", guildId).eq("status", "live").order("updated_at", { ascending: false }).limit(limit);
  return ((data ?? []) as Row[]).map(toWar);
}

/** A server's newest war of any status (where the War room posts a war it starts). */
export async function latestWarIn(guildId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(COLS).eq("guild_id", guildId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toWar(data as Row) : null;
}

export async function warChannel(guildId: string, channelId: string): Promise<WarChannel | null> {
  const { data } = await createServiceClient().from("war_channels").select(CH_COLS).eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  return data ? toChannel(data as ChannelRow) : null;
}

export async function channelByToken(token: string): Promise<WarChannel | null> {
  if (!/^[a-f0-9]{24}$/.test(token)) return null;
  const { data } = await createServiceClient().from("war_channels").select(CH_COLS).eq("overlay_token", token).maybeSingle();
  return data ? toChannel(data as ChannelRow) : null;
}

/** Remembers the channel's team, game and entry (and makes its overlay link the first time). */
export async function rememberChannel(guildId: string, channelId: string, patch: { team?: WarTeamRef; game?: WarGame; entry?: WarEntry; background?: string | null }): Promise<WarChannel | null> {
  const db = createServiceClient();
  const now = await warChannel(guildId, channelId);
  const row = {
    guild_id: guildId,
    channel_id: channelId,
    team_tag: patch.team?.tag ?? now?.team?.tag ?? null,
    team_name: patch.team ? patch.team.name : now?.team?.name ?? null,
    team_logo: patch.team ? patch.team.logo : now?.team?.logo ?? null,
    game: patch.game ?? now?.game ?? null,
    entry: patch.entry ?? now?.entry ?? "scorer",
    overlay_token: now?.overlayToken ?? randomBytes(12).toString("hex"),
    background_url: patch.background !== undefined ? patch.background : now?.background ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("war_channels").upsert(row, { onConflict: "guild_id,channel_id" }).select(CH_COLS).single();
  if (error) { console.error("[wars] remember channel failed:", error.message); return null; }
  return toChannel(data as ChannelRow);
}

// ── Starting and changing a war ───────────────────────────────────────────────────────────────

export type StartResult = { ok: true; war: War } | { ok: false; error: "live"; war: War } | { ok: false; error: "failed" };

export async function startWar(input: { guildId: string; channelId: string; game: WarGame; entry: WarEntry; us: WarTeamRef; them: WarTeamRef; by: { id: string; name: string } }): Promise<StartResult> {
  const live = await liveWar(input.guildId, input.channelId);
  if (live) return { ok: false, error: "live", war: live };
  const { data, error } = await createServiceClient().from("wars").insert({
    guild_id: input.guildId, channel_id: input.channelId, game: input.game, races_total: RACES, entry: input.entry,
    us_tag: input.us.tag, us_name: input.us.name, us_logo: input.us.logo, them_tag: input.them.tag, them_name: input.them.name, them_logo: input.them.logo,
    started_by: input.by.id, started_by_name: input.by.name,
  }).select(COLS).single();
  if (error) {
    // Two people starting at once: the unique index lets one in.
    const again = await liveWar(input.guildId, input.channelId);
    if (again) return { ok: false, error: "live", war: again };
    console.error("[wars] start failed:", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, war: toWar(data as Row) };
}

type Change = Partial<Pick<War, "races" | "penalties" | "taps" | "notes" | "status" | "entry" | "endedAt">>;
type Step<T> = { change: Change; result: T } | { error: string };

/** Applies `plan` to the newest copy of the war; retried when someone else changed it in between. */
async function mutate<T>(id: string, plan: (w: War) => Step<T>): Promise<{ ok: true; war: War; result: T } | { ok: false; error: string; war: War | null }> {
  const db = createServiceClient();
  for (let tries = 0; tries < 5; tries++) {
    const w = await getWar(id);
    if (!w) return { ok: false, error: "gone", war: null };
    const step = plan(w);
    if ("error" in step) return { ok: false, error: step.error, war: w };
    const c = step.change;
    const patch: Record<string, unknown> = { version: w.version + 1, updated_at: new Date().toISOString() };
    if (c.races) patch.races = c.races;
    if (c.penalties) patch.penalties = c.penalties;
    if (c.taps) patch.taps = c.taps;
    if (c.notes) patch.notes = [...c.notes.filter((n) => n.startsWith("track:")).slice(-2), ...c.notes.filter((n) => !n.startsWith("track:")).slice(-4)];
    if (c.status) patch.status = c.status;
    if (c.entry) patch.entry = c.entry;
    if (c.endedAt !== undefined) patch.ended_at = c.endedAt;
    const { data, error } = await db.from("wars").update(patch).eq("id", id).eq("version", w.version).select(COLS).maybeSingle();
    if (error) {
      // Undoing the last race of a finished war reopens it, which can meet another live war in the channel.
      if (error.code === "23505") return { ok: false, error: "live_elsewhere", war: w };
      console.error("[wars] write failed:", error.message);
      return { ok: false, error: "failed", war: w };
    }
    if (data) return { ok: true, war: toWar(data as Row), result: step.result };
  }
  return { ok: false, error: "busy", war: null };
}

const nowIso = () => new Date().toISOString();
const doneWith = (w: War, races: WarRace[]): Change => (races.length >= w.racesTotal ? { status: "done", endedAt: nowIso() } : {});

export type AddRaceError = "not_live" | "taken" | "out_of_order";
/** Adds race `n` (the next one). "taken" when someone else got race `n` in first. */
export function addRace(id: string, input: { n: number; spots: number[]; track: string | null; by: { id: string; name: string }; players?: WarRace["players"]; note?: string | null }) {
  return mutate<WarRace>(id, (w) => {
    if (w.status !== "live") return { error: "not_live" };
    if (w.races.some((r) => r.n === input.n)) return { error: "taken" };
    if (input.n !== w.races.length + 1) return { error: "out_of_order" };
    const race: WarRace = { n: input.n, spots: input.spots, track: input.track, by: input.by, at: nowIso(), ...(input.players ? { players: input.players } : {}) };
    const races = [...w.races, race];
    return { change: { races, taps: w.taps.filter((t) => t.race > input.n), ...(input.note ? { notes: [...w.notes, `Race ${input.n}: ${input.note}`] } : {}), ...doneWith(w, races) }, result: race };
  });
}

/** Replaces race `n`'s places (and track, when given): Fix a race, or "Use mine instead". */
export function replaceRace(id: string, input: { n: number; spots: number[]; track?: string | null; by: { id: string; name: string } }) {
  return mutate<WarRace>(id, (w) => {
    const old = w.races.find((r) => r.n === input.n);
    if (!old) return { error: "no_race" };
    const race: WarRace = { ...old, spots: input.spots, track: input.track === undefined ? old.track : input.track, fixedBy: input.by.name, players: undefined };
    const races = w.races.map((r) => (r.n === input.n ? race : r));
    return { change: { races, notes: [...w.notes, `Race ${input.n} fixed by ${input.by.name}`] }, result: race };
  });
}

export function setTrack(id: string, n: number, track: string) {
  return mutate<WarRace>(id, (w) => {
    const old = w.races.find((r) => r.n === n);
    if (!old) return { error: "no_race" };
    const race = { ...old, track };
    return { change: { races: w.races.map((r) => (r.n === n ? race : r)) }, result: race };
  });
}

/** Takes back race `n` if it's still the last one (a finished war reopens). */
export function undoRace(id: string, n: number, by: string) {
  return mutate<WarRace>(id, (w) => {
    const last = w.races[w.races.length - 1];
    if (!last) return { error: "no_race" };
    if (last.n !== n) return { error: "not_last" };
    if (w.status === "ended") return { error: "not_live" };
    return { change: { races: w.races.slice(0, -1), status: "live", endedAt: null, notes: [...w.notes, `Race ${n} taken back by ${by}`] }, result: last };
  });
}

export function addPenalty(id: string, input: { side: WarSide; points: number; reason: string; by: string }) {
  return mutate<WarPenalty>(id, (w) => {
    if (w.status === "ended") return { error: "not_live" };
    const p: WarPenalty = { side: input.side, points: input.points, reason: input.reason, by: input.by, at: nowIso() };
    const team = input.side === "us" ? w.us.tag : w.them.tag;
    return { change: { penalties: [...w.penalties, p], notes: [...w.notes, `${input.points} off ${team}${input.reason ? ` (${input.reason})` : ""}, from ${input.by}`] }, result: p };
  });
}

export function setEntry(id: string, entry: WarEntry) {
  return mutate<WarEntry>(id, (w) => (w.status !== "live" ? { error: "not_live" } : { change: { entry, taps: [] }, result: entry }));
}

export function endWar(id: string) {
  return mutate<true>(id, (w) => (w.status !== "live" ? { error: "not_live" } : { change: { status: "ended", endedAt: nowIso() }, result: true }));
}

export type TapResult = { kind: "tapped" | "untapped" | "moved"; race: WarRace | null; waiting: number; clashes: number[] };

/**
 * A player taps the place they finished in race `n`. Tapping the same place again takes it back; tapping another
 * moves it. Once six different players hold six different places, the race goes in with who finished where.
 */
export function tapPlace(id: string, input: { n: number; place: number; user: { id: string; name: string } }) {
  return mutate<TapResult>(id, (w) => {
    if (w.status !== "live") return { error: "not_live" };
    if (input.n !== w.races.length + 1) return { error: "stale" };
    const mine = w.taps.find((t) => t.race === input.n && t.id === input.user.id);
    let taps = w.taps.filter((t) => t.race === input.n);
    let kind: TapResult["kind"] = "tapped";
    if (mine && mine.place === input.place) { taps = taps.filter((t) => t.id !== input.user.id); kind = "untapped"; }
    else if (mine) { taps = taps.map((t) => (t.id === input.user.id ? { ...t, place: input.place } : t)); kind = "moved"; }
    else {
      if (taps.length >= TEAM && !taps.some((t) => t.place === input.place)) return { error: "full" };
      taps = [...taps, { id: input.user.id, name: input.user.name.slice(0, 32), place: input.place, race: input.n }];
    }
    const clashes = tapClashes(taps);
    const spots = clashes.length ? null : tapsToSpots(taps);
    if (spots) {
      const race: WarRace = { n: input.n, spots, track: pendingTrack(w, input.n), by: { id: input.user.id, name: input.user.name }, at: nowIso(), players: taps.map((t) => ({ id: t.id, name: t.name, place: t.place })) };
      const races = [...w.races, race];
      return { change: { races, taps: [], ...doneWith(w, races) }, result: { kind, race, waiting: 0, clashes } };
    }
    return { change: { taps }, result: { kind, race: null, waiting: Math.max(0, TEAM - taps.length), clashes } };
  });
}

/** The track for the race being tapped in (kept until the race goes in). */
export function setPendingTrack(id: string, n: number, track: string) {
  return mutate<true>(id, (w) => {
    if (w.status !== "live" || n !== w.races.length + 1) return { error: "stale" };
    const notes = [...w.notes.filter((x) => !x.startsWith(`track:${n}:`)), `track:${n}:${track}`];
    return { change: { notes }, result: true };
  });
}

/** The track picked for a race that's still being tapped in. */
export function pendingTrack(w: War, n: number): string | null {
  const note = [...w.notes].reverse().find((x) => x.startsWith(`track:${n}:`));
  return note ? note.slice(`track:${n}:`.length) : null;
}

/** Notes meant for people (pending tracks and War room picks are kept as notes too, out of sight). */
export const shownNotes = (w: War) => w.notes.filter((n) => !n.startsWith("track:") && !n.startsWith("room:"));

/** The War room in call `instance` picked this war: whoever opens it next in that call lands on it. */
export function markRoom(id: string, instance: string) {
  return mutate<true>(id, (w) => {
    const note = `room:${instance}`;
    if (w.notes.includes(note)) return { change: {}, result: true };
    return { change: { notes: [...w.notes, note] }, result: true };
  });
}

/** Records the card that's now in the channel; false when a newer card got there first. */
export async function setCard(id: string, messageId: string, forVersion: number): Promise<boolean> {
  const { data } = await createServiceClient().from("wars").update({ card_message_id: messageId, card_version: forVersion }).eq("id", id).lt("card_version", forVersion).select("id").maybeSingle();
  return !!data;
}
