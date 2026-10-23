import "server-only";

/**
 * Daily Duel, server side (service role; tables from supabase/daily-duel-m1.sql; engine, solver
 * and rules beside this file). Picks 2026-10-21, https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk.
 *
 * The day: built once (the first request that needs it, or scripts/build-duel-days.ts ahead of
 * time) and stored in duel_days with its own copy of its cards and trainer, so it plays the same
 * forever. Everyone gets the same six cards, Energy row and events. `duel_days.rules` says which
 * rules it was built with (supabase/daily-duel-m2.sql): 2 = conditions play (picks 2026-10-22), and
 * until that column exists new days build with the first rules, as every earlier day keeps.
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
import { alive, applyStep, cardsLeft, inDuel, startState, viewOf, type DuelSetup, type DuelState } from "./engine";
import { adviceFor, buildDay, makeSetup, type DuelPlan } from "./solver";
import { trainerPicture } from "./pictures";
import { bioFor } from "@/data/originals/duel/bios";
import { TIER_LABEL, duelNumber, duelPoints, duelScore, duelShareText, personOf, signatureText, tierFor, type DuelScoreParts, type DuelShareFacts } from "./rules";
import type { DuelData } from "./data";
import type { DuelCard, DuelEventAt, DuelRules, DuelStep, DuelTier, DuelTrainer, EnergyType } from "./types";
import type { DuelChallengerView, DuelHintView, DuelHistory, DuelHome, DuelPicture, DuelPlanView, DuelRunView, DuelTrainerView } from "./view";

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
  /** 2 = conditions play. Absent before daily-duel-m2.sql. */
  rules?: number;
  /** Rules 5: the professor's plans. Absent before daily-duel-m3.sql. */
  plans?: DuelPlan[] | null;
}
const DAY_COLS = "day, number, tier, trainer_id, pack, row, events, par, line, in_band, built_at, cards, trainer";

/** The newest rules (types.ts DuelRules): rules 5 plus the trainer on the same rules (its own hand, the comeback charge), 2026-10-23. */
export const DUEL_RULES: DuelRules = 6;

/** Whether duel_days has `plans` and `win_rate` yet (daily-duel-m3.sql); rules 5 days need them, so until then days build with rules 4. */
let plansColumn: Promise<boolean> | null = null;
function plansReady(): Promise<boolean> {
  plansColumn ??= (async () => {
    const { error } = await createServiceClient().from("duel_days").select("plans, win_rate").limit(1);
    if (error && !missing(error)) console.error("[duel] plans column check failed:", error);
    return !error;
  })();
  return plansColumn;
}

/** The newest rules this database can hold: 1 before daily-duel-m2.sql, 4 before daily-duel-m3.sql. */
async function newestRules(): Promise<DuelRules> {
  if (!(await rulesReady())) return 1;
  return (await plansReady()) ? DUEL_RULES : 4;
}

/** Whether duel_days has its `rules` column yet (daily-duel-m2.sql); asked once per server. */
let rulesColumn: Promise<boolean> | null = null;
function rulesReady(): Promise<boolean> {
  rulesColumn ??= (async () => {
    const { error } = await createServiceClient().from("duel_days").select("rules").limit(1);
    if (error && !missing(error)) console.error("[duel] rules column check failed:", error);
    return !error;
  })();
  return rulesColumn;
}

