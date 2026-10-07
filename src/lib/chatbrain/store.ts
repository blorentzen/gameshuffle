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
import { FOUNDING_CUTOFF, LAUNCH_BOARDS, MAX_ANSWER_LENGTH, normalize } from "./rules";
import { EMPTY_AUDIENCE, cleanAudience, type Audience } from "./audience";

export class ChatBrainNotReady extends Error {}
function notReady(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
}

export type PromptStatus = "draft" | "collecting" | "review" | "published" | "retired";
export type PromptOrigin = "ai" | "staff" | "suggestion" | "community";

export interface BrainCategory { slug: string; name: string; description: string | null; familySafe: boolean; openPrompts: number }

export interface BrainPrompt {
  id: string;
  /** Which run of the question this is (a published question can be surveyed again). */
  edition: number;
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
  origin: PromptOrigin; opens_at: string | null; closes_at: string | null; published_at: string | null; created_at: string; edition: number;
};
const PROMPT_COLS = "id, text, category, family_safe, status, min_answers, origin, opens_at, closes_at, published_at, created_at, edition";

type PromptRef = { id: string; edition: number };

/** Answer counts per prompt, for each prompt's current edition. Fine at launch volumes; becomes a view or RPC once answers grow. */
async function answerCounts(prompts: PromptRef[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!prompts.length) return out;
  const edition = new Map(prompts.map((p) => [p.id, p.edition ?? 1]));
  const { data } = await createServiceClient().from("brain_answers").select("prompt_id, edition").in("prompt_id", [...edition.keys()]).eq("hidden", false).limit(50_000);
  for (const r of (data ?? []) as { prompt_id: string; edition: number }[]) {
    if (r.edition === edition.get(r.prompt_id)) out.set(r.prompt_id, (out.get(r.prompt_id) ?? 0) + 1);
  }
  return out;
}

