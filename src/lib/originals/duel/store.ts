import "server-only";

/**
 * Daily Duel, server side (service role; tables from supabase/daily-duel-m1.sql; engine, solver
 * and rules beside this file). Picks 2026-10-21, https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk.
 *
 * The day: built once (the first request that needs it, or scripts/build-duel-days.ts ahead of
 * time) and stored in duel_days with its own copy of its cards and trainer, so it plays the same
 * forever. Everyone gets the same six cards, Energy row and events.
 *
 * A run: the first duel a player starts on a day is official (streaks, the boards); starting it is
 * the Start button, and its clock runs from then to the final move. Practice opens only once the
 * official duel is over (it would hand you the answer otherwise) and never counts. The server holds
 * the state and checks every step with the engine; every write is version-guarded
 * (duel_runs.version), so two taps landing at once count once. The page only ever sees viewOf.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import { playerKey, type PlayerKind } from "@/lib/daily/boardRules";
import { recordDuelScore } from "@/lib/daily/boards";
import type { DailiesEntry, DayMark } from "@/lib/originals/dailies";
import { alive, applyStep, cardsLeft, startState, viewOf, type DuelSetup, type DuelState } from "./engine";
import { buildDay, makeSetup } from "./solver";
import { trainerPicture } from "./pictures";
import { TIER_LABEL, duelNumber, duelPoints, duelShareText, signatureText, tierFor, type DuelShareFacts } from "./rules";
import type { DuelData } from "./data";
import type { DuelCard, DuelEventAt, DuelStep, DuelTier, DuelTrainer, EnergyType } from "./types";
import type { DuelHistory, DuelHome, DuelPicture, DuelRunView, DuelTrainerView } from "./view";

type DbError = { code?: string; message?: string } | null;
/** A Daily Duel table or column that isn't there yet. */
const missing = (e: DbError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

export interface DuelPlayer { kind: PlayerKind; id: string }
const keyOf = (p: DuelPlayer) => playerKey(p.kind, p.id);
const playerOf = (key: string): DuelPlayer => ({ kind: key.slice(0, 1) as PlayerKind, id: key.slice(2) });

// ─── the day ─────────────────────────────────────────────────────────────────

interface DayRow {
  day: string; number: number; tier: DuelTier; trainer_id: string; pack: string[]; row: EnergyType[]; events: DuelEventAt[];
  par: number; line: DuelStep[]; in_band: boolean; built_at: string; cards: Record<string, DuelCard>; trainer: DuelTrainer | null;
}
const DAY_COLS = "day, number, tier, trainer_id, pack, row, events, par, line, in_band, built_at, cards, trainer";

export interface DuelDay {
  day: string;
  number: number;
  tier: DuelTier;
  trainer: DuelTrainer;
  par: number;
  setup: DuelSetup;
  /** The solver's winning line (never sent to a page). */
  line: DuelStep[];
}

/**
 * Built days don't change, so each server keeps the ones it has read, but only for a few minutes: a
 * day an operator deletes to rebuild (as #2 was on 2026-10-22, under the findable rule) mustn't live
 * on in one server's memory while the others build the new one.
 */
const DAY_CACHE_MS = 5 * 60_000;
const dayCache = new Map<string, { d: DuelDay; at: number }>();
const cachedDay = (day: string): DuelDay | null => {
  const hit = dayCache.get(day);
  if (!hit) return null;
  if (Date.now() - hit.at > DAY_CACHE_MS) { dayCache.delete(day); return null; }
  return hit.d;
};
const keepDay = (d: DuelDay) => { dayCache.set(d.day, { d, at: Date.now() }); };
const building = new Map<string, Promise<DuelDay | null>>();

function dayFrom(r: DayRow): DuelDay | null {
  const trainer = r.trainer;
  if (!trainer) return null;
  const setup = makeSetup(r.cards, trainer, r.pack, r.row, r.events);
  return setup ? { day: r.day, number: r.number, tier: r.tier, trainer, par: r.par, setup, line: r.line } : null;
}

async function readDay(day: string): Promise<DuelDay | null | "missing"> {
  const { data, error } = await createServiceClient().from("duel_days").select(DAY_COLS).eq("day", day).maybeSingle();
  if (error) { if (!missing(error)) console.error("[duel] day read failed:", error); return "missing"; }
  return data ? dayFrom(data as unknown as DayRow) : null;
}

/** The day's data, when the roster files are there (they're made by another script). */
async function loadData(): Promise<DuelData | null> {
  try {
    return (await import("./data")).DUEL_DATA;
  } catch (e) {
    console.error("[duel] card data missing:", e);
    return null;
  }
}

/**
 * Builds a day and stores it (the first build stands: two requests racing store one and both read
 * it back). `budgetMs` caps the search. Returns the stored day, or null when nothing could be built.
 */
export async function buildAndSaveDay(day: string, opts: { budgetMs?: number; data?: DuelData; seed?: string } = {}): Promise<{ day: DuelDay; build: ReturnType<typeof buildDay> } | null> {
  const data = opts.data ?? (await loadData());
  if (!data) return null;
  const build = buildDay(day, data.pool, data.cards, data.trainers, opts.seed ?? "", { budgetMs: opts.budgetMs ?? 20_000 });
  if (!build) return null;
  const trainer = data.trainers.find((t) => t.id === build.trainerId)!;
  const cards: Record<string, DuelCard> = {};
  for (const id of [...build.pack, ...trainer.team]) if (data.cards[id]) cards[id] = data.cards[id];
  const svc = createServiceClient();
  const { error } = await svc.from("duel_days").upsert({
    day, number: build.number, tier: build.tier, trainer_id: build.trainerId, pack: build.pack, row: build.row, events: build.events,
    par: build.par, line: build.line, in_band: build.inBand, cards, trainer,
  }, { onConflict: "day", ignoreDuplicates: true });
  if (error) { console.error("[duel] day save failed:", error); return null; }
  const stored = await readDay(day);
  if (!stored || stored === "missing") return null;
  keepDay(stored);
  return { day: stored, build };
}

/** A day's duel: stored, else built now (lazily, within the budget). Null before the migration or when it can't be built. */
export async function getDay(day = gsDay(), opts: { build?: boolean; budgetMs?: number } = {}): Promise<DuelDay | null> {
  const hit = cachedDay(day);
  if (hit) return hit;
  const have = await readDay(day);
  if (have === "missing") return null;
  if (have) { keepDay(have); return have; }
  if (opts.build === false) return null;
  let p = building.get(day);
  if (!p) {
    p = buildAndSaveDay(day, { budgetMs: opts.budgetMs }).then((r) => r?.day ?? null).finally(() => building.delete(day));
    building.set(day, p);
  }
  return p;
}

/**
 * Today's and tomorrow's duels, built if they aren't stored yet (the every-minute sweep calls it), so
 * a new day is ready at midnight and the homepage's card, which only reads a built day, has its
 * trainer. A stored day is a memory hit for a few minutes after each read (DAY_CACHE_MS).
 */
export async function ensureDays(): Promise<number> {
  let built = 0;
  for (const day of [gsDay(), gsAddDays(gsDay(), 1)]) {
    if (cachedDay(day)) continue;
    const have = await readDay(day);
    if (have === "missing") return built;
    if (have) { keepDay(have); continue; }
    if (await getDay(day)) built++;
  }
  return built;
}

/** The trainer as the page sees it, with their picture (their own card, else `ace`: the last card of the team as the day stored it). */
export function trainerView(t: DuelTrainer, ace: DuelCard | null = null): DuelTrainerView {
  return {
    id: t.id, name: t.name, title: t.title, game: t.game, tier: t.tier, tierLabel: TIER_LABEL[t.tier],
    signature: { title: t.signature.title, effect: t.signature.effect, text: signatureText(t) },
    teamSize: t.team.length,
    picture: trainerPicture(t, ace),
  };
}

/** A day's trainer for the page: the picture's fallback is the ace on the day's own team. */
const dayTrainer = (d: DuelDay) => trainerView(d.trainer, d.setup.foe[d.setup.foe.length - 1] ?? null);

// ─── runs ────────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string; player: string; user_id: string | null; day: string; official: boolean; state: DuelState; steps: DuelStep[];
  version: number; status: "playing" | "done"; result: "won" | "lost" | null; turns: number; cards_left: number | null;
  seconds: number | null; started_at: string; finished_at: string | null;
}
const RUN_COLS = "id, player, user_id, day, official, state, steps, version, status, result, turns, cards_left, seconds, started_at, finished_at";

