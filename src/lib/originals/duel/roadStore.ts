import "server-only";

/**
 * Trainer Road, server side (picks 2026-10-23, https://claude.ai/artifact/Va86Xd5w5G44gPudmzsKDe;
 * tables from supabase/trainer-road-m1.sql; rules in road.ts).
 *
 * A duel: each team's, built ahead for a Pacific month with the Daily Duel's newest rules and the
 * team's own tier targets (solver.ts packsFor), stored in road_duels with its own copy of its cards
 * and trainer, and the same for everyone that month. The cron (/api/cron/road-duels) builds the
 * month's duels a few at a time; a page that finds its duel missing asks for it to be built.
 *
 * A run: any number per player and duel. Every finished run is scored like the Daily Duel's (turns
 * against par, time, the solo bonus, +200 for a Hard win) and earns stars (road.ts roadStars); an
 * account's best run per duel is kept in road_best for the boards (picks: guests can play, stars and
 * boards need a free account). Starting a duel puts away an unfinished one for the same duel. Every
 * write is version-guarded (road_runs.version), as the Daily Duel's are. An account's finished duel
 * also moves its path along (roadProgress.ts applyRunToPath: XP, badges, the League, regions).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import { describePlayers } from "@/lib/daily/boards";
import { applyStep, cardsLeft, startState, viewOf, type DuelSetup, type DuelState } from "./engine";
import { adviceFor, hardParFor, levelSetup, makeSetup, packsFor, type DuelPlan } from "./solver";
import { duelScore, type DuelScoreParts } from "./rules";
import { DUEL_RULES, easyReady, rulesOf, trainerView, type DuelPlayer } from "./store";
import { ROAD_REGIONS, ROAD_SECTIONS, regionOf, roadMonth, roadStars, sectionOf, teamLabel, teamRole } from "./road";
import type { DuelData } from "./data";
import type { DuelCard, DuelEventAt, DuelLevel, DuelRules, DuelStep, DuelTrainer, EnergyType } from "./types";
import type { DuelHintView, DuelRunView } from "./view";
import type { RoadBest, RoadBoardRow, RoadPathResult, RoadTeamHome } from "./roadView";
import { applyRunToPath, cachedLevers, encounterFor, roadLevers } from "./roadProgress";
import { bagView, takeTool, toolsReady } from "./roadTools";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

const keyOf = (p: DuelPlayer) => `${p.kind}:${p.id}`;

/** The month whose duels are in play now. */
export const currentRoadMonth = () => roadMonth(gsDay());

async function loadData(): Promise<DuelData | null> {
  try {
    return (await import("./data")).DUEL_DATA;
  } catch (e) {
    console.error("[road] card data missing:", e);
    return null;
  }
}

// ─── the duels ───────────────────────────────────────────────────────────────

interface DuelRow {
  trainer_id: string; month: string; rules: number; pack: string[]; row: EnergyType[]; events: DuelEventAt[]; par: number; hard_par: number | null;
  line: DuelStep[]; plans: DuelPlan[]; in_band: boolean; cards: Record<string, DuelCard>; trainer: DuelTrainer; built_at: string;
}
const DUEL_COLS = "trainer_id, month, rules, pack, row, events, par, hard_par, line, plans, in_band, cards, trainer, built_at";

export interface RoadDuel {
  trainerId: string;
  month: string;
  rules: DuelRules;
  trainer: DuelTrainer;
  setup: DuelSetup;
  par: number;
  /** Hard's par: 0 = no winning line without comeback Energy (Hard is off for this duel). */
  hardPar: number;
  plans: DuelPlan[];
}


function duelFrom(r: DuelRow): RoadDuel | null {
  const rules = rulesOf(r.rules);
  // The build's luck was seeded by the month (packsFor seeds makeSetup with the `day` it's given).
  const setup = makeSetup(r.cards, r.trainer, r.pack, r.row, r.events, { rules, seed: r.month });
  return setup ? { trainerId: r.trainer_id, month: r.month, rules, trainer: r.trainer, setup, par: r.par, hardPar: r.hard_par ?? 0, plans: r.plans ?? [] } : null;
}

/** Built duels don't change, so each server keeps the ones it has read for a while. */
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { d: RoadDuel; at: number }>();
const building = new Map<string, Promise<RoadDuel | null>>();
const cacheKey = (trainerId: string, month: string) => `${month}:${trainerId}`;

