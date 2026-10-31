import "server-only";

/**
 * Chat Brain survey rounds on stream (specs/gs-originals-chat-brain-stream.md,
 * build step 3). A survey is a standalone window (`!cb ask` or the dashboard):
 * chat answers with `!a`, and this file adds what happens around it.
 *
 *   live view    groups form as answers arrive (style "live"), or only a count
 *                ("hidden", used when the board will be played next; public
 *                GameShuffle questions are always hidden so their board stays
 *                a surprise)
 *   moderation   the streamer or a mod hides or merges groups (dashboard, or
 *                `!cb hide <n>` / `!cb merge <n> <m>` by the numbers on stream)
 *   AI passes    a meaning merge every ~10s while new answers arrive (live
 *                rounds, up to 4) and one more at the close, within a monthly
 *                allowance per channel; never counted against the streamer's
 *                own AI generations
 *   the board    at the close, the channel's own question becomes a board
 *                (publish(), community-scoped) when it has 10+ answers and 3
 *                groups, ready to play with `!cb start survey` or the dashboard
 *
 * State rides on the window's `answer` jsonb (SurveyState plus the result), so
 * there's no new table. Grouping: surveyRules.ts.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDayStart, gsMonthStart } from "@/lib/time/gsClock";
import { buildBoard, type BoardAnswer } from "./rules";
import { aiGroupAnswers, publish } from "./review";
import { WINDOW_COLS, closeWindow, toWindow, type GuessRow, type StreamWindow } from "./stream";
import {
  SURVEY_AI_PER_MONTH,
  SURVEY_SHOW_DONE_MS,
  aiPassDue,
  boardBlocker,
  shownGroups,
  surveyGroups,
  surveyStateOf,
  withHidden,
  withMerge,
  type SurveyAnswer,
  type SurveyGroup,
  type SurveyState,
  type SurveyStyle,
} from "./surveyRules";

/** What a closed survey recorded about its board. */
export interface SurveyResult {
  made: boolean;
  /** Why not: too few answers or groups, a public question (its board is built site-wide), or a failure. */
  reason: "few_answers" | "few_groups" | "public" | "failed" | null;
  boardId: string | null;
  size: number;
}

type SurveyRecord = SurveyState & { top?: { label: string; count: number }[]; result?: SurveyResult; finalAi?: boolean };

export interface StreamSurveyView {
  id: string;
  question: string;
  own: boolean;
  style: SurveyStyle;
  status: "open" | "closed";
  opensAt: string;
  closesAt: string;
  answers: number;
  /** The groups on stream, numbered. Empty for a hidden round. */
  groups: { n: number; label: string; count: number; share: number }[];
  /** Once closed. For a live round with a board, the board itself; a hidden round keeps it for the game. */
  result: (SurveyResult & { board: BoardAnswer[] | null }) | null;
}

export interface SurveyHostView extends StreamSurveyView {
  /** Every group of two or more people, for hiding and merging (the streamer's screen only; folded away in a hidden round). */
  all: { key: string; label: string; count: number; hidden: boolean; shownAs: number | null }[];
  singles: number;
  aiPasses: number;
}

const SURVEY_COLS = `${WINDOW_COLS}, answer, guesses, closed_at`;
type SurveyRow = Parameters<typeof toWindow>[0] & { answer: SurveyRecord | null; guesses: number; closed_at: string | null };

// ─── reads ───────────────────────────────────────────────────────────────────

/** The community's survey that's open, or one that closed in the last minute (still worth showing). */
async function showableSurvey(communityId: string): Promise<SurveyRow | null> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(SURVEY_COLS)
    .eq("community_id", communityId).eq("kind", "survey").is("game_id", null)
    .order("opens_at", { ascending: false }).limit(1).maybeSingle();
  const row = (data as SurveyRow | null) ?? null;
  if (!row) return null;
  if (row.status !== "closed") return row;
  return row.closed_at && Date.now() - Date.parse(row.closed_at) < SURVEY_SHOW_DONE_MS ? row : null;
}

async function readSurvey(windowId: string): Promise<SurveyRow | null> {
  const { data } = await createServiceClient().from("brain_stream_windows").select(SURVEY_COLS).eq("id", windowId).maybeSingle();
  return (data as SurveyRow | null) ?? null;
}

