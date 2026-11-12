import "server-only";

/**
 * Team cards, server player lists, players' own cards, track nicknames and how a server's typed races read
 * (supabase/wars-m5.sql; overrides picks 2026-11-09, all as recommended; rules in cards.ts). Who can change what
 * (pick 2, like /logo): anyone fills in something blank; changing what someone else set takes them or someone who can
 * manage the server. Everything reads as empty until the migration runs.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isReadsLike, type ReadsLike } from "./legacy";
import { readTrack, type WarGame } from "./rules";
import { nickTrackValue } from "./tracks";
import { tagKey } from "./tags";
import { teamCardFor, tagTaken, type CardSet, type LogoSource, type MkcPlayerLite, type PlayerCard, type RosterRow, type TeamCard } from "./cards";
import { mkcTeam, rosterFor, type MkcTeam } from "./mkcTeams";
import type { TableModel } from "./table";

let ready: boolean | null = null;
/** Whether wars-m5.sql has run. */
export async function cardsReady(): Promise<boolean> {
  if (ready) return true;
  // A plain read: a head request to a missing table comes back without an error.
  const { error } = await createServiceClient().from("war_teams").select("id").limit(1);
  ready = !error;
  return ready;
}

export interface TeamCardRow extends TeamCard { guildId: string; createdBy: string; createdByName: string | null; updatedBy: string | null; mkcCheckedAt: string | null }
type TeamRow = {
  id: string; guild_id: string; name: string | null; tags: string[]; color: string | null; created_by: string; created_by_name: string | null; updated_by: string | null;
  logo_source?: LogoSource; mkc_team_id?: number | null; mkc_name?: string | null; mkc_logo?: string | null; mkc_checked_at?: string | null;
};
const TEAM_BASE = "id, guild_id, name, tags, color, created_by, created_by_name, updated_by";
const TEAM_LINKS = ", logo_source, mkc_team_id, mkc_name, mkc_logo, mkc_checked_at";
const teamCols = async (): Promise<string> => ((await linksReady()) ? TEAM_BASE + TEAM_LINKS : TEAM_BASE);
const toTeam = (r: TeamRow): TeamCardRow => ({
  id: r.id, guildId: r.guild_id, name: r.name, tags: r.tags, color: r.color, createdBy: r.created_by, createdByName: r.created_by_name, updatedBy: r.updated_by,
  logoSource: r.logo_source ?? "auto", mkcTeamId: r.mkc_team_id ?? null, mkcName: r.mkc_name ?? null, mkcLogo: r.mkc_logo ?? null, mkcCheckedAt: r.mkc_checked_at ?? null,
});

let linksOk: boolean | null = null;
/** Whether wars-m6.sql has run (logo setting and MKCentral links). */
export async function linksReady(): Promise<boolean> {
  if (linksOk) return true;
  if (!(await cardsReady())) return false;
  const { error } = await createServiceClient().from("war_teams").select("mkc_team_id").limit(1);
  linksOk = !error;
  return linksOk;
}

export interface RosterEntry extends RosterRow { id: string; createdBy: string; createdByName: string | null }
type RosterDb = { id: string; team_id: string; ingame: string; shown: string | null; flag: string | null; source: "captain" | "remember"; created_by: string; created_by_name: string | null; mkc_player_id?: number | null };
const ROSTER_BASE = "id, team_id, ingame, shown, flag, source, created_by, created_by_name";
const rosterCols = async (): Promise<string> => ((await linksReady()) ? `${ROSTER_BASE}, mkc_player_id` : ROSTER_BASE);
const toRoster = (r: RosterDb): RosterEntry => ({ id: r.id, teamId: r.team_id, ingame: r.ingame, shown: r.shown, flag: r.flag, source: r.source, createdBy: r.created_by, createdByName: r.created_by_name, mkcPlayerId: r.mkc_player_id ?? null });

type CardDb = { discord_id: string; shown: string | null; flag: string | null; ingame: string[]; teams: string[] };
const toCard = (r: CardDb): PlayerCard => ({ discordId: r.discord_id, shown: r.shown, flag: r.flag, ingame: r.ingame ?? [], teams: r.teams ?? [] });