async function readDuel(trainerId: string, month: string): Promise<RoadDuel | null | "missing"> {
  const { data, error } = await createServiceClient().from("road_duels").select(DUEL_COLS).eq("trainer_id", trainerId).eq("month", month).maybeSingle();
  if (error) { if (!missing(error)) console.error("[road] duel read failed:", error); return "missing"; }
  return data ? duelFrom(data as unknown as DuelRow) : null;
}

/**
 * Builds a team's duel for a month and stores it (the first build stands). Same targets as the Daily
 * Duel's days for the team's own tier (par band, the slipping player's share of wins, two plans), and
 * Hard's par on the finished duel.
 *
 * `upgrade`: the duel is stored on older rules and nobody has started it, so it's built again on the
 * newest and replaces the stored one (only while the row is still on older rules and still unplayed).
 */
export async function buildRoadDuel(t: DuelTrainer, month: string, opts: { budgetMs?: number; data?: DuelData; upgrade?: boolean } = {}): Promise<RoadDuel | null> {
  const data = opts.data ?? (await loadData());
  if (!data) return null;
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 60_000);
  const rules = DUEL_RULES;
  // Every team needs a duel (no stand-ins here), so packsFor's last resort is on.
  const got = packsFor(month, t, t.tier, data.pool, data.cards, `road:${t.id}`, 120, deadline, undefined, { n: 0 }, 1, rules, { lastResort: true });
  if (!got) { console.error(`[road] ${month} ${t.id}: no duel found in ${Date.now() - t0}ms`); return null; }
  const f = got.found;
  const cards: Record<string, DuelCard> = {};
  for (const id of [...f.pack, ...t.team]) if (data.cards[id]) cards[id] = data.cards[id];
  const setup = makeSetup(cards, t, f.pack, f.row, f.events, { rules, seed: month });
  if (!setup) return null;
  const hardPar = hardParFor(setup);
  // A Hard win is a Normal win too (comeback Energy only helps), so a quicker Hard line is Normal's par (the par search is a beam search and can miss it).
  const par = hardPar && hardPar < f.par ? hardPar : f.par;
  const row = {
    trainer_id: t.id, month, rules, pack: f.pack, row: f.row, events: f.events, par, hard_par: hardPar, line: f.line,
    plans: f.plans ?? [], in_band: got.inBand, win_rate: f.winRate ?? null, cards, trainer: t,
  };
  const svc = createServiceClient();
  if (opts.upgrade) {
    // A run that started while this was building keeps the duel it started on (for the month).
    if (await hasRuns(t.id, month)) return null;
    const { error } = await svc.from("road_duels").update({ ...row, built_at: new Date().toISOString() }).eq("trainer_id", t.id).eq("month", month).lt("rules", rules);
    if (error) { console.error("[road] duel upgrade failed:", error); return null; }
  } else {
    const { error } = await svc.from("road_duels").upsert(row, { onConflict: "trainer_id,month", ignoreDuplicates: true });
    if (error) { console.error("[road] duel save failed:", error); return null; }
  }
  console.log(`[road] ${month} ${t.id}: ${opts.upgrade ? `rebuilt on rules ${rules}, ` : ""}par ${par}${got.inBand ? "" : " (closest)"}, Hard ${hardPar || "off"}, ${Date.now() - t0}ms`);
  const stored = await readDuel(t.id, month);
  if (!stored || stored === "missing") return null;
  cache.set(cacheKey(t.id, month), { d: stored, at: Date.now() });
  return stored;
}

/**
 * A team's duel for a month: stored, else (with `build`) built now within the budget, once per server
 * at a time. A duel nobody has started can be rebuilt on newer rules (ensureRoadDuels), so a run
 * starts on a fresh read (`fresh`), and a run that started after this server cached the duel reads
 * it again (`after` = the run's start), so a run never plays on a copy older than the one it began with.
 */