async function answersOf(windowId: string): Promise<SurveyAnswer[]> {
  const { data } = await createServiceClient().from("brain_stream_guesses").select("raw, normalized").eq("window_id", windowId).limit(20_000);
  return ((data ?? []) as SurveyAnswer[]).filter((a) => a.normalized);
}

const promptCache = new Map<string, { text: string; own: boolean }>();
async function promptOf(promptId: string | null): Promise<{ text: string; own: boolean }> {
  if (!promptId) return { text: "", own: false };
  const hit = promptCache.get(promptId);
  if (hit) return hit;
  const { data } = await createServiceClient().from("brain_prompts").select("text, community_id").eq("id", promptId).maybeSingle();
  const p = { text: (data as { text: string } | null)?.text ?? "", own: !!(data as { community_id: string | null } | null)?.community_id };
  promptCache.set(promptId, p);
  if (promptCache.size > 200) promptCache.delete(promptCache.keys().next().value!);
  return p;
}

async function boardAnswers(boardId: string | null): Promise<BoardAnswer[] | null> {
  if (!boardId) return null;
  const { data } = await createServiceClient().from("brain_boards").select("answers").eq("id", boardId).maybeSingle();
  return ((data as { answers: BoardAnswer[] } | null)?.answers ?? null);
}

const viewCache = new Map<string, { at: number; view: SurveyHostView }>();

/** The survey as the streamer's dashboard sees it (all groups, with keys). */
export async function hostSurveyView(communityId: string): Promise<SurveyHostView | null> {
  const row = await showableSurvey(communityId);
  if (!row) return null;
  const hit = viewCache.get(row.id);
  if (hit && Date.now() - hit.at < 1000 && row.status === "open") return hit.view;
  const [answers, prompt] = await Promise.all([answersOf(row.id), promptOf(row.prompt_id)]);
  const state = surveyStateOf(row.answer);
  const style: SurveyStyle = prompt.own ? state.style : "hidden";
  const groups = surveyGroups(answers, state);
  const total = answers.length;
  const shown = shownGroups(groups, total);
  const shownAt = new Map(shown.map((g) => [g.key, g.n]));
  const result = row.answer?.result ?? null;
  const view: SurveyHostView = {
    id: row.id,
    question: prompt.text,
    own: prompt.own,
    style,
    status: row.status === "closed" ? "closed" : "open",
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    answers: total,
    groups: style === "live" ? shown.map(({ n, label, count, share }) => ({ n, label, count, share })) : [],
    // The dashboard gets the board even for a hidden round (behind a spoiler fold); the overlay strips it.
    result: result ? { ...result, board: result.made ? await boardAnswers(result.boardId) : null } : null,
    all: groups.filter((g) => g.count >= 2).map((g) => ({ key: g.key, label: g.label, count: g.count, hidden: g.hidden, shownAs: shownAt.get(g.key) ?? null })),
    singles: groups.filter((g) => g.count < 2).length,
    // A pass counts once its grouping has landed (it's claimed before Claude answers).
    aiPasses: state.ai?.groups.length ? state.ai.passes : 0,
  };
  viewCache.set(row.id, { at: Date.now(), view });
  if (viewCache.size > 100) viewCache.delete(viewCache.keys().next().value!);
  return view;
}

/** The survey as the overlay shows it: no keys, no hidden groups. */
export async function overlaySurveyView(communityId: string): Promise<StreamSurveyView | null> {
  const v = await hostSurveyView(communityId);
  if (!v) return null;
  const { all: _all, singles: _singles, aiPasses: _ai, ...pub } = v;
  void _all; void _singles; void _ai;
  return { ...pub, result: pub.result ? { ...pub.result, board: pub.style === "live" ? pub.result.board : null } : null };
}

/** Close the community's survey if its time is up (the overlay schedules this after it responds, so it never waits). */
export async function tickSurvey(communityId: string): Promise<void> {
  const row = await showableSurvey(communityId);
  if (row?.status === "open" && Date.parse(row.closes_at) <= Date.now()) await closeWindow(row.id);
}

// ─── moderation ──────────────────────────────────────────────────────────────

export type SurveyEditError = "no_survey" | "closed" | "not_found" | "pick_two";

async function openSurveyRow(communityId: string): Promise<SurveyRow | { error: SurveyEditError }> {
  const row = await showableSurvey(communityId);
  if (!row) return { error: "no_survey" };
  if (row.status !== "open") return { error: "closed" };
  return row;
}

