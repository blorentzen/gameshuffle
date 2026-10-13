import "server-only";

/**
 * Swiss on the server: loads a tournament's Swiss run, applies organizer and
 * player actions, and builds what each person sees. Rules are in swiss.ts.
 *
 * Writes go through `mutate`, which saves `tournaments.swiss` only if its
 * version hasn't moved (two organizers, or a player dropping while the
 * organizer pairs, can't overwrite each other) and re-plans on a clash.
 * Players' reports are rows of their own (tournament_swiss_reports), so a full
 * room reporting at once never touches the tournament row at all.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { listAttendees } from "@/lib/events/attendees";
import { deliver } from "@/lib/events/notify";
import { recipientsFor } from "@/lib/events/reminders";
import type { Bracket } from "./bracket";
import {
  SWISS_MIN_PLAYERS, cutBracket, cutMatchStatus, cutSeeds, currentMatchFor, describeStructure, finalPlacements,
  gamesToWin, isSwissState, lockRound, newSwissState, nextStep, pairNextRound, recordText, roundKey,
  secondsLeft, swissPhase, swissSettingsOf, swissStandings, tableStatus, validScore, cutKey,
  type NextStep, type SwissPhase, type SwissReport, type SwissState, type TableState,
} from "./swiss";

const SEATED = new Set(["confirmed", "checked_in"]);
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export interface SwissTournament {
  id: string;
  title: string;
  status: string;
  format: string | null;
  game_slug: string | null;
  settings: Record<string, unknown> | null;
  organizer_id: string;
  swiss: SwissState | null;
}
interface Participant { id: string; user_id: string | null; display_name: string | null; status: string; joined_at: string | null }

export interface SwissCtx { t: SwissTournament; people: Participant[]; reports: SwissReport[]; state: SwissState | null }

export type SwissError =
  | "missing" | "not_found" | "not_swiss" | "not_open" | "too_few" | "busy" | "not_now" | "bad_score"
  | "not_in_match" | "set_by_organizer" | "locked" | "not_playing" | "already_dropped" | "cant_change";

export const SWISS_ERRORS: Record<SwissError, string> = {
  missing: "Swiss needs a database update first.",
  not_found: "We couldn't find that tournament.",
  not_swiss: "This tournament isn't Swiss.",
  not_open: "Publish the tournament before pairing round 1.",
  too_few: `Swiss needs at least ${SWISS_MIN_PLAYERS} confirmed players.`,
  busy: "Someone else changed the event at the same moment. Try again.",
  not_now: "That can't be done at this point in the event.",
  bad_score: "That isn't a possible score for this match.",
  not_in_match: "That isn't your match.",
  set_by_organizer: "The organizer already entered this result.",
  locked: "That round is locked: results can be changed until the round after next is paired.",
  not_playing: "You're not playing in this tournament.",
  already_dropped: "You've already dropped.",
  cant_change: "That match's winner has already played the next match.",
};

const svc = () => createServiceClient();

/** Everything about a tournament's Swiss run. "missing" before swiss-m1.sql. */
export async function loadSwiss(id: string): Promise<SwissCtx | "missing" | null> {
  const db = svc();
  const { data, error } = await db.from("tournaments").select("id, title, status, format, game_slug, settings, organizer_id, swiss").eq("id", id).maybeSingle();
  if (error) return error.code && MISSING_COLUMN.has(error.code) ? "missing" : null;
  if (!data) return null;
  const t = data as unknown as SwissTournament;
  const [{ data: ppl }, rep] = await Promise.all([
    db.from("tournament_participants").select("id, user_id, display_name, status, joined_at").eq("tournament_id", id).order("joined_at", { ascending: true }),
    db.from("tournament_swiss_reports").select("match_key, participant_id, mine, theirs").eq("tournament_id", id),
  ]);
  if (rep.error && rep.error.code && MISSING_TABLE.has(rep.error.code)) return "missing";
  const reports = ((rep.data ?? []) as { match_key: string; participant_id: string; mine: number; theirs: number }[])
    .map((r) => ({ matchKey: r.match_key, participantId: r.participant_id, mine: r.mine, theirs: r.theirs }));
  return { t, people: (ppl ?? []) as Participant[], reports, state: isSwissState(t.swiss) ? t.swiss : null };
}

