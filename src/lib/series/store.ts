import "server-only";

/**
 * Team series, server side (supabase/series-m1.sql). Loads a series with its teams, players and nights,
 * works out each night from its tournament (src/lib/series/rules.ts), and builds the page's view.
 *
 * Nothing runs on a timer: every read of a live series ticks it (a draft turn whose clock ran out is picked
 * at random, predictions lock once a night's first race is in and settle once its last is), and the
 * every-minute sweep (/api/cron/polls-sweep) is the backstop. Every write is guarded (the draft by its
 * version, predictions by their status), so readers racing each other land once.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { TournamentRace } from "@/lib/tournaments/scoring";
import { applyPick, draftPool, onClock, randomPick, readDraft, timedOut, turnDeadline, turnTeams, type DraftState } from "./draft";
import {
  bestCreator, championFromResults, inkOn, mostImproved, nightResult, seriesTotal,
  type NightParticipant, type NightResult, type PlayerRole, type SeriesStatus, type SeriesTeamLite,
} from "./rules";
import { playerCards } from "./cards";
import { readSettings, type DraftView, type NightView, type PlayView, type SeriesView } from "./view";

export interface SeriesDb {
  id: string; slug: string; title: string; tagline: string | null; game_slug: string; status: SeriesStatus;
  settings: Record<string, unknown>; champion_team_id: string | null; crowned_at: string | null; created_at: string; updated_at: string;
}
export interface TeamDb { id: string; series_id: string; n: number; name: string; tag: string; color: string; look: string | null }
export interface PlayerDb {
  id: string; series_id: string; team_id: string; user_id: string | null; name: string; role: PlayerRole; hours: number | null;
  kart_config_id: string | null; pov: "none" | "sent" | "checked"; pov_note: string | null; reminded_at: string | null; created_at: string;
}
export interface NightDb {
  id: string; series_id: string; n: number; label: string; starts_at: string | null; tournament_id: string | null;
  host_team_id: string | null; counts: boolean; draft: Record<string, unknown>; draft_version: number;
}

export const SERIES_COLS = "id, slug, title, tagline, game_slug, status, settings, champion_team_id, crowned_at, created_at, updated_at";
export const TEAM_COLS = "id, series_id, n, name, tag, color, look";
export const PLAYER_COLS = "id, series_id, team_id, user_id, name, role, hours, kart_config_id, pov, pov_note, reminded_at, created_at";
export const NIGHT_COLS = "id, series_id, n, label, starts_at, tournament_id, host_team_id, counts, draft, draft_version";

export interface Loaded { series: SeriesDb; teams: TeamDb[]; players: PlayerDb[]; nights: NightDb[] }

let ready: { at: number; ok: boolean } | null = null;
/** Whether series-m1.sql has run (checked once a minute). */
export async function seriesReady(): Promise<boolean> {
  if (ready && (ready.ok || Date.now() - ready.at < 60_000)) return ready.ok;
  const { error } = await createServiceClient().from("gs_series").select("id").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

export async function loadSeries(by: { slug?: string; id?: string }): Promise<Loaded | null> {
  if (!by.slug && !by.id) return null;
  const admin = createServiceClient();
  let q = admin.from("gs_series").select(SERIES_COLS);
  q = by.id ? q.eq("id", by.id) : q.eq("slug", by.slug!.toLowerCase());
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  const series = data as SeriesDb;
  const [t, p, n] = await Promise.all([
    admin.from("gs_series_teams").select(TEAM_COLS).eq("series_id", series.id).order("n"),
    admin.from("gs_series_players").select(PLAYER_COLS).eq("series_id", series.id).order("created_at"),
    admin.from("gs_series_nights").select(NIGHT_COLS).eq("series_id", series.id).order("n"),
  ]);
  return { series, teams: (t.data ?? []) as TeamDb[], players: (p.data ?? []) as PlayerDb[], nights: (n.data ?? []) as NightDb[] };
}

export const teamsLite = (l: Loaded): SeriesTeamLite[] => l.teams.map((t) => ({ id: t.id, n: t.n, name: t.name, tag: t.tag, color: t.color }));

export interface TournamentLite { id: string; title: string; status: string; raceCount: number }
export interface NightData { night: NightDb; result: NightResult | null; tournament: TournamentLite | null; participants: (NightParticipant & { tournament_id: string })[] }

/** Each night's tournament, its participants and races, worked into standings. */
export async function loadNights(l: Loaded): Promise<Map<string, NightData>> {
  const out = new Map<string, NightData>();
  const tids = l.nights.flatMap((n) => (n.tournament_id ? [n.tournament_id] : []));
  type T = { id: string; title: string; status: string; scoring_table: number[] | null; settings: { raceCount?: number } | null };
  type P = NightParticipant & { tournament_id: string };
  type R = TournamentRace & { tournament_id: string };
  let ts: T[] = [], ps: P[] = [], rs: R[] = [];
  if (tids.length) {
    const admin = createServiceClient();
    const [tRes, pRes, rRes] = await Promise.all([
      admin.from("tournaments").select("id, title, status, scoring_table, settings").in("id", tids),
      admin.from("tournament_participants").select("id, tournament_id, display_name, team, user_id, status").in("tournament_id", tids),
      admin.from("tournament_races").select("id, tournament_id, race_number, placements").in("tournament_id", tids),
    ]);
    ts = (tRes.data ?? []) as T[]; ps = (pRes.data ?? []) as P[]; rs = (rRes.data ?? []) as R[];
  }
  const teams = teamsLite(l);
  for (const night of l.nights) {
    const t = ts.find((x) => x.id === night.tournament_id) ?? null;
    if (!t) { out.set(night.id, { night, result: null, tournament: null, participants: [] }); continue; }
    const participants = ps.filter((p) => p.tournament_id === t.id);
    const raceCount = Math.max(1, Number(t.settings?.raceCount) || 12);
    const result = nightResult({ teams, participants, races: rs.filter((r) => r.tournament_id === t.id), scoringTable: t.scoring_table, raceCount, tournamentStatus: t.status });
    out.set(night.id, { night, result, tournament: { id: t.id, title: t.title, status: t.status, raceCount }, participants });
  }
  return out;
}

/** Writes a night's draft if nobody else wrote it first. */
export async function writeDraft(nightId: string, version: number, draft: DraftState): Promise<boolean> {
  const { data } = await createServiceClient().from("gs_series_nights")
    .update({ draft, draft_version: version + 1 }).eq("id", nightId).eq("draft_version", version).select("id");
  return !!data?.length;
}

/** Moves a live series along: timed-out draft turns, predictions to lock or settle. True when something changed. */
export async function tickSeries(l: Loaded, data: Map<string, NightData>): Promise<boolean> {
  if (l.series.status !== "live" && l.series.status !== "announced") return false;
  let changed = false;
  for (const night of l.nights) {
    const d = readDraft(night.draft);
    if (!d || d.status !== "running" || !timedOut(d)) continue;
    const team = onClock(d);
    const pick = randomPick(d, `${night.id}:${d.turns.length}`);
    if (!team || !pick) continue;
    if (await writeDraft(night.id, night.draft_version, applyPick(d, team, pick.ban, pick.protect, null, true))) changed = true;
  }
  const { syncPredictions } = await import("./predictions");
  if (await syncPredictions(l, data).catch((e) => { console.error("[series] predictions tick failed:", e); return false; })) changed = true;
  return changed;
}

function draftView(d: DraftState | null): DraftView | null {
  if (!d) return null;
  return {
    status: d.status, bank: d.bank, target: d.target, turnSeconds: d.turnSeconds, order: d.order, turnTeams: turnTeams(d),
    turns: d.turns.map((t) => ({ team: t.team, ban: t.ban, protect: t.protect, auto: t.auto })),
    onClock: onClock(d), deadline: turnDeadline(d), pausedLeft: d.pausedLeft, rolledAt: d.rolledAt,
  };
}

/** Which series player a tournament row is: by account, else by name. */
export function playerFor(players: PlayerDb[], row: { userId?: string | null; user_id?: string | null; name?: string; display_name?: string }): PlayerDb | null {
  const uid = row.userId ?? row.user_id ?? null;
  const name = (row.name ?? row.display_name ?? "").trim().toLowerCase();
  return (uid ? players.find((p) => p.user_id === uid) : null) ?? players.find((p) => p.name.trim().toLowerCase() === name) ?? null;
}

async function buildView(l: Loaded, data: Map<string, NightData>): Promise<SeriesView> {
  const settings = readSettings(l.series.settings);
  const admin = createServiceClient();
  const cards = await playerCards(l.series.id, l.players);
  const teams = l.teams.map((t) => ({
    id: t.id, n: t.n, name: t.name, tag: t.tag, color: t.color, ink: inkOn(t.color), look: t.look,
    players: cards.filter((c) => c.teamId === t.id).sort((a, b) => (a.role === b.role ? 0 : a.role === "competitive" ? -1 : 1)),
  }));
  const nights: NightView[] = l.nights.map((night) => {
    const nd = data.get(night.id);
    const d = readDraft(night.draft);
    const r = nd?.result ?? null;
    return {
      id: night.id, n: night.n, label: night.label, startsAt: night.starts_at, counts: night.counts, hostTeamId: night.host_team_id,
      tournamentId: night.tournament_id, state: r?.state ?? "upcoming", racesDone: r?.racesDone ?? 0, racesTotal: r?.racesTotal ?? nd?.tournament?.raceCount ?? 12,
      teams: r?.teams ?? [],
      players: (r?.players ?? []).map((p) => ({ playerId: playerFor(l.players, p)?.id ?? null, name: p.name, team: p.team, points: p.points })),
      draft: draftView(d), pool: d?.status === "done" ? draftPool(d) : null,
    };
  });
  const lite = teamsLite(l);
  const counted = l.nights.map((n) => ({ counts: n.counts, result: data.get(n.id)?.result ?? null }));
  const total = seriesTotal(lite, counted);

  // Points per player over the counted nights (for best creator).
  const points = new Map<string, number>();
  for (const n of nights) if (n.counts) for (const p of n.players) if (p.playerId) points.set(p.playerId, (points.get(p.playerId) ?? 0) + p.points);
  const finished = l.nights.filter((n) => data.get(n.id)?.result?.state === "done");
  const allDone = l.nights.length > 0 && finished.length === l.nights.length;

  const [{ predictionViews }, playsRes, votesRes] = await Promise.all([
    import("./predictions"),
    admin.from("gs_series_plays").select("id, title, url, player_id, night_id, sort").eq("series_id", l.series.id).order("sort").order("created_at"),
    admin.from("gs_series_play_votes").select("play_id").eq("series_id", l.series.id),
  ]);
  const votes = new Map<string, number>();
  for (const v of (votesRes.data ?? []) as { play_id: string }[]) votes.set(v.play_id, (votes.get(v.play_id) ?? 0) + 1);
  const plays: PlayView[] = ((playsRes.data ?? []) as { id: string; title: string; url: string; player_id: string | null; night_id: string | null }[])
    .map((p) => ({ id: p.id, title: p.title, url: p.url, playerId: p.player_id, nightId: p.night_id, votes: votes.get(p.id) ?? 0 }));
  const topPlays = [...plays].sort((a, b) => b.votes - a.votes);
  const bestPlay = topPlays[0] && topPlays[0].votes > 0 && (!topPlays[1] || topPlays[1].votes < topPlays[0].votes) ? { playId: topPlays[0].id, votes: topPlays[0].votes } : null;

  return {
    id: l.series.id, slug: l.series.slug, title: l.series.title, tagline: l.series.tagline, status: l.series.status, game: l.series.game_slug,
    crownedAt: l.series.crowned_at, teams, nights, total,
    rules: settings.rules, faq: settings.faq, discordUrl: settings.discordUrl,
    predictions: await predictionViews(l.series.id),
    plays,
    awards: {
      champion: l.series.champion_team_id,
      leader: championFromResults(lite, counted),
      bestCreator: allDone ? bestCreator(l.players.map((p) => ({ id: p.id, role: p.role, points: points.get(p.id) ?? 0 }))) : null,
      mostImproved: nights.length >= 2 ? mostImproved(data.get(l.nights[0].id)?.result ?? null, data.get(l.nights[l.nights.length - 1].id)?.result ?? null) : null,
      bestPlay,
    },
    now: Date.now(),
  };
}

const viewCache = new Map<string, { at: number; view: SeriesView }>();
const VIEW_TTL = 1500;

/** Drops a series' cached view (after an organizer or a player changes something). */
export function forgetView(slug: string): void {
  for (const k of [...viewCache.keys()]) if (k.startsWith(`${slug}:`)) viewCache.delete(k);
}

/**
 * The page's view of a series (ticking it first). A draft series is only for staff. Cached a moment per
 * server, since twelve overlays and the page all read it every few seconds.
 */
export async function seriesView(slug: string, opts: { staff?: boolean; fresh?: boolean } = {}): Promise<SeriesView | null> {
  const key = `${slug.toLowerCase()}:${opts.staff ? 1 : 0}`;
  const hit = viewCache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.at < VIEW_TTL) return hit.view;
  let l = await loadSeries({ slug });
  if (!l) return null;
  if (l.series.status === "draft" && !opts.staff) return null;
  let data = await loadNights(l);
  if (await tickSeries(l, data)) {
    l = (await loadSeries({ id: l.series.id })) ?? l;
    data = await loadNights(l);
  }
  const view = await buildView(l, data);
  viewCache.set(key, { at: Date.now(), view });
  if (viewCache.size > 40) viewCache.delete(viewCache.keys().next().value as string);
  return view;
}