export async function getRoadDuel(trainerId: string, month = currentRoadMonth(), opts: { build?: boolean; budgetMs?: number; fresh?: boolean; after?: string } = {}): Promise<RoadDuel | null> {
  const key = cacheKey(trainerId, month);
  const hit = cache.get(key);
  const stale = opts.fresh || (opts.after != null && Date.parse(opts.after) >= (hit?.at ?? 0));
  if (hit && Date.now() - hit.at < CACHE_MS && !stale) return hit.d;
  const have = await readDuel(trainerId, month);
  if (have === "missing") return null;
  if (have) { cache.set(key, { d: have, at: Date.now() }); return have; }
  if (!opts.build) return null;
  let p = building.get(key);
  if (!p) {
    p = (async () => {
      const data = await loadData();
      const t = data?.trainers.find((x) => x.id === trainerId);
      return t && data ? buildRoadDuel(t, month, { budgetMs: opts.budgetMs, data }) : null;
    })().finally(() => building.delete(key));
    building.set(key, p);
  }
  return p;
}

/** Whether anyone has started a team's duel this month. */
async function hasRuns(trainerId: string, month: string): Promise<boolean> {
  const { data } = await createServiceClient().from("road_runs").select("id").eq("trainer_id", trainerId).eq("month", month).limit(1);
  return !!data?.length;
}

/**
 * The month's duels, built a few at a time (the cron, /api/cron/road-duels): Kanto first, Gym
 * Leaders before the Elite Four. In the month's last three days next month's follow, so the 1st
 * never waits. `budgetMs` is shared by the whole run; a build starts only with 30 seconds left.
 *
 * A duel stored on older rules (Britton, 2026-10-24: Trainer Road takes the new rules now, not next
 * month) is built again on the newest once the missing ones are done, unless someone has started it:
 * then it keeps its rules for the month, like a Daily Duel day anyone has started.
 */
export async function ensureRoadDuels(budgetMs = 240_000, opts: { month?: string; only?: string[]; data?: DuelData } = {}): Promise<{ built: number; left: number }> {
  const end = Date.now() + budgetMs;
  const data = opts.data ?? (await loadData());
  if (!data) return { built: 0, left: 0 };
  const today = gsDay();
  const months = opts.month ? [opts.month] : [roadMonth(today), ...(roadMonth(gsAddDays(today, 3)) !== roadMonth(today) ? [roadMonth(gsAddDays(today, 3))] : [])];
  const order = (t: DuelTrainer) => ROAD_REGIONS.findIndex((r) => r.slug === regionOf(t)) * 10 + ROAD_SECTIONS.indexOf(sectionOf(t.tier));
  const roster = data.trainers.filter((t) => regionOf(t) && (!opts.only || opts.only.includes(t.id))).map((t, i) => ({ t, i })).sort((a, b) => order(a.t) - order(b.t) || a.i - b.i).map((x) => x.t);
  let built = 0;
  let left = 0;
  for (const month of months) {
    const { data: have, error } = await createServiceClient().from("road_duels").select("trainer_id, rules").eq("month", month);
    if (error) { if (!missing(error)) console.error("[road] ensure read failed:", error); return { built, left }; }
    const rulesBy = new Map(((have ?? []) as { trainer_id: string; rules: number }[]).map((r) => [r.trainer_id, r.rules]));
    // Missing first, then the ones on older rules (only months still running or to come).
    const upgrades = month >= roadMonth(today) ? roster.filter((t) => (rulesBy.get(t.id) ?? DUEL_RULES) < DUEL_RULES) : [];
    const todo = [...roster.filter((t) => !rulesBy.has(t.id)).map((t) => ({ t, upgrade: false })), ...upgrades.map((t) => ({ t, upgrade: true }))];
    for (const [i, { t, upgrade }] of todo.entries()) {
      const remaining = end - Date.now();
      if (remaining < 30_000) { left += todo.length - i; break; }
      if (upgrade && (await hasRuns(t.id, month))) continue;
      if (await buildRoadDuel(t, month, { budgetMs: Math.min(remaining - 5_000, 120_000), data, upgrade })) built++;
    }
  }
  return { built, left };
}

// ─── runs ────────────────────────────────────────────────────────────────────