async function getRun(id: string): Promise<RunRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("duel_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  return (data as RunRow | null) ?? null;
}

/** The player's official run for a day (null when not started). */
async function officialRun(key: string, day: string): Promise<RunRow | null> {
  const { data } = await createServiceClient().from("duel_runs").select(RUN_COLS).eq("player", key).eq("day", day).eq("official", true).maybeSingle();
  return (data as RunRow | null) ?? null;
}

/** Saves a run's changes if nobody else changed it first. Null on a clash. */
async function save(r: RunRow, patch: Partial<RunRow>): Promise<RunRow | null> {
  const { data, error } = await createServiceClient().from("duel_runs").update({ ...patch, version: r.version + 1 }).eq("id", r.id).eq("version", r.version).select(RUN_COLS).maybeSingle();
  if (error) { console.error("[duel] save failed:", error); return null; }
  return (data as RunRow | null) ?? null;
}

/** An official duel goes on the boards: guests only once they've put a name on the boards. */
async function recordBoard(r: RunRow, d: DuelDay): Promise<{ points: number; tokens: number } | null> {
  if (!r.official || r.status !== "done" || !r.result) return null;
  const player = playerOf(r.player);
  if (player.kind === "g") {
    const { data } = await createServiceClient().from("daily_guests").select("guest_key").eq("guest_key", player.id).maybeSingle();
    if (!data) return null;
  }
  const points = duelPoints(r.result === "won", r.turns, d.par);
  const got = await recordDuelScore({ day: r.day, player, won: r.result === "won", turns: r.turns, cardsLeft: r.cards_left ?? 0, seconds: r.seconds, points });
  return got ? { points: got.points, tokens: got.tokens } : null;
}