const cardGame = (t: SwissTournament) => t.game_slug === "pokemon-tcg";
/** Who plays the next round: seated (confirmed or checked in) and not dropped. */
const activeIds = (ctx: SwissCtx, state: SwissState | null) =>
  ctx.people.filter((p) => SEATED.has(p.status) && !(state && p.id in state.drops)).map((p) => p.id);

type Plan = { state: SwissState; extra?: Record<string, unknown>; after?: (state: SwissState) => Promise<void> } | { error: SwissError };

/** Plan against the latest row, save if nobody moved it, re-plan on a clash. */
async function mutate(id: string, plan: (ctx: SwissCtx) => Plan | Promise<Plan>): Promise<{ ok: true; state: SwissState } | { ok: false; error: SwissError }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const ctx = await loadSwiss(id);
    if (ctx === "missing") return { ok: false, error: "missing" };
    if (!ctx) return { ok: false, error: "not_found" };
    if (ctx.t.format !== "swiss") return { ok: false, error: "not_swiss" };
    const p = await plan(ctx);
    if ("error" in p) return { ok: false, error: p.error };
    const prev = ctx.state?.version ?? null;
    const next: SwissState = { ...p.state, version: (prev ?? 0) + 1 };
    let q = svc().from("tournaments").update({ swiss: next, ...(p.extra ?? {}) }).eq("id", id);
    q = prev === null ? q.is("swiss", null) : q.eq("swiss->>version", String(prev));
    const { data, error } = await q.select("id");
    if (!error && (data ?? []).length === 1) {
      if (p.after) await p.after(next).catch((err) => console.error("[swiss] after save failed:", err));
      return { ok: true, state: next };
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return { ok: false, error: "busy" };
}

const restartTimer = (state: SwissState, now: string): SwissState =>
  state.timer ? { ...state, timer: { ...state.timer, startedAt: now, pausedAt: null, extraSeconds: 0 } } : state;

/** Anyone paired before whose seat went away (removed or dropped from the attendee list) counts as dropped after the last round. */
function settleLeavers(ctx: SwissCtx, state: SwissState): SwissState {
  const seated = new Set(ctx.people.filter((p) => SEATED.has(p.status)).map((p) => p.id));
  const drops = { ...state.drops };
  for (const r of state.list) for (const t of r.tables) for (const id of [t.a, t.b]) {
    if (id && !seated.has(id) && !(id in drops)) drops[id] = state.list.length;
  }
  return { ...state, drops };
}

// ─── Organizer actions ───────────────────────────────────────────────────────

export type OrganizerAction =
  | { action: "start" }
  | { action: "pair" }
  | { action: "cut" }
  | { action: "finish" }
  | { action: "repair" }
  | { action: "result"; key: string; table?: number; matchId?: string; a?: number; b?: number; clear?: boolean }
  | { action: "timer"; op: "start" | "pause" | "resume" | "add" | "restart" }
  | { action: "drop"; participantId: string }
  | { action: "undrop"; participantId: string };

