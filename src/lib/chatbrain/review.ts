import "server-only";

/**
 * Chat Brain review and publish (service role, staff only).
 *
 *   reviewData   a prompt's answers, grouped by spelling (autoGroup), plus the
 *                spelling-merge suggestions
 *   aiGroups     Claude proposes meaning merges and labels ("chips" + "crisps").
 *                A suggestion only: staff apply, edit or ignore it
 *   publish      staff's final groups → brain_groups, answers' group_id, a
 *                frozen everyone board in brain_boards, plus a board for each
 *                audience with enough answers (age, gender, country; the same
 *                reviewed groups, recounted), prompt status 'published'
 *
 * Everything works on the question's current edition: a question surveyed
 * again starts a fresh set of answers and boards, and earlier ones are kept.
 *
 * Groups travel between the admin page and the server as lists of normalized
 * answer keys, never answer ids, so a prompt with thousands of answers stays a
 * small payload. Counts are always recomputed here from the answers.
 */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { draftStructured } from "@/lib/ai/claude";
import { autoGroup, buildBoard, type BoardAnswer } from "./rules";
import { AUDIENCE_MIN, segmentsFor, type AgeBand, type Gender } from "./audience";

export interface ReviewGroup { key: string; label: string; count: number; keys: string[]; samples: string[] }
export interface ReviewData {
  prompt: { id: string; text: string; status: string; minAnswers: number; familySafe: boolean };
  total: number;
  groups: ReviewGroup[];
  suggestions: { into: string; from: string }[];
  published: { answers: BoardAnswer[]; publishedAt: string } | null;
}

type AnswerRow = { id: string; raw: string; normalized: string; age_band: AgeBand | null; gender: Gender | null; country: string | null; created_at: string };

async function editionOf(promptId: string): Promise<number> {
  const { data } = await createServiceClient().from("brain_prompts").select("edition").eq("id", promptId).maybeSingle();
  return (data as { edition: number } | null)?.edition ?? 1;
}

/** This edition's visible answers. */
async function answersFor(promptId: string, edition?: number): Promise<AnswerRow[]> {
  const ed = edition ?? (await editionOf(promptId));
  const { data } = await createServiceClient().from("brain_answers").select("id, raw, normalized, age_band, gender, country, created_at")
    .eq("prompt_id", promptId).eq("edition", ed).eq("hidden", false).limit(50_000);
  return (data ?? []) as AnswerRow[];
}

export async function reviewData(promptId: string): Promise<ReviewData | null> {
  const svc = createServiceClient();
  const { data: p } = await svc.from("brain_prompts").select("id, text, status, min_answers, family_safe").eq("id", promptId).maybeSingle();
  if (!p) return null;
  const prompt = p as { id: string; text: string; status: string; min_answers: number; family_safe: boolean };
  const answers = await answersFor(promptId);
  const { groups, suggestions } = autoGroup(answers);
  const rawBy = new Map<string, string[]>();
  for (const a of answers) { const l = rawBy.get(a.normalized) ?? []; if (l.length < 4 && !l.includes(a.raw)) l.push(a.raw); rawBy.set(a.normalized, l); }
  const { data: board } = await svc.from("brain_boards").select("answers, published_at").eq("prompt_id", promptId).eq("segment", "all")
    .eq("edition", await editionOf(promptId)).maybeSingle();
  return {
    prompt: { id: prompt.id, text: prompt.text, status: prompt.status, minAnswers: prompt.min_answers, familySafe: prompt.family_safe },
    total: answers.length,
    groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.count, keys: [g.key], samples: rawBy.get(g.key) ?? [] })),
    suggestions: suggestions.map(({ into, from }) => ({ into, from })),
    published: board ? { answers: (board as { answers: BoardAnswer[] }).answers, publishedAt: (board as { published_at: string }).published_at } : null,
  };
}

const AiGrouping = z.object({
  groups: z.array(z.object({
    label: z.string().describe("Short display label for the group, 1 to 4 words, Title case first word"),
    keys: z.array(z.string()).describe("The answer keys that belong together, copied exactly from the input"),
  })),
});

/**
 * Claude proposes how answers group by meaning. Input: each distinct answer key
 * with its count and a few raw spellings. Output is validated: every key must
 * exist, none may appear twice, and anything left out stays its own group.
 */