const FLAG = /^[a-z]{2,10}(_[a-z]{2,3})?$/;
const cleanFlag = (v: unknown) => { const c = String(v ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase(); return FLAG.test(c) ? c : null; };
const cleanName = (v: unknown, max = 32) => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max); return s || null; };
const cleanColor = (v: unknown) => { const s = String(v ?? "").trim().toLowerCase(); const m = /^#?([0-9a-f]{6})$/.exec(s); return m ? `#${m[1]}` : null; };
export const cleanTags = (list: unknown[]): string[] => {
  const out: string[] = [];
  for (const v of list) {
    const t = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 12);
    if (t && tagKey(t) && !out.some((o) => tagKey(o) === tagKey(t))) out.push(t);
  }
  return out.slice(0, 8);
};

// ── Team cards ───────────────────────────────────────────────────────────────────────────────

export async function listTeams(guildId: string): Promise<TeamCardRow[]> {
  if (!(await cardsReady())) return [];
  const { data } = await createServiceClient().from("war_teams").select(await teamCols()).eq("guild_id", guildId).order("created_at");
  return ((data ?? []) as unknown as TeamRow[]).map(toTeam);
}

export async function teamById(id: string): Promise<TeamCardRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await cardsReady())) return null;
  const { data } = await createServiceClient().from("war_teams").select(await teamCols()).eq("id", id).maybeSingle();
  return data ? toTeam(data as unknown as TeamRow) : null;
}

/** A server's team card for a tag or name. */
export async function teamFor(guildId: string, ...keys: (string | null | undefined)[]): Promise<TeamCardRow | null> {
  return (teamCardFor(await listTeams(guildId), ...keys) as TeamCardRow | null) ?? null;
}

export type SaveTeamResult = { ok: true; team: TeamCardRow; created: boolean } | { ok: false; error: "not_ready" | "no_tag" | "tag_taken" | "not_yours"; other?: TeamCardRow };

/**
 * Makes or changes a team card. `id` changes that card; without it, the card holding the first tag changes (or a new
 * one is made). Blank fields anyone can fill; changing or removing what's there takes its maker or a server manager.
 */
export async function saveTeam(guildId: string, input: { id?: string | null; name?: string | null; tags?: string[]; color?: string | null; addTags?: string[] }, by: { id: string; name: string }, canManage: boolean): Promise<SaveTeamResult> {
  if (!(await cardsReady())) return { ok: false, error: "not_ready" };
  const all = await listTeams(guildId);
  const tags = input.tags ? cleanTags(input.tags) : null;
  const old = input.id ? all.find((t) => t.id === input.id) ?? null : tags?.length ? (teamCardFor(all, tags[0]) as TeamCardRow | null) : null;
  const nextTags = cleanTags([...(tags ?? old?.tags ?? []), ...(input.addTags ?? [])]);
  if (!nextTags.length) return { ok: false, error: "no_tag" };
  for (const t of nextTags) { const other = tagTaken(all, t, old?.id ?? null); if (other) return { ok: false, error: "tag_taken", other: other as TeamCardRow }; }
  const name = input.name === undefined ? old?.name ?? null : cleanName(input.name, 60);
  const color = input.color === undefined ? old?.color ?? null : cleanColor(input.color);
  const db = createServiceClient();
  if (!old) {
    const { data, error } = await db.from("war_teams").insert({ guild_id: guildId, name, tags: nextTags, color, created_by: by.id, created_by_name: by.name }).select(await teamCols()).single();
    if (error) { console.error("[wars] team card insert failed:", error.message); return { ok: false, error: "not_ready" }; }
    return { ok: true, team: toTeam(data as unknown as TeamRow), created: true };
  }
  const changes = (old.name && old.name !== name) || (old.color && old.color !== color) || old.tags.some((t) => !nextTags.some((n) => tagKey(n) === tagKey(t))) || tagKey(old.tags[0]) !== tagKey(nextTags[0]);
  if (changes && old.createdBy !== by.id && !canManage) return { ok: false, error: "not_yours", other: old };
  const { data } = await db.from("war_teams").update({ name, tags: nextTags, color, updated_by: by.id, updated_by_name: by.name, updated_at: new Date().toISOString() }).eq("id", old.id).select(await teamCols()).single();
  return { ok: true, team: toTeam(data as unknown as TeamRow), created: false };
}

