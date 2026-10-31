import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import { brainPool, loadBrainBoard } from "@/lib/activity/roomBrain";
import { brainProgress, hasAnswered, listOpenPrompts, submitAnswer, type AnswerError } from "@/lib/chatbrain/store";
import { matchGuess, sameLine } from "@/lib/chatbrain/rules";
import type { Audience } from "@/lib/chatbrain/audience";

/**
 * Chat Brain Daily, the Facebook Instant Game (Britton's picks, 2026-10-18,
 * https://claude.ai/artifact/P1nLRnQraMgvSavH3c4Jgk): a question of the day to
 * answer and a board of the day to play. The game runs on Facebook's servers
 * (an uploaded bundle) and calls /api/instant/brain. Nothing about the
 * Facebook player reaches us: the game sends a random id it keeps in
 * Facebook's own player storage, and answers are filed under it like any
 * signed-out browser (source "facebook"), so they feed the site's boards.
 *
 * Question of the day: one of the open, family-safe public questions, picked
 * by the Pacific day from a fixed order, so everyone gets the same one (if a
 * question closes during the day the pick can move on; a player who already
 * answered just gets a new one to answer). Board of the day: a published
 * family-safe board, claimed once per Pacific day in brain_daily (the table
 * chat-brain-m1 made for a daily board), not repeated within 30 days while
 * fresh ones last. Guesses are judged here, so the bundle never holds answers.
 */

const seedOf = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0);

export interface InstantQuestion { id: string; text: string; category: string; answered: boolean }
export interface InstantBoard { id: string; question: string; slots: { rank: number; points: number }[] }
export interface InstantView {
  day: string;
  question: InstantQuestion | null;
  board: InstantBoard | null;
  /** Toward the Chat Brain launch, for the "boards open soon" panel when there's no board yet. */
  progress: { answers: number; boards: number; goal: number } | null;
}

/** Today's question for everyone (Pacific day). */
export async function questionOfDay(day: string, anonId: string | null): Promise<InstantQuestion | null> {
  const open = (await listOpenPrompts({ limit: 200 })).filter((p) => p.familySafe);
  if (!open.length) return null;
  const sorted = [...open].sort((a, b) => a.id.localeCompare(b.id));
  const p = sorted[seedOf(`instant:${day}`) % sorted.length];
  const answered = anonId ? await hasAnswered(p.id, { anonId }).catch(() => false) : false;
  return { id: p.id, text: p.text, category: p.category, answered };
}

/** Today's board id, claimed once per Pacific day; null when no board is published yet (or the table is missing). */
export async function boardOfDay(day: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data: row, error } = await svc.from("brain_daily").select("board_id").eq("board_date", day).maybeSingle();
  if (error) return null;
  if (row) return (row as { board_id: string }).board_id;
  const pool = await brainPool();
  if (!pool.length) return null;
  const { data: recent } = await svc.from("brain_daily").select("board_id").gte("board_date", gsAddDays(day, -30));
  const used = new Set(((recent ?? []) as { board_id: string }[]).map((r) => r.board_id));
  const fresh = pool.filter((id) => !used.has(id));
  const from = (fresh.length ? fresh : pool).slice().sort();
  const pick = from[seedOf(`instant-board:${day}`) % from.length];
  const { error: insErr } = await svc.from("brain_daily").insert({ board_date: day, board_id: pick });
  if (insErr) {
    // Another request claimed today first: use theirs.
    const { data: again } = await svc.from("brain_daily").select("board_id").eq("board_date", day).maybeSingle();
    return (again as { board_id: string } | null)?.board_id ?? null;
  }
  return pick;
}

/** A board as the game sees it: the question and each slot's rank and points, never the answers. */
export async function boardView(id: string): Promise<InstantBoard | null> {
  const b = await loadBrainBoard(id);
  if (!b) return null;
  return { id, question: b.question, slots: [...b.answers].sort((a, c) => a.rank - c.rank).map((a) => ({ rank: a.rank, points: a.points })) };
}

export async function instantView(anonId: string | null): Promise<InstantView> {
  const day = gsDay();
  const [question, boardId] = await Promise.all([questionOfDay(day, anonId).catch(() => null), boardOfDay(day).catch(() => null)]);
  const board = boardId ? await boardView(boardId) : null;
  const progress = board ? null : await brainProgress().then((p) => ({ answers: p.answers, boards: p.boards, goal: p.goal })).catch(() => null);
  return { day, question, board, progress };
}

export type InstantAnswer = { ok: true; same: number; line: string } | { ok: false; error: AnswerError };

export async function instantAnswer(promptId: string, raw: string, anonId: string, country: string | null): Promise<InstantAnswer> {
  const audience: Audience = { ageBand: null, gender: null, country };
  const res = await submitAnswer({ promptId, raw, who: { anonId }, source: "facebook", audience });
  return res.ok ? { ok: true, same: res.same, line: sameLine(res.same) } : res;
}

export type InstantGuess = { result: "hit"; rank: number; label: string; points: number } | { result: "found"; rank: number } | { result: "miss" } | { result: "gone" };

/** One guess against a board. `found` = ranks the player already has. */
export async function instantGuess(boardId: string, guess: string, found: number[]): Promise<InstantGuess> {
  const b = await loadBrainBoard(boardId);
  if (!b) return { result: "gone" };
  const hit = matchGuess(guess, b.answers, []);
  if (!hit) return { result: "miss" };
  if (found.includes(hit.rank)) return { result: "found", rank: hit.rank };
  return { result: "hit", rank: hit.rank, label: hit.label, points: hit.points };
}

/** Every answer, for the end of a game. */
export async function instantReveal(boardId: string): Promise<{ rank: number; label: string; points: number }[] | null> {
  const b = await loadBrainBoard(boardId);
  return b ? [...b.answers].sort((a, c) => a.rank - c.rank).map((a) => ({ rank: a.rank, label: a.label, points: a.points })) : null;
}
