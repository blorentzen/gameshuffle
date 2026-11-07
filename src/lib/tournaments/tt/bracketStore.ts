import "server-only";

/**
 * Brackets decided by time trial on the server: a player adds a time to their open match, matches settle themselves
 * as the times come in (and the bracket moves on), the organizer can settle one on the times so far, and both players
 * hear when a match opens. Rules in bracketTt.ts; the bracket itself is the ordinary 1v1 bracket in tournaments.bracket.
 *
 * Writes to the bracket are guarded by its `v` (bumped on every save here and on the manage page), so a settle never
 * overwrites a result the organizer picked at the same moment.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { addTime } from "@/lib/timeTrials/store";
import { gameBySlug, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtParts } from "@/lib/timeTrials/parts";
import { bracketChampion, lbRoundLabel, matchRoundLabel, roundLabel, type Bracket, type BracketMatch } from "../bracket";
import { ttSettingsOf, type TtCheckItem, type TtEventSettings, type TtProof } from "./event";
import { matchProofStates } from "./matchProof";
import {
  BRACKET_ROUND_BASE, bracketHolds, bracketMatchScore, bracketSlot, bracketTracks, bracketTtRound, isOpenMatch, isTtBracket, openMatchFor,
  settleBracket, ttBestOfOf, type TtBestOf, type TtBracketMatchView, type TtBracketTime, type TtBracketView,
} from "./bracketTt";
import { TT_ERRORS, notifyLines, type TtError } from "./store";
import { tracksForSlot } from "./swissTt";

const SEATED = new Set(["confirmed", "checked_in"]);
const MISSING = new Set(["42703", "PGRST204", "42P01", "PGRST205"]);
const svc = () => createServiceClient();

interface Row {
  id: string; title: string; status: string; format: string | null; game_slug: string | null;
  settings: Record<string, unknown> | null; organizer_id: string; bracket: Bracket | null;
}
interface Person { id: string; user_id: string | null; display_name: string | null; status: string }
interface TimeRow {
  id: string; participant_id: string; round: number; track: string; time_ms: number; proof_status: TtProof; created_at: string;
  video_url: string | null; screenshot_url: string | null; source: "player" | "runner" | "staff";
}

export interface BracketTtCtx {
  t: Row;
  game: TtGame;
  settings: TtEventSettings;
  bestOf: TtBestOf;
  bracket: Bracket | null;
  people: Person[];
  times: TimeRow[];
}

/** A bracket tournament decided by time trial. "missing" before tt-events-m1.sql; null when it isn't one. */
export async function loadBracketTt(id: string): Promise<BracketTtCtx | "missing" | null> {
  const db = svc();
  const { data } = await db.from("tournaments").select("id, title, status, format, game_slug, settings, organizer_id, bracket").eq("id", id).maybeSingle();
  if (!data) return null;
  const t = data as unknown as Row;
  if (!isTtBracket(t)) return null;
  const game = (gameBySlug(t.game_slug ?? "")?.id ?? "mk8dx") as TtGame;
  let tq = db.from("tt_event_times").select("id, participant_id, round, track, time_ms, proof_status, created_at, video_url, screenshot_url, source")
    .eq("tournament_id", id).gte("round", BRACKET_ROUND_BASE);
  // Times from a bracket the organizer cleared and made again don't count in the new one.
  if (t.bracket?.generatedAt) tq = tq.gte("created_at", t.bracket.generatedAt);
  const [ppl, times] = await Promise.all([
    db.from("tournament_participants").select("id, user_id, display_name, status").eq("tournament_id", id),
    tq.order("created_at", { ascending: true }).limit(20000),
  ]);
  if (times.error && times.error.code && MISSING.has(times.error.code)) return "missing";
  return {
    t, game, settings: ttSettingsOf(t.settings?.tt, game), bestOf: ttBestOfOf(t.settings), bracket: t.bracket ?? null,
    people: (ppl.data ?? []) as Person[], times: (times.data ?? []) as TimeRow[],
  };
}