export async function organizerAct(id: string, input: OrganizerAction) {
  const now = new Date().toISOString();
  switch (input.action) {
    case "start":
      return mutate(id, (ctx) => {
        if (ctx.state?.list.length) return { error: "not_now" };
        if (ctx.t.status !== "open" && ctx.t.status !== "in_progress") return { error: "not_open" };
        const field = activeIds(ctx, null);
        if (field.length < SWISS_MIN_PLAYERS) return { error: "too_few" };
        const fresh = newSwissState(swissSettingsOf(ctx.t.settings, cardGame(ctx.t)), field.length);
        const tables = pairNextRound(fresh, [], field, Math.random, ctx.t.id);
        const state = restartTimer({ ...fresh, list: [{ n: 1, pairedAt: now, tables, results: {} }] }, now);
        return { state, extra: { status: "in_progress" }, after: (s) => notifyRound(ctx.t, s, ctx.reports) };
      });
    case "pair":
      return mutate(id, (ctx) => {
        let state = ctx.state;
        if (!state || nextStep(state, ctx.reports) !== "pair") return { error: "not_now" };
        state = settleLeavers(ctx, state);
        const last = state.list[state.list.length - 1];
        const list = [...state.list.slice(0, -1), lockRound(state, last, ctx.reports)];
        const n = list.length + 1;
        const everPaired = new Set(list.flatMap((r) => r.tables.flatMap((t) => [t.a, t.b])));
        const field = activeIds(ctx, state);
        const lateFrom = { ...state.lateFrom };
        for (const pid of field) if (!everPaired.has(pid)) lateFrom[pid] = n;
        const base = { ...state, list, lateFrom };
        const tables = pairNextRound(base, ctx.reports, field, Math.random, ctx.t.id);
        const next = restartTimer({ ...base, list: [...list, { n, pairedAt: now, tables, results: {} }] }, now);
        return { state: next, after: (s) => notifyRound(ctx.t, s, ctx.reports) };
      });
    case "repair":
      return mutate(id, (ctx) => {
        const state = ctx.state;
        if (!state || state.cut || state.finishedAt) return { error: "not_now" };
        const last = state.list[state.list.length - 1];
        if (!last) return { error: "not_now" };
        const touched = Object.keys(last.results).length > 0 || ctx.reports.some((r) => r.matchKey === roundKey(last.n));
        if (touched) return { error: "not_now" };
        const list = state.list.slice(0, -1);
        const lateFrom = Object.fromEntries(Object.entries(state.lateFrom).filter(([, from]) => from < last.n));
        const base = { ...settleLeavers(ctx, { ...state, list }), lateFrom };
        const field = activeIds(ctx, base);
        const everPaired = new Set(list.flatMap((r) => r.tables.flatMap((t) => [t.a, t.b])));
        if (list.length) for (const pid of field) if (!everPaired.has(pid)) base.lateFrom[pid] = last.n;
        if (!list.length && field.length < SWISS_MIN_PLAYERS) return { error: "too_few" };
        const tables = pairNextRound(base, ctx.reports, field, Math.random, ctx.t.id);
        const next = restartTimer({ ...base, list: [...list, { n: last.n, pairedAt: now, tables, results: {} }] }, now);
        return { state: next, after: (s) => notifyRound(ctx.t, s, ctx.reports, true) };
      });
    case "cut":
      return mutate(id, (ctx) => {
        const state = ctx.state;
        if (!state || nextStep(state, ctx.reports) !== "cut") return { error: "not_now" };
        const last = state.list[state.list.length - 1];
        const list = [...state.list.slice(0, -1), lockRound(state, last, ctx.reports)];
        const settled = settleLeavers(ctx, { ...state, list });
        const standings = swissStandings(settled, ctx.reports, activeIds(ctx, settled), ctx.t.id);
        const seeds = cutSeeds(standings, state.topCut);
        if (seeds.length < 2) return { error: "too_few" };
        const next = restartTimer({ ...settled, cut: { seeds, results: {} } }, now);
        return { state: next, after: (s) => notifyRound(ctx.t, s, ctx.reports) };
      });
    case "finish":
      return mutate(id, async (ctx) => {
        let state = ctx.state;
        if (!state || nextStep(state, ctx.reports) !== "finish") return { error: "not_now" };
        if (!state.cut) {
          const last = state.list[state.list.length - 1];
          state = { ...state, list: [...state.list.slice(0, -1), lockRound(state, last, ctx.reports)] };
        }
        const standings = swissStandings(state, ctx.reports, activeIds(ctx, state), ctx.t.id);
        const places = finalPlacements(state, ctx.reports, standings);
        const db = svc();
        const { error } = await db.from("tournament_results").upsert(
          places.map((p) => ({ tournament_id: ctx.t.id, participant_id: p.participantId, placement: p.placement, points: standings.find((r) => r.id === p.participantId)?.points ?? null })),
          { onConflict: "tournament_id,participant_id" },
        );
        if (error) return { error: "busy" };
        return { state: { ...state, finishedAt: now, timer: state.timer ? { ...state.timer, startedAt: null, pausedAt: null } : null }, extra: { status: "complete" } };
      });
    case "result":
      return mutate(id, (ctx) => {
        const state = ctx.state;
        if (!state || state.finishedAt) return { error: "not_now" };
        if (input.key.startsWith("c:")) {
          if (!state.cut) return { error: "not_now" };
          const matchId = input.key.slice(2);
          const bracket = cutBracket(state, ctx.reports)!;
          const m = bracket.matches.find((x) => x.id === matchId);
          if (!m || !m.a || !m.b) return { error: "not_now" };
          // A changed winner can't rewrite a match they've already played.
          if (m.winner) {
            const next = bracket.matches.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
            if (next?.winner) return { error: "cant_change" };
          }
          const results = { ...state.cut.results };
          if (input.clear) delete results[matchId];
          else {
            if (!validScore(state.bestOf, Number(input.a), Number(input.b), true)) return { error: "bad_score" };
            results[matchId] = { a: Number(input.a), b: Number(input.b), by: "organizer" };
          }
          return { state: { ...state, cut: { ...state.cut, results } }, after: (s) => notifyRound(ctx.t, s, ctx.reports) };
        }
        const n = Number(input.key.replace(/^r/, ""));
        const idx = state.list.findIndex((r) => r.n === n);
        if (idx < 0) return { error: "not_now" };
        // Handbook: a record can be changed until the round after next is paired.
        if (idx < state.list.length - 2 || state.cut) return { error: "locked" };
        const round = state.list[idx];
        const table = round.tables.find((t) => t.t === Number(input.table));
        if (!table || !table.b) return { error: "not_now" };
        const results = { ...round.results };
        if (input.clear) delete results[String(table.t)];
        else {
          if (!validScore(state.bestOf, Number(input.a), Number(input.b))) return { error: "bad_score" };
          results[String(table.t)] = { a: Number(input.a), b: Number(input.b), by: "organizer" };
        }
        const list = state.list.map((r, i) => (i === idx ? { ...r, results } : r));
        return { state: { ...state, list } };
      });
    case "timer":
      return mutate(id, (ctx) => {
        const state = ctx.state;
        if (!state?.timer || state.finishedAt) return { error: "not_now" };
        const t = { ...state.timer };
        if (input.op === "start" || input.op === "restart") { t.startedAt = now; t.pausedAt = null; t.extraSeconds = 0; }
        else if (input.op === "pause" && t.startedAt && !t.pausedAt) t.pausedAt = now;
        else if (input.op === "resume" && t.startedAt && t.pausedAt) {
          // Shift the start by the time spent paused.
          t.startedAt = new Date(Date.parse(t.startedAt) + (Date.now() - Date.parse(t.pausedAt))).toISOString();
          t.pausedAt = null;
        } else if (input.op === "add") t.extraSeconds += 300;
        else return { error: "not_now" };
        return { state: { ...state, timer: t } };
      });
    case "drop":
      return dropPlayer(id, input.participantId);
    case "undrop":
      return mutate(id, async (ctx) => {
        const state = ctx.state;
        if (!state || !(input.participantId in state.drops)) return { error: "not_now" };
        // Only before another round is paired: their record has no gaps then.
        if (state.drops[input.participantId] !== state.list.length || state.cut) return { error: "locked" };
        const drops = { ...state.drops };
        delete drops[input.participantId];
        await svc().from("tournament_participants").update({ status: "confirmed" }).eq("id", input.participantId).eq("tournament_id", id);
        return { state: { ...state, drops } };
      });
  }
}

