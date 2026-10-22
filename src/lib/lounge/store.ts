import "server-only";

/**
 * Lounge links and the lounge page's data (server). A GameShuffle account is
 * confirmed as a lounge player by its linked Discord account: MKCentral keeps
 * every player's Discord id, so `confirmLounge` looks the account up in each
 * lounge game and stores what it finds in `lounge_links` (supabase/lounge-m1.sql).
 * Confirmed players get an indexed page and a place on the GameShuffle boards;
 * anyone else looked up gets a page kept out of search.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDayStart, gsWeekStart } from "@/lib/time/gsClock";
import { countryCountAbove, loungeBasic, loungePlayer, loungeStats, unverifiedTables, type LoungePlayer } from "@/lib/mmr/mkcentral";
import { pendingFor, type MmrPending } from "./pending";
import { MMR_GAME_IDS, standing, type MmrChange, type MmrGame } from "@/lib/mmr/rules";
import { LOUNGE_FIRST_SEASON, partners as partnerRows, seasonList, seasonSeries, sharedSeason, thinSeries, type CareerSeason } from "./season";

export interface LoungeLink {
  userId: string;
  game: MmrGame;
  playerId: number;
  name: string;
  country: string | null;
  mmr: number | null;
  maxMmr: number | null;
  division: string | null;
  worldRank: number | null;
  events: number;
  weekMmr: number | null;
  weekOf: string | null;
  confirmedAt: string;
  checkedAt: string | null;
  postedDivision: string | null;
}

const COLS = "user_id, game, player_id, name, country, mmr, max_mmr, division, world_rank, events, week_mmr, week_of, confirmed_at, checked_at, posted_division";
type Row = {
  user_id: string; game: MmrGame; player_id: number; name: string; country: string | null; mmr: number | null; max_mmr: number | null;
  division: string | null; world_rank: number | null; events: number; week_mmr: number | null; week_of: string | null;
  confirmed_at: string; checked_at: string | null; posted_division: string | null;
};
const fromRow = (r: Row): LoungeLink => ({
  userId: r.user_id, game: r.game, playerId: r.player_id, name: r.name, country: r.country, mmr: r.mmr, maxMmr: r.max_mmr,
  division: r.division, worldRank: r.world_rank, events: r.events, weekMmr: r.week_mmr, weekOf: r.week_of,
  confirmedAt: r.confirmed_at, checkedAt: r.checked_at, postedDivision: r.posted_division,
});

/** Is the table there? Missing = the migration hasn't run; everything reads as "nobody confirmed". */
function missing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || /lounge_links/.test(error.message ?? "") && /does not exist|schema cache/.test(error.message ?? ""));
}

export async function linksFor(userId: string): Promise<LoungeLink[]> {
  const { data, error } = await createServiceClient().from("lounge_links").select(COLS).eq("user_id", userId);
  if (error) { if (!missing(error)) console.error("[lounge] linksFor:", error.message); return []; }
  return ((data ?? []) as Row[]).map(fromRow);
}

/** Who on GameShuffle a lounge player is, if they've confirmed. */
export async function linkByPlayer(game: MmrGame, playerId: number): Promise<(LoungeLink & { username: string | null; displayName: string | null }) | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("lounge_links").select(COLS).eq("game", game).eq("player_id", playerId).maybeSingle();
  if (error || !data) { if (error && !missing(error)) console.error("[lounge] linkByPlayer:", error.message); return null; }
  const link = fromRow(data as Row);
  const { data: u } = await db.from("users").select("username, display_name, is_public").eq("id", link.userId).maybeSingle();
  const user = u as { username: string | null; display_name: string | null; is_public: boolean | null } | null;
  return { ...link, username: user?.is_public === false ? null : user?.username ?? null, displayName: user?.display_name ?? null };
}

/** The highest division already posted this season, as stored in `posted_division` ("3:Platinum"). */
export const postedKey = (season: number | null, division: string) => `${season ?? 0}:${division}`;

