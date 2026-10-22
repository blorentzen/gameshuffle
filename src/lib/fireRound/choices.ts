import "server-only";

/**
 * Fire Round's four choices, the staff side (Platform ▸ Trivia ▸ Four
 * choices). Word-answer pack questions need three wrong answers before solo
 * play can use them (Britton's pick, 2026-10-19: drafted, then approved by
 * staff). Numbers and pictures get theirs worked out, so they never appear here.
 *
 *   fillPackWrong   the starter pack's handwritten wrong answers
 *                   (src/data/originals/trivia-pack-wrong.ts) onto questions
 *                   that have none, as drafts
 *   choicesAdmin    what's waiting, what's done, and how full each category is
 *   approveWrong / updateWrong   staff checks
 *   draftWrong      Claude drafts wrong answers for questions that have none
 *   draftCategory   Claude drafts new questions for a pack category, wrong
 *                   answers included, to grow the bank toward ~100 a category
 * AI rules as everywhere: Claude drafts, a person approves.
 */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";
import { questionKey } from "@/lib/chatbrain/rules";
import { gsDay } from "@/lib/time/gsClock";
import { judgeAnswer } from "@/lib/trivia/rules";
import { questionRow } from "@/lib/trivia/store";
import { PACK_WRONG } from "@/data/originals/trivia-pack-wrong";
import { cleanWrong, FIRE_CATEGORIES, inCategory, MIXED } from "@/lib/originals/fireRound";
import { loadPool } from "./store";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42703", "PGRST204", "42P01", "PGRST205"].includes(e.code ?? "") || /wrong_answers|wrong_status|does not exist/i.test(e.message ?? ""));

/** The pack categories a staff member can grow (not the picture rounds, which come from our art). */
export const GROWABLE = ["General knowledge", "Geography", "Science & nature", "History", "Video games", "Movies & TV", "Music", "Sports", "Food & drink", "Words & numbers"];
/** About this many playable questions a category, before launch (pick 8). */
export const CATEGORY_TARGET = 100;

/** Puts the starter pack's wrong answers on pack questions that have none yet, as drafts. Safe to rerun. */
export async function fillPackWrong(): Promise<{ filled: number; ready: boolean }> {
  const svc = createServiceClient();
  const { data, error } = await readAllPages((from, to) => svc.from("trivia_questions").select("id, prompt, answer, accept, wrong_answers").is("owner_user_id", null).eq("kind", "text").order("id").range(from, to));
  if (error) return { filled: 0, ready: !missing(error) };
  const byKey = new Map(Object.entries(PACK_WRONG).map(([prompt, wrong]) => [questionKey(prompt), wrong]));
  let filled = 0;
  for (const r of (data ?? []) as { id: string; prompt: string; answer: string; accept: string[] | null; wrong_answers: string[] | null }[]) {
    if (r.wrong_answers?.length) continue;
    const wrong = cleanWrong(byKey.get(questionKey(r.prompt)), r.answer, r.accept ?? []);
    if (!wrong) continue;
    const { error: e } = await svc.from("trivia_questions").update({ wrong_answers: wrong, wrong_status: "draft" }).eq("id", r.id).is("wrong_answers", null);
    if (!e) filled++;
  }
  return { filled, ready: true };
}

export interface ChoiceQuestion { id: string; category: string; prompt: string; answer: string; accept: string[]; wrong: string[]; status: "draft" | "approved" | "retired" }
export interface CategoryFill { id: string; label: string; playable: number; target: number }
export interface ChoicesAdmin {
  ready: boolean;
  /** Wrong answers waiting for a check. */
  waiting: ChoiceQuestion[];
  /** Approved word-answer questions with no wrong answers yet (Claude can draft them). */
  missing: number;
  /** Questions with none that the starter pack has handwritten ones for (Add the starter wrong answers). */
  starter: number;
  /** Word-answer questions whose wrong answers are approved. */
  approved: number;
  /** How many questions each category can play now, against the ~100 target. */
  categories: CategoryFill[];
  /** Questions Fire Round can play in all. */
  playable: number;
  growable: string[];
}