/** A drop concedes the dropping player's unfinished match. */
async function dropPlayer(id: string, participantId: string) {
  return mutate(id, async (ctx) => {
    const state = ctx.state;
    const person = ctx.people.find((p) => p.id === participantId);
    if (!person) return { error: "not_playing" };
    // Before round 1 there's nothing to drop from: leaving the field is the normal withdraw.
    if (!state || !state.list.length) return { error: "not_now" };
    if (participantId in state.drops) return { error: "already_dropped" };
    if (state.finishedAt) return { error: "not_now" };
    const need = gamesToWin(state.bestOf);
    let next: SwissState = { ...state, drops: { ...state.drops, [participantId]: state.list.length } };
    const match = currentMatchFor(state, ctx.reports, participantId);
    if (match && match.opponent) {
      if (match.cut) {
        const matchId = match.key.slice(2);
        if (!state.cut!.results[matchId] && !cutMatchStatus(state, ctx.reports, matchId, match.side === "a" ? participantId : match.opponent, match.side === "a" ? match.opponent : participantId).result) {
          next = { ...next, cut: { ...state.cut!, results: { ...state.cut!.results, [matchId]: match.side === "a" ? { a: 0, b: need, by: "drop" } : { a: need, b: 0, by: "drop" } } } };
        }
      } else {
        const round = state.list[state.list.length - 1];
        const table = round.tables.find((t) => t.t === match.table)!;
        if (!tableStatus(state, round, table, ctx.reports).result) {
          const res = match.side === "a" ? { a: 0, b: need, by: "drop" as const } : { a: need, b: 0, by: "drop" as const };
          next = { ...next, list: state.list.map((r, i) => (i === state.list.length - 1 ? { ...r, results: { ...r.results, [String(table.t)]: res } } : r)) };
        }
      }
    }
    await svc().from("tournament_participants").update({ status: "dropped" }).eq("id", participantId).eq("tournament_id", id);
    return { state: next };
  });
}

