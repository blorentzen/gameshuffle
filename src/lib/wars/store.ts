import "server-only";

/**
 * Wars in Discord channels (supabase/wars-m1.sql). One live war per channel; every change is a version-guarded
 * write of the whole row (`mutate`), retried when two people change it at once, so a race is never counted twice
 * and an undo never takes back someone else's race.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { penaltyTeam, RACES, standing, tapClashes, tapsToSpots, type WarEntry, type WarGame, type WarPenalty, type WarRace, type WarSide } from "./rules";
import { DEFAULT_FORMAT, roomOf, type WarFormat } from "./format";

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
  /** Players a team and teams in the room (wars-m8; 6v6 before it). */
  format: WarFormat;
  /** The teams past the first two, in the order they were named. */
  others: WarTeamRef[];
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

export interface WarChannel {
  guildId: string; channelId: string; team: WarTeamRef | null; game: WarGame | null; entry: WarEntry; overlayToken: string;
  /** The channel's saved table background. */
  background: string | null;
  /** The team size and race count it last used (wars-m8). */
  size: number | null;
  races: number | null;
}

type Row = {
  id: string; guild_id: string; channel_id: string; game: WarGame; races_total: number; entry: WarEntry;
  us_tag: string; us_name: string | null; us_logo: string | null; them_tag: string; them_name: string | null; them_logo: string | null;
  races: WarRace[]; penalties: WarPenalty[]; taps: WarTap[]; notes: string[]; status: WarStatus;
  card_message_id: string | null; card_version: number; version: number; started_by: string; started_by_name: string | null;
  created_at: string; updated_at: string; ended_at: string | null;
  format?: WarFormat | null; others?: WarTeamRef[] | null;
};
const COLS = "id, guild_id, channel_id, game, races_total, entry, us_tag, us_name, us_logo, them_tag, them_name, them_logo, races, penalties, taps, notes, status, card_message_id, card_version, version, started_by, started_by_name, created_at, updated_at, ended_at";

const cleanFormat = (f: WarFormat | null | undefined): WarFormat =>
  f && Number.isInteger(f.size) && Number.isInteger(f.teams) && f.size >= 1 && f.teams >= 2 ? { size: f.size, teams: f.teams } : DEFAULT_FORMAT;

const toWar = (r: Row): War => ({
  id: r.id, guildId: r.guild_id, channelId: r.channel_id, game: r.game, racesTotal: r.races_total, entry: r.entry,
  us: { tag: r.us_tag, name: r.us_name, logo: r.us_logo }, them: { tag: r.them_tag, name: r.them_name, logo: r.them_logo },
  format: cleanFormat(r.format), others: Array.isArray(r.others) ? r.others : [],
  races: [...(r.races ?? [])].sort((a, b) => a.n - b.n), penalties: r.penalties ?? [], taps: r.taps ?? [], notes: r.notes ?? [],
  status: r.status, cardMessageId: r.card_message_id, cardVersion: r.card_version, version: r.version,
  startedBy: r.started_by, startedByName: r.started_by_name, createdAt: r.created_at, updatedAt: r.updated_at, endedAt: r.ended_at,
});

let ready: boolean | null = null;
/** Whether the tables exist (wars-m1.sql). */
export async function warsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("wars").select("id").limit(1);
  ready = !error;
  return ready;
}

let formatsOk = false;
let formatsAt = 0;
/** Whether wars can have other formats and more teams (wars-m8.sql); asked again after a minute while it's no. */
export async function formatsReady(): Promise<boolean> {
  if (formatsOk) return true;
  if (Date.now() - formatsAt < 60_000) return false;
  formatsAt = Date.now();
  const db = createServiceClient();
  const [a, b] = await Promise.all([db.from("wars").select("format, others").limit(1), db.from("war_channels").select("format").limit(1)]);
  formatsOk = !a.error && !b.error;
  return formatsOk;
}

const cols = async (): Promise<string> => ((await formatsReady()) ? `${COLS}, format, others` : COLS);

/** Every team in the war, in the order they were named: yours, the team in vs:, then the others. */
export const warTeams = (w: War): WarTeamRef[] => [w.us, w.them, ...w.others];
/** Where the war stands, in its own game and format. */
export const warStanding = (w: War) => standing(w.races, w.penalties, w.racesTotal, w.game, w.format);
/** Players in the room. */
export const warRoom = (w: War) => roomOf(w.format);