function toPrompt(r: PromptRow, answers: number): BrainPrompt {
  return {
    id: r.id, text: r.text, category: r.category, familySafe: r.family_safe, status: r.status, minAnswers: r.min_answers,
    origin: r.origin, opensAt: r.opens_at, closesAt: r.closes_at, publishedAt: r.published_at, createdAt: r.created_at, answers,
    edition: r.edition ?? 1,
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

/**
 * Every key one person's answers can be filed under: their account and each
 * chat identity linked to it (Discord, Twitch, the account wallet). The Weekly
 * saves to the account while Discord and the Activity save to the Discord
 * identity, and the Weekly's question is also an open Chat Brain question, so
 * "has this person answered?" has to look under all of them: one answer per
 * person, wherever they gave it. An anonymous browser is only itself.
 */
export interface PersonKeys { userId: string | null; identityIds: string[]; anonKeys: string[] }

export async function personKeys(who: AnswerIdentity): Promise<PersonKeys> {
  if ("anonId" in who) return { userId: null, identityIds: [], anonKeys: [anonKey(who.anonId)] };
  const svc = createServiceClient();
  const identityIds = new Set<string>();
  let userId: string | null = "userId" in who ? who.userId : null;
  if ("identityId" in who) {
    identityIds.add(who.identityId);
    const { data } = await svc.from("gs_identities").select("platform, platform_id, gs_account_id").eq("id", who.identityId).maybeSingle();
    const ident = data as { platform: string; platform_id: string; gs_account_id: string | null } | null;
    userId = ident?.gs_account_id ?? null;
    // An identity seen before its account linked Discord or Twitch may not carry the link yet.
    if (!userId && ident && (ident.platform === "discord" || ident.platform === "twitch")) {
      const { data: u } = await svc.from("users").select("id").eq(ident.platform === "discord" ? "discord_id" : "twitch_id", ident.platform_id).maybeSingle();
      userId = (u as { id: string } | null)?.id ?? null;
    }
  }
  if (userId) {
    const { data } = await svc.from("gs_identities").select("id").eq("gs_account_id", userId).limit(20);
    for (const r of (data ?? []) as { id: string }[]) identityIds.add(r.id);
  }
  return { userId, identityIds: [...identityIds], anonKeys: [] };
}

/** A PostgREST `or` filter matching any of a person's keys (ids are uuids or hex, so safe to inline). */
function keysFilter(k: PersonKeys): string | null {
  const parts = [
    ...(k.userId ? [`user_id.eq.${k.userId}`] : []),
    ...(k.identityIds.length ? [`identity_id.in.(${k.identityIds.join(",")})`] : []),
    ...(k.anonKeys.length ? [`anon_key.in.(${k.anonKeys.join(",")})`] : []),
  ];
  return parts.length ? parts.join(",") : null;
}

/** This person's answer to one prompt's current edition, under any of their keys. */
export async function personAnswer(promptId: string, who: AnswerIdentity | PersonKeys): Promise<{ id: string; raw: string; source: string } | null> {
  const keys = "anonKeys" in who ? who : await personKeys(who);
  const filter = keysFilter(keys);
  if (!filter) return null;
  const svc = createServiceClient();
  const { data: p } = await svc.from("brain_prompts").select("edition").eq("id", promptId).maybeSingle();
  const edition = (p as { edition: number } | null)?.edition ?? 1;
  const { data } = await svc.from("brain_answers").select("id, raw, source").eq("prompt_id", promptId).eq("edition", edition).or(filter).limit(1).maybeSingle();
  return (data as { id: string; raw: string; source: string } | null) ?? null;
}

/** Prompts this person already answered, under any of their keys (so the page shows them something new). */
async function answeredBy(who: AnswerIdentity | null, prompts: PromptRef[]): Promise<Set<string>> {
  if (!who || !prompts.length) return new Set();
  const filter = keysFilter(await personKeys(who));
  if (!filter) return new Set();
  const edition = new Map(prompts.map((p) => [p.id, p.edition ?? 1]));
  const { data } = await createServiceClient().from("brain_answers").select("prompt_id, edition").or(filter).in("prompt_id", [...edition.keys()]);
  return new Set(((data ?? []) as { prompt_id: string; edition: number }[]).filter((r) => r.edition === edition.get(r.prompt_id)).map((r) => r.prompt_id));
}

/** Open public prompts, optionally in one category, unanswered by this person first. */
export async function listOpenPrompts(opts: { category?: string | null; who?: AnswerIdentity | null; limit?: number } = {}): Promise<(BrainPrompt & { answered: boolean })[]> {
  const svc = createServiceClient();
  let q = svc.from("brain_prompts").select(PROMPT_COLS).eq("status", "collecting").is("community_id", null).order("opens_at", { ascending: false, nullsFirst: false }).limit(200);
  if (opts.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (notReady(error)) throw new ChatBrainNotReady();
  const rows = ((data ?? []) as PromptRow[]).filter((r) => isOpen({ status: r.status, opensAt: r.opens_at, closesAt: r.closes_at }));
  const [counts, mine] = await Promise.all([answerCounts(rows), answeredBy(opts.who ?? null, rows)]);
  return rows
    .map((r) => ({ ...toPrompt(r, counts.get(r.id) ?? 0), answered: mine.has(r.id) }))
    .sort((a, b) => Number(a.answered) - Number(b.answered) || (a.minAnswers - a.answers) - (b.minAnswers - b.answers))
    .slice(0, opts.limit ?? 50);
}

export type AnswerError = "not_found" | "closed" | "empty" | "too_long" | "blocked" | "already_answered" | "failed";

/** One answer from any surface. The raw text is kept for review; only grouped answers are ever shown. */
export async function submitAnswer(input: { promptId: string; raw: string; who: AnswerIdentity; source?: string; audience?: Audience | null }): Promise<{ ok: true; same: number } | { ok: false; error: AnswerError }> {
  const raw = input.raw.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "empty" };
  if (raw.length > MAX_ANSWER_LENGTH) return { ok: false, error: "too_long" };
  if (isBlockedText(raw)) return { ok: false, error: "blocked" };
  const normalized = normalize(raw);
  if (!normalized) return { ok: false, error: "empty" };
  const svc = createServiceClient();
  const { data: p, error: pErr } = await svc.from("brain_prompts").select("status, opens_at, closes_at, edition").eq("id", input.promptId).maybeSingle();
  if (notReady(pErr)) throw new ChatBrainNotReady();
  if (!p) return { ok: false, error: "not_found" };
  const row = p as { status: PromptStatus; opens_at: string | null; closes_at: string | null; edition: number };
  if (!isOpen({ status: row.status, opensAt: row.opens_at, closesAt: row.closes_at })) return { ok: false, error: "closed" };
  const source = /^[a-z]+(:[a-z]+)?$/.test(input.source ?? "") && (input.source ?? "").length <= 30 ? input.source! : "site";
  // The audience snapshot: what this person shared, as of now. Accounts use
  // their saved choices; signed-out answers send theirs with the answer.
  const audience = input.audience ?? ("userId" in input.who ? await getAudience(input.who.userId) : null) ?? EMPTY_AUDIENCE;
  const edition = row.edition ?? 1;
  // One answer per person: an answer under any of their keys (the Weekly on
  // their account, Discord on their Discord identity) already counts.
  if (await personAnswer(input.promptId, input.who)) return { ok: false, error: "already_answered" };
  const { error } = await svc.from("brain_answers").insert({
    prompt_id: input.promptId, raw, normalized, source, edition, ...identityColumns(input.who),
    age_band: audience.ageBand, gender: audience.gender, country: audience.country,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "already_answered" : "failed" };
  return { ok: true, same: await othersSaid(input.promptId, edition, normalized, 1) };
}

/** How many other people gave this (normalized) answer so far, this edition. `mine` = how many of the matches are this person's. */
async function othersSaid(promptId: string, edition: number, normalized: string, mine: number): Promise<number> {
  const { count } = await createServiceClient().from("brain_answers").select("id", { count: "exact", head: true })
    .eq("prompt_id", promptId).eq("edition", edition).eq("normalized", normalized).eq("hidden", false);
  return Math.max(0, (count ?? mine) - mine);
}

// ─── audiences ───────────────────────────────────────────────────────────────

/** An account's saved audience choices, or null if they haven't been asked yet. */
export async function getAudience(userId: string): Promise<(Audience & { asked: true }) | null> {
  const { data, error } = await createServiceClient().from("brain_audience").select("age_band, gender, country").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const r = data as { age_band: string | null; gender: string | null; country: string | null };
  return { ...cleanAudience({ ageBand: r.age_band, gender: r.gender, country: r.country }), asked: true };
}

/** Save an account's audience choices (any field may be "prefer not to say"). */
export async function saveAudience(userId: string, a: Audience, countrySource: "auto" | "chosen"): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await createServiceClient().from("brain_audience").upsert({
    user_id: userId, age_band: a.ageBand, gender: a.gender, country: a.country, country_source: countrySource, asked_at: now, updated_at: now,
  }, { onConflict: "user_id" });
  return !error;
}

// ─── admin (staff) ───────────────────────────────────────────────────────────

export async function adminListPrompts(status?: PromptStatus | null): Promise<BrainPrompt[]> {
  let q = createServiceClient().from("brain_prompts").select(PROMPT_COLS).is("community_id", null).order("created_at", { ascending: false }).limit(300);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (notReady(error)) throw new ChatBrainNotReady();
  const rows = (data ?? []) as PromptRow[];
  const counts = await answerCounts(rows);
  return rows.map((r) => toPrompt(r, counts.get(r.id) ?? 0));
}

/**
 * Survey a published question again: a new edition opens for answers, so the
 * crowd can be asked a second time later ("then vs now"). Earlier editions'
 * answers and boards stay as they were.
 */
export async function adminNewEdition(id: string): Promise<{ ok: true; edition: number } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data } = await svc.from("brain_prompts").select("status, edition").eq("id", id).maybeSingle();
  const r = data as { status: PromptStatus; edition: number } | null;
  if (!r) return { ok: false, error: "not_found" };
  if (r.status !== "published") return { ok: false, error: "not_published" };
  const now = new Date().toISOString();
  const edition = (r.edition ?? 1) + 1;
  const { error } = await svc.from("brain_prompts").update({ edition, edition_opened_at: now, opens_at: now, closes_at: null, status: "collecting", updated_at: now })
    .eq("id", id).eq("status", "published");
  return error ? { ok: false, error: "failed" } : { ok: true, edition };
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
/**
 * Saves or changes an account's answer (the Weekly). If they already answered
 * under any of their keys, that one answer changes, wherever it was given, so
 * nobody counts twice on the board.
 */
export async function upsertUserAnswer(input: { promptId: string; userId: string; raw: string; source: string }): Promise<{ ok: true } | { ok: false; error: AnswerError }> {
  const first = await submitAnswer({ promptId: input.promptId, raw: input.raw, who: { userId: input.userId }, source: input.source });
  if (first.ok || first.error !== "already_answered") return first;
  const raw = input.raw.trim().replace(/\s+/g, " ");
  const prior = await personAnswer(input.promptId, { userId: input.userId });
  if (!prior) return { ok: false, error: "failed" };
  const { error } = await createServiceClient().from("brain_answers")
    .update({ raw, normalized: normalize(raw), group_id: null })
    .eq("id", prior.id);
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
  const { data } = await createServiceClient().from("brain_prompts").select("edition").eq("id", promptId).maybeSingle();
  const edition = (data as { edition: number } | null)?.edition ?? 1;
  return (await answeredBy(who, [{ id: promptId, edition }])).has(promptId);
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
  const counts = await answerCounts(rows);
  const skip = new Set(opts.exclude ?? []);
  const fresh = rows.filter((r) => !skip.has(r.id));
  const pool = fresh.length ? fresh : rows;
  const need = (r: PromptRow) => (counts.get(r.id) ?? 0) / Math.max(1, r.min_answers);
  const best = pool.sort((a, b) => need(a) - need(b) || a.created_at.localeCompare(b.created_at))[0];
  return toPrompt(best, counts.get(best.id) ?? 0);
}

// ─── seeding progress + Founding Brain ──────────────────────────────────────

export interface BrainProgress { answers: number; boards: number; goal: number }
let progressCache: { at: number; value: BrainProgress } | null = null;

/** Answers given and boards published on public questions, toward the launch goal. Cached a minute per instance. */
export async function brainProgress(): Promise<BrainProgress> {
  if (progressCache && Date.now() - progressCache.at < 60_000) return progressCache.value;
  const svc = createServiceClient();
  const [answers, boards] = await Promise.all([
    svc.from("brain_answers").select("id, brain_prompts!inner(community_id)", { count: "exact", head: true }).eq("hidden", false).is("brain_prompts.community_id", null),
    // One per question: its first everyone board (audience boards and later editions don't add to launch).
    svc.from("brain_boards").select("prompt_id, brain_prompts!inner(community_id)", { count: "exact", head: true }).eq("segment", "all").eq("edition", 1).is("brain_prompts.community_id", null),
  ]);
  if (notReady(answers.error)) throw new ChatBrainNotReady();
  const value = { answers: answers.count ?? 0, boards: boards.count ?? 0, goal: LAUNCH_BOARDS };
  progressCache = { at: Date.now(), value };
  return value;
}

/** Answers an account has given (signed in, or from a chat identity linked to it), counted for Founding Brain. */
export async function brainAnswerCount(userId: string, identityIds: string[]): Promise<number> {
  const svc = createServiceClient();
  const count = async (col: "user_id" | "identity_id", ids: string[]) => {
    if (!ids.length) return { count: 0, error: null };
    let q = svc.from("brain_answers").select("id", { count: "exact", head: true }).in(col, ids);
    if (FOUNDING_CUTOFF) q = q.lt("created_at", FOUNDING_CUTOFF);
    return q;
  };
  const [own, chat] = await Promise.all([count("user_id", [userId]), count("identity_id", identityIds)]);
  if (notReady(own.error)) return 0;
  return (own.count ?? 0) + (chat.count ?? 0);
}
