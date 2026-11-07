import "server-only";

/**
 * Time trial events on the server (picks 2026-11-05, all A): loads an event, applies organizer, verifier and player
 * actions, and builds what each person sees. Rules in rules.ts, settings and view types in event.ts.
 *
 * Round state lives in `tournaments.tt` and is saved through `mutate`, which writes only if its version hasn't moved
 * and re-plans on a clash (two organizers, or an extension landing while someone closes the round). Times are rows of
 * their own (tt_event_times): adding one never touches the tournament row. A player's time also goes on the public
 * time trial boards (pick 9A), so nobody adds the same run twice; the event keeps its own check.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { listAttendees } from "@/lib/events/attendees";
import { deliver } from "@/lib/events/notify";
import { recipientsFor } from "@/lib/events/reminders";
import { createNotification } from "@/lib/social/notifications";
import { addTime, setVideo, topTenIds } from "@/lib/timeTrials/store";
import { formatTime, videoProof, type TtPlayer } from "@/lib/timeTrials/rules";
import { gameBySlug, ttTrack, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtParts } from "@/lib/timeTrials/parts";
import {
  bestTimes, clipNeeded, cutRound, rankOn, spreadGroups, trackPlaces, type TtRow, type TtRun,
} from "./rules";
import {
  TT_EVENT_MIN_PLAYERS, VENUE_HOURS, atStation, fillStations, groupCloses, groupLabel, isTtState, isVenue, lastClose, planRound, planRounds,
  queuedGroups, roundLabel, roundOpen, ttPhase, ttSettingsOf,
  type TtCall, type TtCheckItem, type TtEventSettings, type TtEventState, type TtEventView, type TtLatestTime, type TtProof, type TtRound,
  type TtStaffRow, type TtStationView, type TtViewGroup, type TtViewRound, type TtViewStation, type TtViewTime,
} from "./event";

const SEATED = new Set(["confirmed", "checked_in"]);
const MISSING = new Set(["42703", "PGRST204", "42P01", "PGRST205"]);
const svc = () => createServiceClient();

export interface TtTournament {
  id: string;
  title: string;
  status: string;
  format: string | null;
  game_slug: string | null;
  settings: Record<string, unknown> | null;
  organizer_id: string;
  tt: TtEventState | null;
}
interface Person { id: string; user_id: string | null; display_name: string | null; status: string; joined_at: string | null }
interface TimeRow {
  id: string; participant_id: string; round: number; runoff: boolean; track: string; time_ms: number;
  screenshot_url: string | null; video_url: string | null; proof_status: TtProof; source: "player" | "runner" | "staff";
  board_time_id: string | null; created_at: string;
}
interface StaffRow { user_id: string; role: "verifier" | "runner" }

export interface TtCtx {
  t: TtTournament;
  game: TtGame;
  settings: TtEventSettings;
  people: Person[];
  times: TimeRow[];
  staff: StaffRow[];
  state: TtEventState | null;
}

export type TtError =
  | "missing" | "not_found" | "not_tt" | "not_open" | "too_few" | "busy" | "not_now" | "no_tracks"
  | "not_playing" | "not_your_round" | "closed" | "bad_track" | "bad_time" | "screenshot_required" | "bad_proof"
  | "faster_than_record" | "bad_video" | "gone" | "clips_waiting" | "no_user" | "runoff_open" | "bad_pick" | "failed"
  | "check_in" | "bad_key" | "station_busy" | "held";

export const TT_ERRORS: Record<TtError, string> = {
  missing: "Time trial events need a database update first.",
  not_found: "We couldn't find that tournament.",
  not_tt: "This tournament isn't a time trial.",
  not_open: "Publish the tournament before it starts.",
  too_few: `A time trial needs at least ${TT_EVENT_MIN_PLAYERS} confirmed players.`,
  busy: "Someone else changed the event at the same moment. Try again.",
  not_now: "That can't be done at this point in the event.",
  no_tracks: "Pick the tracks first (Format & rules).",
  not_playing: "You're not playing in this tournament.",
  not_your_round: "You're not in this round.",
  closed: "Your window has closed.",
  check_in: "Check players in at the venue first (Players tab). In person, only checked-in players go in the groups.",
  bad_key: "This station link no longer works. Ask the organizer for the new one.",
  station_busy: "That station is still running a group. Mark it done first.",
  held: "Your match is decided. It counts once its clips are checked.",
  bad_track: "That track isn't in this round.",
  bad_time: "Type the time like 1:52.384.",
  screenshot_required: "Add your result screenshot first. It's your proof.",
  bad_proof: "That screenshot didn't upload. Add it again.",
  faster_than_record: "That's faster than the world record on this track. Check the time.",
  bad_video: "Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram.",
  gone: "That time is gone.",
  clips_waiting: "Some top times still need their clip checked.",
  no_user: "We couldn't find that player on GameShuffle.",
  runoff_open: "Settle the run-offs first.",
  bad_pick: "Pick exactly the players who move on.",
  failed: "That didn't save. Try again.",
};

let ready: boolean | null = null;
export async function ttEventsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await svc().from("tt_event_times").select("id").limit(1);
  ready = !error;
  return ready;
}

/** Everything about one time trial event. "missing" before tt-events-m1.sql. */
export async function loadTt(id: string): Promise<TtCtx | "missing" | null> {
  const db = svc();
  const { data, error } = await db.from("tournaments").select("id, title, status, format, game_slug, settings, organizer_id, tt").eq("id", id).maybeSingle();
  if (error) return error.code && MISSING.has(error.code) ? "missing" : null;
  if (!data) return null;
  const t = data as unknown as TtTournament;
  const game = (gameBySlug(t.game_slug ?? "")?.id ?? "mk8dx") as TtGame;
  const [ppl, times, staff] = await Promise.all([
    db.from("tournament_participants").select("id, user_id, display_name, status, joined_at").eq("tournament_id", id).order("joined_at", { ascending: true }),
    db.from("tt_event_times").select("id, participant_id, round, runoff, track, time_ms, screenshot_url, video_url, proof_status, source, board_time_id, created_at").eq("tournament_id", id).order("created_at", { ascending: true }).limit(20000),
    db.from("tournament_staff").select("user_id, role").eq("tournament_id", id),
  ]);
  if (times.error && times.error.code && MISSING.has(times.error.code)) return "missing";
  return {
    t, game, settings: ttSettingsOf((t.settings as Record<string, unknown> | null)?.tt, game),
    people: (ppl.data ?? []) as Person[], times: (times.data ?? []) as TimeRow[], staff: (staff.data ?? []) as StaffRow[],
    state: isTtState(t.tt) ? t.tt : null,
  };
}

const seated = (ctx: TtCtx) => ctx.people.filter((p) => SEATED.has(p.status));
const runsOf = (ctx: TtCtx, round: number, runoff = false): TtRun[] =>
  ctx.times.filter((x) => x.round === round && x.runoff === runoff).map((x) => ({ player: x.participant_id, track: x.track, ms: x.time_ms, counts: x.proof_status !== "rejected" }));

type Plan = { state: TtEventState; extra?: Record<string, unknown>; after?: (state: TtEventState) => Promise<void> } | { error: TtError };

async function mutate(id: string, plan: (ctx: TtCtx) => Plan | Promise<Plan>): Promise<{ ok: true; state: TtEventState } | { ok: false; error: TtError }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const ctx = await loadTt(id);
    if (ctx === "missing") return { ok: false, error: "missing" };
    if (!ctx) return { ok: false, error: "not_found" };
    if (ctx.t.format !== "time_trial") return { ok: false, error: "not_tt" };
    const p = await plan(ctx);
    if ("error" in p) return { ok: false, error: p.error };
    const prev = ctx.state?.version ?? null;
    const next: TtEventState = { ...p.state, version: (prev ?? 0) + 1 };
    let q = svc().from("tournaments").update({ tt: next, ...(p.extra ?? {}) }).eq("id", id);
    q = prev === null ? q.is("tt", null) : q.eq("tt->>version", String(prev));
    const { data, error } = await q.select("id");
    if (!error && (data ?? []).length === 1) {
      if (p.after) await p.after(next).catch((err) => console.error("[tt-event] after save failed:", err));
      return { ok: true, state: next };
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return { ok: false, error: "busy" };
}

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Round 1's seeds (pick 4A): players with board bests on more of the event's tracks first, then by those bests added
 * up; players without an account or without times follow in the order they joined.
 */