export async function getWar(id: string): Promise<War | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createServiceClient().from("wars").select(await cols()).eq("id", id).maybeSingle();
  return data ? toWar(data as unknown as Row) : null;
}

/** A war from the start of its id (the war page's address, src/lib/wars/page.ts). */
export async function warByShort(short: string): Promise<War | null> {
  if (!/^[0-9a-f]{12}$/.test(short)) return null;
  const head = `${short.slice(0, 8)}-${short.slice(8, 12)}`;
  const { data } = await createServiceClient().from("wars").select(await cols())
    .gte("id", `${head}-0000-0000-000000000000`).lte("id", `${head}-ffff-ffff-ffffffffffff`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ? toWar(data as unknown as Row) : null;
}

export async function liveWar(guildId: string, channelId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(await cols()).eq("guild_id", guildId).eq("channel_id", channelId).eq("status", "live").maybeSingle();
  return data ? toWar(data as unknown as Row) : null;
}

/** The channel's live war, else its newest one (for the overlay between wars). */
export async function latestWar(guildId: string, channelId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(await cols()).eq("guild_id", guildId).eq("channel_id", channelId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toWar(data as unknown as Row) : null;
}

// ── Channels ──────────────────────────────────────────────────────────────────────────────────

type ChannelFormat = { size?: number; races?: number };
type ChannelRow = { guild_id: string; channel_id: string; team_tag: string | null; team_name: string | null; team_logo: string | null; game: WarGame | null; entry: WarEntry; overlay_token: string; background_url?: string | null; format?: ChannelFormat | null };
const toChannel = (r: ChannelRow): WarChannel => ({
  guildId: r.guild_id, channelId: r.channel_id, team: r.team_tag ? { tag: r.team_tag, name: r.team_name, logo: r.team_logo } : null,
  game: r.game, entry: r.entry, overlayToken: r.overlay_token, background: r.background_url ?? null,
  size: Number.isInteger(r.format?.size) ? r.format!.size! : null, races: Number.isInteger(r.format?.races) ? r.format!.races! : null,
});

const CH_COLS = "guild_id, channel_id, team_tag, team_name, team_logo, game, entry, overlay_token, background_url";
const chCols = async (): Promise<string> => ((await formatsReady()) ? `${CH_COLS}, format` : CH_COLS);

/** A server's live wars, newest change first (the War room's list when a call has more than one). */
export async function liveWarsIn(guildId: string, limit = 10): Promise<War[]> {
  const { data } = await createServiceClient().from("wars").select(await cols()).eq("guild_id", guildId).eq("status", "live").order("updated_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as Row[]).map(toWar);
}

/** A server's newest war of any status (where the War room posts a war it starts). */
export async function latestWarIn(guildId: string): Promise<War | null> {
  const { data } = await createServiceClient().from("wars").select(await cols()).eq("guild_id", guildId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toWar(data as unknown as Row) : null;
}

export async function warChannel(guildId: string, channelId: string): Promise<WarChannel | null> {
  const { data } = await createServiceClient().from("war_channels").select(await chCols()).eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  return data ? toChannel(data as unknown as ChannelRow) : null;
}

export async function channelByToken(token: string): Promise<WarChannel | null> {
  if (!/^[a-f0-9]{24}$/.test(token)) return null;
  const { data } = await createServiceClient().from("war_channels").select(await chCols()).eq("overlay_token", token).maybeSingle();
  return data ? toChannel(data as unknown as ChannelRow) : null;
}

/** Remembers the channel's team, game and entry (and makes its overlay link the first time). */
export async function rememberChannel(guildId: string, channelId: string, patch: { team?: WarTeamRef; game?: WarGame; entry?: WarEntry; background?: string | null; size?: number; races?: number }): Promise<WarChannel | null> {
  const db = createServiceClient();
  const now = await warChannel(guildId, channelId);
  const withFormat = await formatsReady();
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
    ...(withFormat ? { format: { size: patch.size ?? now?.size ?? 6, races: patch.races ?? now?.races ?? RACES } } : {}),
    updated_at: new Date().toISOString(),
  };
  let { data, error } = await db.from("war_channels").upsert(row, { onConflict: "guild_id,channel_id" }).select(await chCols()).single();
  // Before supabase/wars-mkwii-m1.sql the game column only takes Mario Kart 8 Deluxe and World: keep everything else.
  if (error?.code === WII_NOT_READY_CODE && row.game === "mkwii") {
    ({ data, error } = await db.from("war_channels").upsert({ ...row, game: now?.game === "mkwii" ? null : now?.game ?? null }, { onConflict: "guild_id,channel_id" }).select(await chCols()).single());
  }
  if (error) { console.error("[wars] remember channel failed:", error.message); return null; }
  return toChannel(data as unknown as ChannelRow);
}

/** A check constraint said no: before wars-mkwii-m1.sql, that's a Mario Kart Wii war or channel. */
const WII_NOT_READY_CODE = "23514";
/** What a Mario Kart Wii war says until the database takes it. */
export const WII_NOT_READY = "Mario Kart Wii wars open once GameShuffle's database update runs. Start this one as Mario Kart 8 Deluxe or World, or try again later.";

// ── Starting and changing a war ───────────────────────────────────────────────────────────────

export type StartResult = { ok: true; war: War } | { ok: false; error: "live"; war: War } | { ok: false; error: "failed" | "not_ready" | "wii_not_ready" };

export async function startWar(input: {
  guildId: string; channelId: string; game: WarGame; entry: WarEntry; us: WarTeamRef; them: WarTeamRef; by: { id: string; name: string };
  /** 6v6 when left out; another format or more teams need wars-m8. */
  format?: WarFormat; others?: WarTeamRef[]; racesTotal?: number;
  /** A war carried over from another bot starts with its races, penalties and a note saying so. */
  races?: WarRace[]; penalties?: WarPenalty[]; notes?: string[];
}): Promise<StartResult> {
  const format = input.format ?? DEFAULT_FORMAT;
  const others = input.others ?? [];
  const racesTotal = Math.max(1, Math.min(32, Math.round(input.racesTotal ?? RACES)));
  const plain = format.size === DEFAULT_FORMAT.size && format.teams === DEFAULT_FORMAT.teams && !others.length && racesTotal <= 24;
  const withFormat = await formatsReady();
  if (!plain && !withFormat) return { ok: false, error: "not_ready" };
  const live = await liveWar(input.guildId, input.channelId);
  if (live) return { ok: false, error: "live", war: live };
  const { data, error } = await createServiceClient().from("wars").insert({
    guild_id: input.guildId, channel_id: input.channelId, game: input.game, races_total: racesTotal, entry: format.teams > 2 ? "scorer" : input.entry,
    us_tag: input.us.tag, us_name: input.us.name, us_logo: input.us.logo, them_tag: input.them.tag, them_name: input.them.name, them_logo: input.them.logo,
    started_by: input.by.id, started_by_name: input.by.name,
    ...(withFormat ? { format, others } : {}),
    ...(input.races?.length ? { races: input.races } : {}),
    ...(input.penalties?.length ? { penalties: input.penalties } : {}),
    ...(input.notes?.length ? { notes: input.notes } : {}),
    // Every race already in: it starts finished.
    ...((input.races?.length ?? 0) >= racesTotal ? { status: "done", ended_at: new Date().toISOString() } : {}),
  }).select(await cols()).single();
  if (error) {
    // Two people starting at once: the unique index lets one in.
    const again = await liveWar(input.guildId, input.channelId);
    if (again) return { ok: false, error: "live", war: again };
    // The insert is one row, so a refused Mario Kart Wii war leaves nothing behind (WII_NOT_READY says why).
    if (error.code === WII_NOT_READY_CODE && input.game === "mkwii") return { ok: false, error: "wii_not_ready" };
    console.error("[wars] start failed:", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, war: toWar(data as unknown as Row) };
}

type Change = Partial<Pick<War, "races" | "penalties" | "taps" | "notes" | "status" | "entry" | "endedAt" | "us" | "them">>;
type Step<T> = { change: Change; result: T } | { error: string };

/** Applies `plan` to the newest copy of the war; retried when someone else changed it in between. */
async function mutate<T>(id: string, plan: (w: War) => Step<T>): Promise<{ ok: true; war: War; result: T } | { ok: false; error: string; war: War | null }> {
  const db = createServiceClient();
  const sel = await cols();
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
    if (c.us) { patch.us_tag = c.us.tag; patch.us_name = c.us.name; patch.us_logo = c.us.logo; }
    if (c.them) { patch.them_tag = c.them.tag; patch.them_name = c.them.name; patch.them_logo = c.them.logo; }
    const { data, error } = await db.from("wars").update(patch).eq("id", id).eq("version", w.version).select(sel).maybeSingle();
    if (error) {
      // Undoing the last race of a finished war reopens it, which can meet another live war in the channel.
      if (error.code === "23505") return { ok: false, error: "live_elsewhere", war: w };
      console.error("[wars] write failed:", error.message);
      return { ok: false, error: "failed", war: w };
    }
    if (data) return { ok: true, war: toWar(data as unknown as Row), result: step.result };
  }
  return { ok: false, error: "busy", war: null };
}

const nowIso = () => new Date().toISOString();
const doneWith = (w: War, races: WarRace[]): Change => (races.length >= w.racesTotal ? { status: "done", endedAt: nowIso() } : {});

export type AddRaceError = "not_live" | "taken" | "out_of_order";
/** Adds race `n` (the next one). "taken" when someone else got race `n` in first. */
/** A race's places past your team's (several teams) or only its points (carried over from another bot). */
type RaceExtra = { places?: number[][]; scores?: number[] };
const extraOf = (x: RaceExtra) => ({ ...(x.places?.length ? { places: x.places } : {}), ...(x.scores?.length ? { scores: x.scores } : {}) });

export function addRace(id: string, input: { n: number; spots: number[]; track: string | null; by: { id: string; name: string }; players?: WarRace["players"]; note?: string | null } & RaceExtra) {
  return mutate<WarRace>(id, (w) => {
    if (w.status !== "live") return { error: "not_live" };
    if (w.races.some((r) => r.n === input.n)) return { error: "taken" };
    if (input.n !== w.races.length + 1) return { error: "out_of_order" };
    const race: WarRace = { n: input.n, spots: input.spots, track: input.track, by: input.by, at: nowIso(), ...(input.players ? { players: input.players } : {}), ...extraOf(input) };
    const races = [...w.races, race];
    return { change: { races, taps: w.taps.filter((t) => t.race > input.n), ...(input.note ? { notes: [...w.notes, `Race ${input.n}: ${input.note}`] } : {}), ...doneWith(w, races) }, result: race };
  });
}

/** Replaces race `n`'s places (and track, when given): Fix a race, or "Use mine instead". */
export function replaceRace(id: string, input: { n: number; spots: number[]; track?: string | null; by: { id: string; name: string } } & RaceExtra) {
  return mutate<WarRace>(id, (w) => {
    const old = w.races.find((r) => r.n === input.n);
    if (!old) return { error: "no_race" };
    // New places replace a carried-over race's points; several teams bring every team's places.
    const race: WarRace = { ...old, spots: input.spots, track: input.track === undefined ? old.track : input.track, fixedBy: input.by.name, players: undefined, places: undefined, scores: undefined, ...extraOf(input) };
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

/** A penalty on a team: `team` (its number) with several teams, else `side`. */
export function addPenalty(id: string, input: { side: WarSide; points: number; reason: string; by: string; team?: number }) {
  return mutate<WarPenalty>(id, (w) => {
    if (w.status === "ended") return { error: "not_live" };
    const t = input.team ?? (input.side === "us" ? 0 : 1);
    if (t < 0 || t >= w.format.teams) return { error: "no_team" };
    const p: WarPenalty = { side: t === 0 ? "us" : "them", points: input.points, reason: input.reason, by: input.by, at: nowIso(), ...(w.format.teams > 2 ? { team: t } : {}) };
    const team = warTeams(w)[t]?.tag ?? "a team";
    return { change: { penalties: [...w.penalties, p], notes: [...w.notes, `${input.points} off ${team}${input.reason ? ` (${input.reason})` : ""}, from ${input.by}`] }, result: p };
  });
}

/** Takes back a penalty: the newest one on that team (with that many points, when given). */
export function removePenalty(id: string, input: { side: WarSide; points: number | null; by: string; team?: number }) {
  return mutate<WarPenalty>(id, (w) => {
    if (w.status === "ended") return { error: "not_live" };
    const t = input.team ?? (input.side === "us" ? 0 : 1);
    const at = w.penalties.map((p, i) => [p, i] as const).reverse().find(([p]) => penaltyTeam(p) === t && (input.points == null || p.points === input.points))?.[1];
    if (at == null) return { error: "no_penalty" };
    const p = w.penalties[at];
    const team = warTeams(w)[t]?.tag ?? "a team";
    return { change: { penalties: w.penalties.filter((_, i) => i !== at), notes: [...w.notes, `${p.points} back to ${team}, from ${input.by}`] }, result: p };
  });
}

/** A team's tag (and name and logo) mid-war, like Sokuji's %tag. */
export function setSide(id: string, side: WarSide, team: WarTeamRef) {
  return mutate<WarTeamRef>(id, (w) => {
    if (w.status === "ended") return { error: "not_live" };
    const rest = warTeams(w).filter((_, i) => i !== (side === "us" ? 0 : 1));
    if (rest.some((o) => o.tag.toLowerCase() === team.tag.toLowerCase())) return { error: "same_tag" };
    return { change: side === "us" ? { us: team } : { them: team }, result: team };
  });
}

export function setEntry(id: string, entry: WarEntry) {
  return mutate<WarEntry>(id, (w) => {
    if (w.status !== "live") return { error: "not_live" };
    if (entry === "taps" && !tapsFit(w)) return { error: "no_taps" };
    return { change: { entry, taps: [] }, result: entry };
  });
}

/** Players tap their places only in two-team wars of up to 12 players (more places than that don't fit on the card). */
export const tapsFit = (w: Pick<War, "format">) => w.format.teams === 2 && roomOf(w.format) <= 12;

export function endWar(id: string) {
  return mutate<true>(id, (w) => (w.status !== "live" ? { error: "not_live" } : { change: { status: "ended", endedAt: nowIso() }, result: true }));
}

export type TapResult = { kind: "tapped" | "untapped" | "moved"; race: WarRace | null; waiting: number; clashes: number[] };

/**
 * A player taps the place they finished in race `n`. Tapping the same place again takes it back; tapping another
 * moves it. Once every player on the team holds a different place, the race goes in with who finished where.
 */
export function tapPlace(id: string, input: { n: number; place: number; user: { id: string; name: string } }) {
  return mutate<TapResult>(id, (w) => {
    if (w.status !== "live") return { error: "not_live" };
    if (!tapsFit(w)) return { error: "no_taps" };
    if (input.n !== w.races.length + 1) return { error: "stale" };
    if (!(input.place >= 1 && input.place <= roomOf(w.format))) return { error: "no_place" };
    const size = w.format.size;
    const mine = w.taps.find((t) => t.race === input.n && t.id === input.user.id);
    let taps = w.taps.filter((t) => t.race === input.n);
    let kind: TapResult["kind"] = "tapped";
    if (mine && mine.place === input.place) { taps = taps.filter((t) => t.id !== input.user.id); kind = "untapped"; }
    else if (mine) { taps = taps.map((t) => (t.id === input.user.id ? { ...t, place: input.place } : t)); kind = "moved"; }
    else {
      if (taps.length >= size && !taps.some((t) => t.place === input.place)) return { error: "full" };
      taps = [...taps, { id: input.user.id, name: input.user.name.slice(0, 32), place: input.place, race: input.n }];
    }
    const clashes = tapClashes(taps);
    const spots = clashes.length ? null : tapsToSpots(taps, size);
    if (spots) {
      const race: WarRace = { n: input.n, spots, track: pendingTrack(w, input.n), by: { id: input.user.id, name: input.user.name }, at: nowIso(), players: taps.map((t) => ({ id: t.id, name: t.name, place: t.place })) };
      const races = [...w.races, race];
      return { change: { races, taps: [], ...doneWith(w, races) }, result: { kind, race, waiting: 0, clashes } };
    }
    return { change: { taps }, result: { kind, race: null, waiting: Math.max(0, size - taps.length), clashes } };
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