// ─── Player actions ──────────────────────────────────────────────────────────

async function myParticipant(ctx: SwissCtx, userId: string) {
  return ctx.people.find((p) => p.user_id === userId) ?? null;
}

export async function playerReport(id: string, userId: string, input: { key: string; mine: number; theirs: number }): Promise<{ ok: true } | { ok: false; error: SwissError }> {
  const ctx = await loadSwiss(id);
  if (ctx === "missing") return { ok: false, error: "missing" };
  if (!ctx || !ctx.state) return { ok: false, error: ctx ? "not_now" : "not_found" };
  const me = await myParticipant(ctx, userId);
  if (!me) return { ok: false, error: "not_playing" };
  const state = ctx.state;
  if (me.id in state.drops) return { ok: false, error: "already_dropped" };
  const match = currentMatchFor(state, ctx.reports, me.id);
  if (!match || match.key !== input.key || !match.opponent) return { ok: false, error: "not_in_match" };
  const mine = Number(input.mine), theirs = Number(input.theirs);
  if (!validScore(state.bestOf, mine, theirs, match.cut)) return { ok: false, error: "bad_score" };
  if (match.cut) {
    if (state.cut!.results[match.key.slice(2)]) return { ok: false, error: "set_by_organizer" };
  } else {
    const round = state.list[state.list.length - 1];
    if (round.results[String(match.table)]) return { ok: false, error: "set_by_organizer" };
  }
  const { error } = await svc().from("tournament_swiss_reports").upsert(
    { tournament_id: id, match_key: input.key, participant_id: me.id, mine, theirs, reported_at: new Date().toISOString() },
    { onConflict: "tournament_id,match_key,participant_id" },
  );
  if (error) return { ok: false, error: error.code && MISSING_TABLE.has(error.code) ? "missing" : "busy" };
  // A top cut match the two players just agreed on calls the next one.
  if (match.cut) {
    const fresh = await loadSwiss(id);
    if (fresh && fresh !== "missing" && fresh.state) await notifyRound(fresh.t, fresh.state, fresh.reports).catch((err) => console.error("[swiss] cut alert failed:", err));
  }
  return { ok: true };
}