/** The sentence for a refused bracket action (the time trial wording, with a few said for matches). */
const BRACKET_MESSAGES: Partial<Record<TtError, string>> = {
  not_now: "Matches open once the organizer starts the tournament.",
  not_your_round: "You don't have a match open right now.",
  bad_track: "That track isn't in your match.",
};
export const bracketMessage = (e: TtError): string => BRACKET_MESSAGES[e] ?? TT_ERRORS[e];

const timesOf = (ctx: BracketTtCtx): TtBracketTime[] =>
  ctx.times.map((x) => ({ participantId: x.participant_id, round: x.round, track: x.track, ms: x.time_ms, counts: x.proof_status !== "rejected", id: x.id, proof: x.proof_status, video: x.video_url }));

/** A match the times have decided that waits for its clips to be checked. */
export function bracketMatchHeld(ctx: BracketTtCtx, b: Bracket, m: BracketMatch, times: TtBracketTime[] = timesOf(ctx)): boolean {
  if (ctx.settings.matchClips === 0) return false;
  const sc = bracketMatchScore(b, m, ctx.settings.tracks, ctx.bestOf, times);
  return sc.done && !!sc.winner && bracketHolds(b, m, ctx.settings.tracks, ctx.bestOf, times, ctx.settings.matchClips).length > 0;
}

const nameOf = (ctx: BracketTtCtx, id: string | null) => (id ? ctx.people.find((p) => p.id === id)?.display_name ?? "Player" : "To be decided");

/** Saves the bracket only if nobody else saved it since `prev` was read. */
async function writeBracket(id: string, prev: Bracket, next: Bracket): Promise<boolean> {
  let q = svc().from("tournaments").update({ bracket: { ...next, v: (prev.v ?? 0) + 1 } }).eq("id", id).not("bracket", "is", null);
  q = prev.v == null ? q.is("bracket->>v", null) : q.eq("bracket->>v", String(prev.v));
  const { data, error } = await q.select("id");
  return !error && (data ?? []).length === 1;
}

/**
 * Reports every match the times have settled (and `close` on the times so far). Retries on a clash. Tells the players
 * of every match that opened because of it.
 */
export async function settleTtBracket(id: string, close?: string | null): Promise<{ ok: true; settled: string[]; level: string | null } | { ok: false; error: TtError }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const ctx = await loadBracketTt(id);
    if (ctx === "missing") return { ok: false, error: "missing" };
    if (!ctx || !ctx.bracket) return { ok: false, error: "not_found" };
    const before = new Set(ctx.bracket.matches.filter(isOpenMatch).map((m) => m.id));
    const r = settleBracket(ctx.bracket, ctx.settings.tracks, ctx.bestOf, timesOf(ctx), close, ctx.settings.matchClips);
    if (!r.settled.length) return { ok: true, settled: [], level: r.level };
    if (await writeBracket(id, ctx.bracket, r.bracket)) {
      const opened = r.bracket.matches.filter((m) => isOpenMatch(m) && !before.has(m.id));
      if (ctx.t.status === "in_progress" && opened.length) await notifyOpen(ctx, r.bracket, opened).catch((err) => console.error("[tt-bracket] notify failed:", err));
      return { ok: true, settled: r.settled, level: r.level };
    }
    await new Promise((res) => setTimeout(res, 40 + Math.random() * 120));
  }
  return { ok: false, error: "busy" };
}

/** Settles every match open now on the times so far (matches that open because of it stay open). */
export async function settleAllOpen(id: string): Promise<{ ok: true; settled: number; level: string[] } | { ok: false; error: TtError }> {
  const ctx = await loadBracketTt(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx || !ctx.bracket) return { ok: false, error: "not_found" };
  const ids = ctx.bracket.matches.filter(isOpenMatch).map((m) => m.id);
  let settled = 0;
  const level: string[] = [];
  for (const mid of ids) {
    const r = await settleTtBracket(id, mid);
    if (!r.ok) return r;
    settled += r.settled.length;
    if (r.level) level.push(r.level);
  }
  return { ok: true, settled, level };
}

