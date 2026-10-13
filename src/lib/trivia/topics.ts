import "server-only";

/**
 * Game trivia question pages (/trivia/questions/[topic]): the approved
 * GameShuffle pack questions about one game, and a night built from them.
 * A question counts for a topic when its game slug matches, its picture
 * category matches, or it's a Video games question that names the game.
 * Only approved pack questions ever show on a public page.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_TOPIC_QUESTIONS, MIN_TOPIC_QUESTIONS, QUESTION_TOPICS, type QuestionTopic } from "@/data/trivia-seo";
import { Q_COLS, createGame, forGame, toQuestion, type LibraryQuestion, type QuestionRow } from "./store";
import type { TriviaRound } from "./rules";

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/** Every approved pack question with its game, read once per call. Null when trivia isn't set up. */
async function approvedPack(): Promise<(LibraryQuestion & { gameSlug: string | null })[] | null> {
  const { data, error } = await createServiceClient()
    .from("trivia_questions")
    .select(`${Q_COLS}, game_slug`)
    .is("owner_user_id", null)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(3000);
  if (error) return null;
  return ((data ?? []) as (QuestionRow & { game_slug: string | null })[]).map((r) => ({ ...toQuestion(r), gameSlug: r.game_slug ?? null }));
}

function matches(topic: QuestionTopic, q: LibraryQuestion & { gameSlug: string | null }): boolean {
  if (q.gameSlug && topic.gameSlugs.includes(q.gameSlug)) return true;
  if (q.category && topic.pictureCategories?.includes(q.category)) return true;
  if (q.category !== "Video games") return false;
  if (topic.allVideoGames) return true;
  const text = `${q.prompt} ${q.answer}`.toLowerCase();
  return topic.keywords.some((k) => text.includes(k));
}

const byDifficulty = (a: LibraryQuestion, b: LibraryQuestion) => DIFFICULTY_ORDER[a.difficulty ?? "medium"] - DIFFICULTY_ORDER[b.difficulty ?? "medium"];

/** A topic's questions, easiest first, up to the page's limit. */
export async function topicQuestions(topic: QuestionTopic): Promise<LibraryQuestion[]> {
  const pack = await approvedPack();
  if (!pack) return [];
  return pack.filter((q) => matches(topic, q)).sort(byDifficulty).slice(0, MAX_TOPIC_QUESTIONS);
}

/** How many approved questions each topic has (for the index page and the sitemap). */
export async function topicCounts(): Promise<Record<string, number>> {
  const pack = await approvedPack();
  const out: Record<string, number> = {};
  for (const t of QUESTION_TOPICS) out[t.slug] = pack ? pack.filter((q) => matches(t, q)).length : 0;
  return out;
}

/** Topics with enough approved questions to have a page. */
export async function liveTopics(): Promise<QuestionTopic[]> {
  const counts = await topicCounts();
  return QUESTION_TOPICS.filter((t) => (counts[t.slug] ?? 0) >= MIN_TOPIC_QUESTIONS);
}

/**
 * "Play these as a trivia night": the On stream shape (three rounds of 6),
 * filled with the topic's questions, easiest first. Pictures go in picture
 * rounds and words in classic ones; when a game is mostly pictures (Smash),
 * a classic round with nothing left to fill becomes another picture round,
 * and a round with nothing at all is dropped. The host can change anything
 * in the builder.
 */
export async function createTopicGame(hostUserId: string, topic: QuestionTopic): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const questions = await topicQuestions(topic);
  if (questions.length < MIN_TOPIC_QUESTIONS) return { ok: false, error: "not_enough" };
  const made = await createGame(hostUserId, { templateId: "stream", title: `${topic.label} trivia` });
  if (!made.ok) return made;
  const pictures = questions.filter((q) => q.kind === "picture" || !!q.imageUrl);
  const words = questions.filter((q) => !pictures.includes(q));
  let pictureRounds = 0;
  const rounds = made.game.rounds.flatMap((r): TriviaRound[] => {
    const size = r.questions.length || 6;
    // A classic round needs at least 3 word questions; otherwise pictures fill it.
    const wantsPictures = r.style === "picture" ? pictures.length > 0 : words.length < 3 && pictures.length > 0;
    const from = wantsPictures ? pictures : words;
    const take = from.splice(0, size);
    if (!take.length) return [];
    if (wantsPictures) {
      pictureRounds += 1;
      return [{ ...r, style: "picture", title: pictureRounds === 1 ? "Picture round" : `Picture round ${pictureRounds}`, questions: take.map(forGame) }];
    }
    return [{ ...r, style: "classic", title: r.style === "picture" ? "Round two" : r.title, questions: take.map(forGame) }];
  });
  if (!rounds.length) return { ok: false, error: "not_enough" };
  const { error } = await createServiceClient().from("trivia_games").update({ rounds }).eq("id", made.game.id);
  if (error) return { ok: false, error: "failed" };
  return { ok: true, id: made.game.id };
}

/** A few approved, family-safe text questions from these categories (the occasion pages' samples). */
export async function sampleQuestions(categories: string[], n = 4): Promise<LibraryQuestion[]> {
  const pack = await approvedPack();
  if (!pack) return [];
  const pool = pack.filter((q) => !!q.category && categories.includes(q.category) && q.familySafe && q.kind !== "picture" && !q.imageUrl);
  // One from each category in turn, easiest first, so the samples show the spread.
  const out: LibraryQuestion[] = [];
  const byCat = categories.map((c) => pool.filter((q) => q.category === c).sort(byDifficulty));
  for (let i = 0; out.length < n && byCat.some((list) => list.length > i); i++) {
    for (const list of byCat) if (list[i] && out.length < n) out.push(list[i]);
  }
  return out;
}