export async function playerDrop(id: string, userId: string) {
  const ctx = await loadSwiss(id);
  if (ctx === "missing") return { ok: false as const, error: "missing" as SwissError };
  if (!ctx) return { ok: false as const, error: "not_found" as SwissError };
  const me = await myParticipant(ctx, userId);
  if (!me) return { ok: false as const, error: "not_playing" as SwissError };
  return dropPlayer(id, me.id);
}

// ─── What people see ─────────────────────────────────────────────────────────

export interface ViewPlayer { id: string; name: string; record: string; points: number; /** Has an account (a guest can't report). */ account: boolean }
export interface ViewTable {
  t: number;
  a: ViewPlayer;
  b: ViewPlayer | null;
  state: TableState;
  /** Games for a, games for b. */
  result: { a: number; b: number; by: string } | null;
  /** Organizers only: what each player said. */
  reportA?: [number, number] | null;
  reportB?: [number, number] | null;
}
export interface ViewCutMatch { id: string; round: number; a: string | null; b: string | null; winner: string | null; state: TableState | null; result: { a: number; b: number } | null; reportA?: [number, number] | null; reportB?: [number, number] | null }
export interface SwissView {
  phase: SwissPhase;
  rounds: number;
  topCut: number;
  bestOf: 1 | 3;
  structure: string;
  players: number;
  /** `endsAt` while it runs, so screens count down between refreshes. */
  clock: { minutes: number | null; left: number | null; running: boolean; endsAt: string | null; /** The round's full length in seconds (+ added time): a countdown never shows more. */ total: number } | null;
  round: { n: number; tables: ViewTable[] } | null;
  /** Earlier rounds, newest first. */
  history: { n: number; tables: ViewTable[] }[];
  standings: { rank: number; id: string; name: string; record: string; points: number; owp: number; oowp: number; dropped: boolean }[];
  cut: { bracket: Bracket; matches: ViewCutMatch[] } | null;
  next: NextStep;
  counts: { tables: number; done: number; waiting: number; disagree: number };
  you: {
    participantId: string;
    record: string;
    points: number;
    rank: number | null;
    dropped: boolean;
    match: {
      key: string; label: string; table: number | null; cut: boolean;
      opponent: ViewPlayer | null;
      result: { mine: number; theirs: number } | null;
      myReport: [number, number] | null;
      theyReported: boolean;
      state: TableState;
      setByOrganizer: boolean;
    } | null;
  } | null;
  canManage: boolean;
}