/** Every minute: ticks the series that are on (in case nobody has the page or an overlay open). */
export async function sweepSeries(): Promise<number> {
  if (!(await seriesReady())) return 0;
  const { data } = await createServiceClient().from("gs_series").select("id").in("status", ["announced", "live"]).limit(20);
  let moved = 0;
  for (const s of (data ?? []) as { id: string }[]) {
    const l = await loadSeries({ id: s.id });
    if (!l) continue;
    if (await tickSeries(l, await loadNights(l))) { moved += 1; forgetView(l.series.slug); }
  }
  return moved;
}

// ── Who's who ─────────────────────────────────────────────────────────────────────────────────────

/** The series player an account is, in a series. */
export function playerOf(l: Loaded, userId: string | null | undefined): PlayerDb | null {
  return userId ? l.players.find((p) => p.user_id === userId) ?? null : null;
}

const pieceCache = new Map<string, { at: number; value: { slug: string; teamId: string } | null }>();
/**
 * For the GameShuffle overlay's 2-second read: the live series this streamer plays in, and their team, so
 * the overlay's series piece can show it (cached 30s).
 */
export async function seriesPieceFor(userId: string): Promise<{ slug: string; teamId: string } | null> {
  const hit = pieceCache.get(userId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  let value: { slug: string; teamId: string } | null = null;
  try {
    if (await seriesReady()) {
      const { data } = await createServiceClient().from("gs_series_players").select("team_id, gs_series!inner(slug, status)")
        .eq("user_id", userId).eq("gs_series.status", "live").limit(1).maybeSingle();
      const row = data as { team_id: string; gs_series: { slug: string } | { slug: string }[] } | null;
      const s = row ? (Array.isArray(row.gs_series) ? row.gs_series[0] : row.gs_series) : null;
      if (row && s) value = { slug: s.slug, teamId: row.team_id };
    }
  } catch (e) { console.error("[series] overlay piece read:", e); }
  pieceCache.set(userId, { at: Date.now(), value });
  if (pieceCache.size > 2000) pieceCache.delete(pieceCache.keys().next().value as string);
  return value;
}

/** The public series an account plays in (profile badges: champions, and everyone who played). */
export async function seriesHonors(userId: string): Promise<{ title: string; path: string; champion: boolean }[]> {
  if (!(await seriesReady())) return [];
  const { data } = await createServiceClient().from("gs_series_players").select("team_id, gs_series!inner(slug, title, status, champion_team_id)")
    .eq("user_id", userId).in("gs_series.status", ["announced", "live", "finished"]);
  const { seriesPath } = await import("./view");
  return ((data ?? []) as { team_id: string; gs_series: { slug: string; title: string; champion_team_id: string | null } | { slug: string; title: string; champion_team_id: string | null }[] }[])
    .flatMap((r) => {
      const s = Array.isArray(r.gs_series) ? r.gs_series[0] : r.gs_series;
      return s ? [{ title: s.title, path: seriesPath(s.slug), champion: s.champion_team_id === r.team_id }] : [];
    });
}
