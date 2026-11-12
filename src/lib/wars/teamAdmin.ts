import "server-only";

/**
 * The Teams page's reads and the few writes cardStore.ts doesn't have (overrides picks 2026-11-09, all as
 * recommended): who may open it (the account that added GameShuffle Competitive to the server, and staff, the same
 * as the Logos page), everything the page shows at once, a whole server's player lists in one read, and changing one
 * player's line exactly as typed (cardStore's setRoster keeps an old name when a new line leaves it out). With
 * wars-m6.sql (logos + MKCentral picks 2026-11-09, all A): each card's logo setting with the logo it shows now, its
 * MKCentral link, and a linked team's MKCentral players beside the server's own lines; and the link search.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { compAppLive } from "@/lib/discord/appIds";
import { warsReady } from "./store";
import { logoManager, type LogoManager } from "./logoAdmin";
import { cardsReady, linksReady, listTeams, listTrackNames, playerCardsById, readsLikeFor, type TeamCardRow } from "./cardStore";
import { matchMkc, teamCardFor, type PlayerCard } from "./cards";
import { flagsFor } from "./flags";
import { mkcIdFrom, mkcTeam, rosterFor, searchMkcTeams, type MkcTeam } from "./mkcTeams";
import { isWarGame, WAR_GAMES, warTrack, type WarGame } from "./rules";
import { nickTrack, warTracks, wiiCodes } from "./tracks";
import { tagKey } from "./tags";
import { playedTeams, registryTeam } from "./teams";
import { listLogos } from "./logos";
import { logoColor } from "./teamColor";
import {
  cleanFlagText, logoNow, mkcShownName, ownLogo, type MkcHitView, type MkcLinkView, type MkcPlayerView, type SetBy, type TeamLinksView, type TeamsView, type TeamView,
  type TrackNickView, type TrackOption,
} from "./teamView";

export type TeamsAccess =
  | { ok: true; m: LogoManager; by: { id: string; name: string }; guild: string }
  | { ok: false; status: number; error: "not_ready" | "signin" | "not_yours" };

/**
 * The signed-in account as this server's team manager. On the site that person counts as able to manage the server;
 * the cards record them by their Discord account when it's linked (the same person as in Discord), else the account.
 */
export async function teamsAccess(guild: string | null | undefined): Promise<TeamsAccess> {
  if (!compAppLive() || !(await warsReady())) return { ok: false, status: 503, error: "not_ready" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "signin" };
  const m = guild ? await logoManager(user.id, guild) : null;
  if (!m || !guild) return { ok: false, status: 404, error: "not_yours" };
  return { ok: true, m, guild, by: cardBy(m) };
}

/** Who the cards say made a change: the linked Discord account, else the GameShuffle account. */
export function cardBy(m: LogoManager): { id: string; name: string } {
  return { id: m.by.id.startsWith("u:") ? m.userId : m.by.id, name: m.by.name };
}

/** The games a server's wars use, most used first (Mario Kart 8 Deluxe when it has none yet). */
export async function serverGames(guildId: string): Promise<WarGame[]> {
  const db = createServiceClient();
  const [ch, wars] = await Promise.all([
    db.from("war_channels").select("game").eq("guild_id", guildId).not("game", "is", null),
    db.from("wars").select("game").eq("guild_id", guildId).order("created_at", { ascending: false }).limit(50),
  ]);
  const count = new Map<WarGame, number>();
  for (const r of [...((ch.data ?? []) as { game: WarGame | null }[]), ...((wars.data ?? []) as { game: WarGame | null }[])]) {
    if (isWarGame(r.game)) count.set(r.game, (count.get(r.game) ?? 0) + 1);
  }
  const games = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return games.length ? games : ["mk8dx"];
}

const trackList = (game: WarGame): TrackOption[] =>
  warTracks(game).map((t) => ({ id: t.id, code: t.code ?? "", name: t.name, ...(game === "mkwii" ? { also: wiiCodes(t.id).slice(1) } : {}) })).filter((t) => t.code);

