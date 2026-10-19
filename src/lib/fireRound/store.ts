import "server-only";

/**
 * Fire Round, the engine (service role; tables from supabase/fire-round-m1.sql,
 * rules in src/lib/originals/fireRound.ts). Picks Britton made on 2026-10-19:
 * https://claude.ai/artifact/N8ZZzJUvEkJcBf3J3eEeDT.
 *
 * The server holds the clock and the answers. A run lines its questions up
 * when it starts (today's round: the day's shared set; free play: the
 * category's questions this player hasn't had in 30 days), shows one at a
 * time, judges every answer with the trivia nights' answer judge, and keeps
 * the score, the heat and the hearts. The page never sees an answer before
 * it's given, and picture questions load through /api/fire-round/pic so the
 * file name can't give the answer away.
 *
 * Every write is version-guarded (fire_runs.version), so two taps landing at
 * once count once. No cron needed to end a round: any read finishes a run
 * whose clock ran out, and the polls sweep is the backstop (sweepFireRuns).
 *
 * The question pool: approved, family-safe GameShuffle pack questions that
 * can show four choices. Word answers need wrong answers staff approved;
 * numbers and pictures get theirs worked out.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { judgeAnswer, type TriviaQuestion } from "@/lib/trivia/rules";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import { playerKey, type PlayerKind } from "@/lib/daily/boardRules";
import { recordFireScore } from "@/lib/daily/boards";
import {
  boardPoints, choiceIsRight, cleanWrong, fireCategory, fireNumber, fourChoices, heatFor, inCategory, numberDistractors, pointsFor, rosterDistractors, seeded, shuffled,
  DAILY_LENGTH, DAILY_SEEN, DAILY_SET_SIZE, FIRE_CATEGORIES, GRACE_MS, LENGTHS, LIVES, MIN_CATEGORY, MIXED,
  type FireLength, type FireTotals,
} from "@/lib/originals/fireRound";

type DbError = { code?: string; message?: string } | null;
/** A Fire Round table or column that isn't there yet. */
const missing = (e: DbError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

export interface FirePlayer { kind: PlayerKind; id: string }
const keyOf = (p: FirePlayer) => playerKey(p.kind, p.id);

// ─── the pool ────────────────────────────────────────────────────────────────

export interface PoolQuestion {
  id: string; category: string; gameSlug: string | null; kind: "text" | "number" | "picture"; difficulty: "easy" | "medium" | "hard";
  prompt: string; answer: string; accept: string[]; askAbout: string[]; reject: string[]; imageUrl: string | null;
  /** The three wrong answers its four choices use. */
  wrong: string[];
}

type PoolRow = {
  id: string; category: string; game_slug?: string | null; kind: string; difficulty: "easy" | "medium" | "hard"; prompt: string; answer: string;
  accept: string[] | null; ask_about: string[] | null; reject: string[] | null; image_url: string | null; wrong_answers: string[] | null; wrong_status: string | null;
};

let poolCache: { at: number; pool: Map<string, PoolQuestion> } | null = null;
const POOL_TTL = 60_000;

/** Every playable question, by id (cached a minute per server instance). Null before the migration. */
export async function loadPool(force = false): Promise<Map<string, PoolQuestion> | null> {
  if (!force && poolCache && Date.now() - poolCache.at < POOL_TTL) return poolCache.pool;
  const svc = createServiceClient();
  const base = "id, category, kind, difficulty, prompt, answer, accept, ask_about, reject, image_url, wrong_answers, wrong_status";
  const read = (cols: string) => svc.from("trivia_questions").select(cols).is("owner_user_id", null).eq("status", "approved").eq("family_safe", true)
    .in("kind", ["text", "number", "picture"]).limit(5000);
  let { data, error } = await read(`${base}, game_slug`);
  // Before trivia-game-packs-m1 there's no game_slug: read without it.
  if (error && /game_slug/.test(error.message ?? "")) ({ data, error } = await read(base));
  if (error) { if (!missing(error)) console.error("[fire] pool failed:", error); return null; }
  const rows = (data ?? []) as unknown as PoolRow[];
  // Picture rosters: the other answers in the same picture category.
  const rosters = new Map<string, string[]>();
  for (const r of rows) if (r.kind === "picture") rosters.set(r.category, [...(rosters.get(r.category) ?? []), r.answer]);
  const pool = new Map<string, PoolQuestion>();
  for (const r of rows) {
    const accept = r.accept ?? [];
    let wrong: string[] | null = null;
    if (r.kind === "text") wrong = r.wrong_status === "approved" ? cleanWrong(r.wrong_answers, r.answer, accept) : null;
    else if (r.kind === "number") wrong = numberDistractors(r.answer, r.id);
    else if (r.kind === "picture") wrong = r.image_url ? rosterDistractors(r.answer, rosters.get(r.category) ?? [], r.id, accept) : null;
    if (!wrong) continue;
    pool.set(r.id, {
      id: r.id, category: r.category, gameSlug: r.game_slug ?? null, kind: r.kind as PoolQuestion["kind"], difficulty: r.difficulty,
      prompt: r.prompt, answer: r.answer, accept, askAbout: r.ask_about ?? [], reject: r.reject ?? [], imageUrl: r.image_url, wrong,
    });
  }
  poolCache = { at: Date.now(), pool };
  return pool;
}

/** Categories with enough playable questions to show, and how many each holds. */
export async function fireCategories(): Promise<{ id: string; label: string; icon: string; count: number }[] | null> {
  const pool = await loadPool();
  if (!pool) return null;
  const all = [...pool.values()];
  return FIRE_CATEGORIES
    .map((c) => ({ id: c.id, label: c.label, icon: c.icon, count: all.filter((q) => inCategory(c, q)).length }))
    .filter((c) => c.count >= MIN_CATEGORY);
}

const asTrivia = (q: PoolQuestion): TriviaQuestion => ({ prompt: q.prompt, answer: q.answer, accept: q.accept, askAbout: q.askAbout, reject: q.reject, kind: q.kind });
const choicesOf = (q: PoolQuestion) => fourChoices(q.answer, q.wrong, q.id);

/** A difficulty mix that starts gentle: the trivia nights' own pattern. */
const MIX: PoolQuestion["difficulty"][] = ["easy", "easy", "medium", "easy", "medium", "hard", "medium", "easy", "medium", "hard"];

/**
 * Lines questions up: difficulty by MIX (falling back to whatever is left)
 * and never two from the same category in a row while another is available.
 */
function lineUp(candidates: PoolQuestion[], n: number, rand: () => number): string[] {
  const buckets: Record<PoolQuestion["difficulty"], PoolQuestion[]> = {
    easy: shuffled(candidates.filter((q) => q.difficulty === "easy"), rand),
    medium: shuffled(candidates.filter((q) => q.difficulty === "medium"), rand),
    hard: shuffled(candidates.filter((q) => q.difficulty === "hard"), rand),
  };
  const out: PoolQuestion[] = [];
  while (out.length < n) {
    const want = MIX[out.length % MIX.length];
    const order: PoolQuestion["difficulty"][] = [want, ...(["medium", "easy", "hard"] as const).filter((d) => d !== want)];
    const bucket = order.map((d) => buckets[d]).find((b) => b.length);
    if (!bucket) break;
    const last = out[out.length - 1]?.category;
    const i = Math.max(0, bucket.findIndex((q) => q.category !== last));
    out.push(bucket.splice(i, 1)[0]);
  }
  return out.map((q) => q.id);
}

// ─── today's round ───────────────────────────────────────────────────────────

/**
 * Today's questions, the same for everyone in the same order: picked once a
 * day (the first request claims fire_days), DAILY_SET_SIZE of them so a
 * speedrun can't run out, skipping the front of the last 30 days' sets while
 * the pool allows. Ids that stopped being playable since are dropped.
 */
export async function todaySet(day = gsDay()): Promise<string[] | null> {
  const pool = await loadPool();
  if (!pool) return null;
  const svc = createServiceClient();
  const { data: have, error } = await svc.from("fire_days").select("question_ids").eq("day", day).maybeSingle();
  if (error) { if (!missing(error)) console.error("[fire] today read failed:", error); return null; }
  if (have) return ((have as { question_ids: string[] }).question_ids ?? []).filter((id) => pool.has(id));

  const { data: recent } = await svc.from("fire_days").select("day, question_ids").gte("day", gsAddDays(day, -30)).lt("day", day);
  const byAge = ((recent ?? []) as { day: string; question_ids: string[] }[]).sort((a, b) => b.day.localeCompare(a.day));
  const all = [...pool.values()];
  // Skip as many recent days as still leaves a full set.
  let candidates = all;
  for (let keep = byAge.length; keep >= 0; keep--) {
    // Only the front of each recent set counts as used: that's what players reached.
    const used = new Set(byAge.slice(0, keep).flatMap((r) => r.question_ids.slice(0, DAILY_SEEN)));
    const left = all.filter((q) => !used.has(q.id));
    if (left.length >= DAILY_SET_SIZE || keep === 0) { candidates = left.length ? left : all; break; }
  }
  const ids = lineUp(candidates, DAILY_SET_SIZE, seeded(`fire-day:${day}`));
  if (!ids.length) return [];
  await svc.from("fire_days").upsert({ day, question_ids: ids }, { onConflict: "day", ignoreDuplicates: true });
  // Another request may have claimed the day first: everyone uses the stored set.
  const { data: stored } = await svc.from("fire_days").select("question_ids").eq("day", day).maybeSingle();
  return ((stored as { question_ids: string[] } | null)?.question_ids ?? ids).filter((id) => pool.has(id));
}

// ─── free play ───────────────────────────────────────────────────────────────

/** How many questions a free round lines up: plenty for its length. */
const QUEUE_SIZE: Record<FireLength, number> = { sprint: 25, three: 70, five: 110, lives: 150 };

/** A free round's questions: the category's ones this player hasn't had in 30 days first, then the longest unseen. */
async function freeQueue(player: FirePlayer, categoryId: string, length: FireLength): Promise<string[]> {
  const pool = await loadPool();
  if (!pool) return [];
  const cat = fireCategory(categoryId);
  const all = [...pool.values()].filter((q) => inCategory(cat, q));
  const { data } = await createServiceClient().from("fire_seen").select("question_id, seen_at").eq("player", keyOf(player)).gte("seen_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000);
  const seenAt = new Map(((data ?? []) as { question_id: string; seen_at: string }[]).map((r) => [r.question_id, r.seen_at]));
  const fresh = all.filter((q) => !seenAt.has(q.id));
  const n = Math.min(QUEUE_SIZE[length], all.length);
  const ids = lineUp(fresh, n, Math.random);
  if (ids.length < n) {
    const stale = all.filter((q) => seenAt.has(q.id)).sort((a, b) => seenAt.get(a.id)!.localeCompare(seenAt.get(b.id)!));
    ids.push(...stale.slice(0, n - ids.length).map((q) => q.id));
  }
  return ids;
}

async function markSeen(player: FirePlayer, questionId: string) {
  await createServiceClient().from("fire_seen").upsert({ player: keyOf(player), question_id: questionId, seen_at: new Date().toISOString() }, { onConflict: "player,question_id" });
}

// ─── runs ────────────────────────────────────────────────────────────────────

interface Current { qid: string; shownAt: string; revealed: boolean; choices: string[] | null; close?: boolean }
/** One answer: the question, right / wrong / skip, with the choices open, points, and the first 60 characters typed. */
interface LogEntry { q: string; v: "right" | "wrong" | "skip"; c: boolean; p: number; a?: string }

export interface RunRow {
  id: string; player: string; mode: "daily" | "free"; day: string; category: string; length: FireLength; queue: string[]; pos: number;
  current: Current | null; log: LogEntry[]; score: number; right_count: number; missed: number; skipped: number; choices_used: number;
  streak: number; best_streak: number; lives: number | null; counts: boolean; status: "playing" | "done"; version: number;
  started_at: string; ends_at: string | null; finished_at: string | null;
}
const RUN_COLS = "id, player, mode, day, category, length, queue, pos, current, log, score, right_count, missed, skipped, choices_used, streak, best_streak, lives, counts, status, version, started_at, ends_at, finished_at";

export interface FireQuestionView {
  /** 1-based, among the questions answered so far plus this one. */
  index: number;
  prompt: string;
  kind: "text" | "number" | "picture";
  /** Picture questions: loaded through our proxy. */
  image: string | null;
  category: string;
  /** The category's glyph key (src/components/fireRound/fireIcons.tsx). */
  icon: string;
  /** The four choices once opened (or a close typed answer opened them). */
  choices: string[] | null;
  /** The typed answer was close: pick from the four. */
  close: boolean;
}

export interface FireResultView {
  totals: FireTotals;
  /** Best score in this category and length before this run (null: first run). */
  best: number | null;
  newBest: boolean;
  /** Today's round only: what it earned on the board (null when it was practice, or a guest not on the board yet). */
  board: { points: number; tokens: number } | null;
}

export interface FireRunView {
  id: string;
  mode: "daily" | "free";
  day: string;
  /** Today's round number (#1 on FIRE_EPOCH). */
  number: number;
  category: string;
  categoryLabel: string;
  length: FireLength;
  status: "playing" | "done";
  /** Counts on today's board (the player's first round today). */
  counts: boolean;
  endsAt: string | null;
  serverNow: string;
  lives: number | null;
  score: number;
  right: number;
  missed: number;
  skipped: number;
  choices: number;
  streak: number;
  bestStreak: number;
  /** The heat on the next answer. */
  heat: number;
  question: FireQuestionView | null;
  result: FireResultView | null;
}

/** A question's tag: the Fire Round category it falls in (its name and glyph), else its pack category. */
function questionLabel(q: PoolQuestion): { category: string; icon: string } {
  const cat = FIRE_CATEGORIES.find((c) => c.id !== MIXED && inCategory(c, q));
  return cat ? { category: cat.label, icon: cat.icon } : { category: q.category, icon: "shuffle" };
}

const totalsOf = (r: RunRow): FireTotals => ({ score: r.score, right: r.right_count, missed: r.missed, skipped: r.skipped, choices: r.choices_used, bestStreak: r.best_streak });

function viewOf(r: RunRow, pool: Map<string, PoolQuestion>, result: FireResultView | null = null): FireRunView {
  const q = r.current ? pool.get(r.current.qid) : null;
  return {
    id: r.id, mode: r.mode, day: r.day, number: fireNumber(r.day), category: r.category, categoryLabel: fireCategory(r.category).label, length: r.length,
    status: r.status, counts: r.counts, endsAt: r.ends_at, serverNow: new Date().toISOString(), lives: r.lives,
    score: r.score, right: r.right_count, missed: r.missed, skipped: r.skipped, choices: r.choices_used, streak: r.streak, bestStreak: r.best_streak,
    heat: heatFor(r.streak),
    question: r.status === "playing" && q && r.current ? {
      index: r.log.length + 1,
      prompt: q.prompt,
      kind: q.kind,
      image: q.kind === "picture" ? `/api/fire-round/pic/${r.id}?q=${r.pos}` : null,
      ...questionLabel(q),
      choices: r.current.revealed ? r.current.choices : null,
      close: !!r.current.close,
    } : null,
    result,
  };
}

/** The question a run is on, for the picture proxy. */
export async function currentImage(runId: string, pos: number): Promise<string | null> {
  const { data } = await createServiceClient().from("fire_runs").select("pos, current, status").eq("id", runId).maybeSingle();
  const r = data as Pick<RunRow, "pos" | "current" | "status"> | null;
  if (!r || r.status !== "playing" || r.pos !== pos || !r.current) return null;
  const pool = await loadPool();
  return pool?.get(r.current.qid)?.imageUrl ?? null;
}

const expired = (r: RunRow, now = Date.now()) => r.status === "playing" && !!r.ends_at && now > Date.parse(r.ends_at) + GRACE_MS;

/** Saves a run's changes if nobody else changed it first. Null on a clash. */
async function save(r: RunRow, patch: Partial<RunRow>): Promise<RunRow | null> {
  const { data, error } = await createServiceClient().from("fire_runs").update({ ...patch, version: r.version + 1 }).eq("id", r.id).eq("version", r.version).select(RUN_COLS).maybeSingle();
  if (error) { console.error("[fire] save failed:", error); return null; }
  return (data as RunRow | null) ?? null;
}

/** The best finished score this player has in a category and length, leaving out one run. */
async function bestBefore(player: string, category: string, length: FireLength, exceptId: string): Promise<number | null> {
  const { data } = await createServiceClient().from("fire_runs").select("score").eq("player", player).eq("category", category).eq("length", length)
    .eq("status", "done").neq("id", exceptId).order("score", { ascending: false }).limit(1).maybeSingle();
  return (data as { score: number } | null)?.score ?? null;
}

const playerOf = (key: string): FirePlayer => ({ kind: key.slice(0, 1) as PlayerKind, id: key.slice(2) });

/** Today's round goes on the board: guests only once they've put a name on the boards. */
async function recordBoard(r: RunRow): Promise<{ points: number; tokens: number } | null> {
  if (r.mode !== "daily" || !r.counts) return null;
  const player = playerOf(r.player);
  if (player.kind === "g") {
    const { data } = await createServiceClient().from("daily_guests").select("guest_key").eq("guest_key", player.id).maybeSingle();
    if (!data) return null;
  }
  const got = await recordFireScore({ day: r.day, player, score: r.score, right: r.right_count, points: boardPoints(r.score) });
  return got ? { points: got.points, tokens: got.tokens } : null;
}

/** Ends a run (once): the clock ran out, the hearts did, the questions did, or the player stopped. */
async function finish(r: RunRow, pool: Map<string, PoolQuestion>): Promise<FireRunView> {
  let row = r;
  if (r.status === "playing") {
    const done = await save(r, { status: "done", finished_at: new Date().toISOString(), current: null });
    if (!done) {
      const fresh = await getRun(r.id);
      if (!fresh) return viewOf(r, pool);
      if (fresh.status === "playing") return finish(fresh, pool);
      row = fresh;
    } else {
      row = done;
    }
  }
  const [best, board] = await Promise.all([bestBefore(row.player, row.category, row.length, row.id), recordBoard(row)]);
  return viewOf(row, pool, { totals: totalsOf(row), best, newBest: row.score > 0 && (best === null || row.score > best), board });
}

async function getRun(id: string): Promise<RunRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("fire_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  return (data as RunRow | null) ?? null;
}

export type StartResult = { ok: true; run: FireRunView } | { ok: false; error: "not_ready" | "no_questions" | "failed" };

/**
 * Starts a round. Today's round: the day's shared set, 1 minute, mixed; the
 * first one a player starts today counts on the board, any later one is
 * practice. A round already in progress is picked up again (today's) or
 * ended first (free play).
 */
export async function startRun(player: FirePlayer, input: { mode: "daily" | "free"; category?: string; length?: FireLength }): Promise<StartResult> {
  const pool = await loadPool();
  if (!pool) return { ok: false, error: "not_ready" };
  const svc = createServiceClient();
  const key = keyOf(player);
  const day = gsDay();

  const { data: open } = await svc.from("fire_runs").select(RUN_COLS).eq("player", key).eq("status", "playing").order("started_at", { ascending: false }).limit(5);
  for (const r of (open ?? []) as RunRow[]) {
    if (!expired(r) && r.mode === "daily" && input.mode === "daily" && r.day === day) return { ok: true, run: viewOf(r, pool) };
    await finish(r, pool);
  }

  const daily = input.mode === "daily";
  const category = daily ? MIXED : fireCategory(input.category).id;
  const length: FireLength = daily ? DAILY_LENGTH : input.length && input.length in LENGTHS ? input.length : "sprint";
  const queue = daily ? await todaySet(day) : await freeQueue(player, category, length);
  if (!queue) return { ok: false, error: "not_ready" };
  if (!queue.length) return { ok: false, error: "no_questions" };

  const now = new Date();
  const seconds = LENGTHS[length].seconds;
  const row = {
    player: key, mode: input.mode, day, category, length, queue, pos: 0,
    current: { qid: queue[0], shownAt: now.toISOString(), revealed: false, choices: null } satisfies Current,
    lives: seconds === null ? LIVES : null,
    ends_at: seconds === null ? null : new Date(now.getTime() + seconds * 1000).toISOString(),
    counts: daily,
  };
  let { data, error } = await svc.from("fire_runs").insert(row).select(RUN_COLS).single();
  // Someone (this player on another tab) already has today's counting round: this one is practice.
  if (error?.code === "23505") ({ data, error } = await svc.from("fire_runs").insert({ ...row, counts: false }).select(RUN_COLS).single());
  if (error || !data) { if (!missing(error)) console.error("[fire] start failed:", error); return { ok: false, error: missing(error) ? "not_ready" : "failed" }; }
  await markSeen(player, queue[0]);
  return { ok: true, run: viewOf(data as RunRow, pool) };
}

export type FireAction = { kind: "typed"; text: string } | { kind: "choice"; text: string } | { kind: "choices" } | { kind: "skip" } | { kind: "stop" };

export interface FireOutcome {
  verdict: "right" | "wrong" | "skip" | "close";
  /** The right answer, once the question is over. */
  answer: string | null;
  points: number;
  heat: number;
}

export type ActResult = { ok: true; run: FireRunView; outcome: FireOutcome | null } | { ok: false; error: "not_found" | "not_ready" | "bad_request" | "busy" };

/** One move in a round: an answer, opening the choices, a skip, or stopping. */
export async function act(runId: string, player: FirePlayer, action: FireAction, attempt = 0): Promise<ActResult> {
  const pool = await loadPool();
  if (!pool) return { ok: false, error: "not_ready" };
  const r = await getRun(runId);
  if (!r || r.player !== keyOf(player)) return { ok: false, error: "not_found" };
  if (r.status === "done") return { ok: true, run: await finish(r, pool), outcome: null };
  if (expired(r) || action.kind === "stop") return { ok: true, run: await finish(r, pool), outcome: null };
  const cur = r.current;
  const q = cur ? pool.get(cur.qid) : null;
  // The question stopped being playable mid-round (staff retired it): move on without scoring it.
  if (!cur || !q) return advance(r, pool, null, attempt, runId, player, action);

  if (action.kind === "choices") {
    if (cur.revealed) return { ok: true, run: viewOf(r, pool), outcome: null };
    const saved = await save(r, { current: { ...cur, revealed: true, choices: choicesOf(q) } });
    if (!saved) return attempt < 2 ? act(runId, player, action, attempt + 1) : { ok: false, error: "busy" };
    return { ok: true, run: viewOf(saved, pool), outcome: null };
  }

  let right = false;
  let verdict: FireOutcome["verdict"];
  let typed: string | undefined;
  if (action.kind === "skip") verdict = "skip";
  else if (action.kind === "choice") {
    if (!cur.revealed || !cur.choices?.includes(action.text)) return { ok: false, error: "bad_request" };
    right = choiceIsRight(action.text, q.answer);
    verdict = right ? "right" : "wrong";
    typed = action.text;
  } else {
    if (cur.revealed) return { ok: false, error: "bad_request" };
    const text = action.text.trim().slice(0, 120);
    if (!text) return { ok: false, error: "bad_request" };
    const judged = judgeAnswer(text, asTrivia(q));
    if (judged === "ask") {
      // Close but not exact (a host would rule on it): open the four choices for a second chance.
      const saved = await save(r, { current: { ...cur, revealed: true, close: true, choices: choicesOf(q) } });
      if (!saved) return attempt < 2 ? act(runId, player, action, attempt + 1) : { ok: false, error: "busy" };
      return { ok: true, run: viewOf(saved, pool), outcome: { verdict: "close", answer: null, points: 0, heat: heatFor(saved.streak) } };
    }
    right = judged === "correct";
    verdict = right ? "right" : "wrong";
    typed = text;
  }

  const points = pointsFor(right, cur.revealed, r.streak);
  const entry: LogEntry = { q: q.id, v: verdict === "skip" ? "skip" : right ? "right" : "wrong", c: cur.revealed, p: points, ...(typed ? { a: typed.slice(0, 60) } : {}) };
  const outcome: FireOutcome = { verdict, answer: q.answer, points, heat: heatFor(r.streak) };
  return advance(r, pool, { entry, right, points, usedChoices: cur.revealed && verdict !== "skip" }, attempt, runId, player, action, outcome);
}

/** Records an answer (if any) and moves to the next question, or ends the run. */
async function advance(
  r: RunRow, pool: Map<string, PoolQuestion>, scored: { entry: LogEntry; right: boolean; points: number; usedChoices: boolean } | null,
  attempt: number, runId: string, player: FirePlayer, action: FireAction, outcome: FireOutcome | null = null,
): Promise<ActResult> {
  const streak = scored ? (scored.right ? r.streak + 1 : 0) : r.streak;
  const lives = r.lives === null ? null : scored && !scored.right ? r.lives - 1 : r.lives;
  const patch: Partial<RunRow> = {
    log: scored ? [...r.log, scored.entry] : r.log,
    score: r.score + (scored?.points ?? 0),
    right_count: r.right_count + (scored?.right ? 1 : 0),
    missed: r.missed + (scored && scored.entry.v === "wrong" ? 1 : 0),
    skipped: r.skipped + (scored && scored.entry.v === "skip" ? 1 : 0),
    choices_used: r.choices_used + (scored?.usedChoices ? 1 : 0),
    streak,
    best_streak: Math.max(r.best_streak, streak),
    lives,
  };
  // Next question: skip any that stopped being playable.
  let pos = r.pos + 1;
  while (pos < r.queue.length && !pool.has(r.queue[pos])) pos++;
  const outOfTime = !!r.ends_at && Date.now() > Date.parse(r.ends_at);
  const over = (lives !== null && lives <= 0) || pos >= r.queue.length || outOfTime;
  if (!over) {
    patch.pos = pos;
    patch.current = { qid: r.queue[pos], shownAt: new Date().toISOString(), revealed: false, choices: null };
  }
  const saved = await save(r, patch);
  if (!saved) return attempt < 2 ? act(runId, player, action, attempt + 1) : { ok: false, error: "busy" };
  if (over) return { ok: true, run: await finish(saved, pool), outcome };
  await markSeen(player, r.queue[pos]);
  return { ok: true, run: viewOf(saved, pool), outcome };
}

// ─── what the page opens with ────────────────────────────────────────────────

export interface FireBest { category: string; categoryLabel: string; length: FireLength; score: number; right: number }

export interface FireHome {
  ready: boolean;
  day: string;
  number: number;
  categories: { id: string; label: string; icon: string; count: number }[];
  /** Today's round: the counting run once finished. */
  today: { score: number; right: number; bestStreak: number } | null;
  /** Days in a row with today's round played (today, or up to yesterday while today's is still open). */
  streak: number;
  bests: FireBest[];
  /** A round still running (pick it back up). */
  current: FireRunView | null;
}

/** The page's opening state for a player (or a visitor with no id yet). */
export async function fireHome(player: FirePlayer | null): Promise<FireHome> {
  const day = gsDay();
  const empty: FireHome = { ready: false, day, number: fireNumber(day), categories: [], today: null, streak: 0, bests: [], current: null };
  const pool = await loadPool();
  const categories = await fireCategories();
  if (!pool || !categories) return empty;
  const base = { ...empty, ready: categories.length > 0, categories };
  if (!player) return base;
  const svc = createServiceClient();
  const key = keyOf(player);

  const [{ data: open }, { data: dailies }, { data: done }] = await Promise.all([
    svc.from("fire_runs").select(RUN_COLS).eq("player", key).eq("status", "playing").order("started_at", { ascending: false }).limit(3),
    svc.from("fire_runs").select("day, score, right_count, best_streak, status").eq("player", key).eq("mode", "daily").eq("counts", true).gte("day", gsAddDays(day, -400)).order("day", { ascending: false }).limit(400),
    svc.from("fire_runs").select("category, length, score, right_count").eq("player", key).eq("status", "done").order("score", { ascending: false }).limit(300),
  ]);

  let current: FireRunView | null = null;
  for (const r of (open ?? []) as RunRow[]) {
    if (expired(r)) { await finish(r, pool); continue; }
    if (!current) current = viewOf(r, pool);
  }

  const daily = (dailies ?? []) as { day: string; score: number; right_count: number; best_streak: number; status: string }[];
  const todays = daily.find((d) => d.day === day && d.status === "done");
  const played = new Set(daily.filter((d) => d.status === "done").map((d) => d.day));
  let streak = 0;
  for (let d = played.has(day) ? day : gsAddDays(day, -1); played.has(d); d = gsAddDays(d, -1)) streak++;

  const bestMap = new Map<string, FireBest>();
  for (const r of (done ?? []) as { category: string; length: FireLength; score: number; right_count: number }[]) {
    const k = `${r.category}|${r.length}`;
    if (!bestMap.has(k) && r.score > 0) bestMap.set(k, { category: r.category, categoryLabel: fireCategory(r.category).label, length: r.length, score: r.score, right: r.right_count });
  }

  return {
    ...base,
    today: todays ? { score: todays.score, right: todays.right_count, bestStreak: todays.best_streak } : null,
    streak,
    bests: [...bestMap.values()].slice(0, 6),
    current,
  };
}

/** A run's view for its player (finishing it first if its clock ran out). */
export async function runView(runId: string, player: FirePlayer): Promise<FireRunView | null> {
  const pool = await loadPool();
  const r = await getRun(runId);
  if (!pool || !r || r.player !== keyOf(player)) return null;
  return expired(r) || r.status === "done" ? finish(r, pool) : viewOf(r, pool);
}

/**
 * A guest who just put a name on the boards: today's finished round goes on
 * the board now (it couldn't when it ended).
 */
export async function boardTodayFor(player: FirePlayer): Promise<{ points: number; tokens: number } | null> {
  const { data } = await createServiceClient().from("fire_runs").select(RUN_COLS).eq("player", keyOf(player)).eq("mode", "daily").eq("counts", true).eq("day", gsDay()).eq("status", "done").maybeSingle();
  return data ? recordBoard(data as RunRow) : null;
}

/**
 * A guest signed in: their rounds move onto the account. A day where both
 * have a counting round keeps the account's (the guest's becomes practice).
 */
export async function moveFireRuns(guestKey: string, userId: string): Promise<void> {
  const svc = createServiceClient();
  const from = `g:${guestKey}`;
  const to = `u:${userId}`;
  const { data: mine, error } = await svc.from("fire_runs").select("day").eq("player", to).eq("mode", "daily").eq("counts", true);
  if (error) return; // before the migration
  const taken = ((mine ?? []) as { day: string }[]).map((r) => r.day);
  if (taken.length) await svc.from("fire_runs").update({ counts: false }).eq("player", from).eq("mode", "daily").in("day", taken);
  await svc.from("fire_runs").update({ player: to }).eq("player", from);
  // What they've seen, so free play keeps not repeating.
  const { data: seen } = await svc.from("fire_seen").select("question_id, seen_at").eq("player", from).limit(5000);
  const rows = ((seen ?? []) as { question_id: string; seen_at: string }[]).map((r) => ({ player: to, question_id: r.question_id, seen_at: r.seen_at }));
  for (let i = 0; i < rows.length; i += 500) await svc.from("fire_seen").upsert(rows.slice(i, i + 500), { onConflict: "player,question_id" });
  await svc.from("fire_seen").delete().eq("player", from);
}

/** The polls sweep's backstop: ends rounds whose clock ran out, and Until 3 misses rounds left open a day. */
export async function sweepFireRuns(limit = 50): Promise<number> {
  const pool = await loadPool();
  if (!pool) return 0;
  const svc = createServiceClient();
  const now = Date.now();
  const { data, error } = await svc.from("fire_runs").select(RUN_COLS).eq("status", "playing").lt("started_at", new Date(now - 60_000).toISOString()).order("started_at").limit(limit);
  if (error) return 0;
  let ended = 0;
  for (const r of (data ?? []) as RunRow[]) {
    const stale = r.ends_at ? expired(r, now) : Date.parse(r.started_at) < now - 86_400_000;
    if (!stale) continue;
    await finish(r, pool);
    ended++;
  }
  return ended;
}