interface RunRow {
  id: string; player: string; user_id: string | null; trainer_id: string; month: string; level: DuelLevel; state: DuelState; steps: DuelStep[];
  version: number; status: "playing" | "done"; result: "won" | "lost" | null; turns: number; cards_left: number | null; seconds: number | null;
  score: number | null; stars: number | null; asked: boolean; started_at: string; finished_at: string | null;
  /** Tools used in this run (supabase/trainer-road-m6.sql). */
  tools?: number;
}
const RUN_COLS_BASE = "id, player, user_id, trainer_id, month, level, state, steps, version, status, result, turns, cards_left, seconds, score, stars, asked, started_at, finished_at";
const runCols = async () => `${RUN_COLS_BASE}${(await toolsReady()) ? ", tools" : ""}`;

const isHard = (r: Pick<RunRow, "level">) => r.level === "hard";
const levelOf = (r: Pick<RunRow, "level">): DuelLevel => r.level ?? "normal";
/** Hard takes away your comeback Energy, Easy brings one for each card you've lost; Easy plays against Normal's par. */
/**
 * A run's setup: the duel at the run's level, with its tools (picks 2026-10-25): one a duel (the
 * `road_tools_duel` lever), none in Hard. A run that already used more than the lever allows now keeps
 * what it used, so it always replays.
 */
function setupOf(r: Pick<RunRow, "level" | "state">, d: RoadDuel): DuelSetup {
  const setup = levelSetup(d.setup, r.level);
  const cap = isHard(r) ? 0 : cachedLevers().toolsDuel;
  const tools = Math.max(cap, r.state?.used?.length ?? 0);
  return tools ? { ...setup, tools } : setup;
}
const parOf = (r: Pick<RunRow, "level">, d: RoadDuel): number => (isHard(r) && d.hardPar ? d.hardPar : d.par);
/** Easy on a duel: rules 6 duels on, once the database takes Easy runs. */
const easyOn = async (d: RoadDuel) => d.rules >= 6 && (await easyReady());

async function getRun(id: string): Promise<RunRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("road_runs").select(await runCols()).eq("id", id).maybeSingle();
  return (data as unknown as RunRow | null) ?? null;
}

async function save(r: RunRow, patch: Partial<RunRow>): Promise<RunRow | null> {
  const { data, error } = await createServiceClient().from("road_runs").update({ ...patch, version: r.version + 1 }).eq("id", r.id).eq("version", r.version).select(await runCols()).maybeSingle();
  if (error) { console.error("[road] save failed:", error); return null; }
  return (data as unknown as RunRow | null) ?? null;
}

function scoreOf(r: RunRow, d: RoadDuel): DuelScoreParts | null {
  if (r.status !== "done" || !r.result) return null;
  return duelScore({ won: r.result === "won", turns: r.turns, par: parOf(r, d), seconds: r.seconds, solo: !r.asked, knocked: r.state.foe.filter((c) => c.out).length, level: levelOf(r) });
}

/** The arena's view: on Professor's advice's turn it carries a play (not in Hard). */
function playView(r: RunRow, d: RoadDuel) {
  const setup = setupOf(r, d);
  const play = viewOf(setup, r.state, d.trainer);
  if (play.event?.kind === "advice" && !play.over && !isHard(r)) play.hint = adviceFor(setup, r.state);
  return play;
}

const duelTrainer = (d: RoadDuel) => trainerView(d.trainer, d.setup.foe[d.setup.foe.length - 1] ?? null);

/** A run as the arena reads it (the Daily Duel's shape: every Trainer Road run counts, so `official`). */
function runView(r: RunRow, d: RoadDuel): DuelRunView & { stars: number | null; best: boolean } {
  const done = r.status === "done";
  const parts = scoreOf(r, d);
  return {
    id: r.id, day: r.month, number: 0, official: true, status: r.status, trainer: duelTrainer(d), play: playView(r, d), result: r.result,
    turns: r.state.turn, cardsLeft: cardsLeft(r.state), par: done ? parOf(r, d) : null, points: null, score: parts, scoring: "score",
    asked: r.asked, level: levelOf(r), seconds: done ? r.seconds : null, startedAt: r.started_at, serverNow: new Date().toISOString(),
    board: null, share: null, stars: done ? r.stars : null, best: false, tools: r.tools ?? r.state.used?.length ?? 0,
  };
}

/** Adds an account's tools to a run in play that allows them (the route's answer; guests and Hard get none). */
export async function withBag<T extends DuelRunView>(run: T, player: DuelPlayer | null): Promise<T> {
  if (player?.kind !== "u" || run.status === "done" || !run.play.tools) return run;
  return { ...run, bag: await bagView(player.id, await roadLevers()) };
}