export function buildView(ctx: SwissCtx, opts: { userId: string | null; canManage: boolean }): SwissView | null {
  const state = ctx.state;
  const s = swissSettingsOf(ctx.t.settings, cardGame(ctx.t));
  const field = activeIds(ctx, state);
  const name = new Map(ctx.people.map((p) => [p.id, p.display_name || "Player"]));
  const hasAccount = new Set(ctx.people.filter((p) => p.user_id).map((p) => p.id));
  if (!state) {
    return {
      phase: "setup", rounds: 0, topCut: 0, bestOf: s.bestOf,
      // Until four have joined, an example with 16 (the settings say the same).
      structure: field.length < SWISS_MIN_PLAYERS ? `With 16 players (an example until people join): ${describeStructure(s, 16)}` : `With ${field.length} players: ${describeStructure(s, field.length)}`,
      players: field.length, clock: null, round: null, history: [], standings: [], cut: null, next: "pair",
      counts: { tables: 0, done: 0, waiting: 0, disagree: 0 }, you: null, canManage: opts.canManage,
    };
  }
  const reports = ctx.reports;
  const standings = swissStandings(state, reports, field, ctx.t.id);
  const byId = new Map(standings.map((r) => [r.id, r]));
  const vp = (id: string): ViewPlayer => {
    const r = byId.get(id);
    return { id, name: name.get(id) ?? "Player", record: r ? recordText(r) : "0-0", points: r?.points ?? 0, account: hasAccount.has(id) };
  };
  const viewTables = (round: SwissState["list"][number]): ViewTable[] => round.tables.map((t) => {
    const st = tableStatus(state, round, t, reports);
    return {
      t: t.t, a: vp(t.a), b: t.b ? vp(t.b) : null, state: st.state,
      result: st.result ? { a: st.result.a, b: st.result.b, by: st.result.by } : null,
      ...(opts.canManage ? { reportA: st.reportA, reportB: st.reportB } : {}),
    };
  });
  const last = state.list[state.list.length - 1] ?? null;
  const current = last && !state.cut ? viewTables(last) : null;
  const counts = { tables: 0, done: 0, waiting: 0, disagree: 0 };
  const bracket = cutBracket(state, reports);
  let cutMatches: ViewCutMatch[] = [];
  if (bracket) {
    cutMatches = bracket.matches.map((m) => {
      const st = m.a && m.b ? cutMatchStatus(state, reports, m.id, m.a, m.b) : null;
      return {
        id: m.id, round: m.round, a: m.a, b: m.b, winner: m.winner, state: st?.state ?? null,
        result: st?.result ? { a: st.result.a, b: st.result.b } : null,
        ...(opts.canManage ? { reportA: st?.reportA ?? null, reportB: st?.reportB ?? null } : {}),
      };
    });
    for (const m of cutMatches.filter((x) => x.a && x.b && !x.winner)) { counts.tables++; if (m.state === "disagree") counts.disagree++; else counts.waiting++; }
  } else if (current) {
    for (const t of current.filter((x) => x.b)) { counts.tables++; counts[t.state === "done" ? "done" : t.state === "disagree" ? "disagree" : "waiting"]++; }
  }

  let you: SwissView["you"] = null;
  const me = opts.userId ? ctx.people.find((p) => p.user_id === opts.userId) : null;
  if (me && (byId.has(me.id) || SEATED.has(me.status))) {
    const row = byId.get(me.id);
    const m = currentMatchFor(state, reports, me.id);
    let match: NonNullable<SwissView["you"]>["match"] = null;
    if (m) {
      const myRep = reports.find((r) => r.matchKey === m.key && r.participantId === me.id);
      const theirRep = m.opponent ? reports.find((r) => r.matchKey === m.key && r.participantId === m.opponent) : null;
      let st: TableState = "waiting";
      let result: { mine: number; theirs: number } | null = null;
      let setByOrganizer = false;
      if (m.cut) {
        const a = m.side === "a" ? me.id : m.opponent!, b = m.side === "a" ? m.opponent! : me.id;
        const cs = cutMatchStatus(state, reports, m.key.slice(2), a, b);
        st = cs.state;
        if (cs.result) result = m.side === "a" ? { mine: cs.result.a, theirs: cs.result.b } : { mine: cs.result.b, theirs: cs.result.a };
        setByOrganizer = !!state.cut!.results[m.key.slice(2)];
      } else if (last) {
        const table = last.tables.find((t) => t.a === me.id || t.b === me.id)!;
        const ts = tableStatus(state, last, table, reports);
        st = ts.state;
        if (ts.result) result = m.side === "a" ? { mine: ts.result.a, theirs: ts.result.b } : { mine: ts.result.b, theirs: ts.result.a };
        setByOrganizer = !!last.results[String(table.t)];
      }
      match = {
        key: m.key, label: m.label, table: m.table, cut: m.cut, opponent: m.opponent ? vp(m.opponent) : null,
        result, myReport: myRep ? [myRep.mine, myRep.theirs] : null, theyReported: !!theirRep, state: st, setByOrganizer,
      };
    }
    you = { participantId: me.id, record: row ? recordText(row) : "0-0", points: row?.points ?? 0, rank: row?.rank ?? null, dropped: me.id in state.drops || me.status === "dropped", match };
  }

  const left = secondsLeft(state.timer);
  return {
    phase: swissPhase(state),
    rounds: state.rounds,
    topCut: state.topCut,
    bestOf: state.bestOf,
    structure: describeStructure({ ...s, rounds: state.rounds, topCut: state.topCut, bestOf: state.bestOf }, state.startedWith),
    players: state.startedWith,
    clock: state.timer ? {
      minutes: state.timer.minutes, left,
      running: !!state.timer.startedAt && !state.timer.pausedAt,
      endsAt: state.timer.startedAt && !state.timer.pausedAt && state.timer.minutes ? new Date(Date.parse(state.timer.startedAt) + (state.timer.minutes * 60 + state.timer.extraSeconds) * 1000).toISOString() : null,
      total: (state.timer.minutes ?? 0) * 60 + state.timer.extraSeconds,
    } : null,
    round: current && last ? { n: last.n, tables: current } : null,
    history: state.list.slice(0, state.cut ? undefined : -1).map((r) => ({ n: r.n, tables: viewTables(r) })).reverse(),
    standings: standings.map((r) => ({ rank: r.rank, id: r.id, name: name.get(r.id) ?? "Player", record: recordText(r), points: r.points, owp: r.owp, oowp: r.oowp, dropped: r.dropped })),
    cut: bracket ? { bracket, matches: cutMatches } : null,
    next: nextStep(state, reports),
    counts,
    you,
    canManage: opts.canManage,
  };
}