function shareFactsOf(r: RunRow, d: DuelDay): DuelShareFacts {
  return {
    number: duelNumber(r.day), trainer: d.trainer.name, won: r.result === "won", turns: r.turns, par: d.par, seconds: r.seconds,
    standing: r.state.you.map((c) => !c.out), knocked: r.state.foe.length - alive(r.state.foe), team: r.state.foe.length, practice: !r.official,
  };
}

function runView(r: RunRow, d: DuelDay, board: { points: number; tokens: number } | null = null): DuelRunView {
  const done = r.status === "done";
  // Par shows once the official duel is over (practice only opens after it).
  const parShown = done || !r.official;
  return {
    id: r.id, day: r.day, number: duelNumber(r.day), official: r.official, status: r.status,
    trainer: dayTrainer(d),
    play: viewOf(d.setup, r.state, d.trainer),
    result: r.result,
    turns: r.state.turn,
    cardsLeft: cardsLeft(r.state),
    par: parShown ? d.par : null,
    points: r.official && done && r.result ? duelPoints(r.result === "won", r.turns, d.par) : null,
    seconds: done ? r.seconds : null,
    startedAt: r.started_at,
    serverNow: new Date().toISOString(),
    board,
    share: done && r.result ? duelShareText(shareFactsOf(r, d)) : null,
  };
}

export type StartResult = { ok: true; run: DuelRunView } | { ok: false; error: "not_ready" | "official_first" | "failed" };

/**
 * Starts a duel. Official: the player's first today (pressing Start starts its clock); asking again
 * returns the same one. Practice: only once the official duel is over; each start is a fresh duel
 * on the same day (an unfinished practice one is put away).
 */
export async function startRun(player: DuelPlayer, mode: "official" | "practice"): Promise<StartResult> {
  const day = gsDay();
  const d = await getDay(day);
  if (!d) return { ok: false, error: "not_ready" };
  const svc = createServiceClient();
  const key = keyOf(player);
  const official = await officialRun(key, day);
  if (mode === "official") {
    if (official) return { ok: true, run: runView(official, d) };
  } else if (!official || official.status !== "done") {
    return { ok: false, error: "official_first" };
  } else {
    await svc.from("duel_runs").update({ status: "done" }).eq("player", key).eq("day", day).eq("official", false).eq("status", "playing");
  }
  const row = { player: key, user_id: player.kind === "u" ? player.id : null, day, official: mode === "official", state: startState(d.setup), steps: [] };
  const { data, error } = await svc.from("duel_runs").insert(row).select(RUN_COLS).single();
  if (error?.code === "23505") {
    // Another tab started the official duel first: that one stands.
    const again = await officialRun(key, day);
    return again ? { ok: true, run: runView(again, d) } : { ok: false, error: "failed" };
  }
  if (error || !data) { if (!missing(error)) console.error("[duel] start failed:", error); return { ok: false, error: missing(error) ? "not_ready" : "failed" }; }
  return { ok: true, run: runView(data as RunRow, d) };
}

export type ActResult = { ok: true; run: DuelRunView } | { ok: false; error: "not_found" | "not_ready" | "bad_request" | "illegal" | "over" | "busy" };