/** Keeps an account's best finished run per duel: higher score first, then the faster time. Returns whether this run is now the best. */
async function keepBest(r: RunRow): Promise<boolean> {
  if (!r.player.startsWith("u:") || r.status !== "done" || r.score == null) return false;
  const svc = createServiceClient();
  const { data } = await svc.from("road_best").select("score, seconds").eq("player", r.player).eq("trainer_id", r.trainer_id).eq("month", r.month).maybeSingle();
  const prev = data as { score: number; seconds: number | null } | null;
  if (prev && (prev.score > r.score || (prev.score === r.score && (prev.seconds ?? Infinity) <= (r.seconds ?? Infinity)))) return false;
  const { error } = await svc.from("road_best").upsert({
    player: r.player, trainer_id: r.trainer_id, month: r.month, run_id: r.id, level: r.level, won: r.result === "won", score: r.score, stars: r.stars ?? 0,
    turns: r.turns, seconds: r.seconds, updated_at: new Date().toISOString(), ...((await toolsReady()) ? { tools: r.tools ?? 0 } : {}),
  }, { onConflict: "player,trainer_id,month" });
  if (error) { console.error("[road] best save failed:", error); return false; }
  return true;
}

export type RoadStartResult = { ok: true; run: DuelRunView } | { ok: false; error: "not_ready" | "not_found" | "hard_off" | "easy_off" | "failed" };

/** Starts a duel against a team (an unfinished one for the same duel is put away). */
export async function startRoadRun(player: DuelPlayer, trainerId: string, level: DuelLevel = "normal"): Promise<RoadStartResult> {
  const month = currentRoadMonth();
  const d = await getRoadDuel(trainerId, month, { fresh: true });
  if (!d) return { ok: false, error: "not_ready" };
  if (level === "hard" && !d.hardPar) return { ok: false, error: "hard_off" };
  if (level === "easy" && !(await easyOn(d))) return { ok: false, error: "easy_off" };
  const key = keyOf(player);
  const svc = createServiceClient();
  await svc.from("road_runs").update({ status: "done" }).eq("player", key).eq("trainer_id", trainerId).eq("month", month).eq("status", "playing");
  const row = { player: key, user_id: player.kind === "u" ? player.id : null, trainer_id: trainerId, month, level, state: startState(levelSetup(d.setup, level)), steps: [] };
  const { data, error } = await svc.from("road_runs").insert(row).select(await runCols()).single();
  if (error || !data) { if (!missing(error)) console.error("[road] start failed:", error); return { ok: false, error: missing(error) ? "not_ready" : "failed" }; }
  return { ok: true, run: runView(data as unknown as RunRow, d) };
}

export type RoadActResult = { ok: true; run: DuelRunView & { path?: RoadPathResult | null } } | { ok: false; error: "not_found" | "not_ready" | "illegal" | "over" | "busy" | "no_tool" };

/** One step in a duel. A finished run is scored, gets its stars, and becomes the account's best when it beats it. */
export async function roadAct(runId: string, player: DuelPlayer, st: DuelStep, attempt = 0): Promise<RoadActResult> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return { ok: false, error: "not_found" };
  const d = await getRoadDuel(r.trainer_id, r.month, { after: r.started_at });
  if (!d) return { ok: false, error: "not_ready" };
  if (r.status === "done") return { ok: false, error: "over" };
  await roadLevers();
  const next = applyStep(setupOf(r, d), r.state, st);
  if (!next) return { ok: false, error: "illegal" };
  const patch: Partial<RunRow> = { state: next, steps: [...(r.steps ?? []), st], turns: next.turn };
  if ("tool" in st) {
    // A tool comes out of the account's bag (or a kept tool); it ends the solo bonus and marks the run.
    const n = next.used?.length ?? 1;
    if (player.kind !== "u" || !(await takeTool(player.id, st.tool, r.id, "road", n))) return { ok: false, error: "no_tool" };
    patch.asked = true;
    if (await toolsReady()) patch.tools = n;
  }
  if (next.over) {
    const now = new Date();
    const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(r.started_at)) / 1000));
    const won = next.over === "won";
    const par = parOf(r, d);
    Object.assign(patch, {
      status: "done", result: next.over, cards_left: cardsLeft(next), finished_at: now.toISOString(), seconds,
      score: duelScore({ won, turns: next.turn, par, seconds, solo: !r.asked, knocked: next.foe.filter((c) => c.out).length, level: levelOf(r) }).score,
      stars: roadStars(won, next.turn, par, levelOf(r)),
    } satisfies Partial<RunRow>);
  }
  const saved = await save(r, patch);
  if (!saved) return attempt < 2 ? roadAct(runId, player, st, attempt + 1) : { ok: false, error: "busy" };
  const view: DuelRunView & { stars: number | null; best: boolean; path?: RoadPathResult | null } = runView(saved, d);
  if (saved.status === "done") {
    view.best = await keepBest(saved);
    // An account's path: XP, and the badge, League step or region when this was the next trainer on it.
    if (player.kind === "u") view.path = await applyRunToPath(player.id, { trainerId: saved.trainer_id, month: saved.month, won: saved.result === "won", hard: isHard(saved), stars: saved.stars ?? 0 });
  }
  return { ok: true, run: view };
}

