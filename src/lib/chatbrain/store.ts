import "server-only";

/**
 * Chat Brain store (service role). Spec: specs/gs-originals-chat-brain.md,
 * schema: supabase/chat-brain-m1.sql. Phase 1 bones: categories, open prompts,
 * answering from any surface (with its source), and the admin prompt list.
 * Grouping, boards and Daily come next.
 */

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { MAX_ANSWER_LENGTH, normalize } from "./rules";

export class ChatBrainNotReady extends Error {}
function notReady(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
}

export type PromptStatus = "draft" | "collecting" | "review" | "published" | "retired";
export type PromptOrigin = "ai" | "staff" | "suggestion" | "community";

export interface BrainCategory { slug: string; name: string; description: string | null; familySafe: boolean; openPrompts: number }

export interface BrainPrompt {
  id: string;
  text: string;
  category: string;
  familySafe: boolean;
  status: PromptStatus;
  minAnswers: number;
  origin: PromptOrigin;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  /** Answers so far (admin and the "needs N more" line). */
  answers: number;
}

type PromptRow = {
  id: string; text: string; category: string; family_safe: boolean; status: PromptStatus; min_answers: number;
  origin: PromptOrigin; opens_at: string | null; closes_at: string | null; published_at: string | null; created_at: string;
};
const PROMPT_COLS = "id, text, category, family_safe, status, min_answers, origin, opens_at, closes_at, published_at, created_at";

/** Answer counts per prompt. Fine at launch volumes; becomes a view or RPC once answers grow. */
async function answerCounts(promptIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!promptIds.length) return out;
  const { data } = await createServiceClient().from("brain_answers").select("prompt_id").in("prompt_id", promptIds).eq("hidden", false).limit(50_000);
  for (const r of (data ?? []) as { prompt_id: string }[]) out.set(r.prompt_id, (out.get(r.prompt_id) ?? 0) + 1);
  return out;
}

function toPrompt(r: PromptRow, answers: number): BrainPrompt {
  return {
    id: r.id, text: r.text, category: r.category, familySafe: r.family_safe, status: r.status, minAnswers: r.min_answers,
    origin: r.origin, opensAt: r.opens_at, closesAt: r.closes_at, publishedAt: r.published_at, createdAt: r.created_at, answers,
  };
}

/** Open for answers right now: collecting, public, inside its dates. */
function isOpen(p: Pick<BrainPrompt, "status" | "opensAt" | "closesAt">, now = Date.now()): boolean {
  return p.status === "collecting"
    && (!p.opensAt || Date.parse(p.opensAt) <= now)
    && (!p.closesAt || Date.parse(p.closesAt) > now);
}

export async function listCategories(): Promise<BrainCategory[]> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("brain_categories").select("slug, name, description, family_safe").order("sort");
  if (notReady(error)) throw new ChatBrainNotReady();
  const { data: prompts } = await svc.from("brain_prompts").select("category, status, opens_at, closes_at").eq("status", "collecting").is("community_id", null);
  const open = new Map<string, number>();
  for (const p of (prompts ?? []) as { category: string; status: PromptStatus; opens_at: string | null; closes_at: string | null }[]) {
    if (isOpen({ status: p.status, opensAt: p.opens_at, closesAt: p.closes_at })) open.set(p.category, (open.get(p.category) ?? 0) + 1);
  }
  return ((data ?? []) as { slug: string; name: string; description: string | null; family_safe: boolean }[])
    .map((c) => ({ slug: c.slug, name: c.name, description: c.description, familySafe: c.family_safe, openPrompts: open.get(c.slug) ?? 0 }));
}

/** Identity for one-answer-per-person. Anonymous browser ids are hashed with a server secret, never stored raw. */
export type AnswerIdentity = { userId: string } | { anonId: string } | { identityId: string };

function anonKey(anonId: string): string {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "chat-brain";
  return createHash("sha256").update(`brain:${secret}:${anonId}`).digest("hex").slice(0, 48);
}

function identityColumns(who: AnswerIdentity): Record<string, string> {
  if ("userId" in who) return { user_id: who.userId };
  if ("identityId" in who) return { identity_id: who.identityId };
  return { anon_key: anonKey(who.anonId) };
}