const trackList = (ctx: BracketTtCtx, b: Bracket, m: BracketMatch) => bracketTracks(ctx.settings.tracks, ctx.bestOf, b, m);

/** "Your Semifinals match against Sam is open in" (the notice adds the tournament's name). */
async function notifyOpen(ctx: BracketTtCtx, b: Bracket, matches: BracketMatch[]): Promise<void> {
  const lines: { pid: string; key: string; text: string }[] = [];
  for (const m of matches) {
    const label = matchRoundLabel(b, m);
    for (const [me, them] of [[m.a!, m.b!], [m.b!, m.a!]]) lines.push({ pid: me, key: `bracket:${m.id}`, text: `Your ${label} match against ${nameOf(ctx, them)} is open in` });
  }
  await notifyLines(ctx.t, lines);
}

/** Every open match's players hear it's open (once per match). For the manage page's ping and the start. */
export async function notifyOpenMatches(id: string): Promise<number> {
  const ctx = await loadBracketTt(id);
  if (!ctx || ctx === "missing" || !ctx.bracket || ctx.t.status !== "in_progress") return 0;
  const open = ctx.bracket.matches.filter(isOpenMatch);
  await notifyOpen(ctx, ctx.bracket, open);
  return open.length;
}

export async function bracketTtAdd(id: string, userId: string, input: {
  track: string; ms: number; screenshot: string; laps: number[] | null; read: { timeMs: number | null; laps: number[] | null; parts: TtParts | null } | null;
  /** A time already on the boards (added in Discord): the event points at it instead of adding a second one. */
  boardTimeId?: string | null;
}): Promise<{ ok: true; timeId: string; won: number; lost: number; settled: boolean; held: boolean; needsClip: boolean } | { ok: false; error: TtError }> {
  const ctx = await loadBracketTt(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx || !ctx.bracket) return { ok: false, error: "not_found" };
  if (ctx.t.status !== "in_progress") return { ok: false, error: "not_now" };
  const me = ctx.people.find((p) => p.user_id === userId && SEATED.has(p.status));
  if (!me) return { ok: false, error: "not_playing" };
  const m = openMatchFor(ctx.bracket, me.id);
  if (!m) return { ok: false, error: "not_your_round" };
  const tracks = trackList(ctx, ctx.bracket, m);
  if (!tracks.includes(input.track)) return { ok: false, error: "bad_track" };
  if (!(input.ms >= 30_000 && input.ms <= 600_000)) return { ok: false, error: "bad_time" };
  // Decided and waiting on its clips: no more racing unless a check takes a time away.
  if (bracketMatchHeld(ctx, ctx.bracket, m)) return { ok: false, error: "held" };
  const round = bracketTtRound(m);
  const db = svc();
  // A double tap or a retried request: the same time on the same track within ten minutes is the first one again.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dupe } = await db.from("tt_event_times").select("id").eq("tournament_id", id).eq("participant_id", me.id)
    .eq("round", round).eq("track", input.track).eq("time_ms", input.ms).gte("created_at", since).limit(1).maybeSingle();
  let timeId = (dupe as { id: string } | null)?.id ?? null;
  if (!timeId && input.boardTimeId) {
    const { data, error } = await db.from("tt_event_times").insert({
      tournament_id: id, participant_id: me.id, round, track: input.track, time_ms: input.ms, laps: input.laps, read_ms: input.read?.timeMs ?? null,
      screenshot_url: input.screenshot, source: "player", added_by: userId, board_time_id: input.boardTimeId,
    }).select("id").single();
    if (error || !data) { console.error("[tt-bracket] add failed:", error?.message); return { ok: false, error: "failed" }; }
    timeId = (data as { id: string }).id;
  }
  if (!timeId) {
    const s = ctx.settings;
    const added = await addTime({
      player: `u:${userId}`, userId, identityId: null, game: ctx.game, track: input.track, cc: s.cc, items: s.items, vehicle: s.vehicle,
      timeMs: input.ms, proof: "screenshot", proofUrl: input.screenshot, readByAi: input.read?.timeMs === input.ms, source: "site",
      laps: input.laps, readMs: input.read?.timeMs ?? null, readLaps: input.read?.laps ?? null, parts: input.read?.parts ?? null,
    });
    if (!added.ok && added.error === "faster_than_record") return { ok: false, error: "faster_than_record" };
    const { data, error } = await db.from("tt_event_times").insert({
      tournament_id: id, participant_id: me.id, round, track: input.track, time_ms: input.ms, laps: input.laps, read_ms: input.read?.timeMs ?? null,
      screenshot_url: input.screenshot, source: "player", added_by: userId, board_time_id: added.ok ? added.timeId : null,
    }).select("id").single();
    if (error || !data) { console.error("[tt-bracket] add failed:", error?.message); return { ok: false, error: "failed" }; }
    timeId = (data as { id: string }).id;
  }
  const times: TtBracketTime[] = [...timesOf(ctx).filter((x) => x.id !== timeId), { participantId: me.id, round, track: input.track, ms: input.ms, counts: true, id: timeId, proof: "none", video: null }];
  const sc = bracketMatchScore(ctx.bracket, m, ctx.settings.tracks, ctx.bestOf, times);
  const mineA = m.a === me.id;
  const needsClip = bracketHolds(ctx.bracket, m, ctx.settings.tracks, ctx.bestOf, times, ctx.settings.matchClips).some((h) => h.id === timeId && h.needsClip);
  const settle = await settleTtBracket(id);
  const settled = settle.ok && settle.settled.includes(m.id);
  return { ok: true, timeId, won: mineA ? sc.a : sc.b, lost: mineA ? sc.b : sc.a, settled, held: !settled && bracketMatchHeld(ctx, ctx.bracket, m, times), needsClip };
}

