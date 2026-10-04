import "server-only";

/**
 * Claude drafts Chat Brain survey questions for a category, straight into the
 * prompt queue as drafts (origin 'ai'). Staff approve, edit or retire them in
 * Platform ▸ Chat Brain; nothing is opened for answers automatically (the
 * Weekly claims the oldest family-safe draft, so approve before a Monday).
 *
 * Each draft passes the word filter, the 8-140 character rule, and a
 * near-duplicate check against every question already in Chat Brain.
 */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { draftStructured } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";
import { normalize } from "./rules";

const Drafts = z.object({
  prompts: z.array(z.object({
    text: z.string().describe("The question, 8 to 140 characters"),
    familySafe: z.boolean().describe("True if fine for kids and family game nights"),
  })),
});

const STOP = new Set(["name", "something", "a", "an", "the", "you", "your", "that", "people", "thing", "of", "to", "in", "on", "at", "for", "do", "would", "might", "most", "what", "when", "is", "are", "be", "with", "or", "and"]);
function words(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
}
/** Two questions share most of their meaningful words. */
export function nearDuplicate(a: string, b: string): boolean {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size) >= 0.75;
}

export interface DraftOutcome { created: { id: string; text: string; familySafe: boolean }[]; skipped: { text: string; reason: "duplicate" | "blocked" | "length" }[] }

export async function draftPrompts(input: { category: string; count?: number; createdBy: string | null; guidance?: string | null }): Promise<{ ok: true; outcome: DraftOutcome } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: cat } = await svc.from("brain_categories").select("slug, name, description, family_safe").eq("slug", input.category).maybeSingle();
  if (!cat) return { ok: false, error: "unknown_category" };
  const c = cat as { slug: string; name: string; description: string | null; family_safe: boolean };
  const { data: existingRows } = await svc.from("brain_prompts").select("text").limit(5000);
  const existing = ((existingRows ?? []) as { text: string }[]).map((r) => r.text);
  const count = Math.max(3, Math.min(20, input.count ?? 10));

  const r = await draftStructured({
    system: `You write questions for Chat Brain, a survey party game. People answer a question with the first thing that comes to mind; the most common answers become a board that others try to guess.
A great question:
- has many reasonable answers, and a clear top few that lots of people will share (so the board is guessable);
- is answered in one to three words;
- is short and conversational: "Name something you bring to a game night", "What's the first thing you do when you lose a game?";
- fits the category's theme.
Avoid: questions about real private people, politics, religion, tragedies, or anything mean-spirited; questions with one right answer (that's trivia, not a survey); yes/no questions; the catchphrases or branding of any TV game show.
Mark familySafe false for anything with adult themes (drinking, dating, gross-out) so it stays out of family games.`,
    prompt: `Category: ${c.name}${c.description ? ` (${c.description})` : ""}.${c.family_safe ? " This category is family-friendly: keep every question family-safe." : ""}
${input.guidance ? `Extra direction from the editor: ${input.guidance}\n` : ""}Write ${count} new questions. Do not repeat or closely reword any of these existing questions:
${existing.slice(0, 400).map((t) => `- ${t}`).join("\n") || "(none yet)"}`,
    schema: Drafts,
    effort: "medium",
    maxTokens: 8000,
  });
  if (!r.ok) return { ok: false, error: r.error };

  const outcome: DraftOutcome = { created: [], skipped: [] };
  const seen = [...existing];
  for (const d of r.data.prompts) {
    const text = d.text.trim().replace(/\s+/g, " ");
    if (text.length < 8 || text.length > 140) { outcome.skipped.push({ text, reason: "length" }); continue; }
    if (isBlockedText(text)) { outcome.skipped.push({ text, reason: "blocked" }); continue; }
    if (seen.some((e) => nearDuplicate(e, text))) { outcome.skipped.push({ text, reason: "duplicate" }); continue; }
    const familySafe = c.family_safe ? true : d.familySafe;
    const { data: row } = await svc.from("brain_prompts").insert({ text, category: c.slug, family_safe: familySafe, origin: "ai", created_by: input.createdBy }).select("id").single();
    if (row) { outcome.created.push({ id: (row as { id: string }).id, text, familySafe }); seen.push(text); }
  }
  return { ok: true, outcome };
}