export async function removeTeam(id: string, by: { id: string }, canManage: boolean): Promise<"ok" | "gone" | "not_yours"> {
  const team = await teamById(id);
  if (!team) return "gone";
  if (team.createdBy !== by.id && !canManage) return "not_yours";
  await createServiceClient().from("war_teams").delete().eq("id", id);
  return "ok";
}

// ── A server's players ───────────────────────────────────────────────────────────────────────

export async function rosterOf(teamId: string): Promise<RosterEntry[]> {
  if (!(await cardsReady())) return [];
  const { data } = await createServiceClient().from("war_roster").select(await rosterCols()).eq("team_id", teamId).order("ingame");
  return ((data ?? []) as unknown as RosterDb[]).map(toRoster);
}

export interface RosterChange { added: number; changed: number; skipped: { ingame: string; by: string | null }[] }

/** Adds or changes a team's players from lines (see readRosterLines); someone else's line takes them or a manager. */
export async function setRoster(guildId: string, teamId: string, lines: { ingame: string; shown: string | null; flag: string | null; mkcPlayerId?: number | null }[], by: { id: string; name: string }, canManage: boolean, source: "captain" | "remember" = "captain"): Promise<RosterChange> {
  const out: RosterChange = { added: 0, changed: 0, skipped: [] };
  if (!(await cardsReady()) || !lines.length) return out;
  const have = new Map((await rosterOf(teamId)).map((r) => [tagKey(r.ingame), r]));
  const db = createServiceClient();
  const now = new Date().toISOString();
  const links = await linksReady();
  for (const l of lines) {
    const mkc = links && l.mkcPlayerId ? { mkc_player_id: l.mkcPlayerId } : {};
    const key = tagKey(l.ingame).slice(0, 32);
    if (!key) continue;
    const shown = cleanName(l.shown);
    const flag = cleanFlag(l.flag);
    const old = have.get(key);
    if (old) {
      const differs = (old.shown ?? null) !== shown || (old.flag ?? null) !== flag;
      if (!differs) continue;
      const overwrites = (old.shown && old.shown !== shown) || (old.flag && old.flag !== flag);
      if (overwrites && old.createdBy !== by.id && !canManage) { out.skipped.push({ ingame: l.ingame, by: old.createdByName }); continue; }
      await db.from("war_roster").update({ shown: shown ?? old.shown, flag: flag ?? old.flag, source, updated_at: now, ...mkc }).eq("id", old.id);
      out.changed++;
    } else {
      const { error } = await db.from("war_roster").insert({ guild_id: guildId, team_id: teamId, ingame: l.ingame.slice(0, 32), ingame_key: key, shown, flag, source, created_by: by.id, created_by_name: by.name, ...mkc });
      if (!error) out.added++;
    }
  }
  return out;
}

export async function removeRosterRow(id: string, by: { id: string }, canManage: boolean): Promise<"ok" | "gone" | "not_yours"> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await cardsReady())) return "gone";
  const db = createServiceClient();
  const { data } = await db.from("war_roster").select("id, created_by").eq("id", id).maybeSingle();
  const row = data as { id: string; created_by: string } | null;
  if (!row) return "gone";
  if (row.created_by !== by.id && !canManage) return "not_yours";
  await db.from("war_roster").delete().eq("id", id);
  return "ok";
}

// ── Players' own cards ───────────────────────────────────────────────────────────────────────

export async function playerCard(discordId: string): Promise<PlayerCard | null> {
  if (!/^[0-9]{5,25}$/.test(discordId) || !(await cardsReady())) return null;
  const { data } = await createServiceClient().from("war_cards").select("discord_id, shown, flag, ingame, teams").eq("discord_id", discordId).maybeSingle();
  return data ? toCard(data as CardDb) : null;
}