export async function choicesAdmin(): Promise<ChoicesAdmin> {
  const empty: ChoicesAdmin = { ready: false, waiting: [], missing: 0, starter: 0, approved: 0, categories: [], playable: 0, growable: GROWABLE };
  const { data, error } = await readAllPages((from, to) => createServiceClient().from("trivia_questions")
    .select("id, category, prompt, answer, accept, status, wrong_answers, wrong_status")
    .is("owner_user_id", null).eq("kind", "text").neq("status", "retired").order("id").range(from, to));
  if (error) return empty;
  const rows = (data ?? []) as { id: string; category: string; prompt: string; answer: string; accept: string[] | null; status: ChoiceQuestion["status"]; wrong_answers: string[] | null; wrong_status: string | null }[];
  const pool = await loadPool(true);
  const starterKeys = new Set(Object.keys(PACK_WRONG).map(questionKey));
  const all = [...(pool?.values() ?? [])];
  return {
    ready: true,
    waiting: rows.filter((r) => r.wrong_status === "draft" && r.wrong_answers?.length)
      .map((r) => ({ id: r.id, category: r.category, prompt: r.prompt, answer: r.answer, accept: r.accept ?? [], wrong: r.wrong_answers ?? [], status: r.status })),
    missing: rows.filter((r) => r.status === "approved" && !r.wrong_answers?.length).length,
    starter: rows.filter((r) => !r.wrong_answers?.length && starterKeys.has(questionKey(r.prompt))).length,
    approved: rows.filter((r) => r.wrong_status === "approved").length,
    categories: FIRE_CATEGORIES.filter((c) => c.id !== MIXED).map((c) => ({ id: c.id, label: c.label, playable: all.filter((q) => inCategory(c, q)).length, target: CATEGORY_TARGET })),
    playable: all.length,
    growable: GROWABLE,
  };
}

export async function approveWrong(ids: string[]): Promise<number> {
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!clean.length) return 0;
  const { data } = await createServiceClient().from("trivia_questions").update({ wrong_status: "approved", updated_at: new Date().toISOString() })
    .in("id", clean).is("owner_user_id", null).not("wrong_answers", "is", null).select("id");
  return (data ?? []).length;
}