async function seedOrder(ctx: TtCtx, ids: string[], tracks: string[]): Promise<string[]> {
  const byPid = new Map(ctx.people.map((p) => [p.id, p]));
  const keys = ids.map((id) => byPid.get(id)?.user_id).filter((u): u is string => !!u).map((u) => `u:${u}`);
  const best = new Map<string, Map<string, number>>();
  if (keys.length && tracks.length) {
    let q = svc().from("tt_times").select("player, track, time_ms").eq("game", ctx.game).eq("cc", ctx.settings.cc)
      .eq("items", ctx.settings.items).eq("status", "ok").in("track", tracks).in("player", keys);
    if (ctx.settings.vehicle !== "any") q = q.eq("vehicle", ctx.settings.vehicle);
    const { data } = await q.limit(20000);
    for (const r of (data ?? []) as { player: string; track: string; time_ms: number }[]) {
      const m = best.get(r.player) ?? new Map<string, number>();
      if (!m.has(r.track) || r.time_ms < m.get(r.track)!) m.set(r.track, r.time_ms);
      best.set(r.player, m);
    }
  }
  const score = (id: string): [number, number] => {
    const u = byPid.get(id)?.user_id;
    const m = u ? best.get(`u:${u}`) : undefined;
    if (!m || !m.size) return [0, 0];
    return [m.size, [...m.values()].reduce((a, b) => a + b, 0)];
  };
  const join = new Map(ids.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => {
    const [ca, ta] = score(a), [cb, tb] = score(b);
    return cb - ca || ta - tb || join.get(a)! - join.get(b)!;
  });
}

const iso = (ms: number) => new Date(ms).toISOString();
const windowEnd = (hours: number, from = Date.now()) => iso(from + Math.round(hours * 3600_000));

function newRound(n: number, settings: TtEventSettings, groups: string[][], size: number, advance: number, final: boolean, venue: number | null = null): TtRound {
  const now = Date.now();
  // In person a round stays open until the organizer closes it, and the first groups are called to the stations.
  const r: TtRound = { n, tracks: settings.tracks, opensAt: iso(now), closesAt: windowEnd(venue ? VENUE_HOURS : settings.hours, now), closedAt: null, size, advance, final, groups, extended: {}, runoffs: [], through: null };
  return venue ? { ...r, calls: fillStations(r, venue, iso(now)) } : r;
}

// ── In person: stations and runner links ─────────────────────────────────────────────────────────────

const venueOf = (ctx: TtCtx) => (isVenue(ctx.t.settings) ? ctx.settings.stations : null);
const newSalt = () => randomBytes(9).toString("base64url");