export async function savePlayerCard(discordId: string, input: { shown?: unknown; flag?: unknown; ingame?: unknown[]; teams?: unknown[] }): Promise<PlayerCard | null> {
  if (!(await cardsReady())) return null;
  const old = await playerCard(discordId);
  const ingame = input.ingame ? [...new Set(input.ingame.map((v) => cleanName(v)).filter((v): v is string => !!v))].slice(0, 8) : old?.ingame ?? [];
  const row = {
    discord_id: discordId,
    shown: input.shown === undefined ? old?.shown ?? null : cleanName(input.shown),
    flag: input.flag === undefined ? old?.flag ?? null : cleanFlag(input.flag),
    ingame,
    ingame_keys: ingame.map((n) => tagKey(n).slice(0, 32)).filter(Boolean),
    teams: input.teams ? cleanTags(input.teams).slice(0, 4) : old?.teams ?? [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await createServiceClient().from("war_cards").upsert(row, { onConflict: "discord_id" }).select("discord_id, shown, flag, ingame, teams").single();
  if (error) { console.error("[wars] player card save failed:", error.message); return null; }
  return toCard(data as CardDb);
}

/** Players' own cards by Discord account (for players who tapped their places). */
export async function playerCardsById(ids: string[]): Promise<Map<string, PlayerCard>> {
  const list = ids.filter((id) => /^[0-9]{5,25}$/.test(id));
  if (!list.length || !(await cardsReady())) return new Map();
  const { data } = await createServiceClient().from("war_cards").select("discord_id, shown, flag, ingame, teams").in("discord_id", list);
  return new Map(((data ?? []) as CardDb[]).map((r) => [r.discord_id, toCard(r)]));
}

/** Everything a table needs to show players and teams as people set them. */
export async function cardSetFor(guildId: string, model: TableModel, game: WarGame = "mk8dx"): Promise<CardSet> {
  if (!(await cardsReady())) return { teams: [], roster: [], cards: [] };
  const keys = [...new Set(model.teams.flatMap((t) => t.players.map((p) => tagKey(p.name).slice(0, 32))).filter(Boolean))].slice(0, 60);
  const db = createServiceClient();
  const teams = await listTeams(guildId);
  // The table's own teams: their whole lists (a renamed player is still theirs) and, when linked, their MKCentral players.
  const onTable = [...new Set(model.teams.map((t) => teamCardFor(teams, t.tag, t.name)).filter((c): c is TeamCardRow => !!c))];
  const cols = await rosterCols();
  const [byTeam, byName, cards, mkcTeams] = await Promise.all([
    onTable.length ? db.from("war_roster").select(cols).in("team_id", onTable.map((t) => t.id)) : Promise.resolve({ data: [] }),
    keys.length ? db.from("war_roster").select(cols).eq("guild_id", guildId).in("ingame_key", keys) : Promise.resolve({ data: [] }),
    keys.length ? db.from("war_cards").select("discord_id, shown, flag, ingame, teams").overlaps("ingame_keys", keys).limit(200) : Promise.resolve({ data: [] }),
    Promise.all(onTable.map(async (t) => [t.id, t.mkcTeamId ? await mkcTeam(t.mkcTeamId).catch(() => null) : null] as const)),
  ]);
  const roster = new Map<string, RosterEntry>();
  for (const r of [...((byTeam.data ?? []) as unknown as RosterDb[]), ...((byName.data ?? []) as unknown as RosterDb[])]) roster.set(r.id, toRoster(r));
  const mkc: Record<string, MkcPlayerLite[]> = {};
  for (const [id, team] of mkcTeams) { const r = team ? rosterFor(team, game) : null; if (r?.players.length) mkc[id] = r.players; }
  // Linked players' own cards, by Discord account (their card beats MKCentral's name and country).
  const ids = [...new Set(Object.values(mkc).flat().map((p) => p.discordId).filter((v): v is string => !!v))];
  const own = ids.length ? await playerCardsById(ids) : new Map<string, PlayerCard>();
  const all = new Map<string, PlayerCard>(((cards.data ?? []) as CardDb[]).map((r) => [r.discord_id, toCard(r)]));
  for (const [id, c] of own) all.set(id, c);
  return { teams, roster: [...roster.values()], cards: [...all.values()], mkc };
}

// ── The logo setting and MKCentral links (wars-m6) ──────────────────────────────────────────

export type LinkResult = { ok: true; team: TeamCardRow; mkc: MkcTeam | null } | { ok: false; error: "not_ready" | "gone" | "not_yours" | "no_team" | "taken"; other?: TeamCardRow };

/** A setting someone else chose takes them or a server manager; a blank (auto, not linked) anyone can set. */
const mayChange = (team: TeamCardRow, by: { id: string }, canManage: boolean, blank: boolean) => blank || canManage || team.createdBy === by.id;

export async function setLogoSource(teamId: string, source: LogoSource, by: { id: string; name: string }, canManage: boolean): Promise<LinkResult> {
  if (!(await linksReady())) return { ok: false, error: "not_ready" };
  const team = await teamById(teamId);
  if (!team) return { ok: false, error: "gone" };
  if (!mayChange(team, by, canManage, (team.logoSource ?? "auto") === "auto")) return { ok: false, error: "not_yours", other: team };
  const { data } = await createServiceClient().from("war_teams").update({ logo_source: source, updated_by: by.id, updated_by_name: by.name, updated_at: new Date().toISOString() }).eq("id", team.id).select(await teamCols()).single();
  return { ok: true, team: toTeam(data as unknown as TeamRow), mkc: null };
}

/**
 * Links a team card to its MKCentral team, filling only what's blank (name; the tags its rosters use, added after the
 * card's own). Changing an existing link takes the card's maker or a server manager.
 */
export async function linkMkc(teamId: string, mkcId: number, game: WarGame, by: { id: string; name: string }, canManage: boolean): Promise<LinkResult> {
  if (!(await linksReady())) return { ok: false, error: "not_ready" };
  const team = await teamById(teamId);
  if (!team) return { ok: false, error: "gone" };
  if (!mayChange(team, by, canManage, !team.mkcTeamId)) return { ok: false, error: "not_yours", other: team };
  const mkc = await mkcTeam(mkcId, { fresh: true });
  if (!mkc) return { ok: false, error: "no_team" };
  const r = rosterFor(mkc, game);
  const all = await listTeams(team.guildId);
  const extra = cleanTags([r?.tag ?? "", mkc.tag].filter(Boolean)).filter((t) => !team.tags.some((g) => tagKey(g) === tagKey(t)) && !tagTaken(all, t, team.id));
  const { data } = await createServiceClient().from("war_teams").update({
    name: team.name ?? (r?.name || mkc.name).slice(0, 60), tags: cleanTags([...team.tags, ...extra]),
    mkc_team_id: mkc.id, mkc_name: (r?.name || mkc.name).slice(0, 80), mkc_logo: mkc.logo, mkc_checked_at: new Date().toISOString(),
    updated_by: by.id, updated_by_name: by.name, updated_at: new Date().toISOString(),
  }).eq("id", team.id).select(await teamCols()).single();
  return { ok: true, team: toTeam(data as unknown as TeamRow), mkc };
}

/** Unlinks (and remembers that someone said "none of these", so /war doesn't ask again). */
export async function unlinkMkc(teamId: string, by: { id: string; name: string }, canManage: boolean): Promise<LinkResult> {
  if (!(await linksReady())) return { ok: false, error: "not_ready" };
  const team = await teamById(teamId);
  if (!team) return { ok: false, error: "gone" };
  if (!mayChange(team, by, canManage, !team.mkcTeamId)) return { ok: false, error: "not_yours", other: team };
  const { data } = await createServiceClient().from("war_teams").update({
    mkc_team_id: null, mkc_name: null, mkc_logo: null, mkc_checked_at: new Date().toISOString(),
    logo_source: team.logoSource === "mkcentral" ? "auto" : team.logoSource ?? "auto", updated_by: by.id, updated_by_name: by.name, updated_at: new Date().toISOString(),
  }).eq("id", team.id).select(await teamCols()).single();
  return { ok: true, team: toTeam(data as unknown as TeamRow), mkc: null };
}

/** Reads a linked team from MKCentral again (the Update button) and keeps its name and logo as last seen. */
export async function refreshMkc(teamId: string, game: WarGame): Promise<{ team: TeamCardRow; mkc: MkcTeam | null } | null> {
  if (!(await linksReady())) return null;
  const team = await teamById(teamId);
  if (!team?.mkcTeamId) return team ? { team, mkc: null } : null;
  const mkc = await mkcTeam(team.mkcTeamId, { fresh: true });
  if (!mkc) return { team, mkc: null };
  const r = rosterFor(mkc, game);
  const { data } = await createServiceClient().from("war_teams").update({ mkc_name: (r?.name || mkc.name).slice(0, 80), mkc_logo: mkc.logo, mkc_checked_at: new Date().toISOString() }).eq("id", team.id).select(await teamCols()).single();
  return { team: toTeam(data as unknown as TeamRow), mkc };
}

// ── A server's settings: how typed races read, its track nicknames ─────────────────────────

export async function readsLikeFor(guildId: string): Promise<ReadsLike> {
  if (!(await cardsReady())) return "sokuji";
  const { data } = await createServiceClient().from("war_guilds").select("reads_like").eq("guild_id", guildId).maybeSingle();
  const v = (data as { reads_like: string } | null)?.reads_like;
  return isReadsLike(v) ? v : "sokuji";
}

export async function setReadsLike(guildId: string, readsLike: ReadsLike, by: string): Promise<boolean> {
  if (!(await cardsReady())) return false;
  const { error } = await createServiceClient().from("war_guilds").upsert({ guild_id: guildId, reads_like: readsLike, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "guild_id" });
  return !error;
}

export async function trackNames(guildId: string): Promise<Record<string, string>> {
  if (!(await cardsReady())) return {};
  const { data } = await createServiceClient().from("war_track_names").select("nick_key, track").eq("guild_id", guildId).limit(300);
  return Object.fromEntries(((data ?? []) as { nick_key: string; track: string }[]).map((r) => [r.nick_key, r.track]));
}

export async function listTrackNames(guildId: string): Promise<{ nick: string; track: string }[]> {
  if (!(await cardsReady())) return [];
  const { data } = await createServiceClient().from("war_track_names").select("nick, track").eq("guild_id", guildId).order("nick").limit(300);
  return (data ?? []) as { nick: string; track: string }[];
}

export type TrackNameResult = "ok" | "not_ready" | "bad_nick" | "no_track" | "is_code";
/** A server's own name for a track. A nickname that's already a track code would never be read, so it's refused. */
export async function setTrackName(guildId: string, game: WarGame, nick: string, trackCodeOrId: string, by: string): Promise<TrackNameResult> {
  if (!(await cardsReady())) return "not_ready";
  const n = nick.replace(/\s+/g, " ").trim().slice(0, 24);
  const key = tagKey(n).slice(0, 24);
  if (!key) return "bad_nick";
  if (readTrack(game, n)) return "is_code";
  const id = readTrack(game, trackCodeOrId)?.id ?? null;
  if (!id) return "no_track";
  // Mario Kart Wii's nicknames carry the game ("mkwii:<id>"): two Wii ids are also Mario Kart World ids.
  const track = nickTrackValue(game, id);
  await createServiceClient().from("war_track_names").upsert({ guild_id: guildId, nick_key: key, nick: n, track, created_by: by }, { onConflict: "guild_id,nick_key" });
  return "ok";
}

export async function removeTrackName(guildId: string, nick: string): Promise<boolean> {
  if (!(await cardsReady())) return false;
  const { data } = await createServiceClient().from("war_track_names").delete().eq("guild_id", guildId).eq("nick_key", tagKey(nick).slice(0, 24)).select("nick_key");
  return !!data?.length;
}

/** Typed races in a channel (on unless the channel turned them off). */
export async function typedOn(guildId: string, channelId: string): Promise<boolean> {
  if (!(await cardsReady())) return true;
  const { data } = await createServiceClient().from("war_channels").select("typed").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  return (data as { typed: boolean } | null)?.typed ?? true;
}

export async function setTypedOn(guildId: string, channelId: string, on: boolean): Promise<boolean> {
  if (!(await cardsReady())) return false;
  const { data } = await createServiceClient().from("war_channels").update({ typed: on }).eq("guild_id", guildId).eq("channel_id", channelId).select("channel_id");
  return !!data?.length;
}