/** Prompts this person already answered (so the page shows them something new). */
async function answeredBy(who: AnswerIdentity | null, promptIds: string[]): Promise<Set<string>> {
  if (!who || !promptIds.length) return new Set();
  const [col, val] = Object.entries(identityColumns(who))[0];
  const { data } = await createServiceClient().from("brain_answers").select("prompt_id").eq(col, val).in("prompt_id", promptIds);
  return new Set(((data ?? []) as { prompt_id: string }[]).map((r) => r.prompt_id));
}

/** Open public prompts, optionally in one category, unanswered by this person first. */
export async function listOpenPrompts(opts: { category?: string | null; who?: AnswerIdentity | null; limit?: number } = {}): Promise<(BrainPrompt & { answered: boolean })[]> {
  const svc = createServiceClient();
  let q = svc.from("brain_prompts").select(PROMPT_COLS).eq("status", "collecting").is("community_id", null).order("opens_at", { ascending: false, nullsFirst: false }).limit(200);
  if (opts.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (notReady(error)) throw new ChatBrainNotReady();
  const rows = ((data ?? []) as PromptRow[]).filter((r) => isOpen({ status: r.status, opensAt: r.opens_at, closesAt: r.closes_at }));
  const ids = rows.map((r) => r.id);
  const [counts, mine] = await Promise.all([answerCounts(ids), answeredBy(opts.who ?? null, ids)]);
  return rows
    .map((r) => ({ ...toPrompt(r, counts.get(r.id) ?? 0), answered: mine.has(r.id) }))
    .sort((a, b) => Number(a.answered) - Number(b.answered) || (a.minAnswers - a.answers) - (b.minAnswers - b.answers))
    .slice(0, opts.limit ?? 50);
}

export type AnswerError = "not_found" | "closed" | "empty" | "too_long" | "blocked" | "already_answered" | "failed";

/** One answer from any surface. The raw text is kept for review; only grouped answers are ever shown. */
export async function submitAnswer(input: { promptId: string; raw: string; who: AnswerIdentity; source?: string }): Promise<{ ok: true } | { ok: false; error: AnswerError }> {
  const raw = input.raw.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "empty" };
  if (raw.length > MAX_ANSWER_LENGTH) return { ok: false, error: "too_long" };
  if (isBlockedText(raw)) return { ok: false, error: "blocked" };
  const normalized = normalize(raw);
  if (!normalized) return { ok: false, error: "empty" };
  const svc = createServiceClient();
  const { data: p, error: pErr } = await svc.from("brain_prompts").select("status, opens_at, closes_at").eq("id", input.promptId).maybeSingle();
  if (notReady(pErr)) throw new ChatBrainNotReady();
  if (!p) return { ok: false, error: "not_found" };
  const row = p as { status: PromptStatus; opens_at: string | null; closes_at: string | null };
  if (!isOpen({ status: row.status, opensAt: row.opens_at, closesAt: row.closes_at })) return { ok: false, error: "closed" };
  const source = /^[a-z]+(:[a-z]+)?$/.test(input.source ?? "") && (input.source ?? "").length <= 30 ? input.source! : "site";
  const { error } = await svc.from("brain_answers").insert({ prompt_id: input.promptId, raw, normalized, source, ...identityColumns(input.who) });
  if (error) return { ok: false, error: error.code === "23505" ? "already_answered" : "failed" };
  return { ok: true };
}

// ─── admin (staff) ───────────────────────────────────────────────────────────

export async function adminListPrompts(status?: PromptStatus | null): Promise<BrainPrompt[]> {
  let q = createServiceClient().from("brain_prompts").select(PROMPT_COLS).is("community_id", null).order("created_at", { ascending: false }).limit(300);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (notReady(error)) throw new ChatBrainNotReady();
  const rows = (data ?? []) as PromptRow[];
  const counts = await answerCounts(rows.map((r) => r.id));
  return rows.map((r) => toPrompt(r, counts.get(r.id) ?? 0));
}

export async function adminCreatePrompt(input: { text: string; category: string; familySafe?: boolean; origin?: PromptOrigin; opensAt?: string | null; closesAt?: string | null; createdBy: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (text.length < 8 || text.length > 140) return { ok: false, error: "bad_length" };
  if (isBlockedText(text)) return { ok: false, error: "blocked" };
  const { data, error } = await createServiceClient().from("brain_prompts").insert({
    text, category: input.category, family_safe: input.familySafe ?? true, origin: input.origin ?? "staff",
    opens_at: input.opensAt ?? null, closes_at: input.closesAt ?? null, created_by: input.createdBy,
  }).select("id").single();
  if (notReady(error)) throw new ChatBrainNotReady();
  if (error || !data) return { ok: false, error: error?.code === "23503" ? "unknown_category" : "failed" };
  return { ok: true, id: (data as { id: string }).id };
}

/** Move a prompt along. Opening it for answers stamps opens_at if it has none. */
export async function adminSetStatus(id: string, status: PromptStatus): Promise<boolean> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "collecting") {
    const { data } = await createServiceClient().from("brain_prompts").select("opens_at").eq("id", id).maybeSingle();
    if (!(data as { opens_at: string | null } | null)?.opens_at) patch.opens_at = new Date().toISOString();
  }
  const { error } = await createServiceClient().from("brain_prompts").update(patch).eq("id", id);
  return !error;
}