// ── The view ─────────────────────────────────────────────────────────────────────────────────────────

function matchView(ctx: BracketTtCtx, b: Bracket, m: BracketMatch, times: TtBracketTime[]): TtBracketMatchView {
  const tracks = trackList(ctx, b, m);
  const round = bracketTtRound(m);
  const best = (pid: string, track: string) => {
    let ms: number | null = null;
    for (const x of times) if (x.round === round && x.participantId === pid && x.track === track && x.counts && (ms === null || x.ms < ms)) ms = x.ms;
    return ms;
  };
  const sc = bracketMatchScore(b, m, ctx.settings.tracks, ctx.bestOf, times);
  const proof = matchProofStates(m.a!, m.b!, tracks, round, times.filter((x) => x.id).map((x) => ({ id: x.id!, participantId: x.participantId, round: x.round, track: x.track, ms: x.ms, proof: x.proof ?? "none", video: x.video ?? null })), ctx.settings.matchClips);
  return {
    id: m.id, label: matchRoundLabel(b, m),
    a: { id: m.a!, name: nameOf(ctx, m.a), won: sc.a }, b: { id: m.b!, name: nameOf(ctx, m.b), won: sc.b },
    tracks: tracks.map((t) => ({ id: t, a: best(m.a!, t), b: best(m.b!, t), aProof: proof.get(t)?.get(m.a!) ?? null, bProof: proof.get(t)?.get(m.b!) ?? null })),
    held: bracketMatchHeld(ctx, b, m, times),
  };
}

