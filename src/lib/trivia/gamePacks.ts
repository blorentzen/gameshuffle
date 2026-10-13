import "server-only";

/**
 * Trivia packs about one game (supabase/trivia-game-packs-m1.sql): staff
 * draft them with Claude in Platform ▸ Trivia, approve them like the rest of
 * the GameShuffle pack, and break mode's Game Trivia asks about the game on
 * stream from the approved ones. AI rules as everywhere: Claude drafts, a
 * person approves, nothing reaches a stream until then.
 *
 * Where we have checked facts (the Daily's character facts) Claude is given
 * them and told to stick to them; for everything else it must name a
 * reference staff can check. The questions go in as Video games, so trivia
 * nights can use them too.
 */

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";
import { gsDay } from "@/lib/time/gsClock";
import { PUZZLES } from "@/lib/originals/daily";
import { PUZZLE_GAMES } from "@/lib/break/games/facts";
import { CHAT_GAMES } from "@/lib/twitch/chatGames";
import { questionRow } from "./store";

const notReady = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /game_slug/.test(e.message ?? ""));

/** The games a pack can be about: the ones break mode knows as "the game on stream", those with checked facts first. */
export function packGames(): { slug: string; title: string; facts: boolean }[] {
  const withFacts = new Set(Object.values(PUZZLE_GAMES).flat());
  return Object.values(CHAT_GAMES)
    .map((g) => ({ slug: g.slug, title: g.title, facts: withFacts.has(g.slug) }))
    .sort((a, b) => Number(b.facts) - Number(a.facts) || a.title.localeCompare(b.title));
}

export const gameTitle = (slug: string) => CHAT_GAMES[slug]?.title ?? slug;

/** True once the game_slug column exists. */
export async function gamePacksReady(): Promise<boolean> {
  const { error } = await createServiceClient().from("trivia_questions").select("game_slug").limit(1);
  return !error;
}

/** Which pack questions are about which game (id → slug), for Platform ▸ Trivia. Null until the column exists. */
export async function gameTags(): Promise<Record<string, string> | null> {
  const { data, error } = await createServiceClient().from("trivia_questions").select("id, game_slug")
    .is("owner_user_id", null).not("game_slug", "is", null).limit(5000);
  if (error) return null;
  return Object.fromEntries(((data ?? []) as { id: string; game_slug: string }[]).map((r) => [r.id, r.game_slug]));
}

/** The checked facts we hold for a game, as lines Claude can quote from. */
export function factsFor(slug: string): string[] {
  const lines: string[] = [];
  for (const [id, games] of Object.entries(PUZZLE_GAMES)) {
    if (!games.includes(slug)) continue;
    const p = PUZZLES[id];
    if (!p) continue;
    for (const c of p.characters) {
      const facts = p.traits.map((t, i) => (c.traits[i] === null || c.traits[i] === "" ? null : `${t.label}: ${c.traits[i]}`)).filter(Boolean);
      lines.push(`${c.name} (${p.game}). ${facts.join("; ")}.`);
    }
  }
  return lines;
}

const SCHEMA = z.object({
  questions: z.array(z.object({
    prompt: z.string().describe("The question as it appears on stream. One sentence, under 160 characters, readable at a glance."),
    answer: z.string().describe("The answer, short: a name, a number or a few words."),
    accept: z.array(z.string()).describe("Other ways of writing the same answer that should count: short forms, common spellings, nicknames."),
    reject: z.array(z.string()).describe("Close but wrong answers people will give, which must not count."),
    kind: z.enum(["text", "number", "choice"]).describe("number when the answer is a number or a year; choice for a four-option question."),
    options: z.array(z.string()).nullable().describe("For choice questions: exactly four options, one of them the answer word for word. Null otherwise."),
    difficulty: z.enum(["easy", "medium", "hard"]),
    from_facts: z.boolean().describe("true when the question comes from the checked facts given."),
    sources: z.array(z.object({ title: z.string(), url: z.string().nullable() })).describe("One or two references where staff can check the fact (the official site, the series wiki). Use 'GameShuffle checked facts' for questions from the facts given."),
    changeable: z.boolean().describe("true when the fact could change with an update (roster counts, balance numbers, latest additions)."),
  })),
});