export async function aiGroups(promptId: string): Promise<{ ok: true; groups: { label: string; keys: string[] }[] } | { ok: false; error: string }> {
  const { data: p } = await createServiceClient().from("brain_prompts").select("text").eq("id", promptId).maybeSingle();
  if (!p) return { ok: false, error: "not_found" };
  const answers = await answersFor(promptId);
  const { groups } = autoGroup(answers);
  if (groups.length < 2) return { ok: false, error: "too_few" };
  // The long tail (one-off answers past the first 300 keys) can't reach a board anyway.
  const input = groups.slice(0, 300).map((g) => ({ key: g.key, count: g.count, examples: answers.filter((a) => a.normalized === g.key).slice(0, 3).map((a) => a.raw) }));
  const r = await draftStructured({
    system: `You group survey answers for a party game where people guess the most popular answers to a question.
Merge answers that mean the same thing for this question: synonyms, brand vs generic, singular vs plural, obvious misspellings. Like the TV survey games, when a broad answer is common (for example "snacks") and other answers are just examples of it ("chips", "pretzels"), merge the examples into the broad answer, unless an example is popular enough to stand on its own (about 10% of all answers or more). Do not merge answers that are only loosely related. Give each group a short, friendly label as a player would say it.
Copy keys exactly as given. Every input key appears in exactly one group; a key with nothing to merge is a group of one.`,
    prompt: `Question: ${(p as { text: string }).text}\n\nAnswers (key, how many people gave it, example spellings):\n${JSON.stringify(input)}`,
    schema: AiGrouping,
    effort: "medium",
    maxTokens: 16000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const valid = new Set(input.map((i) => i.key));
  const seen = new Set<string>();
  const out: { label: string; keys: string[] }[] = [];
  for (const g of r.data.groups) {
    const keys = g.keys.filter((k) => valid.has(k) && !seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (keys.length) out.push({ label: g.label.trim().slice(0, 60) || keys[0], keys });
  }
  for (const k of valid) if (!seen.has(k)) out.push({ label: k, keys: [k] });
  return { ok: true, groups: out };
}

export interface PublishGroup { label: string; keys: string[]; hidden?: boolean }

/** Staff's final grouping → groups, answer links, a frozen board, and status 'published'. */
export async function publish(promptId: string, groups: PublishGroup[], publishedBy: string | null): Promise<{ ok: true; board: BoardAnswer[] } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: p } = await svc.from("brain_prompts").select("id, family_safe, edition, edition_opened_at, opens_at").eq("id", promptId).maybeSingle();
  if (!p) return { ok: false, error: "not_found" };
  const prompt = p as { family_safe: boolean; edition: number; edition_opened_at: string | null; opens_at: string | null };
  const edition = prompt.edition ?? 1;
  const answers = await answersFor(promptId, edition);
  const byKey = new Map<string, AnswerRow[]>();
  for (const a of answers) { const l = byKey.get(a.normalized) ?? []; l.push(a); byKey.set(a.normalized, l); }
  const used = new Set<string>();
  const clean = groups
    .map((g) => ({ label: g.label.trim().slice(0, 60), hidden: !!g.hidden, keys: [...new Set(g.keys)].filter((k) => byKey.has(k) && !used.has(k) && (used.add(k), true)) }))
    .filter((g) => g.label && g.keys.length);
  const reviewed = clean.map((g) => ({ label: g.label, hidden: g.hidden, aliases: g.keys, count: g.keys.reduce((n, k) => n + (byKey.get(k)?.length ?? 0), 0) }));
  const board = buildBoard(reviewed, answers.length);
  if (!board.length) return { ok: false, error: "not_enough" };

  // Replace this prompt's groups, then point each answer at its group.
  await svc.from("brain_groups").delete().eq("prompt_id", promptId);
  for (const g of clean) {
    const { data: row } = await svc.from("brain_groups").insert({ prompt_id: promptId, label: g.label, aliases: g.keys, hidden: g.hidden }).select("id").single();
    const gid = (row as { id: string } | null)?.id;
    if (!gid) continue;
    const ids = g.keys.flatMap((k) => (byKey.get(k) ?? []).map((a) => a.id));
    for (let i = 0; i < ids.length; i += 500) await svc.from("brain_answers").update({ group_id: gid }).in("id", ids.slice(i, i + 500));
  }
  const now = new Date().toISOString();
  const answeredFrom = answers.reduce<string | null>((min, a) => (!min || a.created_at < min ? a.created_at : min), null) ?? prompt.edition_opened_at ?? prompt.opens_at;
  const base = { prompt_id: promptId, edition, family_safe: prompt.family_safe, published_at: now, published_by: publishedBy, answered_from: answeredFrom, answered_to: now };
  const { error } = await svc.from("brain_boards").upsert({ ...base, segment: "all", answers: board, answer_count: answers.length }, { onConflict: "prompt_id,segment,edition" });
  if (error) return { ok: false, error: "board_failed" };

  // Audience boards: the same reviewed groups, recounted for each audience with
  // at least AUDIENCE_MIN answers. A re-publish replaces them.
  const bySegment = new Map<string, AnswerRow[]>();
  for (const a of answers) for (const seg of segmentsFor({ ageBand: a.age_band, gender: a.gender, country: a.country })) {
    const l = bySegment.get(seg) ?? []; l.push(a); bySegment.set(seg, l);
  }
  await svc.from("brain_boards").delete().eq("prompt_id", promptId).eq("edition", edition).neq("segment", "all");
  for (const [segment, rows] of bySegment) {
    if (rows.length < AUDIENCE_MIN) continue;
    const count = new Map<string, number>();
    for (const r of rows) count.set(r.normalized, (count.get(r.normalized) ?? 0) + 1);
    const cut = buildBoard(clean.map((g) => ({ label: g.label, hidden: g.hidden, aliases: g.keys, count: g.keys.reduce((n, k) => n + (count.get(k) ?? 0), 0) })), rows.length);
    if (cut.length) await svc.from("brain_boards").insert({ ...base, segment, answers: cut, answer_count: rows.length });
  }
  await svc.from("brain_prompts").update({ status: "published", published_at: now, updated_at: now }).eq("id", promptId);
  return { ok: true, board };
}