/** A station's runner key: signed with the server's secret, so it never sits in the tournament row. New salt, new links. */
function stationKey(id: string, n: number, salt: string): string {
  const secret = process.env.TT_STATION_SECRET || createHash("sha256").update(`tt-station:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex");
  return createHmac("sha256", secret).update(`${id}:${n}:${salt}`).digest("base64url").slice(0, 24);
}
export const stationPath = (id: string, n: number, salt: string) => `/tournament/${id}/station/${n}?k=${stationKey(id, n, salt)}`;
function keyOk(id: string, n: number, salt: string, key: string): boolean {
  const want = Buffer.from(stationKey(id, n, salt));
  const got = Buffer.from(key);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Marks a station's group done and fills free stations from the queue. */
function stationDone(r: TtRound, station: number, venue: number, now: number): { round: TtRound; called: TtCall[] } | null {
  const c = atStation(r, station);
  if (!c) return null;
  const calls = (r.calls ?? []).map((x) => (x === c ? { ...x, doneAt: iso(now) } : x));
  const done = { ...r, calls };
  const called = fillStations(done, venue, iso(now));
  return { round: { ...done, calls: [...calls, ...called] }, called };
}

/** Round `n`'s size, cut and whether it's the final (planRound, shared with the settings preview). */
function roundFrom(settings: TtEventSettings, n: number, players: number): { size: number; advance: number; final: boolean } {
  const r = planRound(settings.plan, n, players);
  return { size: r.size, advance: r.advance, final: r.final };
}

// ── Organizer actions ────────────────────────────────────────────────────────────────────────────────

export type TtOrganizerAction =
  | { action: "start" }
  | { action: "extend"; minutes: number; group?: number | null }
  | { action: "close" }
  | { action: "reopen"; minutes: number }
  | { action: "cut" }
  | { action: "runoff"; group: number; minutes: number; track?: string }
  | { action: "settle"; group: number; players: string[] }
  | { action: "next" }
  | { action: "finish"; force?: boolean }
  | { action: "move"; participantId: string; to: number }
  | { action: "add_for"; participantId: string; track: string; ms: number; runoff?: boolean }
  | { action: "remove_time"; timeId: string }
  | { action: "staff_add"; username: string; role?: "verifier" | "runner" }
  | { action: "staff_remove"; userId: string; role?: "verifier" | "runner" }
  | { action: "remind"; timeId: string }
  | { action: "call"; group: number; station: number }
  | { action: "station_done"; station: number }
  | { action: "links_reset" };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export async function organizerAct(id: string, userId: string, input: TtOrganizerAction): Promise<{ ok: true } | { ok: false; error: TtError }> {
  const now = Date.now();
  switch (input.action) {
    case "start":
      return mutate(id, async (ctx) => {
        if (ctx.state?.rounds.length) return { error: "not_now" };
        if (ctx.t.status !== "open" && ctx.t.status !== "in_progress") return { error: "not_open" };
        if (!ctx.settings.tracks.length) return { error: "no_tracks" };
        // In person, check-in at the venue decides who's in, so no-shows don't hold a station (pick 7A).
        const venue = venueOf(ctx);
        const field = (venue ? ctx.people.filter((p) => p.status === "checked_in") : seated(ctx)).map((p) => p.id);
        if (field.length < TT_EVENT_MIN_PLAYERS) return { error: venue ? "check_in" : "too_few" };
        let round: TtRound;
        if (ctx.settings.shape === "leaderboard") {
          round = newRound(0, ctx.settings, [], field.length, 0, true, venue);
        } else {
          const seeds = await seedOrder(ctx, field, ctx.settings.tracks);
          const r = roundFrom(ctx.settings, 1, seeds.length);
          round = newRound(1, ctx.settings, spreadGroups(seeds, r.size), r.size, r.advance, r.final, venue);
        }
        const state: TtEventState = { version: 0, rounds: [round], finishedAt: null, order: null, venue: venue ? { stations: venue, salt: newSalt() } : null };
        return { state, extra: { status: "in_progress" }, after: (s) => (venue ? notifyCalls(ctx, s.rounds[0], s.rounds[0].calls ?? []) : notifyRoundOpen(ctx, s)) };
      });
    case "extend":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || r.through || ctx.state.finishedAt) return { error: "not_now" };
        const minutes = clamp(input.minutes, 5, 60 * 24 * 7);
        const g = input.group;
        const rounds = [...ctx.state.rounds];
        if (g != null && g >= 0 && g < r.groups.length) {
          const from = Math.max(now, Date.parse(groupCloses(r, g)));
          rounds[rounds.length - 1] = { ...r, closedAt: null, extended: { ...r.extended, [String(g)]: iso(from + minutes * 60_000) } };
        } else {
          const from = Math.max(now, Date.parse(r.closedAt ?? r.closesAt));
          rounds[rounds.length - 1] = { ...r, closedAt: null, closesAt: iso(from + minutes * 60_000) };
        }
        return { state: { ...ctx.state, rounds } };
      });
    case "close":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || !roundOpen(r, now)) return { error: "not_now" };
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, closedAt: iso(now) };
        return { state: { ...ctx.state, rounds } };
      });
    case "reopen":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || r.through || ctx.state.finishedAt || roundOpen(r, now)) return { error: "not_now" };
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, closedAt: null, extended: {}, closesAt: iso(now + clamp(input.minutes, 5, 60 * 24 * 7) * 60_000) };
        return { state: { ...ctx.state, rounds } };
      });
    case "cut":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || r.n === 0 || r.final || r.through || roundOpen(r, now)) return { error: "not_now" };
        const runs = runsOf(ctx, r.n);
        const groups = r.groups.map((g) => rankOn(g, r.tracks, runs, ctx.settings.scoring));
        const cut = cutRound(groups, r.advance, r.tracks, runs, ctx.settings.scoring);
        const rounds = [...ctx.state.rounds];
        if (!cut.runoffs.length) {
          rounds[rounds.length - 1] = { ...r, closedAt: r.closedAt ?? iso(now), through: cut.through };
        } else {
          // A one-track run-off with its own short window (pick 5A): the round's first track, 30 minutes.
          const runoffs = cut.runoffs.map((x) => ({ ...x, track: r.tracks[0], opensAt: iso(now), closesAt: iso(now + 30 * 60_000), settled: null }));
          rounds[rounds.length - 1] = { ...r, closedAt: r.closedAt ?? iso(now), runoffs };
        }
        return { state: { ...ctx.state, rounds }, after: (s) => notifyRunoffs(ctx, s) };
      });
    case "runoff":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        const ro = r?.runoffs.find((x) => x.group === input.group && !x.settled);
        if (!ctx.state || !r || !ro) return { error: "not_now" };
        const track = input.track && r.tracks.includes(input.track) ? input.track : ro.track;
        const runoffs = r.runoffs.map((x) => (x === ro ? { ...x, track, opensAt: iso(now), closesAt: iso(now + clamp(input.minutes, 5, 60 * 24) * 60_000) } : x));
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, runoffs };
        return { state: { ...ctx.state, rounds } };
      });
    case "settle":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        const ro = r?.runoffs.find((x) => x.group === input.group && !x.settled);
        if (!ctx.state || !r || !ro) return { error: "not_now" };
        const picks = [...new Set(input.players)];
        if (picks.length !== ro.spots || picks.some((p) => !ro.players.includes(p))) return { error: "bad_pick" };
        const runoffs = r.runoffs.map((x) => (x === ro ? { ...x, settled: picks } : x));
        const rounds = [...ctx.state.rounds];
        let next: TtRound = { ...r, runoffs };
        if (runoffs.every((x) => x.settled)) next = { ...next, through: throughAfterRunoffs(ctx, next) };
        rounds[rounds.length - 1] = next;
        return { state: { ...ctx.state, rounds } };
      });
    case "next":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || !r.through || r.final || ctx.state.finishedAt) return { error: "not_now" };
        const n = r.n + 1;
        const shape = roundFrom(ctx.settings, n, r.through.length);
        const venue = ctx.state.venue?.stations ?? null;
        const round = newRound(n, ctx.settings, spreadGroups(r.through, shape.size), shape.size, shape.advance, shape.final, venue);
        return { state: { ...ctx.state, rounds: [...ctx.state.rounds, round] }, after: (s) => (venue ? notifyCalls(ctx, round, round.calls ?? []) : notifyRoundOpen(ctx, s)) };
      });
    case "finish":
      return mutate(id, async (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || ctx.state.finishedAt || roundOpen(r, now)) return { error: "not_now" };
        if (!(r.final || r.n === 0)) return { error: "not_now" };
        if (!input.force && waitingChecks(ctx) > 0) return { error: "clips_waiting" };
        const order = finalOrder(ctx, ctx.state);
        const rows = ctx.settings.scoring === "points" ? pointsById(ctx, r) : new Map<string, number>();
        if (order.length) {
          const { error } = await svc().from("tournament_results").upsert(
            order.map((pid, i) => ({ tournament_id: ctx.t.id, participant_id: pid, placement: i + 1, points: rows.get(pid) ?? null })),
            { onConflict: "tournament_id,participant_id" },
          );
          if (error) { console.error("[tt-event] results failed:", error.message); return { error: "failed" }; }
        }
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, closedAt: r.closedAt ?? iso(now) };
        return { state: { ...ctx.state, rounds, finishedAt: iso(now), order }, extra: { status: "complete" } };
      });
    case "move":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        if (!ctx.state || !r || r.n === 0 || r.through || input.to < 0 || input.to >= r.groups.length) return { error: "not_now" };
        const from = r.groups.findIndex((g) => g.includes(input.participantId));
        if (from < 0 || from === input.to) return { error: "not_now" };
        const groups = r.groups.map((g, i) => (i === from ? g.filter((p) => p !== input.participantId) : i === input.to ? [...g, input.participantId] : g));
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, groups };
        return { state: { ...ctx.state, rounds } };
      });
    case "call":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        const v = ctx.state?.venue;
        if (!ctx.state || !r || !v || r.n === 0 || r.through || ctx.state.finishedAt) return { error: "not_now" };
        if (input.group < 0 || input.group >= r.groups.length || input.station < 1 || input.station > v.stations) return { error: "not_now" };
        if (atStation(r, input.station)) return { error: "station_busy" };
        if ((r.calls ?? []).some((c) => c.group === input.group && !c.doneAt)) return { error: "not_now" };
        const call: TtCall = { group: input.group, station: input.station, calledAt: iso(now), doneAt: null };
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = { ...r, calls: [...(r.calls ?? []), call] };
        return { state: { ...ctx.state, rounds }, after: () => notifyCalls(ctx, r, [call]) };
      });
    case "station_done":
      return mutate(id, (ctx) => {
        const r = ctx.state?.rounds.at(-1);
        const v = ctx.state?.venue;
        if (!ctx.state || !r || !v) return { error: "not_now" };
        const d = stationDone(r, input.station, v.stations, now);
        if (!d) return { error: "not_now" };
        const rounds = [...ctx.state.rounds];
        rounds[rounds.length - 1] = d.round;
        return { state: { ...ctx.state, rounds }, after: () => notifyCalls(ctx, r, d.called) };
      });
    case "links_reset":
      return mutate(id, (ctx) => {
        if (!ctx.state?.venue) return { error: "not_now" };
        return { state: { ...ctx.state, venue: { ...ctx.state.venue, salt: newSalt() } } };
      });
    case "add_for": {
      const ctx = await loadTt(id);
      if (ctx === "missing") return { ok: false, error: "missing" };
      if (!ctx || ctx.t.format !== "time_trial") return { ok: false, error: "not_found" };
      const r = await saveTime(ctx, { participantId: input.participantId, track: input.track, ms: input.ms, runoff: !!input.runoff, source: "staff", addedBy: userId, screenshot: null, board: null, ignoreWindow: true });
      return r.ok ? { ok: true } : r;
    }
    case "remove_time": {
      const { error } = await svc().from("tt_event_times").delete().eq("id", input.timeId).eq("tournament_id", id);
      return error ? { ok: false, error: "failed" } : { ok: true };
    }
    case "staff_add": {
      const name = input.username.trim().replace(/^@/, "").toLowerCase();
      if (!name) return { ok: false, error: "no_user" };
      const { data } = await svc().from("users").select("id").ilike("username", name).maybeSingle();
      const u = data as { id: string } | null;
      if (!u) return { ok: false, error: "no_user" };
      const { error } = await svc().from("tournament_staff").upsert({ tournament_id: id, user_id: u.id, role: input.role ?? "verifier", added_by: userId }, { onConflict: "tournament_id,user_id,role" });
      if (error) return { ok: false, error: "failed" };
      const ctx = await loadTt(id);
      if (ctx && ctx !== "missing") await createNotification({
        userId: u.id, actorUserId: userId, type: "tournament_update", title: "You're checking times",
        message: `You can now check times in ${ctx.t.title}. They're on the event page.`, link: `/tournament/${id}`,
      }).catch(() => {});
      return { ok: true };
    }
    case "staff_remove": {
      const { error } = await svc().from("tournament_staff").delete().eq("tournament_id", id).eq("user_id", input.userId).eq("role", input.role ?? "verifier");
      return error ? { ok: false, error: "failed" } : { ok: true };
    }
    case "remind": {
      const ctx = await loadTt(id);
      if (ctx === "missing") return { ok: false, error: "missing" };
      if (!ctx) return { ok: false, error: "not_found" };
      const t = ctx.times.find((x) => x.id === input.timeId);
      const p = t ? ctx.people.find((x) => x.id === t.participant_id) : null;
      if (!t || !p?.user_id) return { ok: false, error: "gone" };
      await createNotification({
        userId: p.user_id, actorUserId: userId, type: "tournament_update", title: "Add your clip",
        message: `${ttTrack(ctx.game, t.track)?.name ?? "Your track"}: your ${formatTime(t.time_ms)} needs a clip of the run's last 30 seconds before ${ctx.t.format === "time_trial" ? `${ctx.t.title} is final` : `your match in ${ctx.t.title} counts`}.`,
        link: `/tournament/${id}`,
      });
      return { ok: true };
    }
  }
}

