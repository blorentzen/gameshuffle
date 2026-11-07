import "server-only";

/**
 * The Host home (journeys picks 2026-11-06, step 7, all A): every event you run (tournaments you organize or
 * co-organize, game nights you host, trivia nights), sorted into stages, with what needs you first: players waiting to
 * be accepted, a tournament still marked as running days after its date, one whose date passed without starting, a
 * trivia night left open. Plus this month's numbers and your leagues and seasons.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isStaleOpen, isStuckLive } from "@/lib/events/lifecycle";
import { gsMonthStart } from "@/lib/time/gsClock";
import { leagueStandings, listMyLeagues, type LeagueTeamRow } from "@/lib/trivia/leagues";

export type HostKind = "tournament" | "night" | "trivia";
export type HostStage = "running" | "coming" | "draft" | "stuck" | "stale" | "finished" | "archived";

export interface HostEvent {
  id: string;
  kind: HostKind;
  title: string;
  /** Where you run it. */
  href: string;
  /** ISO start, when it has one. */
  at: string | null;
  stage: HostStage;
  /** A game slug for its box art. */
  game: string | null;
  cover: string | null;
  /** "12 of 32 signed up", "6 going", "Week 3". */
  line: string | null;
}

export interface NeedsYou { key: string; kind: HostKind; title: string; line: string; action: { label: string; href: string }; game: string | null; cover: string | null }
export interface HostSeason { key: string; title: string; href: string; line: string; top: { name: string; points: number }[]; done: boolean }

export interface HostHome {
  hasRun: boolean;
  needs: NeedsYou[];
  events: HostEvent[];
  month: { events: number; players: number };
  seasons: HostSeason[];
}

type Tour = { id: string; title: string; game_slug: string | null; status: string; date_time: string | null; archived_at: string | null; header_image_url: string | null; max_participants: number | null; acceptance_mode: string | null };
type Night = { id: string; title: string; status: string; starts_at: string | null; archived_at?: string | null; cover_image_url?: string | null; games?: { imageUrl?: string | null }[] | null };
type Trivia = { id: string; title: string; status: string; created_at: string; started_at: string | null; finished_at: string | null; league_week: number | null };

const TOUR_COLS = "id, title, game_slug, status, date_time, archived_at, header_image_url, max_participants, acceptance_mode";
const HOUR = 3_600_000;

function tourStage(t: Tour): HostStage {
  if (t.archived_at || t.status === "cancelled") return "archived";
  if (t.status === "draft") return "draft";
  if (t.status === "complete") return "finished";
  if (isStuckLive(t)) return "stuck";
  if (t.status === "in_progress") return "running";
  if (isStaleOpen(t)) return "stale";
  return "coming";
}

function nightStage(n: Night, now: number): HostStage {
  if (n.archived_at || n.status === "cancelled") return "archived";
  if (n.status === "draft") return "draft";
  if (n.status === "ended") return "finished";
  const at = n.starts_at ? Date.parse(n.starts_at) : NaN;
  if (Number.isFinite(at) && at <= now && now - at < 6 * HOUR) return "running";
  if (Number.isFinite(at) && now - at >= 6 * HOUR) return "finished";
  return "coming";
}

/** A trivia night still open half a day after it started was left open, not running. */
const TRIVIA_LEFT_OPEN = 12 * 3_600_000;

function triviaStage(g: Trivia, now: number): HostStage {
  if (g.status === "cancelled") return "archived";
  if (g.status === "done") return "finished";
  if (g.status === "live") return g.started_at && now - Date.parse(g.started_at) > TRIVIA_LEFT_OPEN ? "stuck" : "running";
  return "draft";
}