/** One step in a duel: send out a card ({ next }), or a turn ({ attach, act }). */
export async function act(runId: string, player: DuelPlayer, st: DuelStep, attempt = 0): Promise<ActResult> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return { ok: false, error: "not_found" };
  const d = await getDay(r.day, { build: false });
  if (!d) return { ok: false, error: "not_ready" };
  if (r.status === "done") return { ok: false, error: "over" };
  const next = applyStep(d.setup, r.state, st);
  if (!next) return { ok: false, error: "illegal" };
  const patch: Partial<RunRow> = { state: next, steps: [...(r.steps ?? []), st], turns: next.turn };
  if (next.over) {
    const now = new Date();
    patch.status = "done";
    patch.result = next.over;
    patch.cards_left = cardsLeft(next);
    patch.finished_at = now.toISOString();
    patch.seconds = Math.max(0, Math.round((now.getTime() - Date.parse(r.started_at)) / 1000));
  }
  const saved = await save(r, patch);
  if (!saved) return attempt < 2 ? act(runId, player, st, attempt + 1) : { ok: false, error: "busy" };
  const board = saved.status === "done" ? await recordBoard(saved, d) : null;
  return { ok: true, run: runView(saved, d, board) };
}

/** A run's view for its player. */
export async function getRunView(runId: string, player: DuelPlayer): Promise<DuelRunView | null> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return null;
  const d = await getDay(r.day, { build: false });
  return d ? runView(r, d) : null;
}

// ─── streaks and the page's opening state ────────────────────────────────────

type OfficialRow = { day: string; status: "playing" | "done"; result: "won" | "lost" | null; seconds: number | null; turns: number };

const NO_HISTORY: DuelHistory = { streak: 0, best: 0, played: 0, won: 0, fastest: null, recent: Array.from({ length: 14 }, () => null) };