/** After every run-off is settled: the cut's own picks with each run-off's winners added. */
function throughAfterRunoffs(ctx: TtCtx, r: TtRound): string[] {
  const runs = runsOf(ctx, r.n);
  const groups = r.groups.map((g) => rankOn(g, r.tracks, runs, ctx.settings.scoring));
  const cut = cutRound(groups, r.advance, r.tracks, runs, ctx.settings.scoring);
  const main = cut.through.filter((p) => !cut.fillIns.includes(p));
  return [...main, ...r.runoffs.flatMap((x) => x.settled ?? []), ...cut.fillIns];
}

function pointsById(ctx: TtCtx, r: TtRound): Map<string, number> {
  const ids = r.n === 0 ? seated(ctx).map((p) => p.id) : r.groups.flat();
  return new Map(rankOn(ids, r.tracks, runsOf(ctx, r.n), ctx.settings.scoring).map((x) => [x.player, x.points]));
}

/**
 * Everyone's final place: the leaderboard's standings; for groups, the final's order, then the players each earlier
 * round sent home (the latest round first), ranked together on that round's tracks. Players without a time aren't placed.
 */
function finalOrder(ctx: TtCtx, state: TtEventState): string[] {
  const out: string[] = [];
  const last = state.rounds.at(-1)!;
  if (last.n === 0) {
    return rankOn(seated(ctx).map((p) => p.id), last.tracks, runsOf(ctx, 0), ctx.settings.scoring).filter((r) => r.done > 0).map((r) => r.player);
  }
  out.push(...rankOn(last.groups.flat(), last.tracks, runsOf(ctx, last.n), ctx.settings.scoring).filter((r) => r.done > 0).map((r) => r.player));
  for (let i = state.rounds.length - 2; i >= 0; i--) {
    const r = state.rounds[i];
    const through = new Set(r.through ?? []);
    const home = r.groups.flat().filter((p) => !through.has(p) && !out.includes(p));
    out.push(...rankOn(home, r.tracks, runsOf(ctx, r.n), ctx.settings.scoring).filter((x) => x.done > 0).map((x) => x.player));
  }
  return out;
}

// ── Times ────────────────────────────────────────────────────────────────────────────────────────────

/** Each player's best time per track in a round, with its place among the round's field on that track. */
function bestRows(ctx: TtCtx, round: number): Map<string, { row: TimeRow; place: number }> {
  const rows = ctx.times.filter((x) => x.round === round && !x.runoff && x.proof_status !== "rejected");
  const best = new Map<string, TimeRow>();
  for (const x of rows) {
    const k = `${x.participant_id}:${x.track}`;
    const had = best.get(k);
    if (!had || x.time_ms < had.time_ms) best.set(k, x);
  }
  const byTrack = bestTimes(rows.map((x) => ({ player: x.participant_id, track: x.track, ms: x.time_ms })));
  const places = new Map([...byTrack.entries()].map(([t, m]) => [t, trackPlaces(m)] as const));
  const out = new Map<string, { row: TimeRow; place: number }>();
  for (const [k, row] of best) out.set(k, { row, place: places.get(row.track)?.get(row.participant_id) ?? 0 });
  return out;
}

const needsClip = (ctx: TtCtx, row: TimeRow, place: number) =>
  clipNeeded(ctx.settings.clips, place) && row.proof_status !== "checked" && !row.video_url;

/** Times a verifier still has to look at before the results are final: a clip waiting, or a top time without one. */
function waitingChecks(ctx: TtCtx): number {
  let n = 0;
  const rounds = ctx.state?.rounds ?? [];
  for (const r of rounds) for (const { row, place } of bestRows(ctx, r.n).values()) {
    if (row.proof_status === "waiting" || (clipNeeded(ctx.settings.clips, place) && row.proof_status !== "checked")) n++;
  }
  return n;
}

interface SaveInput {
  participantId: string; track: string; ms: number; runoff: boolean; source: "player" | "runner" | "staff"; addedBy: string | null;
  screenshot: string | null; ignoreWindow?: boolean;
  /** A time already on the boards (added in Discord): the event points at it instead of adding a second one. */
  boardTimeId?: string | null;
  board: { player: TtPlayer; userId: string; readMs: number | null; readLaps: number[] | null; laps: number[] | null; parts: TtParts | null } | null;
}

async function saveTime(ctx: TtCtx, input: SaveInput): Promise<{ ok: true; timeId: string; place: number; total: number; needsClip: boolean } | { ok: false; error: TtError }> {
  const state = ctx.state;
  const r = state?.rounds.at(-1);
  if (!state || !r || state.finishedAt) return { ok: false, error: "closed" };
  if (!(input.ms >= 30_000 && input.ms <= 600_000)) return { ok: false, error: "bad_time" };
  const now = Date.now();
  let trackOk = r.tracks.includes(input.track);
  if (input.runoff) {
    const ro = r.runoffs.find((x) => !x.settled && x.players.includes(input.participantId));
    if (!ro) return { ok: false, error: "not_your_round" };
    trackOk = ro.track === input.track;
    if (!input.ignoreWindow && (now < Date.parse(ro.opensAt) || now > Date.parse(ro.closesAt))) return { ok: false, error: "closed" };
  } else {
    const group = r.n === 0 ? 0 : r.groups.findIndex((g) => g.includes(input.participantId));
    if (r.n !== 0 && group < 0) return { ok: false, error: "not_your_round" };
    if (!input.ignoreWindow) {
      if (r.through || r.closedAt) return { ok: false, error: "closed" };
      if (now < Date.parse(r.opensAt) || now > Date.parse(groupCloses(r, group))) return { ok: false, error: "closed" };
    }
  }
  if (!trackOk) return { ok: false, error: "bad_track" };

  const db = svc();
  // A double tap or a retried request: the same time on the same track within ten minutes is the first one again.
  const since = iso(now - 10 * 60_000);
  const { data: dupe } = await db.from("tt_event_times").select("id").eq("tournament_id", ctx.t.id).eq("participant_id", input.participantId)
    .eq("round", r.n).eq("track", input.track).eq("time_ms", input.ms).gte("created_at", since).limit(1).maybeSingle();
  let timeId = (dupe as { id: string } | null)?.id ?? null;
  if (!timeId) {
    let boardId: string | null = input.boardTimeId ?? null;
    if (!boardId && input.board && input.screenshot) {
      const added = await addTime({
        player: input.board.player, userId: input.board.userId, identityId: null, game: ctx.game, track: input.track, cc: ctx.settings.cc,
        items: ctx.settings.items, vehicle: ctx.settings.vehicle, timeMs: input.ms, proof: "screenshot", proofUrl: input.screenshot,
        readByAi: input.board.readMs === input.ms, source: "site", laps: input.board.laps, readMs: input.board.readMs, readLaps: input.board.readLaps, parts: input.board.parts,
      });
      if (!added.ok && added.error === "faster_than_record") return { ok: false, error: "faster_than_record" };
      if (added.ok) boardId = added.timeId;
    }
    const { data, error } = await db.from("tt_event_times").insert({
      tournament_id: ctx.t.id, participant_id: input.participantId, round: r.n, runoff: input.runoff, track: input.track, time_ms: input.ms,
      laps: input.board?.laps ?? null, read_ms: input.board?.readMs ?? null, screenshot_url: input.screenshot, source: input.source,
      added_by: input.addedBy, board_time_id: boardId,
      // A time staff or a runner typed in is their word: no clip asked of the player.
      proof_status: input.source === "player" ? "none" : "checked", checked_by: input.source === "player" ? null : input.addedBy,
      checked_at: input.source === "player" ? null : iso(now),
    }).select("id").single();
    if (error || !data) { console.error("[tt-event] add failed:", error?.message); return { ok: false, error: "failed" }; }
    timeId = (data as { id: string }).id;
  }
  const fresh = await loadTt(ctx.t.id);
  const c = fresh && fresh !== "missing" ? fresh : ctx;
  const mine = bestRows(c, r.n).get(`${input.participantId}:${input.track}`);
  const total = new Set(c.times.filter((x) => x.round === r.n && !x.runoff && x.track === input.track).map((x) => x.participant_id)).size;
  const place = mine?.place ?? 1;
  return { ok: true, timeId, place, total, needsClip: !!mine && mine.row.id === timeId && needsClip(c, mine.row, place) };
}