export type GamePackResult = AiResult<{ added: number; skipped: number }>;

/**
 * Drafts `count` questions about one game and saves them as pack drafts.
 * Skips questions the pack already has (same normalized prompt).
 */
export async function draftGamePack(slug: string, count: number): Promise<GamePackResult | { ok: false; error: "not_ready" | "unknown_game" }> {
  if (!CHAT_GAMES[slug]) return { ok: false, error: "unknown_game" };
  if (!(await gamePacksReady())) return { ok: false, error: "not_ready" };
  const svc = createServiceClient();
  const title = gameTitle(slug);
  const { data: existing } = await svc.from("trivia_questions").select("prompt").is("owner_user_id", null).eq("game_slug", slug).limit(500);
  const avoid = ((existing ?? []) as { prompt: string }[]).map((r) => r.prompt);
  const facts = factsFor(slug);
  const today = gsDay();

  const system = [
    "You write trivia questions that run on a Twitch streamer's break screen while they're away. Chat types the answer; answers are judged from an answer line, so one clear answer matters more than anything.",
    "Every question is about the one game named. Accuracy first: only write questions whose answer you're certain of and that the game's official site or its main fan wiki would confirm. Skip disputed or version-dependent facts unless you mark them changeable.",
    facts.length ? "Checked facts are given. Prefer questions built from them (set from_facts true) and never contradict them. Questions beyond the facts must name a reference." : "Name a reference for every question.",
    "Short and readable at a glance: no long setups, no trick questions, nothing that needs an image. Mix easy, medium and hard, and vary the kind: mostly typed answers, some numbers, a few four-option choices.",
    "Family friendly. Plain English. Don't use em dashes or en dashes.",
  ].join(" ");
  const prompt = [
    `Game: ${title}`,
    `Write ${count} questions.`,
    facts.length ? `Checked facts (GameShuffle, researched on the series wikis):\n${facts.slice(0, 120).map((f) => `- ${f}`).join("\n")}` : "",
    avoid.length ? `Already in the pack (don't repeat these facts):\n${avoid.slice(0, 120).map((q) => `- ${q}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const res = await draftStructured({ system, prompt, schema: SCHEMA, effort: "medium", maxTokens: 8000 });
  if (!res.ok) return res;
  const have = new Set(avoid.map((p) => p.toLowerCase().replace(/\W+/g, " ").trim()));
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const q of res.data.questions.slice(0, count)) {
    const key = q.prompt.toLowerCase().replace(/\W+/g, " ").trim();
    if (have.has(key) || isBlockedText(q.prompt) || isBlockedText(q.answer)) { skipped++; continue; }
    const v = questionRow({
      prompt: q.prompt,
      answer: q.answer,
      accept: q.accept,
      reject: q.reject,
      kind: q.kind,
      options: q.kind === "choice" ? q.options : null,
      category: "Video games",
      difficulty: q.difficulty,
      sources: q.sources.map((s) => ({ title: s.title, url: s.url })),
      asOf: q.changeable ? today : null,
      changeable: q.changeable,
      familySafe: true,
    });
    if (!v.ok) { skipped++; continue; }
    have.add(key);
    rows.push({ ...v.row, owner_user_id: null, origin: "ai", status: "draft", game_slug: slug });
  }
  if (rows.length) {
    const { error } = await svc.from("trivia_questions").insert(rows);
    if (notReady(error)) return { ok: false, error: "not_ready" };
    if (error) throw new Error(`game pack save failed: ${error.message}`);
  }
  return { ok: true, data: { added: rows.length, skipped } };
}
