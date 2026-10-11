import "server-only";

/**
 * Know the Channel questions (break mode): the streamer's and their mods' own
 * questions about the channel, asked on a break (games/channel.ts). Table
 * break_channel_questions (break-mode-m2.sql, service role only).
 *
 * Questions the streamer or a mod types go straight in (approved); AI drafts
 * from the questionnaire land as drafts to keep or toss. Every field passes
 * the word filter. Missing table = "not ready" (the screen says to run the
 * migration).
 */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";

export interface ChannelQuestion {
  id: string;
  prompt: string;
  answer: string;
  accept: string[];
  status: "draft" | "approved" | "retired";
  origin: "streamer" | "mod" | "ai";
  createdAt: string;
}

export class ChannelQuestionsNotReady extends Error {}

const COLS = "id, prompt, answer, accept, status, origin, created_at";
const MAX_PER_CHANNEL = 200;

function toQuestion(r: { id: string; prompt: string; answer: string; accept: string[] | null; status: string; origin: string; created_at: string }): ChannelQuestion {
  return { id: r.id, prompt: r.prompt, answer: r.answer, accept: r.accept ?? [], status: r.status as ChannelQuestion["status"], origin: r.origin as ChannelQuestion["origin"], createdAt: r.created_at };
}

function notReady(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /break_channel_questions/.test(error.message ?? ""));
}

export type QuestionInput = { prompt: string; answer: string; accept?: string[] };
export type QuestionError = "too_short" | "too_long" | "blocked";
export type CleanResult = { ok: true; value: { prompt: string; answer: string; accept: string[] } } | { ok: false; error: QuestionError };

/** Tidy and check one question: lengths, up to 8 other answers, the word filter. */
export function cleanQuestion(input: QuestionInput): CleanResult {
  const prompt = input.prompt.trim().replace(/\s+/g, " ");
  const answer = input.answer.trim().replace(/\s+/g, " ");
  const accept = [...new Set((input.accept ?? []).map((a) => a.trim().replace(/\s+/g, " ")).filter((a) => a && a.toLowerCase() !== answer.toLowerCase()))].slice(0, 8);
  if (prompt.length < 5 || answer.length < 1) return { ok: false, error: "too_short" };
  if (prompt.length > 160 || answer.length > 60 || accept.some((a) => a.length > 60)) return { ok: false, error: "too_long" };
  if ([prompt, answer, ...accept].some((t) => isBlockedText(t))) return { ok: false, error: "blocked" };
  return { ok: true, value: { prompt, answer, accept } };
}

export async function listQuestions(communityId: string): Promise<ChannelQuestion[]> {
  const { data, error } = await createServiceClient().from("break_channel_questions").select(COLS)
    .eq("community_id", communityId).neq("status", "retired").order("created_at", { ascending: false }).limit(MAX_PER_CHANNEL);
  if (notReady(error)) throw new ChannelQuestionsNotReady();
  if (error) throw new Error(error.message);
  return ((data ?? []) as Parameters<typeof toQuestion>[0][]).map(toQuestion);
}

export async function addQuestions(communityId: string, createdBy: string, origin: ChannelQuestion["origin"], items: QuestionInput[]): Promise<{ added: ChannelQuestion[]; skipped: number }> {
  const admin = createServiceClient();
  const { count, error: countErr } = await admin.from("break_channel_questions").select("id", { count: "exact", head: true }).eq("community_id", communityId).neq("status", "retired");
  if (notReady(countErr)) throw new ChannelQuestionsNotReady();
  const room = Math.max(0, MAX_PER_CHANNEL - (count ?? 0));
  const clean = items.map(cleanQuestion).filter((r): r is Extract<CleanResult, { ok: true }> => r.ok).map((r) => r.value).slice(0, room);
  if (!clean.length) return { added: [], skipped: items.length };
  const status = origin === "ai" ? "draft" : "approved";
  const { data, error } = await admin.from("break_channel_questions")
    .insert(clean.map((q) => ({ community_id: communityId, prompt: q.prompt, answer: q.answer, accept: q.accept, status, origin, created_by: createdBy })))
    .select(COLS);
  if (notReady(error)) throw new ChannelQuestionsNotReady();
  if (error) throw new Error(error.message);
  return { added: ((data ?? []) as Parameters<typeof toQuestion>[0][]).map(toQuestion), skipped: items.length - clean.length };
}