/** The number at the start of this Pacific week, from the season's changes (newest first). */
export function weekStartMmr(changes: MmrChange[], weekStartIso: string): number | null {
  const start = Date.parse(weekStartIso);
  const before = changes.find((c) => Date.parse(c.at) < start);
  if (before) return before.mmr;
  const oldest = changes[changes.length - 1];
  return oldest ? oldest.mmr - (oldest.reason === "Placement" ? 0 : oldest.delta) : null;
}

/** Fresh numbers for a link from a full player read (the 15-minute check and every page view of a confirmed player). */
export function linkUpdate(player: LoungePlayer, link: Pick<LoungeLink, "weekOf" | "weekMmr"> | null): Record<string, unknown> {
  const weekOf = gsWeekStart();
  const update: Record<string, unknown> = {
    name: player.name, country: player.country, mmr: player.mmr, max_mmr: player.maxMmr, division: player.division,
    world_rank: player.worldRank, events: player.eventsPlayed, checked_at: new Date().toISOString(),
  };
  if (!link || link.weekOf !== weekOf || link.weekMmr == null) {
    // Midnight Monday, Pacific.
    update.week_of = weekOf;
    update.week_mmr = weekStartMmr(player.changes, gsDayStart(weekOf).toISOString());
  }
  return update;
}

/** Confirm an account in every lounge game its Discord account plays. Returns the links it has now.
 *  `no_discord` = the account has no Discord linked (the page asks them to link it). */
export async function confirmLounge(userId: string): Promise<{ links: LoungeLink[]; error?: "no_discord" | "unavailable" }> {
  const db = createServiceClient();
  const { data: u } = await db.from("users").select("discord_id").eq("id", userId).maybeSingle();
  const discordId = (u as { discord_id: string | null } | null)?.discord_id ?? null;
  if (!discordId) return { links: await linksFor(userId), error: "no_discord" };
  const existing = new Map((await linksFor(userId)).map((l) => [l.game, l]));
  let unavailable = false;
  for (const game of MMR_GAME_IDS) {
    let basic;
    try { basic = await loungeBasic({ discordId }, game, { fresh: true }); } catch { unavailable = true; continue; }
    if (!basic) {
      // The lounge no longer ties this Discord account to the player: drop the link.
      if (existing.has(game)) await db.from("lounge_links").delete().eq("user_id", userId).eq("game", game);
      continue;
    }
    let player: LoungePlayer | null = null;
    try { player = await loungePlayer({ id: basic.playerId }, game, { fresh: true }); } catch { unavailable = true; }
    const prev = existing.get(game) ?? null;
    const row = {
      user_id: userId, game, player_id: basic.playerId, name: basic.name, country: basic.country, mmr: basic.mmr,
      ...(player ? linkUpdate(player, prev && prev.playerId === basic.playerId ? prev : null) : {}),
      // A new confirmation records where they are now, so the first rank-up post is the next division up.
      ...(prev && prev.playerId === basic.playerId ? {} : { confirmed_at: new Date().toISOString(), posted_division: player?.division ? postedKey(player.season, player.division) : null }),
    };
    // Another account confirmed this player before (a Discord account moved): the newest confirmation wins.
    await db.from("lounge_links").delete().eq("game", game).eq("player_id", basic.playerId).neq("user_id", userId);
    const { error } = await db.from("lounge_links").upsert(row, { onConflict: "user_id,game" });
    if (error && !missing(error)) console.error("[lounge] confirm:", error.message);
  }
  return { links: await linksFor(userId), error: unavailable ? "unavailable" : undefined };
}

// ── The lounge page ─────────────────────────────────────────────────────

export interface PartnerView { playerId: number; name: string; events: number; wins: number; losses: number; net: number; formats: string[]; averageScore: number | null }