export async function playerAdd(id: string, userId: string, input: {
  track: string; ms: number; runoff: boolean; screenshot: string | null;
  read: { timeMs: number | null; laps: number[] | null; parts: TtParts | null } | null; laps: number[] | null;
}): Promise<{ ok: true; timeId: string; place: number; total: number; needsClip: boolean } | { ok: false; error: TtError }> {
  const ctx = await loadTt(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx || ctx.t.format !== "time_trial") return { ok: false, error: "not_found" };
  const me = ctx.people.find((p) => p.user_id === userId && SEATED.has(p.status));
  if (!me) return { ok: false, error: "not_playing" };
  if (!input.screenshot) return { ok: false, error: "screenshot_required" };
  return saveTime(ctx, {
    participantId: me.id, track: input.track, ms: input.ms, runoff: input.runoff, source: "player", addedBy: userId, screenshot: input.screenshot,
    board: { player: `u:${userId}`, userId, readMs: input.read?.timeMs ?? null, readLaps: input.read?.laps ?? null, laps: input.laps, parts: input.read?.parts ?? null },
  });
}

/** A clip for one of your event times: it waits for a verifier, and goes on the board time too when that one is in its top ten. */
export async function playerClip(id: string, userId: string, timeId: string, url: string): Promise<{ ok: true } | { ok: false; error: TtError }> {
  const video = videoProof(url);
  if (!video) return { ok: false, error: "bad_video" };
  const ctx = await loadTt(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx) return { ok: false, error: "not_found" };
  const me = ctx.people.find((p) => p.user_id === userId);
  const t = ctx.times.find((x) => x.id === timeId);
  if (!me || !t || t.participant_id !== me.id || t.proof_status === "checked") return { ok: false, error: "gone" };
  const { error } = await svc().from("tt_event_times").update({ video_url: video, proof_status: "waiting", check_note: null }).eq("id", timeId);
  if (error) return { ok: false, error: "failed" };
  if (t.board_time_id) {
    const top = await topTenIds(ctx.game, t.track, ctx.settings.cc, ctx.settings.items, ctx.settings.vehicle).catch(() => new Set<string>());
    if (top.has(t.board_time_id)) await setVideo(`u:${userId}`, t.board_time_id, video).catch(() => false);
  }
  return { ok: true };
}

/** A verifier (or organizer) checks a time: it counts (checked) or doesn't (rejected), with a note the player sees. */
export async function checkTime(id: string, userId: string, timeId: string, ok: boolean, note: string | null): Promise<{ ok: true } | { ok: false; error: TtError }> {
  const { data, error } = await svc().from("tt_event_times")
    .update({ proof_status: ok ? "checked" : "rejected", checked_by: userId, checked_at: new Date().toISOString(), check_note: note?.trim().slice(0, 300) || null })
    .eq("id", timeId).eq("tournament_id", id).select("participant_id, track, time_ms");
  if (error) return { ok: false, error: "failed" };
  const row = (data ?? [])[0] as { participant_id: string; track: string; time_ms: number } | undefined;
  if (!row) return { ok: false, error: "gone" };
  if (!ok) {
    const ctx = await loadTt(id);
    const p = ctx && ctx !== "missing" ? ctx.people.find((x) => x.id === row.participant_id) : null;
    if (ctx && ctx !== "missing" && p?.user_id) await createNotification({
      userId: p.user_id, actorUserId: userId, type: "tournament_update", title: "A time didn't count",
      message: `${ttTrack(ctx.game, row.track)?.name ?? "Your track"}: ${formatTime(row.time_ms)} won't count in ${ctx.t.title}.${note ? ` ${note.trim().slice(0, 200)}` : ""}`,
      link: `/tournament/${id}`,
    }).catch(() => {});
  }
  return { ok: true };
}