/** Change the round's state from its latest copy (hides and merges made at the same time both stick). */
async function saveState(windowId: string, change: (s: SurveyState) => SurveyState): Promise<boolean> {
  const row = await readSurvey(windowId);
  if (!row || row.status !== "open") return false;
  const next = change(surveyStateOf(row.answer));
  const { data } = await createServiceClient().from("brain_stream_windows")
    .update({ answer: { ...(row.answer ?? {}), hidden: next.hidden, merges: next.merges, style: next.style } })
    .eq("id", windowId).eq("status", "open").select("id").maybeSingle();
  viewCache.delete(windowId);
  return !!data;
}

/** A group by its key (dashboard) or its number on stream (`!cb hide 2`). */
async function findGroups(row: SurveyRow, refs: ({ key: string } | { n: number })[]): Promise<SurveyGroup[] | null> {
  const answers = await answersOf(row.id);
  const groups = surveyGroups(answers, surveyStateOf(row.answer));
  const shown = shownGroups(groups, answers.length);
  const out: SurveyGroup[] = [];
  for (const ref of refs) {
    const g = "key" in ref ? groups.find((x) => x.key === ref.key || x.keys.includes(ref.key)) : shown.find((x) => x.n === ref.n);
    if (!g) return null;
    if (!out.some((o) => o.key === g.key)) out.push(g);
  }
  return out;
}

export async function hideSurveyGroup(communityId: string, ref: { key: string } | { n: number }, hide = true): Promise<{ ok: true; label: string } | { ok: false; error: SurveyEditError }> {
  const row = await openSurveyRow(communityId);
  if ("error" in row) return { ok: false, error: row.error };
  const [g] = (await findGroups(row, [ref])) ?? [];
  if (!g) return { ok: false, error: "not_found" };
  return (await saveState(row.id, (s) => withHidden(s, g, hide))) ? { ok: true, label: g.label } : { ok: false, error: "closed" };
}

/** Fold every group after the first into the first. */
export async function mergeSurveyGroups(communityId: string, refs: ({ key: string } | { n: number })[]): Promise<{ ok: true; label: string } | { ok: false; error: SurveyEditError }> {
  const row = await openSurveyRow(communityId);
  if ("error" in row) return { ok: false, error: row.error };
  const groups = await findGroups(row, refs);
  if (!groups) return { ok: false, error: "not_found" };
  if (groups.length < 2) return { ok: false, error: "pick_two" };
  const [into, ...from] = groups;
  return (await saveState(row.id, (s) => withMerge(s, into, from))) ? { ok: true, label: into.label } : { ok: false, error: "closed" };
}

// ─── AI passes ───────────────────────────────────────────────────────────────

/** AI passes this channel's survey rounds used this Pacific month. */
async function aiUsedThisMonth(communityId: string): Promise<number> {
  const { data } = await createServiceClient().from("brain_stream_windows").select("answer")
    .eq("community_id", communityId).eq("kind", "survey").gte("opens_at", gsDayStart(gsMonthStart()).toISOString()).limit(1000);
  return ((data ?? []) as { answer: SurveyRecord | null }[]).reduce((n, r) => n + (r.answer?.ai?.passes ?? 0) + (r.answer?.finalAi ? 1 : 0), 0);
}

/**
 * Run a live AI pass if one is due. Called after a read responds (the overlay
 * and dashboard schedule it with `after()`), so nobody waits on it. The pass is
 * claimed on the previous pass's time, so two readers can't both run it.
 */