function schedule(ctx: BracketTtCtx, b: Bracket | null): { label: string; tracks: string[] }[] {
  const list = ctx.settings.tracks;
  if (!b) return [];
  const out: { label: string; tracks: string[] }[] = [];
  for (let r = 0; r < b.rounds; r++) out.push({ label: roundLabel(r, b.rounds), tracks: tracksForSlot(list, ctx.bestOf, bracketSlot(b, { group: "wb", round: r })) });
  for (let r = 0; r < (b.lbRounds ?? 0); r++) out.push({ label: lbRoundLabel(r, b.lbRounds ?? 0), tracks: tracksForSlot(list, ctx.bestOf, bracketSlot(b, { group: "lb", round: r })) });
  if (b.kind === "double_elim") out.push({ label: "Grand Final", tracks: tracksForSlot(list, ctx.bestOf, bracketSlot(b, { group: "gf", round: 0 })) });
  return out;
}

export function bracketTtView(ctx: BracketTtCtx, who: { userId: string | null; canManage: boolean; canCheck?: boolean }): TtBracketView {
  const b = ctx.bracket;
  const times = timesOf(ctx);
  const open = b ? b.matches.filter(isOpenMatch).map((m) => matchView(ctx, b, m, times)) : [];
  const me = who.userId ? ctx.people.find((p) => p.user_id === who.userId && SEATED.has(p.status)) : null;
  let you: TtBracketView["you"] = null;
  if (me) {
    const m = b ? openMatchFor(b, me.id) : null;
    const mv = m ? open.find((x) => x.id === m.id) ?? null : null;
    // Out = lost in single elimination, or lost twice in double.
    // (Losing the first grand final from the winners side only forces the reset, so it isn't a loss here.)
    const losses = b ? b.matches.filter((x) => x.winner && (x.a === me.id || x.b === me.id) && x.winner !== me.id && !(x.id === "gf-r0-m0" && x.a === me.id)).length : 0;
    you = { participantId: me.id, match: mv ? { ...mv, side: mv.a.id === me.id ? "a" : "b" } : null, out: !!b && !mv && (b.kind === "single_elim" ? losses >= 1 : losses >= 2) };
  }
  return {
    settings: ctx.settings, bestOf: ctx.bestOf, started: ctx.t.status === "in_progress" || ctx.t.status === "complete", generated: !!b,
    champion: b ? (() => { const c = bracketChampion(b); return c ? nameOf(ctx, c) : null; })() : null,
    schedule: schedule(ctx, b), open, you, canManage: who.canManage, canCheck: who.canManage || !!who.canCheck,
  };
}

// ── The times to check ───────────────────────────────────────────────────────────────────────────────

/** Open matches' times waiting on a check (clip needed or clip in), the ones holding a decided match first. */
export function bracketChecks(ctx: BracketTtCtx): { checks: TtCheckItem[]; holding: number } {
  const b = ctx.bracket;
  if (!b || ctx.settings.matchClips === 0) return { checks: [], holding: 0 };
  const times = timesOf(ctx);
  const byId = new Map(ctx.times.map((x) => [x.id, x]));
  const checks: TtCheckItem[] = [];
  for (const m of b.matches.filter(isOpenMatch)) {
    const held = bracketMatchHeld(ctx, b, m, times);
    for (const h of bracketHolds(b, m, ctx.settings.tracks, ctx.bestOf, times, ctx.settings.matchClips)) {
      const row = byId.get(h.id);
      if (!row) continue;
      checks.push({
        id: h.id, name: nameOf(ctx, h.participantId), track: h.track, round: row.round, ms: h.ms, place: h.place, proof: h.proof,
        screenshot: row.screenshot_url, video: row.video_url, needsClip: h.needsClip, at: row.created_at, source: row.source,
        label: `${matchRoundLabel(b, m)}, ${nameOf(ctx, m.a)} vs ${nameOf(ctx, m.b)}`, held,
      });
    }
  }
  const rank = (c: TtCheckItem) => (c.held ? 0 : 2) + (c.proof === "waiting" ? 0 : 1);
  checks.sort((x, y) => rank(x) - rank(y) || x.at.localeCompare(y.at));
  return { checks, holding: checks.filter((c) => c.held).length };
}