export interface LoungeProfile {
  /** The season shown (the current one unless a past season was asked for). */
  player: LoungePlayer;
  /** The player's current season (their id, name and registry link come from here). */
  current: LoungePlayer;
  /** The season shown, the current season, and every season the picker offers (newest first). */
  season: number | null;
  currentSeason: number | null;
  seasons: number[];
  isCurrent: boolean;
  /** False when a past season had no event for this player ("Didn't play"). */
  played: boolean;
  division: string;
  next: { name: string; at: number } | null;
  toNext: number | null;
  pct: number;
  steps: { name: string; at: number }[];
  /** Players with an event that season (for "top 0.4%"). */
  totalPlayers: number | null;
  countryRank: number | null;
  partners: PartnerView[];
  /** userId is for server pages only (the owner's own view); never send it to the browser. */
  confirmed: { userId: string; username: string | null; displayName: string | null } | null;
  /** A submitted table staff haven't verified yet (current season only). */
  pending: MmrPending | null;
}

/** Everything the lounge page shows for one player in one game. null = no such player. Throws LoungeUnavailable.
 *  `season` shows a finished season instead (its reads are kept for good); one out of range shows the current. */
export async function loungeProfile(who: { id?: number | null; name?: string | null }, game: MmrGame, opts: { season?: number | null } = {}): Promise<LoungeProfile | null> {
  const current = await loungePlayer(who, game);
  if (!current) return null;
  const cur = current.season;
  const want = opts.season ?? null;
  const past = want != null && cur != null && want >= LOUNGE_FIRST_SEASON[game] && want < cur;
  const seasonOpts = past ? { season: want, final: true } : {};
  const [read, stats, link] = await Promise.all([
    past ? loungePlayer({ id: current.playerId }, game, seasonOpts) : Promise.resolve(current),
    loungeStats(game, seasonOpts),
    linkByPlayer(game, current.playerId),
  ]);
  // A season the player skipped: MKCentral answers with no events (or not at all).
  const player: LoungePlayer = read ?? { ...current, season: want, mmr: null, maxMmr: null, division: null, worldRank: null, eventsPlayed: 0, winRate: null, averageScore: null, noSqAverageScore: null, largestGain: null, largestGainTableId: null, largestLoss: null, largestLossTableId: null, winsLastTen: null, lossesLastTen: null, averageLastTen: null, partnerAverage: null, changes: [] };
  const played = player.eventsPlayed > 0 || !past;
  const steps = stats.steps;
  const st = standing(player.mmr, steps, player.division);
  const top = partnerRows(player.changes, 8);
  const [countryAbove, names, waiting] = await Promise.all([
    player.country && player.mmr != null && player.eventsPlayed > 0 ? countryCountAbove(game, player.country, player.mmr + 1, seasonOpts) : Promise.resolve(null),
    Promise.all(top.map((p) => loungeBasic({ id: p.playerId }, game).catch(() => null))),
    past ? Promise.resolve([]) : unverifiedTables(game).catch(() => []),
  ]);
  const known = new Set(player.changes.map((c) => c.id));
  const table = waiting.find((t) => !known.has(t.id) && t.teams.some((tm) => tm.scores.some((s) => s.playerId === player.playerId)));
  if (link) {
    // A confirmed player's page view is also a check: the boards stay fresh between the 15-minute runs.
    void createServiceClient().from("lounge_links").update(linkUpdate(current, link)).eq("user_id", link.userId).eq("game", game).then(() => undefined);
  }
  return {
    player,
    current,
    season: past ? want : cur,
    currentSeason: cur,
    seasons: seasonList(game, cur),
    isCurrent: !past,
    played,
    division: st.division,
    next: st.next,
    toNext: st.toNext,
    pct: st.pct,
    steps,
    totalPlayers: stats.totalPlayers,
    countryRank: countryAbove == null ? null : countryAbove + 1,
    partners: top.map((p, i) => ({ ...p, name: names[i]?.name ?? `Player ${p.playerId}` })),
    confirmed: link ? { userId: link.userId, username: link.username, displayName: link.displayName } : null,
    pending: table ? pendingFor(table, player.playerId) : null,
  };
}