/** Is the tournament visible to this person (drafts are only for their organizers)? */
export function visibleTo(ctx: SwissCtx, canManage: boolean): boolean {
  return ctx.t.status !== "draft" || canManage;
}

// ─── New round alerts ────────────────────────────────────────────────────────

/** Tells every player in the new round (or the new top cut matches) where they're sitting. Once per player per match. */
async function notifyRound(t: SwissTournament, state: SwissState, reports: SwissReport[], repaired = false): Promise<void> {
  const db = svc();
  const attendees = await listAttendees("tournament", t.id);
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const name = (id: string | null) => (id ? byId.get(id)?.displayName ?? "your opponent" : "");
  const lines: { pid: string; key: string; text: string }[] = [];
  if (state.cut) {
    const bracket = cutBracket(state, reports)!;
    for (const m of bracket.matches.filter((x) => x.a && x.b && !x.winner)) {
      const label = `Top ${state.cut.seeds.length}, ${m.round === bracket.rounds - 1 ? "the final" : m.round === bracket.rounds - 2 ? "semifinals" : "quarterfinals"}`;
      lines.push({ pid: m.a!, key: cutKey(m.id), text: `${label}: you play ${name(m.b)}.` });
      lines.push({ pid: m.b!, key: cutKey(m.id), text: `${label}: you play ${name(m.a)}.` });
    }
  } else {
    const round = state.list[state.list.length - 1];
    for (const tb of round.tables) {
      const head = `Round ${round.n} of ${state.rounds}${repaired ? " (re-paired)" : ""}`;
      if (!tb.b) lines.push({ pid: tb.a, key: roundKey(round.n), text: `${head}: you have a bye, which counts as a win.` });
      else {
        lines.push({ pid: tb.a, key: roundKey(round.n), text: `${head}: table ${tb.t} against ${name(tb.b)}.` });
        lines.push({ pid: tb.b, key: roundKey(round.n), text: `${head}: table ${tb.t} against ${name(tb.a)}.` });
      }
    }
  }
  const targets = lines.map((l) => byId.get(l.pid)).filter((a): a is NonNullable<typeof a> => !!a);
  if (!targets.length) return;
  const recipients = await recipientsFor(targets);
  const href = `/tournament/${t.id}`;
  const url = `${getBaseUrl()}${href}`;
  for (const l of lines) {
    const r = recipients.get(l.pid);
    if (!r) continue;
    const claimKey = `${l.pid}:swiss:${l.key}${repaired ? `:${state.version}` : ""}`;
    const { error } = await db.from("event_reminders_sent").insert({ event_type: "tournament", event_id: t.id, attendee_key: claimKey, threshold: "up" });
    if (error) continue;
    await deliver(r, {
      inApp: { type: "tournament_youre_up", title: "You're up", message: `${l.text} ${t.title}.`, link: href, data: { eventType: "tournament", eventId: t.id, raceId: l.key } },
      sms: { body: `${l.text} ${t.title}: ${url}`, category: "event_reminders", billedUserId: t.organizer_id, eventType: "tournament", eventId: t.id },
    });
  }
}