export interface DuelDay {
  day: string;
  number: number;
  tier: DuelTier;
  trainer: DuelTrainer;
  par: number;
  setup: DuelSetup;
  /** The solver's winning line (never sent to a page). */
  line: DuelStep[];
  /** The rules it was built with (types.ts DuelRules). */
  rules: DuelRules;
  /** Rules 5: the professor's plans (empty on older days). */
  plans: DuelPlan[];
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

const rulesOf = (n: number | undefined): DuelRules => (n === 6 ? 6 : n === 5 ? 5 : n === 4 ? 4 : n === 3 ? 3 : n === 2 ? 2 : 1);

function dayFrom(r: DayRow): DuelDay | null {
  const trainer = r.trainer;
  if (!trainer) return null;
  const rules = rulesOf(r.rules);
  const setup = makeSetup(r.cards, trainer, r.pack, r.row, r.events, { rules, seed: r.day });
  return setup ? { day: r.day, number: r.number, tier: r.tier, trainer, par: r.par, setup, line: r.line, rules, plans: r.plans ?? [] } : null;
}

async function readDay(day: string): Promise<DuelDay | null | "missing"> {
  const cols = (await rulesReady()) ? `${DAY_COLS}, rules${(await plansReady()) ? ", plans" : ""}` : DAY_COLS;
  const { data, error } = await createServiceClient().from("duel_days").select(cols).eq("day", day).maybeSingle();
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
 * A day built with the newest rules the database can hold, as the row duel_days stores. When the
 * newest rules find no puzzle in the budget (a slow Champion day), the first rules try, so a day
 * always exists; `allowOlder: false` (an upgrade) skips that.
 */
async function buildRow(day: string, opts: { budgetMs?: number; data?: DuelData; seed?: string; allowOlder?: boolean }) {
  const data = opts.data ?? (await loadData());
  if (!data) return null;
  let rules: DuelRules = await newestRules();
  const budgetMs = opts.budgetMs ?? 20_000;
  const t0 = Date.now();
  let build = buildDay(day, data.pool, data.cards, data.trainers, opts.seed ?? "", { budgetMs, rules });
  if (!build && rules >= 2 && opts.allowOlder !== false) {
    // Only the time that's left (at least 5 seconds), so the every-minute job stays inside its limit.
    const left = Math.max(5_000, budgetMs - (Date.now() - t0));
    console.error(`[duel] ${day}: no puzzle with rules ${rules} in ${budgetMs}ms; building with the first rules (${left}ms)`);
    rules = 1;
    build = buildDay(day, data.pool, data.cards, data.trainers, opts.seed ?? "", { budgetMs: left, rules });
  }
  if (!build) return null;
  const trainer = data.trainers.find((t) => t.id === build.trainerId)!;
  const cards: Record<string, DuelCard> = {};
  for (const id of [...build.pack, ...trainer.team]) if (data.cards[id]) cards[id] = data.cards[id];
  const row = {
    day, number: build.number, tier: build.tier, trainer_id: build.trainerId, pack: build.pack, row: build.row, events: build.events,
    par: build.par, line: build.line, in_band: build.inBand, cards, trainer, ...(rules >= 2 ? { rules } : {}),
    ...(rules >= 5 ? { plans: build.plans ?? [], win_rate: build.winRate ?? null } : {}),
  };
  return { build, row };
}

/**
 * Builds a day and stores it (the first build stands: two requests racing store one and both read
 * it back). `budgetMs` caps the search. Returns the stored day, or null when nothing could be built.
 */
export async function buildAndSaveDay(day: string, opts: { budgetMs?: number; data?: DuelData; seed?: string } = {}): Promise<{ day: DuelDay; build: ReturnType<typeof buildDay> } | null> {
  const made = await buildRow(day, opts);
  if (!made) return null;
  const { build, row } = made;
  const svc = createServiceClient();
  const { error } = await svc.from("duel_days").upsert(row, { onConflict: "day", ignoreDuplicates: true });
  if (error) { console.error("[duel] day save failed:", error); return null; }
  const stored = await readDay(day);
  if (!stored || stored === "missing") return null;
  keepDay(stored);
  return { day: stored, build };
}

/**
 * A day after today that was built with older rules and nobody has played yet is built again with
 * the newest (Britton, 2026-10-22: conditions from tomorrow on). Today's duel never changes, and a day
 * anyone has started keeps what it has. The write only lands on a row still on the older rules, so
 * two servers upgrading at once store one.
 */
async function upgradeDay(d: DuelDay, budgetMs?: number): Promise<DuelDay> {
  const newest = await newestRules();
  if (d.rules >= newest || d.day <= gsDay()) return d;
  const svc = createServiceClient();
  const { data: runs } = await svc.from("duel_runs").select("id").eq("day", d.day).limit(1);
  if (runs?.length) return d;
  const t0 = Date.now();
  const made = await buildRow(d.day, { budgetMs, allowOlder: false });
  if (!made || made.build.rules !== newest) {
    console.error(`[duel] ${d.day}: no puzzle with rules ${newest} in ${Date.now() - t0}ms (budget ${budgetMs ?? 20_000}ms); it keeps rules ${d.rules}`);
    return d;
  }
  const { error } = await svc.from("duel_days").update({ ...made.row, built_at: new Date().toISOString() }).eq("day", d.day).lt("rules", newest);
  if (error) { console.error("[duel] day upgrade failed:", error); return d; }
  const rate = made.build.winRate != null ? `, slipping player wins ${Math.round(made.build.winRate * 100)}%, ${made.build.plans?.length ?? 0} plans` : "";
  console.log(`[duel] ${d.day}: rebuilt with rules ${newest}: ${made.build.trainerId}, par ${made.build.par}${made.build.inBand ? "" : " (closest to the target)"}${rate}, ${made.build.attempts} packs, ${Date.now() - t0}ms`);
  const stored = await readDay(d.day);
  return stored && stored !== "missing" ? stored : d;
}

/** A stored day, brought up to the newest rules when it's still to come (once per server at a time). */
async function upgraded(d: DuelDay, budgetMs?: number): Promise<DuelDay> {
  if (d.rules >= DUEL_RULES || d.day <= gsDay()) return d;
  const key = `${d.day}:upgrade`;
  let p = building.get(key);
  if (!p) {
    p = upgradeDay(d, budgetMs).finally(() => building.delete(key));
    building.set(key, p);
  }
  return (await p) ?? d;
}

/** A day's duel: stored, else built now (lazily, within the budget). Null before the migration or when it can't be built. */
export async function getDay(day = gsDay(), opts: { build?: boolean; budgetMs?: number } = {}): Promise<DuelDay | null> {
  const hit = cachedDay(day);
  if (hit) return hit;
  const have = await readDay(day);
  if (have === "missing") return null;
  // Upgrades take minutes on a slow machine, so only the Duel's own cron runs them (ensureDays); the
  // dev server upgrades on read so a previewed day (?day=) shows the newest rules.
  if (have) { const d = process.env.NODE_ENV === "development" ? await upgraded(have, ENSURE_BUDGET_MS) : have; keepDay(d); return d; }
  if (opts.build === false) return null;
  let p = building.get(day);
  if (!p) {
    p = buildAndSaveDay(day, { budgetMs: opts.budgetMs }).then((r) => r?.day ?? null).finally(() => building.delete(day));
    building.set(day, p);
  }
  return p;
}

/**
 * Today's and tomorrow's duels, built if they aren't stored yet (the Duel's own cron calls it,
 * /api/cron/duel-days), so a new day is ready at midnight and the homepage's card, which only reads a
 * built day, has its trainer; tomorrow's is rebuilt when it's still on older rules (upgradeDay).
 * `budgetMs` is shared by the whole run. A build's time depends on the machine: Gladion's day took 10
 * seconds on a laptop and found nothing in 20 on Vercel (2026-10-22), so the budget is generous.
 */
export async function ensureDays(budgetMs = ENSURE_BUDGET_MS): Promise<number> {
  const end = Date.now() + budgetMs;
  let built = 0;
  for (const day of [gsDay(), gsAddDays(gsDay(), 1)]) {
    const left = end - Date.now();
    if (left < 5_000) break;
    const hit = cachedDay(day);
    if (hit && (hit.rules >= DUEL_RULES || hit.day <= gsDay())) continue;
    const have = await readDay(day);
    if (have === "missing") return built;
    if (have) {
      const d = await upgraded(have, left);
      if (d !== have) built++;
      keepDay(d);
      continue;
    }
    if (await getDay(day, { budgetMs: left })) built++;
  }
  return built;
}

/** A run of the Duel's cron: room for a hard day twice over on Vercel's slower machines, inside the route's 300 seconds. */
const ENSURE_BUDGET_MS = 240_000;

/** The trainer as the page sees it, with their picture (their own card, else `ace`: the last card of the team as the day stored it). */
export function trainerView(t: DuelTrainer, ace: DuelCard | null = null): DuelTrainerView {
  return {
    id: t.id, name: t.name, title: t.title, game: t.game, tier: t.tier, tierLabel: TIER_LABEL[t.tier],
    signature: { title: t.signature.title, effect: t.signature.effect, text: signatureText(t) },
    teamSize: t.team.length,
    picture: trainerPicture(t, ace),
    bio: bioFor(personOf(t)),
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
  const parts = scoreOf(r, d, d.rules >= 6 ? await askedOn(r.player, r.day) : false);
  const points = parts ? parts.points : duelPoints(r.result === "won", r.turns, d.par);
  const got = await recordDuelScore({ day: r.day, player, won: r.result === "won", turns: r.turns, cardsLeft: r.cards_left ?? 0, seconds: r.seconds, points, ...(parts ? { score: parts.score } : {}) });
  return got ? { points: got.points, tokens: got.tokens } : null;
}

// ─── asking the professor (rules 6) ──────────────────────────────────────────

/** Whether duel_help exists yet (daily-duel-m4.sql); asked once per server. Without it nobody is marked, so everyone keeps the bonus. */
let helpTable: Promise<boolean> | null = null;
function helpReady(): Promise<boolean> {
  helpTable ??= (async () => {
    const { error } = await createServiceClient().from("duel_help").select("player").limit(1);
    if (error && !missing(error)) console.error("[duel] help table check failed:", error);
    return !error;
  })();
  return helpTable;
}

/** The player asked the professor on this day (the plans or a tip): the official duel loses the solo bonus. */
async function askedOn(key: string, day: string): Promise<boolean> {
  if (!(await helpReady())) return false;
  const { data } = await createServiceClient().from("duel_help").select("player").eq("player", key).eq("day", day).maybeSingle();
  return !!data;
}

async function markAsked(key: string, day: string): Promise<void> {
  if (!(await helpReady())) return;
  const { error } = await createServiceClient().from("duel_help").upsert({ player: key, day }, { onConflict: "player,day", ignoreDuplicates: true });
  if (error) console.error("[duel] help record failed:", error);
}

/** Whether this run's player asked the professor on its day (official runs on rules 6 days only). */
const askedFor = async (r: RunRow, d: DuelDay) => (d.rules >= 6 && r.official ? askedOn(r.player, r.day) : false);

/** A finished official duel's score on a rules 6 day (null otherwise: older days keep their points). */
function scoreOf(r: RunRow, d: DuelDay, asked: boolean): DuelScoreParts | null {
  if (d.rules < 6 || !r.official || r.status !== "done" || !r.result) return null;
  return duelScore({ won: r.result === "won", turns: r.turns, par: d.par, seconds: r.seconds, solo: !asked, knocked: r.state.foe.filter((c) => c.out).length });
}

/** The professor's plans for a day. On a rules 6 day asking for them ends the solo bonus (it's recorded first). */
export async function askProfessor(player: DuelPlayer, day = gsDay()): Promise<DuelPlanView[] | null> {
  const d = await getDay(day, { build: false });
  if (!d) return null;
  if (d.rules >= 6) await markAsked(keyOf(player), day);
  return d.plans.map((p) => ({ title: p.title, text: p.text }));
}

/**
 * A tip for the turn in progress (the professor's play: where the Energy goes, which one, and what to
 * do). On a rules 6 day's official duel asking ends the solo bonus (recorded first). Null between turns.
 */
export async function tipFor(runId: string, player: DuelPlayer): Promise<DuelHintView | null | "not_found"> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return "not_found";
  const d = await getDay(r.day, { build: false });
  if (!d || r.status === "done") return null;
  if (d.rules >= 6 && r.official) await markAsked(r.player, r.day);
  return adviceFor(d.setup, r.state);
}

function shareFactsOf(r: RunRow, d: DuelDay): DuelShareFacts {
  return {
    number: duelNumber(r.day), trainer: d.trainer.name, won: r.result === "won", turns: r.turns, par: d.par, seconds: r.seconds,
    standing: r.state.you.filter((_, i) => inDuel(r.state, i)).map((c) => !c.out), knocked: r.state.foe.length - alive(r.state.foe), team: r.state.foe.length, practice: !r.official,
  };
}

/** The arena's view of a run: on Professor's advice's turn it carries a play for the turn (a short search). */
function playView(r: RunRow, d: DuelDay) {
  const play = viewOf(d.setup, r.state, d.trainer);
  if (play.event?.kind === "advice" && !play.over) play.hint = adviceFor(d.setup, r.state);
  return play;
}

function runView(r: RunRow, d: DuelDay, board: { points: number; tokens: number } | null = null, asked = false): DuelRunView {
  const parts = scoreOf(r, d, asked);
  const done = r.status === "done";
  // Par shows once the official duel is over (practice only opens after it).
  const parShown = done || !r.official;
  return {
    id: r.id, day: r.day, number: duelNumber(r.day), official: r.official, status: r.status,
    trainer: dayTrainer(d),
    play: playView(r, d),
    result: r.result,
    turns: r.state.turn,
    cardsLeft: cardsLeft(r.state),
    par: parShown ? d.par : null,
    points: parts ? parts.points : r.official && done && r.result ? duelPoints(r.result === "won", r.turns, d.par) : null,
    score: parts,
    scoring: d.rules >= 6 ? "score" : "points",
    asked,
    seconds: done ? r.seconds : null,
    startedAt: r.started_at,
    serverNow: new Date().toISOString(),
    board,
    share: done && r.result ? duelShareText({ ...shareFactsOf(r, d), score: parts?.score ?? null }) : null,
  };
}

export type StartResult = { ok: true; run: DuelRunView } | { ok: false; error: "not_ready" | "official_first" | "failed" };

/**
 * Starts a duel. Official: the player's first today (pressing Start starts its clock); asking again
 * returns the same one. Practice: only once the official duel is over; each start is a fresh duel
 * on the same day (an unfinished practice one is put away).
 */
export async function startRun(player: DuelPlayer, mode: "official" | "practice", day = gsDay()): Promise<StartResult> {
  const d = await getDay(day);
  if (!d) return { ok: false, error: "not_ready" };
  const svc = createServiceClient();
  const key = keyOf(player);
  const official = await officialRun(key, day);
  if (mode === "official") {
    if (official) return { ok: true, run: runView(official, d, null, await askedFor(official, d)) };
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
    return again ? { ok: true, run: runView(again, d, null, await askedFor(again, d)) } : { ok: false, error: "failed" };
  }
  if (error || !data) { if (!missing(error)) console.error("[duel] start failed:", error); return { ok: false, error: missing(error) ? "not_ready" : "failed" }; }
  return { ok: true, run: runView(data as RunRow, d, null, await askedFor(data as RunRow, d)) };
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
  return { ok: true, run: runView(saved, d, board, await askedFor(saved, d)) };
}

/** A run's view for its player. */
export async function getRunView(runId: string, player: DuelPlayer): Promise<DuelRunView | null> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return null;
  const d = await getDay(r.day, { build: false });
  return d ? runView(r, d, null, await askedFor(r, d)) : null;
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

/** The page's opening state: today's trainer, team and six, your official duel or its result, practice, a duel to pick back up, streaks. `day`: another day, for development previews only. */
export async function duelHome(player: DuelPlayer | null, day = gsDay()): Promise<DuelHome> {
  const empty: DuelHome = {
    ready: false, day, number: duelNumber(day), tier: tierFor(day), trainer: null, pack: [], bring: 6, team: [],
    official: null, par: null, practiceAllowed: false, current: null, history: NO_HISTORY, signedIn: player?.kind === "u",
    rules: 1, plans: [], planCount: 0, scoring: "points", asked: false,
  };
  const d = await getDay(day);
  if (!d) return empty;
  const start = viewOf(d.setup, startState(d.setup), d.trainer);
  const base: DuelHome = {
    ...empty, ready: true, tier: d.tier, trainer: dayTrainer(d), pack: start.you, bring: start.bring, team: start.foe,
    rules: d.rules, planCount: d.plans.length, scoring: d.rules >= 6 ? "score" : "points",
    // Rules 6: the plans stay on the server until asked for (askProfessor); older days show them.
    plans: d.rules >= 6 ? [] : d.plans.map((p) => ({ title: p.title, text: p.text })),
  };
  if (!player) return base;
  const key = keyOf(player);
  const [official, rows, { data: practice }, asked] = await Promise.all([
    officialRun(key, day),
    officialRows(key, day),
    createServiceClient().from("duel_runs").select(RUN_COLS).eq("player", key).eq("day", day).eq("official", false).eq("status", "playing").order("started_at", { ascending: false }).limit(1),
    d.rules >= 6 ? askedOn(key, day) : Promise.resolve(false),
  ]);
  const over = official?.status === "done";
  const parts = official ? scoreOf(official, d, asked) : null;
  const open = official && !over ? official : ((practice ?? []) as RunRow[])[0] ?? null;
  return {
    ...base,
    official: official ? {
      id: official.id, status: official.status, result: official.result, turns: official.turns, cardsLeft: official.cards_left ?? cardsLeft(official.state),
      seconds: over ? official.seconds : null, points: parts ? parts.points : over && official.result ? duelPoints(official.result === "won", official.turns, d.par) : null,
      score: parts,
    } : null,
    asked,
    plans: d.rules < 6 || asked ? d.plans.map((p) => ({ title: p.title, text: p.text })) : [],
    par: over ? d.par : null,
    practiceAllowed: over,
    current: open ? runView(open, d, null, open.official ? asked : false) : null,
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
export async function duelDayTrainer(day: string): Promise<{ number: number; par: number; trainer: DuelTrainerView; team: { name: string; img: string | null; t: EnergyType; hp: number }[] } | null> {
  const d = await getDay(day, { build: false }).catch(() => null);
  return d ? { number: duelNumber(day), par: d.par, trainer: dayTrainer(d), team: d.setup.foe.map((c) => ({ name: c.short, img: c.img, t: c.t, hp: c.hp })) } : null;
}

/** Today's challenger for the cards that lead into the Duel (reads a built day; never builds one). */
export async function duelChallenger(day: string): Promise<DuelChallengerView | null> {
  const got = await duelDayTrainer(day);
  if (!got) return null;
  const t = got.trainer;
  return { day, number: got.number, name: t.name, title: t.title, game: t.game, tierLabel: t.tierLabel, picture: t.picture, bio: t.bio, team: got.team };
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