/** A nickname's track as "SGB · Shy Guy Bazaar", looked up in the server's games first (a Wii nickname is "mkwii:<id>"). */
function nickLabel(track: string, games: WarGame[]): string {
  for (const g of [...games, ...WAR_GAMES]) {
    const id = nickTrack(g, track);
    const t = id ? warTrack(g, id) : null;
    if (t) return t.code ? `${t.code} · ${t.name}` : t.name;
  }
  return track;
}

export async function trackNickViews(guildId: string, games?: WarGame[]): Promise<TrackNickView[]> {
  const [list, gs] = await Promise.all([listTrackNames(guildId), games ? Promise.resolve(games) : serverGames(guildId)]);
  return list.map((n) => ({ nick: n.nick, track: n.track, label: nickLabel(n.track, gs) }));
}

type RosterDb = { id: string; team_id: string; ingame: string; ingame_key: string; shown: string | null; flag: string | null; source: "captain" | "remember"; mkc_player_id?: number | null };
type CardDb = { discord_id: string; shown: string | null; flag: string | null; ingame_keys: string[] | null; teams: string[] | null };

/** Every player line in a server, in one read (cardStore reads one team at a time). */
async function rosterIn(guildId: string, links: boolean): Promise<RosterDb[]> {
  const cols = `id, team_id, ingame, ingame_key, shown, flag, source${links ? ", mkc_player_id" : ""}`;
  const { data } = await createServiceClient().from("war_roster").select(cols).eq("guild_id", guildId).order("ingame").limit(2000);
  return (data ?? []) as unknown as RosterDb[];
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** Discord accounts that tapped their places for each team card in the server's recent wars (its "us" side). */
async function tappedFor(guildId: string, teams: TeamCardRow[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const { data } = await createServiceClient().from("wars").select("us_tag, us_name, races, taps").eq("guild_id", guildId).order("created_at", { ascending: false }).limit(150);
  type WarDb = { us_tag: string; us_name: string | null; races: { players?: { id?: string }[] }[] | null; taps: { id?: string }[] | null };
  for (const w of (data ?? []) as WarDb[]) {
    const card = teamCardFor(teams, w.us_tag, w.us_name);
    if (!card) continue;
    const ids = out.get(card.id) ?? new Set<string>();
    for (const r of w.races ?? []) for (const p of r.players ?? []) if (p.id) ids.add(p.id);
    for (const t of w.taps ?? []) if (t.id) ids.add(t.id);
    out.set(card.id, ids);
  }
  return out;
}

/** MKCentral's logo for the first of a card's tags that has one (what cardLogo falls back to), in the game. */
async function tagLogoFor(tags: string[], game: WarGame): Promise<{ tag: string; url: string } | null> {
  for (const tag of tags.slice(0, 4)) {
    const logo = (await registryTeam(tag, game).catch(() => null))?.logo;
    if (logo) return { tag, url: logo };
  }
  return null;
}

/** A card's link as the page shows it: MKCentral read now (a 10-minute copy), else what it said last time. */
function linkView(card: TeamCardRow, team: MkcTeam | null, game: WarGame): MkcLinkView | null {
  if (!card.mkcTeamId) return null;
  const r = team ? rosterFor(team, game) : null;
  return {
    id: card.mkcTeamId,
    name: (r?.name || team?.name || card.mkcName || card.tags[0]).slice(0, 80),
    tag: r?.tag || team?.tag || null,
    logo: team ? team.logo : card.mkcLogo ?? null,
    players: team ? (r ? r.players.length : null) : null,
    game,
    reached: !!team,
  };
}

/**
 * A linked team's MKCentral players beside the server's lines. A line is tied to a player by the MKCentral player it
 * was picked as, else by its in-game name (as tables match them). Tables show the server's line first, then the
 * player's own card (by Discord account), then MKCentral.
 */
function mkcPlayersFor(team: MkcTeam, game: WarGame, lines: RosterDb[], own: Map<string, PlayerCard>, tapped: Set<string>, flagUrls: Record<string, string>): MkcPlayerView[] {
  const players = rosterFor(team, game)?.players ?? [];
  const tie = new Map<number, { line: RosterDb; part: string | null }>();
  for (const l of lines) if (l.mkc_player_id && players.some((p) => p.id === l.mkc_player_id) && !tie.has(l.mkc_player_id)) tie.set(l.mkc_player_id, { line: l, part: null });
  const tiedLines = new Set([...tie.values()].map((t) => t.line.id));
  for (const l of lines) {
    if (tiedLines.has(l.id) || l.mkc_player_id) continue;
    const hit = matchMkc(l.ingame, players.filter((p) => !tie.has(p.id)));
    if (hit) { tie.set(hit.player.id, { line: l, part: hit.shown }); tiedLines.add(l.id); }
  }
  return players.map((p) => {
    const t = tie.get(p.id);
    const line = t?.line ?? null;
    const card = p.discordId ? own.get(p.discordId) : undefined;
    const fromMkc = t?.part ?? mkcShownName(p.name);
    let shown: string, flag: string | null, from: MkcPlayerView["from"];
    if (line && (line.shown || line.flag)) { shown = line.shown ?? line.ingame; flag = line.flag; from = line.source; }
    else if (card && (card.shown || card.flag)) { shown = card.shown ?? fromMkc; flag = card.flag ?? p.country; from = "themselves"; }
    else { shown = fromMkc; flag = p.country; from = "mkcentral"; }
    return {
      id: p.id, name: p.name, shown, flag, flagUrl: flag ? flagUrls[flag] ?? null : null, from,
      lineId: line?.id ?? null, ingame: line?.ingame ?? null, played: !!line || (!!p.discordId && tapped.has(p.discordId)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Players' own cards with any of these in-game names. */
async function cardsWithNames(keys: string[]): Promise<CardDb[]> {
  const out: CardDb[] = [];
  for (let i = 0; i < keys.length; i += 120) {
    const { data } = await createServiceClient().from("war_cards").select("discord_id, shown, flag, ingame_keys, teams").overlaps("ingame_keys", keys.slice(i, i + 120)).limit(1000);
    out.push(...((data ?? []) as CardDb[]));
  }
  return out;
}

/** Everything the Teams page shows, or null before wars-m5.sql has run. */
export async function teamsView(guildId: string): Promise<TeamsView | null> {
  if (!(await cardsReady())) return null;
  const links = await linksReady();
  const [teams, roster, readsLike, games, played] = await Promise.all([
    listTeams(guildId), rosterIn(guildId, links), readsLikeFor(guildId), serverGames(guildId), playedTeams(guildId).catch(() => []),
  ]);
  const game = games[0] ?? "mk8dx";
  const cards = await cardsWithNames([...new Set(roster.map((r) => r.ingame_key))]);
  const keysOf = (t: TeamCardRow) => new Set([...t.tags, t.name].filter((v): v is string => !!v).map(tagKey).filter(Boolean));

  // With wars-m6: each linked team read from MKCentral (a 10-minute copy), its players' own cards, who's tapped here,
  // and MKCentral's logo by tag for every card (Automatic's last stop).
  const linked = links ? teams.filter((t) => t.mkcTeamId) : [];
  const [mkcTeams, tagLogos, tapped] = links
    ? await Promise.all([
      Promise.all(linked.map(async (t) => [t.id, await withTimeout(mkcTeam(t.mkcTeamId!), 3500, null)] as const)).then((e) => new Map(e)),
      Promise.all(teams.map(async (t) => [t.id, await withTimeout(tagLogoFor(t.tags, game), 2500, null)] as const)).then((e) => new Map(e)),
      linked.length ? tappedFor(guildId, teams).catch(() => new Map<string, Set<string>>()) : Promise.resolve(new Map<string, Set<string>>()),
    ])
    : [new Map<string, MkcTeam | null>(), new Map<string, { tag: string; url: string } | null>(), new Map<string, Set<string>>()];
  const mkcIds = [...mkcTeams.values()].flatMap((m) => (m ? rosterFor(m, game)?.players ?? [] : [])).map((p) => p.discordId).filter((v): v is string => !!v);
  const own = mkcIds.length ? await playerCardsById([...new Set(mkcIds)]).catch(() => new Map<string, PlayerCard>()) : new Map<string, PlayerCard>();

  const lines = teams.map((t) => {
    const keys = keysOf(t);
    return {
      team: t,
      rows: roster.filter((r) => r.team_id === t.id).map((r) => {
        // The player's own card counts the way tables read it: the one card with this in-game name that names this
        // team, else the only card anywhere with this in-game name.
        const claims = cards.filter((c) => (c.ingame_keys ?? []).includes(r.ingame_key));
        const onTeam = claims.filter((c) => (c.teams ?? []).some((g) => keys.has(tagKey(g))));
        const card = onTeam.length === 1 ? onTeam[0] : claims.length === 1 ? claims[0] : undefined;
        return { r, card: card && (card.shown || card.flag) ? card : undefined };
      }),
    };
  });
  const mkcFlags = [...mkcTeams.values()].flatMap((m) => (m ? rosterFor(m, game)?.players ?? [] : [])).map((p) => p.country);
  const ownFlags = [...own.values()].map((c) => c.flag);
  const flags = await flagsFor(guildId, [...lines.flatMap((l) => l.rows.flatMap(({ r, card }) => [r.flag, card?.flag])), ...mkcFlags, ...ownFlags].filter((f): f is string => !!f)).catch(() => ({} as Record<string, string>));
  const mk = new Map(played.filter((p) => p.logo && /^https:\/\/mkcentral\.com\//.test(p.logo)).map((p) => [tagKey(p.tag), p.logo!]));

  const view: TeamView[] = lines.map(({ team: t, rows }) => {
    const m = mkcTeams.get(t.id) ?? null;
    const teamLinks: TeamLinksView | null = links ? { source: t.logoSource ?? "auto", mkc: linkView(t, m, game), tagLogo: tagLogos.get(t.id) ?? null } : null;
    return {
      id: t.id,
      name: t.name,
      tags: t.tags,
      color: t.color,
      mkLogo: t.tags.map((g) => mk.get(tagKey(g))).find(Boolean) ?? null,
      players: rows.map(({ r, card }) => {
        // Tables read a line with a name or flag as it is; a line with neither falls back to the player's own card.
        const lineWins = !!(r.shown || r.flag);
        const shown = lineWins ? r.shown : card?.shown ?? null;
        const flag = lineWins ? r.flag : card?.flag ?? null;
        const setBy: SetBy = !lineWins && card ? "themselves" : r.source;
        return { id: r.id, ingame: r.ingame, shown, flag, flagUrl: flag ? flags[flag] ?? null : null, setBy, line: { shown: r.shown, flag: r.flag } };
      }),
      links: teamLinks,
      mkcPlayers: m ? mkcPlayersFor(m, game, roster.filter((r) => r.team_id === t.id), own, tapped.get(t.id) ?? new Set(), flags) : null,
      logoColor: null,
    };
  });

  // The color tables pick from each team's logo (the logo a table shows, the way logoNow picks it), for cards without
  // their own color.
  const uploads = await listLogos(guildId).catch(() => []);
  await Promise.all(view.map(async (t) => {
    if (t.color) return;
    const upload = ownLogo(t.tags, uploads)?.url ?? null;
    const url = t.links ? logoNow(t.links.source, { upload, linked: t.links.mkc ? { name: t.links.mkc.name, logo: t.links.mkc.logo } : null, tagLogo: t.links.tagLogo }).url : upload ?? t.mkLogo;
    t.logoColor = url ? await withTimeout(logoColor(url).catch(() => null), 2500, null) : null;
  }));

  return {
    teams: view,
    played: played.filter((p) => !teamCardFor(teams, p.tag, p.name)).slice(0, 8).map((p) => ({ tag: p.tag, name: p.name })),
    readsLike,
    games,
    tracks: { mk8dx: trackList("mk8dx"), mkworld: trackList("mkworld"), mkwii: trackList("mkwii") },
    nicks: await trackNickViews(guildId, games),
    linksReady: links,
  };
}

/** A team card, only when it's this server's. */
export async function teamIn(guildId: string, id: unknown): Promise<TeamCardRow | null> {
  if (typeof id !== "string") return null;
  return (await listTeams(guildId)).find((t) => t.id === id) ?? null;
}

/** An MKCentral player on a linked card's MKCentral team (any game), or null. For tying a typed line to them. */
export async function mkcPlayerOn(team: TeamCardRow, raw: unknown): Promise<number | null> {
  const id = typeof raw === "number" ? raw : Number(String(raw ?? ""));
  if (!team.mkcTeamId || !Number.isInteger(id) || id <= 0 || !(await linksReady())) return null;
  const m = await withTimeout(mkcTeam(team.mkcTeamId), 3500, null);
  return m?.rosters.some((r) => r.players.some((p) => p.id === id)) ? id : null;
}

/** A player line, only when it's this server's. */
export async function rosterRowIn(guildId: string, id: unknown): Promise<{ id: string; teamId: string } | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || !(await cardsReady())) return null;
  const { data } = await createServiceClient().from("war_roster").select("id, team_id, guild_id").eq("id", id).maybeSingle();
  const row = data as { id: string; team_id: string; guild_id: string } | null;
  return row && row.guild_id === guildId ? { id: row.id, teamId: row.team_id } : null;
}

const cleanName = (v: unknown) => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 32); return s || null; };

export type RosterEdit = "ok" | "gone" | "bad_name" | "bad_flag" | "taken";

/**
 * One player's line exactly as typed: a blank name for tables or flag clears it, a new in-game name renames the line
 * (refused when the team already lists that name). Becomes the server's own line (captain).
 */
export async function updateRosterRow(guildId: string, id: string, input: { ingame: unknown; shown: unknown; flag: unknown }): Promise<RosterEdit> {
  const row = await rosterRowIn(guildId, id);
  if (!row) return "gone";
  const ingame = cleanName(input.ingame);
  const key = ingame ? tagKey(ingame).slice(0, 32) : "";
  if (!ingame || !key) return "bad_name";
  const flagText = String(input.flag ?? "").trim();
  const flag = flagText ? cleanFlagText(flagText) : null;
  if (flagText && !flag) return "bad_flag";
  const shownRaw = cleanName(input.shown);
  const shown = shownRaw && shownRaw !== ingame ? shownRaw : null;
  const db = createServiceClient();
  const { data: other } = await db.from("war_roster").select("id").eq("team_id", row.teamId).eq("ingame_key", key).neq("id", id).maybeSingle();
  if (other) return "taken";
  const { error } = await db.from("war_roster").update({ ingame, ingame_key: key, shown, flag, source: "captain", updated_at: new Date().toISOString() }).eq("id", id);
  return error ? "taken" : "ok";
}

/**
 * The link search: MKCentral teams matching a tag or name (the game's roster first), or the one team a pasted
 * MKCentral link points at. The first few are read in full for their player counts (a 10-minute copy each).
 */
export async function searchMkcView(q: string, game: WarGame): Promise<{ hits: MkcHitView[]; byLink: boolean }> {
  const text = q.trim().slice(0, 200);
  if (!text) return { hits: [], byLink: false };
  const link = /mkcentral\.com|[?&]id=/i.test(text) ? mkcIdFrom(text) : null;
  const hit = (t: MkcTeam): MkcHitView => {
    const r = rosterFor(t, game);
    return { id: t.id, name: r?.name || t.name, tag: r?.tag || t.tag, logo: t.logo, game: r ? game : null, players: r ? r.players.length : null };
  };
  if (link) {
    const t = await withTimeout(mkcTeam(link), 3500, null);
    return { hits: t ? [hit(t)] : [], byLink: true };
  }
  const found = await searchMkcTeams(text, game).catch(() => []);
  const counted = await Promise.all(found.slice(0, 6).map(async (h) => {
    if (!h.game) return h;
    const t = await withTimeout(mkcTeam(h.id), 2500, null);
    const r = t ? rosterFor(t, game) : null;
    return r ? { ...h, players: r.players.length } : h;
  }));
  const hits = [...counted, ...found.slice(6)].map((h): MkcHitView => ({ id: h.id, name: h.name, tag: h.tag, logo: h.logo, game: h.game ? game : null, players: h.players }));
  return { hits, byLink: false };
}