/** The event's verifiers and runners with their names (organizers only). */
export async function staffRowsFor(rows: StaffRow[]): Promise<TtStaffRow[]> {
  const ids = [...new Set(rows.map((s) => s.user_id))];
  const { data } = ids.length ? await svc().from("users").select("id, display_name, username").in("id", ids) : { data: [] };
  const u = new Map(((data ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((x) => [x.id, x]));
  return rows.map((s) => ({ userId: s.user_id, role: s.role, name: u.get(s.user_id)?.display_name || u.get(s.user_id)?.username || "Player", username: u.get(s.user_id)?.username ?? null }));
}

/** A tournament's staff, read on its own (Swiss and brackets decided by time trial). */
export async function staffOf(id: string): Promise<TtStaffRow[]> {
  const { data } = await svc().from("tournament_staff").select("user_id, role").eq("tournament_id", id);
  return staffRowsFor((data ?? []) as StaffRow[]);
}

export async function canCheckEvent(id: string, userId: string): Promise<boolean> {
  const { data } = await svc().from("tournament_staff").select("user_id").eq("tournament_id", id).eq("user_id", userId).eq("role", "verifier").maybeSingle();
  return !!data;
}

// ── Runners (in person) ──────────────────────────────────────────────────────────────────────────────

export type TtRunnerInput =
  | { action: "save"; track: string; times: { participantId: string; ms: number }[] }
  | { action: "done" };

/** Checks a station link: the event, the station and its key. */
async function runnerCtx(id: string, n: number, key: string): Promise<{ ctx: TtCtx; r: TtRound | null } | { error: TtError }> {
  const ctx = await loadTt(id);
  if (ctx === "missing") return { error: "missing" };
  if (!ctx || ctx.t.format !== "time_trial") return { error: "not_found" };
  const v = ctx.state?.venue;
  if (!v || !Number.isInteger(n) || n < 1 || n > v.stations || !keyOk(id, n, v.salt, key)) return { error: "bad_key" };
  return { ctx, r: ctx.state?.rounds.at(-1) ?? null };
}

/** Who a station's runner can type times for: the group up there, or anyone checked in on a leaderboard. */
function runnerPlayers(ctx: TtCtx, r: TtRound, n: number): string[] {
  if (r.n === 0) return ctx.people.filter((p) => SEATED.has(p.status)).map((p) => p.id);
  const c = atStation(r, n);
  return c ? r.groups[c.group] ?? [] : [];
}

/**
 * A runner types in times at their station (no screenshot, pick 7A). A runner's time is the player's time on that
 * track in this round: typing it again replaces it (a typo is fixed by typing the right one).
 */
export async function runnerAct(id: string, n: number, key: string, input: TtRunnerInput): Promise<{ ok: true; saved: number } | { ok: false; error: TtError }> {
  const got = await runnerCtx(id, n, key);
  if ("error" in got) return { ok: false, error: got.error };
  const { ctx, r } = got;
  if (!r || ctx.state?.finishedAt) return { ok: false, error: "not_now" };
  if (input.action === "done") {
    const res = await organizerActAs(id, { action: "station_done", station: n });
    return res.ok ? { ok: true, saved: 0 } : res;
  }
  if (!r.tracks.includes(input.track)) return { ok: false, error: "bad_track" };
  const allowed = new Set(runnerPlayers(ctx, r, n));
  if (!allowed.size) return { ok: false, error: "not_now" };
  let saved = 0;
  for (const t of input.times.slice(0, 16)) {
    if (!allowed.has(t.participantId) || !(t.ms >= 30_000 && t.ms <= 600_000)) continue;
    const had = ctx.times.find((x) => x.participant_id === t.participantId && x.round === r.n && x.track === input.track && !x.runoff && x.source === "runner");
    if (had?.time_ms === t.ms) continue;
    const res = await saveTime(ctx, { participantId: t.participantId, track: input.track, ms: Math.round(t.ms), runoff: false, source: "runner", addedBy: null, screenshot: null, board: null });
    if (!res.ok) return res;
    // The runner's earlier entry for this player and track is replaced, not kept as a second run.
    await svc().from("tt_event_times").delete().eq("tournament_id", id).eq("participant_id", t.participantId).eq("round", r.n).eq("track", input.track)
      .eq("runoff", false).eq("source", "runner").neq("id", res.timeId);
    saved++;
  }
  return { ok: true, saved };
}

/** Organizer actions that a runner link may also take (marking its own station done). */
const organizerActAs = (id: string, input: TtOrganizerAction) => organizerAct(id, "", input);

export async function stationView(id: string, n: number, key: string): Promise<TtStationView | { error: TtError }> {
  const got = await runnerCtx(id, n, key);
  if ("error" in got) return got;
  const { ctx, r } = got;
  const name = new Map(ctx.people.map((p) => [p.id, p.display_name || "Player"]));
  const timesFor = (pid: string): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    for (const t of r?.tracks ?? []) {
      let best: number | null = null;
      for (const x of ctx.times) if (r && x.round === r.n && !x.runoff && x.participant_id === pid && x.track === t && x.proof_status !== "rejected" && (best === null || x.time_ms < best)) best = x.time_ms;
      out[t] = best;
    }
    return out;
  };
  const total = (ctx.state?.rounds.length ?? 0) + (r && (r.final || r.n === 0) ? 0 : 1);
  const c = r && r.n > 0 ? atStation(r, n) : null;
  const q = r && r.n > 0 ? queuedGroups(r) : [];
  return {
    title: ctx.t.title, n, stations: ctx.state?.venue?.stations ?? 0, settings: ctx.settings,
    round: r ? { n: r.n, label: roundLabel(r, total), open: roundOpen(r) } : null, tracks: r?.tracks ?? [],
    group: c && r ? { index: c.group, label: groupLabel(c.group), players: (r.groups[c.group] ?? []).map((pid) => ({ id: pid, name: name.get(pid) ?? "Player", times: timesFor(pid) })) } : null,
    everyone: r && r.n === 0 ? runnerPlayers(ctx, r, n).map((pid) => ({ id: pid, name: name.get(pid) ?? "Player", times: timesFor(pid) })) : null,
    next: q.length ? groupLabel(q[0]) : null, finished: !!ctx.state?.finishedAt,
  };
}

// ── The view ─────────────────────────────────────────────────────────────────────────────────────────

export function visibleTo(ctx: TtCtx, canManage: boolean): boolean {
  return ctx.t.status !== "draft" || canManage;
}

export async function buildView(ctx: TtCtx, who: { userId: string | null; canManage: boolean; canCheck: boolean }): Promise<TtEventView> {
  const nowMs = Date.now();
  const state = ctx.state;
  const phase = ttPhase(state, nowMs);
  const name = new Map(ctx.people.map((p) => [p.id, p.display_name || "Player"]));
  const me = who.userId ? ctx.people.find((p) => p.user_id === who.userId) ?? null : null;
  const field = seated(ctx).map((p) => p.id);
  const hidden = ctx.settings.hideTracks && phase === "setup" && !who.canManage;

  const rounds: TtViewRound[] = (state?.rounds ?? []).map((r) => {
    const runs = runsOf(ctx, r.n);
    const total = state!.rounds.length + (r.final || r.n === 0 ? 0 : 1);
    const members = r.n === 0 ? [field] : r.groups;
    const groups: TtViewGroup[] = members.map((ids, gi) => {
      const ranked: TtRow[] = rankOn(ids, r.tracks, runs, ctx.settings.scoring);
      const inCount = ranked.filter((x) => (ctx.settings.scoring === "total" ? x.complete : x.done > 0)).length;
      return {
        index: gi, label: r.n === 0 ? "Standings" : groupLabel(gi), closesAt: groupCloses(r, gi), inCount,
        cutAfter: r.n === 0 || r.final ? null : r.advance, yours: !!me && ids.includes(me.id),
        rows: ranked.map((x) => ({ participantId: x.player, name: name.get(x.player) ?? "Player", you: !!me && x.player === me.id, place: x.place, tied: x.tied, total: x.total, points: x.points, done: x.done, times: x.times, places: x.places })),
      };
    });
    const runoffs = r.runoffs.map((ro) => {
      const best = bestTimes(runsOf(ctx, r.n, true), ro.players).get(ro.track);
      return { ...ro, names: ro.players.map((p) => name.get(p) ?? "Player"), times: Object.fromEntries(ro.players.map((p) => [p, best?.get(p) ?? null])) };
    });
    return {
      n: r.n, label: roundLabel(r, total), tracks: r.tracks, opensAt: r.opensAt, closesAt: lastClose(r), closedAt: r.closedAt,
      open: roundOpen(r, nowMs), size: r.size, advance: r.advance, final: r.final, groups, runoffs, through: r.through,
    };
  });

  const cur = state?.rounds.at(-1) ?? null;
  let you: TtEventView["you"] = null;
  if (me && SEATED.has(me.status)) {
    const group = !cur ? null : cur.n === 0 ? 0 : cur.groups.findIndex((g) => g.includes(me.id));
    const inRound = !!cur && (cur.n === 0 || (group ?? -1) >= 0);
    const inRunoff = !!cur && cur.runoffs.some((x) => !x.settled && x.players.includes(me.id) && nowMs >= Date.parse(x.opensAt) && nowMs <= Date.parse(x.closesAt));
    const open = !!cur && inRound && !cur.through && !cur.closedAt && nowMs >= Date.parse(cur.opensAt) && nowMs <= Date.parse(groupCloses(cur, group ?? 0));
    const out = !!state && state.rounds.length > 1 && !!cur && cur.n > 0 && !inRound;
    const best = cur ? bestRows(ctx, cur.n) : new Map();
    const times: TtViewTime[] = !cur ? [] : ctx.times.filter((x) => x.participant_id === me.id && x.round === cur.n).map((x) => {
      const b = best.get(`${me.id}:${x.track}`);
      const isBest = !!b && b.row.id === x.id;
      return {
        id: x.id, track: x.track, ms: x.time_ms, place: isBest && !x.runoff ? b.place : null, proof: x.proof_status, screenshot: x.screenshot_url, video: x.video_url,
        needsClip: isBest && !x.runoff && needsClip(ctx, x, b.place), at: x.created_at, runoff: x.runoff,
      };
    }).sort((a, b) => b.at.localeCompare(a.at));
    // In person a runner at your station types your times in; your phone shows where to go.
    const venue = !!state?.venue;
    let station: NonNullable<TtEventView["you"]>["station"] = null;
    if (venue && cur && cur.n > 0 && group != null && group >= 0) {
      const live = (cur.calls ?? []).find((c) => c.group === group && !c.doneAt);
      const done = (cur.calls ?? []).some((c) => c.group === group && c.doneAt);
      station = live ? { n: live.station, ahead: 0, done: false } : done ? { n: null, ahead: 0, done: true } : { n: null, ahead: Math.max(0, queuedGroups(cur).indexOf(group)), done: false };
    }
    you = {
      participantId: me.id, canAdd: !venue && (open || inRunoff), group: group != null && group >= 0 ? group : null, times, out, station,
      why: !state || !cur ? "It hasn't started yet." : state.finishedAt ? "It's finished." : out ? "You're out of this round."
        : venue ? "A runner at your station types your times in." : !open && !inRunoff ? "The window is closed." : null,
    };
  }

  // In person: each station and the group up there, the groups waiting, and (organizers) the runner links.
  let venueView: TtEventView["venue"] = null;
  if (state?.venue) {
    const v = state.venue;
    const stations: TtViewStation[] = Array.from({ length: v.stations }, (_, i) => {
      const n = i + 1;
      const c = cur && cur.n > 0 ? atStation(cur, n) : null;
      return {
        n, group: c?.group ?? null, label: c ? groupLabel(c.group) : null, players: c && cur ? (cur.groups[c.group] ?? []).map((p) => name.get(p) ?? "Player") : [],
        calledAt: c?.calledAt ?? null, ...(who.canManage ? { link: stationPath(ctx.t.id, n, v.salt) } : {}),
      };
    });
    venueView = {
      stations,
      queue: cur && cur.n > 0 && !cur.through ? queuedGroups(cur).map((i) => ({ index: i, label: groupLabel(i) })) : [],
      done: cur ? (cur.calls ?? []).filter((c) => c.doneAt).map((c) => groupLabel(c.group)) : [],
    };
  }

  // The latest times in the round now running (the TV board's ticker).
  const latest: TtLatestTime[] = [];
  if (cur) {
    const places = bestRows(ctx, cur.n);
    for (const x of [...ctx.times].filter((t) => t.round === cur.n && !t.runoff && t.proof_status !== "rejected").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)) {
      const b = places.get(`${x.participant_id}:${x.track}`);
      latest.push({ name: name.get(x.participant_id) ?? "Player", track: x.track, ms: x.time_ms, at: x.created_at, place: b && b.row.id === x.id ? b.place : null });
    }
  }

  let checks: TtCheckItem[] | null = null;
  let waiting = 0;
  if (who.canManage || who.canCheck) {
    checks = [];
    for (const r of state?.rounds ?? []) {
      for (const { row, place } of bestRows(ctx, r.n).values()) {
        const need = clipNeeded(ctx.settings.clips, place);
        if (row.proof_status === "checked" || row.proof_status === "rejected") continue;
        if (row.proof_status === "waiting" || need) waiting++;
        checks.push({
          id: row.id, name: name.get(row.participant_id) ?? "Player", track: row.track, round: r.n, ms: row.time_ms, place, proof: row.proof_status,
          screenshot: row.screenshot_url, video: row.video_url, needsClip: need && !row.video_url, at: row.created_at, source: row.source,
        });
      }
    }
    const rank = (c: TtCheckItem) => (c.proof === "waiting" ? 0 : c.needsClip ? 1 : 2);
    checks.sort((a, b) => rank(a) - rank(b) || (a.place ?? 99) - (b.place ?? 99) || b.at.localeCompare(a.at));
    checks = checks.slice(0, 300);
  }

  const staff = who.canManage ? await staffRowsFor(ctx.staff) : null;

  const planned = ctx.settings.shape === "groups" ? planRounds(Math.max(field.length, TT_EVENT_MIN_PLAYERS), ctx.settings.plan) : [];
  const final = state?.order ? state.order.map((pid, i) => ({ participantId: pid, name: name.get(pid) ?? "Player", place: i + 1 })) : null;

  return {
    settings: ctx.settings, phase, tracks: hidden ? null : ctx.settings.tracks, players: field.length, rounds,
    current: cur ? cur.n : null, planned, you, checks, waitingChecks: waiting, staff,
    canManage: who.canManage, canCheck: who.canManage || who.canCheck, final, now: iso(nowMs), venue: venueView, latest,
  };
}