/** Run `fn` over `items` a few at a time (polite to MKCentral on a first career read). */
async function inTurn<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** Every season of a player's career in one game, oldest first, from their current read. Past seasons
 *  are read once and kept (three at a time the first time); a season with no events shows as not played.
 *  Throws LoungeUnavailable when MKCentral doesn't answer (nothing half-read is kept). */
export async function loungeCareer(current: LoungePlayer, game: MmrGame): Promise<CareerSeason[]> {
  const cur = current.season;
  if (cur == null) return [];
  const seasons = seasonList(game, cur).reverse();
  return inTurn(seasons, 3, async (season): Promise<CareerSeason> => {
    const now = season === cur;
    const opts = now ? {} : { season, final: true };
    const [p, stats] = await Promise.all([
      now ? Promise.resolve(current) : loungePlayer({ id: current.playerId }, game, opts),
      loungeStats(game, opts),
    ]);
    const played = !!p && p.eventsPlayed > 0;
    return {
      season,
      current: now,
      shared: sharedSeason(game, season),
      played,
      mmr: p?.mmr ?? null,
      maxMmr: p?.maxMmr ?? null,
      division: p?.division ?? null,
      events: p?.eventsPlayed ?? 0,
      winRate: p?.winRate ?? null,
      worldRank: played ? p?.worldRank ?? null : null,
      series: played && p ? thinSeries(seasonSeries(p.changes).map((x) => x.mmr)) : [],
      steps: stats.steps,
    };
  });
}

// ── GameShuffle boards ──────────────────────────────────────────────────

export type BoardScope = "everyone" | "friends" | "crew" | "country";
export interface BoardRow { userId: string; name: string; username: string | null; mmr: number | null; division: string | null; week: number | null; me: boolean; country: string | null }