/** A player's official duels as streaks: days in a row won (today's counts once over), the longest run, wins, the fastest win, the last two weeks. */
function historyOf(rows: OfficialRow[], day: string): DuelHistory {
  const done = rows.filter((r) => r.status === "done" && r.result);
  const won = new Set(done.filter((r) => r.result === "won").map((r) => r.day));
  const lost = new Set(done.filter((r) => r.result === "lost").map((r) => r.day));
  let streak = 0;
  if (!lost.has(day)) for (let d = won.has(day) ? day : gsAddDays(day, -1); won.has(d); d = gsAddDays(d, -1)) streak++;
  let best = 0;
  let run = 0;
  for (const d of [...won].sort()) {
    run = won.has(gsAddDays(d, -1)) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const times = done.filter((r) => r.result === "won" && r.seconds != null).map((r) => r.seconds!);
  return {
    streak, best, played: done.length, won: won.size, fastest: times.length ? Math.min(...times) : null,
    recent: Array.from({ length: 14 }, (_, i): DayMark => {
      const d = gsAddDays(day, i - 13);
      return won.has(d) ? "won" : lost.has(d) ? "missed" : null;
    }),
  };
}

async function officialRows(key: string, day: string): Promise<OfficialRow[]> {
  const { data } = await createServiceClient().from("duel_runs").select("day, status, result, seconds, turns")
    .eq("player", key).eq("official", true).gte("day", gsAddDays(day, -400)).lte("day", day).order("day", { ascending: false }).limit(400);
  return (data ?? []) as OfficialRow[];
}

/** The page's opening state: today's trainer, team and six, your official duel or its result, practice, a duel to pick back up, streaks. */
export async function duelHome(player: DuelPlayer | null): Promise<DuelHome> {
  const day = gsDay();
  const empty: DuelHome = {
    ready: false, day, number: duelNumber(day), tier: tierFor(day), trainer: null, pack: [], team: [],
    official: null, par: null, practiceAllowed: false, current: null, history: NO_HISTORY, signedIn: player?.kind === "u",
  };
  const d = await getDay(day);
  if (!d) return empty;
  const start = viewOf(d.setup, startState(d.setup), d.trainer);
  const base: DuelHome = { ...empty, ready: true, tier: d.tier, trainer: dayTrainer(d), pack: start.you, team: start.foe };
  if (!player) return base;
  const key = keyOf(player);
  const [official, rows, { data: practice }] = await Promise.all([
    officialRun(key, day),
    officialRows(key, day),
    createServiceClient().from("duel_runs").select(RUN_COLS).eq("player", key).eq("day", day).eq("official", false).eq("status", "playing").order("started_at", { ascending: false }).limit(1),
  ]);
  const over = official?.status === "done";
  const open = official && !over ? official : ((practice ?? []) as RunRow[])[0] ?? null;
  return {
    ...base,
    official: official ? {
      id: official.id, status: official.status, result: official.result, turns: official.turns, cardsLeft: official.cards_left ?? cardsLeft(official.state),
      seconds: over ? official.seconds : null, points: over && official.result ? duelPoints(official.result === "won", official.turns, d.par) : null,
    } : null,
    par: over ? d.par : null,
    practiceAllowed: over,
    current: open ? runView(open, d) : null,
    history: historyOf(rows, day),
  };
}

/** The Daily Duel's entry for the dailies' today bar, Next up, combined share and streak cards (src/lib/originals/dailies.ts). */
export async function duelDailiesEntry(player: DuelPlayer): Promise<DailiesEntry> {
  const day = gsDay();
  const key = keyOf(player);
  const rows = await officialRows(key, day);
  const today = rows.find((r) => r.day === day);
  const history = historyOf(rows, day);
  const d = today?.status === "done" ? await getDay(day, { build: false }) : null;
  return {
    day,
    number: duelNumber(day),
    state: today?.status === "done" ? "done" : today ? "playing" : "fresh",
    duel: today?.status === "done" && today.result ? { won: today.result === "won", turns: today.turns, par: d?.par ?? null, seconds: today.seconds } : null,
    stats: { played: history.played, won: history.won, streak: history.streak, best: history.best, fastest: history.fastest },
    recent: history.recent,
  };
}

/** A guest who just put a name on the boards: today's finished official duel goes on the board now. */
export async function boardTodayFor(player: DuelPlayer): Promise<{ points: number; tokens: number } | null> {
  const day = gsDay();
  const r = await officialRun(keyOf(player), day);
  if (!r || r.status !== "done") return null;
  const d = await getDay(day, { build: false });
  return d ? recordBoard(r, d) : null;
}

/**
 * A guest signed in: their duels move onto the account. A day where both have an official duel
 * keeps the account's (the guest's becomes practice).
 */
export async function moveDuelRuns(guestKey: string, userId: string): Promise<void> {
  const svc = createServiceClient();
  const from = `g:${guestKey}`;
  const to = `u:${userId}`;
  const { data: mine, error } = await svc.from("duel_runs").select("day").eq("player", to).eq("official", true);
  if (error) return; // before the migration
  const taken = ((mine ?? []) as { day: string }[]).map((r) => r.day);
  if (taken.length) await svc.from("duel_runs").update({ official: false }).eq("player", from).eq("official", true).in("day", taken);
  await svc.from("duel_runs").update({ player: to, user_id: userId }).eq("player", from);
}

/**
 * A finished duel's facts for a share card (src/lib/share/store.ts): the run asked for (it must be
 * this player's), else today's official one. Null when there's nothing finished to share.
 */
export async function duelShareFacts(player: DuelPlayer, runId?: string | null): Promise<(DuelShareFacts & { day: string; official: boolean; streak: number; trainerTitle: string; picture: DuelPicture | null }) | null> {
  const key = keyOf(player);
  const r = runId ? await getRun(runId) : await officialRun(key, gsDay());
  if (!r || r.player !== key || r.status !== "done" || !r.result) return null;
  const d = await getDay(r.day, { build: false });
  if (!d) return null;
  const history = r.official ? historyOf(await officialRows(key, r.day), r.day) : null;
  return { ...shareFactsOf(r, d), day: r.day, official: r.official, streak: history?.streak ?? 0, trainerTitle: d.trainer.title, picture: dayTrainer(d).picture };
}

/** A built day's trainer (the winners video, the homepage's Today card): null when the day isn't built (never builds one). */
export async function duelDayTrainer(day: string): Promise<{ number: number; par: number; trainer: DuelTrainerView } | null> {
  const d = await getDay(day, { build: false }).catch(() => null);
  return d ? { number: duelNumber(day), par: d.par, trainer: dayTrainer(d) } : null;
}

/** Each player's official duels won, up to `day` (the winners video's streaks, counted as the streak cards count them). */
export async function duelWonDays(players: string[], day: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!players.length) return out;
  const { data, error } = await createServiceClient().from("duel_runs").select("player, day")
    .in("player", players).eq("official", true).eq("result", "won").lte("day", day).gte("day", gsAddDays(day, -400)).limit(5000);
  if (error) { if (!missing(error)) console.error("[duel] won days failed:", error); return out; }
  for (const r of (data ?? []) as { player: string; day: string }[]) out.set(r.player, (out.get(r.player) ?? new Set<string>()).add(r.day));
  return out;
}