export async function updateQuestion(communityId: string, id: string, patch: Partial<QuestionInput> & { status?: ChannelQuestion["status"] }): Promise<ChannelQuestion | { error: QuestionError } | null> {
  const admin = createServiceClient();
  const { data: cur } = await admin.from("break_channel_questions").select(COLS).eq("id", id).eq("community_id", communityId).maybeSingle();
  if (!cur) return null;
  const q = toQuestion(cur as Parameters<typeof toQuestion>[0]);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.prompt !== undefined || patch.answer !== undefined || patch.accept !== undefined) {
    const clean = cleanQuestion({ prompt: patch.prompt ?? q.prompt, answer: patch.answer ?? q.answer, accept: patch.accept ?? q.accept });
    if (!clean.ok) return { error: clean.error };
    Object.assign(row, clean.value);
  }
  if (patch.status && ["draft", "approved", "retired"].includes(patch.status)) row.status = patch.status;
  const { data } = await admin.from("break_channel_questions").update(row).eq("id", id).eq("community_id", communityId).select(COLS).maybeSingle();
  return data ? toQuestion(data as Parameters<typeof toQuestion>[0]) : null;
}

export async function deleteQuestion(communityId: string, id: string): Promise<boolean> {
  const { data } = await createServiceClient().from("break_channel_questions").delete().eq("id", id).eq("community_id", communityId).select("id");
  return !!data?.length;
}

// ─── AI drafts from the questionnaire ────────────────────────────────────────

export interface Questionnaire {
  games: string;
  main: string;
  facts: string;
  jokes: string;
  community: string;
}

const SYSTEM = `You write quiz questions about one Twitch streamer's channel, for a game their chat plays during a break ("Know the Channel"). You only use facts the streamer wrote in the questionnaire: never invent facts, guess, or use outside knowledge about real people. Each question has one short answer that chat can type (1 to 4 words), plus other ways of writing that answer (nicknames, spellings, short forms). Questions are fun, kind and stream-safe: nothing personal or private (no addresses, family details, health, money, schedules beyond what they wrote), nothing mean, nothing sexual. Use plain words. Don't use em dashes or en dashes. Write the questions in the second person about the streamer by name, e.g. "What does Nova call her chat?".`;

const schema = z.object({
  questions: z.array(z.object({
    prompt: z.string(),
    answer: z.string(),
    accept: z.array(z.string()),
  })),
});

export async function draftChannelQuestions(streamer: string, q: Questionnaire, avoid: string[]): Promise<AiResult<QuestionInput[]>> {
  const facts = [
    q.games && `Games I play most: ${q.games}`,
    q.main && `My favorite character or main: ${q.main}`,
    q.facts && `Channel facts viewers should know:\n${q.facts}`,
    q.jokes && `Running jokes and catchphrases:\n${q.jokes}`,
    q.community && `My community's name, emotes or traditions:\n${q.community}`,
  ].filter(Boolean).join("\n\n");
  const res = await draftStructured({
    system: SYSTEM,
    schema,
    effort: "low",
    maxTokens: 4000,
    prompt: `The streamer is ${streamer}. Write 15 questions from this questionnaire, spread across everything they wrote. Skip anything you can't turn into a fair question with a clear answer.${avoid.length ? `\n\nThey already have these questions, so don't repeat them:\n${avoid.map((a) => `- ${a}`).join("\n")}` : ""}\n\nQuestionnaire:\n${facts}`,
  });
  if (!res.ok) return res;
  const cleaned = res.data.questions.map((x) => cleanQuestion(x)).filter((r): r is Extract<CleanResult, { ok: true }> => r.ok).map((r) => r.value);
  return { ok: true, data: cleaned.slice(0, 15) };
}