/** Confirmed players in one game, for a scope seen by a viewer (friends = you and who you follow; crew = people on a crew with you). */
export async function boardRows(game: MmrGame, scope: BoardScope, viewerId: string | null, limit = 50): Promise<{ rows: BoardRow[]; country: string | null }> {
  const db = createServiceClient();
  let ids: string[] | null = null;
  let country: string | null = null;
  if (scope === "friends" || scope === "crew") {
    if (!viewerId) return { rows: [], country };
    if (scope === "friends") {
      const { data } = await db.from("follows").select("followee_user_id").eq("follower_user_id", viewerId);
      ids = [viewerId, ...((data ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id)];
    } else {
      const { data: mine } = await db.from("community_crew_members").select("community_id").eq("user_id", viewerId);
      const comms = [...new Set(((mine ?? []) as { community_id: string }[]).map((r) => r.community_id))];
      if (!comms.length) return { rows: [], country };
      const { data: members } = await db.from("community_crew_members").select("user_id").in("community_id", comms);
      ids = [...new Set(((members ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    }
  }
  if (scope === "country") {
    if (!viewerId) return { rows: [], country };
    const { data } = await db.from("lounge_links").select("country").eq("user_id", viewerId).eq("game", game).maybeSingle();
    country = (data as { country: string | null } | null)?.country ?? null;
    if (!country) return { rows: [], country };
  }
  let q = db.from("lounge_links").select("user_id, name, mmr, division, week_mmr, country").eq("game", game).not("mmr", "is", null).order("mmr", { ascending: false }).limit(limit);
  if (ids) q = q.in("user_id", ids.slice(0, 500));
  if (country) q = q.eq("country", country);
  const { data, error } = await q;
  if (error) { if (!missing(error)) console.error("[lounge] board:", error.message); return { rows: [], country }; }
  const list = (data ?? []) as Array<{ user_id: string; name: string; mmr: number | null; division: string | null; week_mmr: number | null; country: string | null }>;
  const users = list.length ? (await db.from("users").select("id, username, is_public").in("id", list.map((r) => r.user_id))).data ?? [] : [];
  const handle = new Map((users as { id: string; username: string | null; is_public: boolean | null }[]).map((u) => [u.id, u.is_public === false ? null : u.username]));
  return {
    country,
    rows: list.map((r) => ({
      userId: r.user_id, name: r.name, username: handle.get(r.user_id) ?? null, mmr: r.mmr, division: r.division, country: r.country,
      week: r.mmr != null && r.week_mmr != null ? r.mmr - r.week_mmr : null, me: r.user_id === viewerId,
    })),
  };
}

/** This week's biggest climbers among confirmed players in a game. */
export async function climbers(game: MmrGame, limit = 8): Promise<BoardRow[]> {
  const { rows } = await boardRows(game, "everyone", null, 500);
  return rows.filter((r) => (r.week ?? 0) > 0).sort((a, b) => (b.week ?? 0) - (a.week ?? 0)).slice(0, limit);
}

// ── How you play (from the copied tables, supabase/lounge-m2.sql) ─────────

export interface RoomRecord { events: number; aboveShare: number; averagePlaces: number }

/** How a player finished against the room's ratings this season: the share of events they beat
 *  their likely place, and by how many places on average (positive = better). Null without tables. */
export async function againstRoomFor(game: MmrGame, playerId: number, season: number | null): Promise<RoomRecord | null> {
  const { likelyPlaces } = await import("./odds");
  const db = createServiceClient();
  const { data: mine, error } = await db.from("lounge_table_players").select("table_id, team_index, team_rank, lounge_tables!inner(season)").eq("game", game).eq("player_id", playerId).eq("lounge_tables.season", season ?? 0).limit(1000);
  if (error || !mine?.length) return null;
  const myRows = mine as unknown as { table_id: number; team_index: number; team_rank: number | null }[];
  const ids = myRows.map((r) => r.table_id);
  const rows: { table_id: number; team_index: number; prev_mmr: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const { data } = await db.from("lounge_table_players").select("table_id, team_index, prev_mmr").in("table_id", ids.slice(i, i + 75)).limit(1000);
    rows.push(...((data ?? []) as typeof rows));
  }
  const byTable = new Map<number, Map<number, number[]>>();
  for (const r of rows) {
    if (r.prev_mmr == null) continue;
    const teams = byTable.get(r.table_id) ?? new Map<number, number[]>();
    teams.set(r.team_index, [...(teams.get(r.team_index) ?? []), r.prev_mmr]);
    byTable.set(r.table_id, teams);
  }
  let events = 0, above = 0, total = 0;
  for (const me of myRows) {
    const teams = byTable.get(me.table_id);
    if (!teams || me.team_rank == null || !teams.has(me.team_index)) continue;
    const order = [...teams.keys()];
    const ratings = order.map((k) => { const v = teams.get(k)!; return v.reduce((a, b) => a + b, 0) / v.length; });
    const likely = likelyPlaces(ratings)[order.indexOf(me.team_index)];
    const diff = likely - me.team_rank;
    events++; total += diff; if (diff > 0) above++;
  }
  return events ? { events, aboveShare: above / events, averagePlaces: total / events } : null;
}

export interface Rival { playerId: number; name: string; events: number; ahead: number; behind: number }

/** The players someone met most as opponents this season, with the record against each. */
export async function rivalsFor(game: MmrGame, playerId: number, season: number | null, limit = 6): Promise<Rival[]> {
  const { data, error } = await createServiceClient().rpc("lounge_rivals", { p_game: game, p_player: playerId, p_season: season ?? 0, p_limit: limit });
  if (error) return [];
  return ((data ?? []) as { player_id: number; name: string; events: number; ahead: number; behind: number }[])
    .map((r) => ({ playerId: r.player_id, name: r.name, events: Number(r.events), ahead: Number(r.ahead), behind: Number(r.behind) }));
}