/** A tip for the turn in progress. Asking ends this run's solo bonus (Hard has no tips). */
export async function roadTip(runId: string, player: DuelPlayer): Promise<DuelHintView | null | "not_found"> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return "not_found";
  const d = await getRoadDuel(r.trainer_id, r.month, { after: r.started_at });
  if (!d || r.status === "done" || isHard(r)) return null;
  if (!r.asked) await save(r, { asked: true });
  return adviceFor(setupOf(r, d), r.state);
}

export async function getRoadRunView(runId: string, player: DuelPlayer): Promise<DuelRunView | null> {
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return null;
  const d = await getRoadDuel(r.trainer_id, r.month, { after: r.started_at });
  return d ? runView(r, d) : null;
}

// ─── boards, stars and a team's page ─────────────────────────────────────────

const BOARD_SIZE = 10;

/** A duel's board this month (accounts' best runs: score, then time), with the viewer's own row when they're further down. */
async function boardFor(trainerId: string, month: string, viewer: string | null): Promise<{ rows: RoadBoardRow[]; you: RoadBoardRow | null; total: number }> {
  const svc = createServiceClient();
  const cols = `player, score, stars, turns, seconds, level, won${(await toolsReady()) ? ", tools" : ""}`;
  const { data, count, error } = await svc.from("road_best").select(cols, { count: "exact" })
    .eq("trainer_id", trainerId).eq("month", month).order("score", { ascending: false }).order("seconds", { ascending: true, nullsFirst: false }).limit(BOARD_SIZE);
  if (error) return { rows: [], you: null, total: 0 };
  type Best = { player: string; score: number; stars: number; turns: number; seconds: number | null; level: DuelLevel; won: boolean; tools?: number };
  const top = (data ?? []) as unknown as Best[];
  let mine: (Best & { place: number }) | null = null;
  if (viewer?.startsWith("u:") && !top.some((b) => b.player === viewer)) {
    const { data: me } = await svc.from("road_best").select(cols).eq("player", viewer).eq("trainer_id", trainerId).eq("month", month).maybeSingle();
    if (me) {
      const m = me as unknown as Best;
      const { count: ahead } = await svc.from("road_best").select("player", { count: "exact", head: true }).eq("trainer_id", trainerId).eq("month", month).gt("score", m.score);
      mine = { ...m, place: (ahead ?? 0) + 1 };
    }
  }
  const names = await describePlayers([...top.map((b) => b.player), ...(mine ? [mine.player] : [])]);
  // Places: a tie on score and time shares a place.
  let place = 0;
  const rows = top.map((b, i): RoadBoardRow => {
    if (i === 0 || b.score !== top[i - 1].score || b.seconds !== top[i - 1].seconds) place = i + 1;
    const n = names.get(b.player);
    return { place, name: n?.name ?? "A player", avatar: n?.avatar ?? null, profile: n?.profile ?? null, score: b.score, stars: b.stars, turns: b.turns, seconds: b.seconds, hard: b.level === "hard", easy: b.level === "easy", tools: (b.tools ?? 0) > 0, won: b.won, you: b.player === viewer };
  });
  const youRow = rows.find((r) => r.you) ?? (mine ? (() => {
    const n = names.get(mine.player);
    return { place: mine.place, name: n?.name ?? "You", avatar: n?.avatar ?? null, profile: n?.profile ?? null, score: mine.score, stars: mine.stars, turns: mine.turns, seconds: mine.seconds, hard: mine.level === "hard", easy: mine.level === "easy", tools: (mine.tools ?? 0) > 0, won: mine.won, you: true };
  })() : null);
  return { rows, you: youRow, total: count ?? rows.length };
}