/** Staff edit a question's three wrong answers (saved as checked). */
export async function updateWrong(id: string, wrong: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: q } = await svc.from("trivia_questions").select("prompt, answer, accept, ask_about, reject, kind").eq("id", id).is("owner_user_id", null).maybeSingle();
  if (!q) return { ok: false, error: "not_found" };
  const row = q as { prompt: string; answer: string; accept: string[] | null; ask_about: string[] | null; reject: string[] | null; kind: string };
  const clean = cleanWrong(wrong, row.answer, row.accept ?? []);
  if (!clean) return { ok: false, error: "need_three" };
  const tq = { prompt: row.prompt, answer: row.answer, accept: row.accept ?? [], askAbout: row.ask_about ?? [], reject: row.reject ?? [], kind: "text" as const };
  if (clean.some((w) => judgeAnswer(w, tq) === "correct")) return { ok: false, error: "counts_as_right" };
  if (clean.some((w) => isBlockedText(w))) return { ok: false, error: "blocked" };
  const { error } = await svc.from("trivia_questions").update({ wrong_answers: clean, wrong_status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

const WRONG_SCHEMA = z.object({
  items: z.array(z.object({
    id: z.string().describe("The question's id, exactly as given."),
    wrong: z.array(z.string()).describe("Three wrong answers."),
  })),
});

/** Claude drafts wrong answers for approved word-answer questions that have none (up to `limit` at a time). */
export async function draftWrong(limit = 30): Promise<AiResult<{ drafted: number; skipped: number }> | { ok: false; error: "not_ready" | "none" }> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("trivia_questions").select("id, category, prompt, answer, accept, ask_about, reject")
    .is("owner_user_id", null).eq("kind", "text").eq("status", "approved").is("wrong_answers", null).limit(Math.min(50, limit));
  if (error) return { ok: false, error: "not_ready" };
  const rows = (data ?? []) as { id: string; category: string; prompt: string; answer: string; accept: string[] | null; ask_about: string[] | null; reject: string[] | null }[];
  if (!rows.length) return { ok: false, error: "none" };

  const system = [
    "You write the three wrong options for multiple-choice trivia questions. A player who doesn't know the answer sees the right answer and your three, shuffled.",
    "Each wrong option must be plainly wrong to someone who knows the answer, yet believable to someone who doesn't: same kind of thing as the answer (a city for a city, a person for a person), similar length and style.",
    "Never write the answer, another accepted spelling of it, or anything that is also correct (for 'name one of' questions, nothing else from the set). Avoid near-spellings of the answer.",
    "Family friendly. Plain English. Don't use em dashes or en dashes.",
  ].join(" ");
  const prompt = rows.map((r) => [
    `id: ${r.id}`,
    `question: ${r.prompt}`,
    `answer: ${r.answer}`,
    r.accept?.length ? `also correct: ${r.accept.join("; ")}` : "",
    r.reject?.length ? `close but wrong (good options): ${r.reject.join("; ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");

  const res = await draftStructured({ system, prompt: `Write three wrong options for each question.\n\n${prompt}`, schema: WRONG_SCHEMA, effort: "low", maxTokens: 6000 });
  if (!res.ok) return res;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let drafted = 0;
  let skipped = 0;
  for (const item of res.data.items) {
    const r = byId.get(item.id);
    if (!r) continue;
    const tq = { prompt: r.prompt, answer: r.answer, accept: r.accept ?? [], askAbout: r.ask_about ?? [], reject: r.reject ?? [], kind: "text" as const };
    const clean = cleanWrong(item.wrong, r.answer, r.accept ?? []);
    if (!clean || clean.some((w) => judgeAnswer(w, tq) === "correct" || isBlockedText(w))) { skipped++; continue; }
    const { error: e } = await svc.from("trivia_questions").update({ wrong_answers: clean, wrong_status: "draft" }).eq("id", r.id).is("wrong_answers", null);
    if (!e) drafted++;
  }
  return { ok: true, data: { drafted, skipped } };
}

const CATEGORY_SCHEMA = z.object({
  questions: z.array(z.object({
    prompt: z.string().describe("The question. One sentence, under 140 characters, readable at a glance."),
    answer: z.string().describe("The answer, short: a name, a number or a few words."),
    accept: z.array(z.string()).describe("Other ways of writing the same answer that should count."),
    reject: z.array(z.string()).describe("Close but wrong answers people will give, which must not count."),
    kind: z.enum(["text", "number"]).describe("number when the answer is a number or a year."),
    wrong: z.array(z.string()).describe("For text questions: three believable wrong options, plainly wrong to someone who knows. Empty for number questions."),
    difficulty: z.enum(["easy", "medium", "hard"]),
    sources: z.array(z.object({ title: z.string(), url: z.string().nullable() })).describe("One or two references where staff can check the fact."),
    changeable: z.boolean().describe("true when the fact could change (records, current holders, latest counts)."),
  })),
});

/**
 * Claude drafts `count` new questions for a pack category, each with its
 * wrong answers, as drafts for staff to check. Skips questions the pack has.
 */
export async function draftCategory(category: string, count: number): Promise<AiResult<{ added: number; skipped: number }> | { ok: false; error: "not_ready" | "unknown_category" }> {
  if (!GROWABLE.includes(category)) return { ok: false, error: "unknown_category" };
  const svc = createServiceClient();
  const { data: existing, error } = await readAllPages((from, to) => svc.from("trivia_questions").select("prompt").is("owner_user_id", null).eq("category", category).order("id").range(from, to));
  if (error) return { ok: false, error: "not_ready" };
  const avoid = ((existing ?? []) as { prompt: string }[]).map((r) => r.prompt);
  const today = gsDay();

  const system = [
    "You write trivia questions for a fast solo trivia game: players type the answer against the clock, or open four choices when stuck. One clear answer matters more than anything.",
    "Accuracy first: only questions whose answer you're certain of and that a standard reference (an encyclopedia, the official site) would confirm. Skip anything disputed or that depends on how you count.",
    "Short and readable at a glance: no long setups, no trick questions, nothing that needs an image. Mix easy, medium and hard, mostly easy and medium. About one in four can be a number or year.",
    "For every text question write three wrong options: the same kind of thing as the answer, believable to someone who doesn't know, plainly wrong to someone who does, never another correct answer or a near-spelling of the answer.",
    "Family friendly, nothing about violence, politics or religion. Plain English. Don't use em dashes or en dashes.",
  ].join(" ");
  const prompt = [
    `Category: ${category}`,
    `Write ${count} questions.`,
    avoid.length ? `Already in the pack (don't repeat these facts):\n${avoid.slice(0, 200).map((q) => `- ${q}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const res = await draftStructured({ system, prompt, schema: CATEGORY_SCHEMA, effort: "medium", maxTokens: 10000 });
  if (!res.ok) return res;
  const have = new Set(avoid.map(questionKey));
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const q of res.data.questions.slice(0, count)) {
    const key = questionKey(q.prompt);
    if (have.has(key) || isBlockedText(q.prompt) || isBlockedText(q.answer)) { skipped++; continue; }
    const v = questionRow({
      prompt: q.prompt, answer: q.answer, accept: q.accept, reject: q.reject, kind: q.kind, category, difficulty: q.difficulty,
      sources: q.sources.map((s) => ({ title: s.title, url: s.url })), asOf: q.changeable ? today : null, changeable: q.changeable, familySafe: true,
    });
    if (!v.ok) { skipped++; continue; }
    const tq = { prompt: q.prompt, answer: q.answer, accept: q.accept, askAbout: [], reject: q.reject, kind: q.kind };
    const wrong = q.kind === "text" ? cleanWrong(q.wrong, q.answer, q.accept) : null;
    const okWrong = wrong && !wrong.some((w) => judgeAnswer(w, tq) === "correct" || isBlockedText(w));
    have.add(key);
    rows.push({ ...v.row, owner_user_id: null, origin: "ai", status: "draft", ...(okWrong ? { wrong_answers: wrong, wrong_status: "draft" } : {}) });
  }
  if (rows.length) {
    // Rows with and without wrong answers in one insert: give every row the same keys (missing keys are sent as null).
    const even = rows.map((r) => ({ wrong_answers: null, wrong_status: null, ...r }));
    const { error: e } = await svc.from("trivia_questions").insert(even);
    if (e) { if (missing(e)) return { ok: false, error: "not_ready" }; throw new Error(`category draft save failed: ${e.message}`); }
  }
  return { ok: true, data: { added: rows.length, skipped } };
}