// ── Notices ──────────────────────────────────────────────────────────────────────────────────────────

/** One "You're up" per (player, key), in-app and by text (claimed in event_reminders_sent). Also used by brackets decided by time trial. */
export async function notifyLines(t: { id: string; title: string; organizer_id: string }, lines: { pid: string; key: string; text: string }[]): Promise<void> {
  if (!lines.length) return;
  const ctx = { t };
  const attendees = await listAttendees("tournament", ctx.t.id);
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const targets = lines.map((l) => byId.get(l.pid)).filter((a): a is NonNullable<typeof a> => !!a);
  if (!targets.length) return;
  const recipients = await recipientsFor(targets);
  const href = `/tournament/${ctx.t.id}`;
  const url = `${getBaseUrl()}${href}`;
  for (const l of lines) {
    const r = recipients.get(l.pid);
    if (!r) continue;
    const { error } = await svc().from("event_reminders_sent").insert({ event_type: "tournament", event_id: ctx.t.id, attendee_key: `${l.pid}:tt:${l.key}`, threshold: "up" });
    if (error) continue;
    await deliver(r, {
      inApp: { type: "tournament_youre_up", title: "You're up", message: `${l.text} ${ctx.t.title}.`, link: href, data: { eventType: "tournament", eventId: ctx.t.id } },
      sms: { body: `${l.text} ${ctx.t.title}: ${url}`, category: "event_reminders", billedUserId: ctx.t.organizer_id, eventType: "tournament", eventId: ctx.t.id },
    });
  }
}

const closeText = (at: string) => new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" });

/** When a round opens (pick 6A): each player in it, with their group and when it closes. */
async function notifyRoundOpen(ctx: TtCtx, state: TtEventState): Promise<void> {
  const r = state.rounds.at(-1);
  if (!r) return;
  const label = roundLabel(r, state.rounds.length + (r.final || r.n === 0 ? 0 : 1));
  const lines = r.n === 0
    ? seated(ctx).map((p) => ({ pid: p.id, key: "r0", text: `The time trial is open until ${closeText(r.closesAt)}.` }))
    : r.groups.flatMap((g, gi) => g.map((pid) => ({ pid, key: `r${r.n}`, text: `${label} is open${r.final ? "" : `: Group ${groupLabel(gi)}`}, until ${closeText(r.closesAt)}.` })));
  await notifyLines(ctx.t, lines);
}

async function notifyRunoffs(ctx: TtCtx, state: TtEventState): Promise<void> {
  const r = state.rounds.at(-1);
  if (!r?.runoffs.length) return;
  const lines = r.runoffs.flatMap((ro) => ro.players.map((pid) => ({
    pid, key: `ro${r.n}:${ro.group}`,
    text: `You're tied at the cut: a run-off on ${ttTrack(ctx.game, ro.track)?.name ?? "one track"} decides ${ro.spots === 1 ? "the last spot" : `${ro.spots} spots`}, until ${closeText(ro.closesAt)}.`,
  })));
  await notifyLines(ctx.t, lines);
}

/** In person: each player in a group called to a station (pick 7A). Once per group, round and station. */
async function notifyCalls(ctx: TtCtx, r: Pick<TtRound, "n" | "groups">, calls: TtCall[]): Promise<void> {
  const lines = calls.flatMap((c) => (r.groups[c.group] ?? []).map((pid) => ({
    pid, key: `call${r.n}:${c.group}:${c.station}`, text: `Go to Station ${c.station}: Group ${groupLabel(c.group)} is up in`,
  })));
  await notifyLines(ctx.t, lines);
}

/**
 * The every-minute sweep: an hour before a round (or a group's extension) closes, players in it who still miss a
 * track get one reminder (pick 6A). Claimed per player and round, so it sends once.
 */
export async function sweepTtEvents(): Promise<number> {
  if (!(await ttEventsReady())) return 0;
  const { data } = await svc().from("tournaments").select("id").eq("format", "time_trial").eq("status", "in_progress").limit(200);
  let sent = 0;
  const now = Date.now();
  for (const { id } of (data ?? []) as { id: string }[]) {
    const ctx = await loadTt(id);
    if (!ctx || ctx === "missing" || !ctx.state) continue;
    const r = ctx.state.rounds.at(-1);
    // In person, runners type the times in and the organizer closes the round: no "an hour left".
    if (!r || !roundOpen(r, now) || ctx.state.venue) continue;
    const runs = runsOf(ctx, r.n);
    const best = bestTimes(runs);
    const members = r.n === 0 ? seated(ctx).map((p) => [p.id, 0] as const) : r.groups.flatMap((g, gi) => g.map((p) => [p, gi] as const));
    const lines: { pid: string; key: string; text: string }[] = [];
    for (const [pid, gi] of members) {
      const left = Date.parse(groupCloses(r, gi)) - now;
      if (left > 3600_000 || left < 0) continue;
      const missing = r.tracks.filter((t) => !best.get(t)?.has(pid)).length;
      if (!missing) continue;
      lines.push({ pid, key: `close${r.n}`, text: `An hour left, and you still need ${missing === 1 ? "a time on 1 track" : `times on ${missing} tracks`}.` });
    }
    if (lines.length) { await notifyLines(ctx.t, lines); sent += lines.length; }
  }
  return sent;
}