/** A player's best stars this month for every duel they've finished (the region pages' tiles). Accounts only. */
export async function roadStarsFor(player: DuelPlayer | null, month = currentRoadMonth()): Promise<Record<string, number>> {
  if (!player || player.kind !== "u") return {};
  const { data, error } = await createServiceClient().from("road_best").select("trainer_id, stars").eq("player", keyOf(player)).eq("month", month);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { trainer_id: string; stars: number }[]).map((r) => [r.trainer_id, r.stars]));
}

/**
 * One team's duel for its trainer page: the team and your six, Hard, your best this month, the board,
 * and a duel in progress to pick back up. A duel that isn't built yet says so (`ready: false`; the
 * route asks for the build after answering).
 */
export async function roadTeamHome(player: DuelPlayer | null, trainerId: string): Promise<RoadTeamHome | null> {
  const data = await loadData();
  const t = data?.trainers.find((x) => x.id === trainerId);
  if (!t) return null;
  const month = currentRoadMonth();
  const key = player ? keyOf(player) : null;
  const base: RoadTeamHome = {
    trainerId, month, game: t.game, gameLabel: teamLabel(t), title: t.title, tier: t.tier, tierLabel: teamRole(t),
    ready: false, trainer: null, pack: [], team: [], bring: 6, rules: DUEL_RULES, hard: { can: false, par: null }, easy: { can: false }, comeback: 0, par: null, best: null, current: null,
    board: [], you: null, players: 0, signedIn: player?.kind === "u", encounter: null,
  };
  const [d, encounter] = await Promise.all([getRoadDuel(trainerId, month), player?.kind === "u" ? encounterFor(player.id, trainerId) : Promise.resolve(null)]);
  base.encounter = encounter;
  if (!d) return base;
  const start = viewOf(d.setup, startState(d.setup), d.trainer);
  const svc = createServiceClient();
  const cols = await runCols();
  const [bestRow, openRow, finishedAny, board] = await Promise.all([
    key?.startsWith("u:") ? svc.from("road_best").select("score, stars, turns, seconds, level, won").eq("player", key).eq("trainer_id", trainerId).eq("month", month).maybeSingle() : Promise.resolve({ data: null }),
    key ? svc.from("road_runs").select(cols).eq("player", key).eq("trainer_id", trainerId).eq("month", month).eq("status", "playing").order("started_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    key ? svc.from("road_runs").select("id, level").eq("player", key).eq("trainer_id", trainerId).eq("month", month).not("result", "is", null).limit(20) : Promise.resolve({ data: [] }),
    boardFor(trainerId, month, key),
  ]);
  const best = bestRow.data as RoadBest | null;
  const open = ((openRow.data ?? []) as unknown as RunRow[])[0] ?? null;
  const played = (finishedAny.data ?? []) as { level: string }[];
  return {
    ...base,
    ready: true, trainer: duelTrainer(d), pack: start.you, team: start.foe, bring: start.bring, rules: d.rules,
    // Par shows once you've finished a run in that mode.
    hard: { can: !!d.hardPar, par: played.some((p) => p.level === "hard") ? d.hardPar || null : null },
    easy: { can: await easyOn(d) },
    comeback: d.setup.comeback ?? 0,
    par: played.some((p) => p.level !== "hard") ? d.par : null,
    best, current: open ? runView(open, d) : null,
    board: board.rows, you: board.you, players: board.total,
  };
}

/** Team counts and built duels for the hub (how much of the road is ready this month). */
export async function roadBuiltCount(month = currentRoadMonth()): Promise<number> {
  const { count, error } = await createServiceClient().from("road_duels").select("trainer_id", { count: "exact", head: true }).eq("month", month);
  return error ? 0 : count ?? 0;
}