export async function maybeAiPass(communityId: string): Promise<void> {
  const row = await showableSurvey(communityId);
  if (!row || row.status !== "open") return;
  const prompt = await promptOf(row.prompt_id);
  if (!prompt.own) return;
  const state = surveyStateOf(row.answer);
  const answers = await answersOf(row.id);
  const distinct = new Set(answers.map((a) => a.normalized)).size;
  if (!aiPassDue(state, distinct, Date.now())) return;
  if ((await aiUsedThisMonth(communityId)) >= SURVEY_AI_PER_MONTH) return;

  const svc = createServiceClient();
  const claimAt = new Date().toISOString();
  const prevAt = state.ai?.at ?? null;
  const claimed = { groups: state.ai?.groups ?? [], passes: (state.ai?.passes ?? 0) + 1, at: claimAt, distinct };
  let q = svc.from("brain_stream_windows").update({ answer: { ...(row.answer ?? {}), ai: claimed } }).eq("id", row.id).eq("status", "open");
  // `->>` reads a missing key and a JSON null alike as NULL.
  q = prevAt ? q.eq("answer->ai->>at", prevAt) : q.is("answer->>ai", null);
  const { data: won } = await q.select("id").maybeSingle();
  if (!won) return;

  const r = await aiGroupAnswers(prompt.text, answers, { effort: "low" }).catch(() => null);
  if (!r?.ok) return;
  const latest = await readSurvey(row.id);
  if (!latest || latest.status !== "open") return;
  await svc.from("brain_stream_windows").update({ answer: { ...(latest.answer ?? {}), ai: { ...claimed, groups: r.groups } } }).eq("id", row.id).eq("status", "open");
  viewCache.delete(row.id);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

// ─── the close ───────────────────────────────────────────────────────────────

/**
 * At the close (stream.closeWindow, after the answers are saved): one more AI
 * pass, then the channel's own question becomes a board when there's enough.
 * Returns what to record on the window.
 */
export async function finishSurvey(window: StreamWindow, guesses: GuessRow[], ownerUserId: string | null): Promise<{ record: SurveyRecord; groups: SurveyGroup[] }> {
  const { data } = await createServiceClient().from("brain_stream_windows").select("answer").eq("id", window.id).maybeSingle();
  const prior = ((data as { answer: SurveyRecord | null } | null)?.answer ?? {}) as SurveyRecord;
  let state = surveyStateOf(prior);
  const prompt = await promptOf(window.promptId);
  const answers: SurveyAnswer[] = guesses.map((g) => ({ raw: g.raw, normalized: g.normalized })).filter((a) => a.normalized);
  let finalAi = false;

  if (prompt.own && new Set(answers.map((a) => a.normalized)).size >= 3 && (await aiUsedThisMonth(window.communityId)) < SURVEY_AI_PER_MONTH) {
    const r = await withTimeout(aiGroupAnswers(prompt.text, answers, { effort: "medium" }).catch(() => null), 15_000);
    if (r?.ok) {
      state = { ...state, ai: { groups: r.groups, passes: state.ai?.passes ?? 0, at: new Date().toISOString(), distinct: new Set(answers.map((a) => a.normalized)).size } };
      finalAi = true;
    }
  }
  const groups = surveyGroups(answers, state);
  const record: SurveyRecord = { ...prior, ...state, finalAi };

  if (!prompt.own || !window.promptId) {
    record.result = { made: false, reason: "public", boardId: null, size: 0 };
    return { record, groups };
  }
  const preview = buildBoard(groups.map((g) => ({ label: g.label, count: g.count, aliases: g.keys, hidden: g.hidden })), answers.length);
  const blocked = boardBlocker(answers.length, preview);
  if (blocked) {
    record.result = { made: false, reason: blocked, boardId: null, size: 0 };
    return { record, groups };
  }
  const pub = await publish(window.promptId, groups.map((g) => ({ label: g.label, keys: g.keys, hidden: g.hidden })), ownerUserId);
  if (!pub.ok) {
    record.result = { made: false, reason: pub.error === "not_enough" ? "few_groups" : "failed", boardId: null, size: 0 };
    return { record, groups };
  }
  const { data: b } = await createServiceClient().from("brain_boards").select("id").eq("prompt_id", window.promptId).eq("segment", "all")
    .order("edition", { ascending: false }).limit(1).maybeSingle();
  record.result = { made: true, reason: null, boardId: (b as { id: string } | null)?.id ?? null, size: pub.board.length };
  return { record, groups };
}

/** The board this channel's latest survey made, if it's still there to play. */
export async function latestSurveyBoard(communityId: string): Promise<{ id: string; promptId: string } | null> {
  const { data } = await createServiceClient().from("brain_stream_windows").select("answer, prompt_id")
    .eq("community_id", communityId).eq("kind", "survey").eq("status", "closed").is("game_id", null)
    .order("opens_at", { ascending: false }).limit(10);
  for (const r of (data ?? []) as { answer: SurveyRecord | null; prompt_id: string | null }[]) {
    const boardId = r.answer?.result?.boardId;
    if (boardId && r.prompt_id) return { id: boardId, promptId: r.prompt_id };
  }
  return null;
}