export async function hostHome(userId: string): Promise<HostHome> {
  const db = createServiceClient();
  const now = Date.now();
  const [own, co, nightsRes, triviaRes, seasons] = await Promise.all([
    db.from("tournaments").select(TOUR_COLS).eq("organizer_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("tournament_organizers").select(`tournaments(${TOUR_COLS})`).eq("user_id", userId).limit(100),
    db.from("board_game_nights").select("*").eq("host_id", userId).order("starts_at", { ascending: false, nullsFirst: false }).limit(200),
    db.from("trivia_games").select("id, title, status, created_at, started_at, finished_at, league_week").eq("host_user_id", userId).order("created_at", { ascending: false }).limit(100),
    hostSeasons(userId),
  ]);

  const tours = new Map<string, Tour>();
  for (const t of (own.data ?? []) as Tour[]) tours.set(t.id, t);
  for (const r of (co.data ?? []) as { tournaments: Tour | Tour[] | null }[]) {
    const t = Array.isArray(r.tournaments) ? r.tournaments[0] : r.tournaments;
    if (t && !tours.has(t.id)) tours.set(t.id, t);
  }
  const nights = (nightsRes.data ?? []) as Night[];
  const trivia = (triviaRes.data ?? []) as Trivia[];

  // Counts for the open ones: signed up and waiting (tournaments), going (nights).
  const openTours = [...tours.values()].filter((t) => ["open", "in_progress", "draft"].includes(t.status) && !t.archived_at);
  const nightIds = nights.filter((n) => n.status === "scheduled").map((n) => n.id);
  const [parts, rsvps] = await Promise.all([
    openTours.length ? db.from("tournament_participants").select("tournament_id, status").in("tournament_id", openTours.map((t) => t.id)).then((r) => (r.data ?? []) as { tournament_id: string; status: string }[]) : Promise.resolve([]),
    nightIds.length ? db.from("board_game_night_rsvps").select("night_id, status").in("night_id", nightIds).eq("status", "going").then((r) => (r.data ?? []) as { night_id: string }[], () => []) : Promise.resolve([]),
  ]);
  const signed = new Map<string, number>();
  const waiting = new Map<string, number>();
  for (const p of parts) {
    const t = tours.get(p.tournament_id);
    // Under "Accept people by hand", a registered entry is an application waiting on the organizer.
    if (p.status === "registered" && t?.acceptance_mode !== "auto") waiting.set(p.tournament_id, (waiting.get(p.tournament_id) ?? 0) + 1);
    else if (["registered", "confirmed", "checked_in"].includes(p.status)) signed.set(p.tournament_id, (signed.get(p.tournament_id) ?? 0) + 1);
  }
  const going = new Map<string, number>();
  for (const r of rsvps) going.set(r.night_id, (going.get(r.night_id) ?? 0) + 1);

  const events: HostEvent[] = [
    ...[...tours.values()].map((t): HostEvent => ({
      id: t.id, kind: "tournament", title: t.title, href: `/tournament/${t.id}/manage`, at: t.date_time, stage: tourStage(t),
      game: t.game_slug, cover: t.header_image_url,
      line: signed.has(t.id) || t.max_participants ? `${signed.get(t.id) ?? 0}${t.max_participants ? ` of ${t.max_participants}` : ""} signed up` : null,
    })),
    ...nights.map((n): HostEvent => ({
      id: n.id, kind: "night", title: n.title, href: `/game-nights/${n.id}/manage`, at: n.starts_at, stage: nightStage(n, now),
      game: null, cover: n.cover_image_url ?? n.games?.find((g) => g.imageUrl)?.imageUrl ?? null,
      line: going.has(n.id) ? `${going.get(n.id)} going` : null,
    })),
    ...trivia.map((g): HostEvent => ({
      id: g.id, kind: "trivia", title: g.title, href: `/trivia/host/${g.id}`, at: g.started_at ?? g.created_at, stage: triviaStage(g, now),
      game: null, cover: null, line: g.league_week ? `League week ${g.league_week}` : null,
    })),
  ];

  const needs: NeedsYou[] = [];
  for (const t of tours.values()) {
    const stage = tourStage(t);
    const w = waiting.get(t.id) ?? 0;
    if (w > 0 && (stage === "coming" || stage === "running")) {
      needs.push({ key: `w-${t.id}`, kind: "tournament", title: t.title, line: `${w} ${w === 1 ? "player is" : "players are"} waiting to be accepted`, action: { label: "Review players", href: `/tournament/${t.id}/manage?tab=players` }, game: t.game_slug, cover: t.header_image_url });
    }
    if (stage === "stuck") needs.push({ key: `s-${t.id}`, kind: "tournament", title: t.title, line: "Still marked as running days after its date. Enter the last results or finish it.", action: { label: "Enter results", href: `/tournament/${t.id}/manage?tab=run` }, game: t.game_slug, cover: t.header_image_url });
    if (stage === "stale") needs.push({ key: `d-${t.id}`, kind: "tournament", title: t.title, line: "Its date passed and it never started.", action: { label: "Pick a new date", href: `/tournament/${t.id}/manage?tab=rules` }, game: t.game_slug, cover: t.header_image_url });
  }
  for (const g of trivia) {
    if (triviaStage(g, now) === "stuck") {
      needs.push({ key: `t-${g.id}`, kind: "trivia", title: g.title, line: "This trivia night is still open. Finish it to save the results.", action: { label: "Finish it", href: `/trivia/host/${g.id}` }, game: null, cover: null });
    }
  }

  // This month (Pacific): events that happened or are set for it, and the players in them.
  const monthStart = gsMonthStart();
  const inMonth = events.filter((e) => e.at && e.at >= monthStart && e.stage !== "archived" && e.stage !== "draft");
  const monthTourIds = inMonth.filter((e) => e.kind === "tournament").map((e) => e.id);
  const monthNightIds = inMonth.filter((e) => e.kind === "night").map((e) => e.id);
  const [mp, mr] = await Promise.all([
    monthTourIds.length ? db.from("tournament_participants").select("user_id, guest_name").in("tournament_id", monthTourIds).in("status", ["registered", "confirmed", "checked_in"]).then((r) => (r.data ?? []) as { user_id: string | null; guest_name?: string | null }[], () => []) : Promise.resolve([]),
    monthNightIds.length ? db.from("board_game_night_rsvps").select("user_id").in("night_id", monthNightIds).eq("status", "going").then((r) => (r.data ?? []) as { user_id: string | null }[], () => []) : Promise.resolve([]),
  ]);
  const people = new Set<string>([...mp.map((p) => p.user_id ?? `g:${p.guest_name ?? ""}`), ...mr.map((r) => r.user_id ?? "")].filter(Boolean));

  return {
    hasRun: tours.size + nights.length + trivia.length + seasons.length > 0,
    needs,
    events,
    month: { events: inMonth.length, players: people.size },
    seasons: seasons.filter((x) => !x.done).slice(0, 4),
  };
}

/** Your trivia leagues (each with its top three) and championship seasons, running ones first. */
export async function hostSeasons(userId: string): Promise<HostSeason[]> {
  const db = createServiceClient();
  const [leagues, champs] = await Promise.all([
    listMyLeagues(userId).catch(() => []),
    db.from("championships").select("id, name, status").eq("owner_id", userId).order("created_at", { ascending: false }).limit(40)
      .then((r) => (r.data ?? []) as { id: string; name: string; status: string }[], () => []),
  ]);
  const tables = await Promise.all(leagues.map(async (l) => {
    const { data } = await db.from("trivia_league_teams").select("id, league_id, community_id, name, captain_user_id, created_at").eq("league_id", l.id).limit(200);
    const teams = (data ?? []) as LeagueTeamRow[];
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const rows = await leagueStandings(l, teams).catch(() => []);
    return rows.slice(0, 3).map((r) => ({ name: names.get(r.teamId) ?? "A team", points: r.points }));
  }));
  const out: HostSeason[] = [
    ...leagues.map((l, i) => ({ key: `l-${l.id}`, title: l.title, href: `/trivia/leagues/${l.slug}/manage`, line: l.status === "finished" ? "Trivia league · finished" : "Trivia league", top: tables[i], done: l.status !== "active" })),
    ...champs.map((c) => ({ key: `c-${c.id}`, title: c.name, href: `/tournament/championship/${c.id}/manage`, line: c.status === "archived" ? "Championship season · complete" : "Championship season", top: [], done: c.status === "archived" })),
  ];
  return out.sort((a, b) => Number(a.done) - Number(b.done));
}

/** Whether this account has run anything (a tournament, co-organized or its own, a game night, a trivia night or league). */
export async function hasHosted(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const head = { count: "exact" as const, head: true };
  const counts = await Promise.all([
    db.from("tournaments").select("id", head).eq("organizer_id", userId),
    db.from("tournament_organizers").select("tournament_id", head).eq("user_id", userId),
    db.from("board_game_nights").select("id", head).eq("host_id", userId),
    db.from("trivia_games").select("id", head).eq("host_user_id", userId),
    db.from("championships").select("id", head).eq("owner_id", userId),
  ]);
  return counts.some((r) => (r.count ?? 0) > 0);
}