// ── Listing (the time trials page's events row, pick 12A) ────────────────────────────────────────────

export interface TtEventListItem { id: string; title: string; game: TtGame; status: "open" | "in_progress"; players: number; closesAt: string | null; startsAt: string | null; board: string }

/** Time trial events people can join or are running now, soonest first: for one game, or both. */
export async function listTtEvents(game: TtGame | null, limit = 4): Promise<TtEventListItem[]> {
  if (!(await ttEventsReady())) return [];
  // Time trial events, and Swiss events whose matches are decided by time trial.
  let q = svc().from("tournaments").select("id, title, status, format, game_slug, date_time, settings, tt, archived_at")
    .or("format.eq.time_trial,and(format.eq.swiss,settings->swiss->>timeTrial.eq.true),and(format.in.(single_elim,double_elim),settings->>timeTrial.eq.true)")
    .in("status", ["open", "in_progress"]).is("archived_at", null);
  if (game) q = q.eq("game_slug", game === "mk8dx" ? "mario-kart-8-deluxe" : "mario-kart-world");
  const { data, error } = await q.order("status", { ascending: false }).order("date_time", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) return [];
  type Row = { id: string; title: string; status: "open" | "in_progress"; format: string; game_slug: string; date_time: string | null; settings: Record<string, unknown> | null; tt: unknown };
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const { data: ppl } = ids.length ? await svc().from("tournament_participants").select("tournament_id").in("tournament_id", ids).in("status", [...SEATED]) : { data: [] };
  const count = new Map<string, number>();
  for (const p of (ppl ?? []) as { tournament_id: string }[]) count.set(p.tournament_id, (count.get(p.tournament_id) ?? 0) + 1);
  return rows.map((r) => {
    const g = (gameBySlug(r.game_slug)?.id ?? "mk8dx") as TtGame;
    const st = isTtState(r.tt) ? r.tt : null;
    const cur = st?.rounds.at(-1) ?? null;
    const settings = ttSettingsOf(r.settings?.tt, g);
    return {
      id: r.id, title: r.title, game: g, status: r.status, players: count.get(r.id) ?? 0,
      closesAt: cur && roundOpen(cur) ? lastClose(cur) : null, startsAt: r.date_time,
      board: `${settings.cc}cc, ${settings.items === "none" ? "no mushrooms" : "mushrooms"}${r.format === "swiss" ? `, Swiss, best of ${(r.settings?.swiss as { bestOf?: number } | undefined)?.bestOf === 1 ? 1 : 3} tracks`
        : r.format === "single_elim" || r.format === "double_elim" ? `, ${r.format === "double_elim" ? "double" : "single"} elimination, best of ${r.settings?.ttBestOf === 3 ? 3 : 1} track${r.settings?.ttBestOf === 3 ? "s" : ""}`
        : settings.shape === "groups" ? ", groups and a final" : ""}`,
    };
  });
}

// ── From Discord (/tt add, events pick 10A) ──────────────────────────────────────────────────────────

export interface TtEventChoice { id: string; title: string }

/**
 * The events a player could count a board time in: they're seated, their window is open, the track is in the round
 * (or their run-off), and the board matches (same game, speed and items; a vehicle board only when the event's
 * vehicle is that one or any).
 */
export async function eventsForBoardTime(userId: string, t: { game: TtGame; track: string; cc: number; items: string; vehicle: string }): Promise<TtEventChoice[]> {
  if (!(await ttEventsReady())) return [];
  const db = svc();
  const { data: mine } = await db.from("tournament_participants").select("id, tournament_id, status").eq("user_id", userId).in("status", [...SEATED]);
  const tids = [...new Set(((mine ?? []) as { tournament_id: string }[]).map((m) => m.tournament_id))];
  if (!tids.length) return [];
  const { data } = await db.from("tournaments").select("id, title, game_slug, settings, tt").in("id", tids).eq("format", "time_trial").eq("status", "in_progress");
  const out: TtEventChoice[] = [];
  const now = Date.now();
  for (const r of (data ?? []) as { id: string; title: string; game_slug: string; settings: Record<string, unknown> | null; tt: unknown }[]) {
    const game = gameBySlug(r.game_slug)?.id;
    if (game !== t.game || !isTtState(r.tt)) continue;
    const s = ttSettingsOf(r.settings?.tt, game);
    if (s.cc !== t.cc || s.items !== t.items || (s.vehicle !== "any" && s.vehicle !== t.vehicle)) continue;
    const cur = r.tt.rounds.at(-1);
    if (!cur || r.tt.finishedAt) continue;
    const pid = ((mine ?? []) as { id: string; tournament_id: string }[]).find((m) => m.tournament_id === r.id)?.id;
    if (!pid) continue;
    const ro = cur.runoffs.find((x) => !x.settled && x.players.includes(pid) && x.track === t.track && now >= Date.parse(x.opensAt) && now <= Date.parse(x.closesAt));
    const group = cur.n === 0 ? 0 : cur.groups.findIndex((g) => g.includes(pid));
    const open = group >= 0 && !cur.through && !cur.closedAt && now >= Date.parse(cur.opensAt) && now <= Date.parse(groupCloses(cur, group)) && cur.tracks.includes(t.track);
    if (ro || open) out.push({ id: r.id, title: r.title });
  }
  return out;
}

/** Counts one of the player's board times (with its screenshot) in an event. */
export async function countBoardTime(id: string, userId: string, boardTimeId: string): Promise<{ ok: true; title: string; game: TtGame; track: string; place: number; total: number; needsClip: boolean; runoff: boolean } | { ok: false; error: TtError }> {
  const ctx = await loadTt(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx || ctx.t.format !== "time_trial") return { ok: false, error: "not_found" };
  const me = ctx.people.find((p) => p.user_id === userId && SEATED.has(p.status));
  if (!me) return { ok: false, error: "not_playing" };
  const { data } = await svc().from("tt_times").select("id, player, game, track, cc, items, vehicle, time_ms, proof_kind, proof_url, laps, read_ms, status").eq("id", boardTimeId).maybeSingle();
  const b = data as { id: string; player: string; game: string; track: string; cc: number; items: string; vehicle: string; time_ms: number; proof_kind: string; proof_url: string | null; laps: number[] | null; read_ms: number | null; status: string } | null;
  if (!b || b.player !== `u:${userId}` || b.status !== "ok") return { ok: false, error: "gone" };
  if (b.proof_kind !== "screenshot" || !b.proof_url) return { ok: false, error: "screenshot_required" };
  const s = ctx.settings;
  if (b.game !== ctx.game || b.cc !== s.cc || b.items !== s.items || (s.vehicle !== "any" && b.vehicle !== s.vehicle)) return { ok: false, error: "bad_track" };
  const cur = ctx.state?.rounds.at(-1);
  const runoff = !!cur?.runoffs.some((x) => !x.settled && x.players.includes(me.id) && x.track === b.track);
  const r = await saveTime(ctx, {
    participantId: me.id, track: b.track, ms: b.time_ms, runoff, source: "player", addedBy: userId, screenshot: b.proof_url,
    boardTimeId: b.id, board: { player: `u:${userId}`, userId, readMs: b.read_ms, readLaps: null, laps: b.laps, parts: null },
  });
  if (!r.ok) return r;
  return { ok: true, title: ctx.t.title, game: ctx.game, track: b.track, place: r.place, total: r.total, needsClip: r.needsClip, runoff };
}