/**
 * A signed-in player's answer that they may change while the prompt is open
 * (the Weekly survey): insert, or update their existing answer in place.
 */
export async function upsertUserAnswer(input: { promptId: string; userId: string; raw: string; source: string }): Promise<{ ok: true } | { ok: false; error: AnswerError }> {
  const first = await submitAnswer({ promptId: input.promptId, raw: input.raw, who: { userId: input.userId }, source: input.source });
  if (first.ok || first.error !== "already_answered") return first;
  const raw = input.raw.trim().replace(/\s+/g, " ");
  const { error } = await createServiceClient().from("brain_answers")
    .update({ raw, normalized: normalize(raw), group_id: null })
    .eq("prompt_id", input.promptId).eq("user_id", input.userId);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** Staff edit a question's wording, category or family-safe flag (drafts and collecting prompts). */
export async function adminEditPrompt(id: string, patch: { text?: string; category?: string; familySafe?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.text !== undefined) {
    const text = patch.text.trim().replace(/\s+/g, " ");
    if (text.length < 8 || text.length > 140) return { ok: false, error: "bad_length" };
    if (isBlockedText(text)) return { ok: false, error: "blocked" };
    update.text = text;
  }
  if (patch.category) update.category = patch.category;
  if (typeof patch.familySafe === "boolean") update.family_safe = patch.familySafe;
  const { error } = await createServiceClient().from("brain_prompts").update(update).eq("id", id).in("status", ["draft", "collecting"]);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** One public question for its share page and image (null if missing, private, or retired). */
export async function getPublicPrompt(id: string): Promise<{ id: string; text: string; category: string; status: PromptStatus; open: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await createServiceClient().from("brain_prompts").select("id, text, category, status, opens_at, closes_at, community_id").eq("id", id).maybeSingle();
  if (notReady(error) || !data) return null;
  const r = data as { id: string; text: string; category: string; status: PromptStatus; opens_at: string | null; closes_at: string | null; community_id: string | null };
  if (r.community_id || r.status === "retired" || r.status === "draft") return null;
  return { id: r.id, text: r.text, category: r.category, status: r.status, open: isOpen({ status: r.status, opensAt: r.opens_at, closesAt: r.closes_at }) };
}

/** Has this person answered this prompt? (The Discord button checks before opening its form.) */
export async function hasAnswered(promptId: string, who: AnswerIdentity): Promise<boolean> {
  return (await answeredBy(who, [promptId])).has(promptId);
}

/**
 * The open public prompt that most needs answers, for pushes like the daily
 * Discord post: family-safe, furthest from its answer target, skipping `exclude`
 * (recently pushed) unless nothing else is open. Optional category filter.
 */
export async function promptNeedingAnswers(opts: { category?: string | null; exclude?: string[] } = {}): Promise<BrainPrompt | null> {
  let q = createServiceClient().from("brain_prompts").select(PROMPT_COLS).eq("status", "collecting").eq("family_safe", true).is("community_id", null).limit(200);
  if (opts.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (notReady(error)) throw new ChatBrainNotReady();
  const rows = ((data ?? []) as PromptRow[]).filter((r) => isOpen({ status: r.status, opensAt: r.opens_at, closesAt: r.closes_at }));
  if (!rows.length) return null;
  const counts = await answerCounts(rows.map((r) => r.id));
  const skip = new Set(opts.exclude ?? []);
  const fresh = rows.filter((r) => !skip.has(r.id));
  const pool = fresh.length ? fresh : rows;
  const need = (r: PromptRow) => (counts.get(r.id) ?? 0) / Math.max(1, r.min_answers);
  const best = pool.sort((a, b) => need(a) - need(b) || a.created_at.localeCompare(b.created_at))[0];
  return toPrompt(best, counts.get(best.id) ?? 0);
}
