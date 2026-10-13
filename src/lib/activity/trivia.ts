import "server-only";

/**
 * Trivia inside the Discord Activity. When the server's owner is running a
 * trivia night on stream, players answer it here as the same player they'd
 * be from Discord's buttons (viewerForDiscord: their linked Twitch account,
 * else their GameShuffle account, else their Discord id). With nothing live,
 * a practice round: five approved GameShuffle pack questions, judged on the
 * server one at a time, nothing scored or saved.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { liveStreamGame } from "@/lib/trivia/stream";
import { judgeAnswer, type TriviaQuestion } from "@/lib/trivia/rules";
import type { GameRow } from "@/lib/trivia/store";

export const PRACTICE_SIZE = 5;

/** The trivia night on stream for the server this Activity is in, if its owner is running one. */
export async function serverTriviaGame(guildId: string | null | undefined): Promise<GameRow | null> {
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return null;
  const { data } = await createServiceClient().from("discord_guilds").select("owner_user_id, removed_at").eq("guild_id", guildId).maybeSingle();
  const row = data as { owner_user_id: string; removed_at: string | null } | null;
  if (!row || row.removed_at) return null;
  return liveStreamGame(row.owner_user_id);
}

export interface PracticeQuestion { id: string; prompt: string; kind: "text" | "number" | "choice"; options: string[] | null; category: string }

type Row = { id: string; prompt: string; answer: string; accept: string[]; ask_about: string[]; reject: string[]; kind: "text" | "number" | "choice"; options: string[] | null; category: string };
const COLS = "id, prompt, answer, accept, ask_about, reject, kind, options, category";

/** Five approved pack questions (no pictures), mixed categories, skipping ones this player just saw. */
export async function practiceSet(skip: Set<string>): Promise<PracticeQuestion[]> {
  const { data } = await createServiceClient().from("trivia_questions").select(COLS)
    .is("owner_user_id", null).eq("status", "approved").eq("family_safe", true).in("kind", ["text", "number", "choice"]).limit(800);
  const rows = ((data ?? []) as Row[]).filter((r) => !skip.has(r.id) && (r.kind !== "choice" || (r.options?.length ?? 0) >= 2));
  // Shuffle, then take one per category first so a round isn't five geography questions.
  for (let i = rows.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const picked: Row[] = [];
  const cats = new Set<string>();
  for (const r of rows) { if (picked.length < PRACTICE_SIZE && !cats.has(r.category)) { picked.push(r); cats.add(r.category); } }
  for (const r of rows) { if (picked.length < PRACTICE_SIZE && !picked.includes(r)) picked.push(r); }
  return picked.map((r) => ({ id: r.id, prompt: r.prompt, kind: r.kind, options: r.kind === "choice" ? r.options : null, category: r.category }));
}

export type PracticeResult = { verdict: "correct" | "close" | "wrong"; answer: string };

/** Judges one practice answer (a letter for choices, like the stream). Null when the question isn't an approved pack question. */
export async function checkPractice(id: string, raw: string): Promise<PracticeResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("trivia_questions").select(COLS).eq("id", id).is("owner_user_id", null).eq("status", "approved").maybeSingle();
  const r = data as Row | null;
  if (!r) return null;
  const q: TriviaQuestion = { prompt: r.prompt, answer: r.answer, accept: r.accept ?? [], askAbout: r.ask_about ?? [], reject: r.reject ?? [], kind: r.kind, options: r.options };
  const v = judgeAnswer(raw.trim().slice(0, 120), q);
  return { verdict: v === "correct" ? "correct" : v === "ask" ? "close" : "wrong", answer: r.answer };
}
