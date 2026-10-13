/**
 * Chat Brain boards in the Discord Activity's room (server only): the call
 * plays published boards like the stream's speed round. Everyone types
 * answers on their own screen; the first person to name a hidden answer takes
 * its points, every find restarts the clock, running out of time is a strike,
 * and three strikes (or a cleared board) ends it. A game is 1 to 5 boards.
 *
 * Boards are the published public ones (segment "all", family-safe), the
 * newest edition of each question, not played in this room yet. Until Chat
 * Brain launches there are none, and the lobby doesn't offer the game. In
 * development, community test boards count too, so it can be tried on dev.
 *
 * Answers and their spellings live in the room's `secret`; views show an
 * answer only once it's found or the board is over.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { matchGuess, type BoardAnswer } from "@/lib/chatbrain/rules";

export const BRAIN_BOARD_COUNTS = [1, 3, 5] as const;
/** Each find restarts the clock; running out is a strike. */
export const BRAIN_FIND_SECONDS = 20;
export const BRAIN_STRIKES = 3;

export interface BrainState {
  kind: "brain";
  boards: number;
  /** Board ids for this game, in order. */
  boardIds: string[];
  /** Which board (0-based). */
  boardNo: number;
  question: string;
  /** Each answer's slot: found (by whom) or still hidden; labels only for found ones until the board ends. */
  slots: { rank: number; points: number; label: string | null; finder: { id: string; name: string } | null }[];
  strikes: number;
  scores: Record<string, number>;
  /** The latest find, for the reveal on every screen. */
  lastFind: { name: string; label: string; points: number } | null;
  seen: string[];
}

export interface BrainSecret { answers: BoardAnswer[] }

let poolCache: { at: number; ids: string[] } | null = null;

/** Public boards the room can play (dev adds community test boards). Cached for a few minutes. */
export async function brainPool(): Promise<string[]> {
  if (poolCache && Date.now() - poolCache.at < 5 * 60_000) return poolCache.ids;
  const { data, error } = await createServiceClient().from("brain_boards")
    .select("id, prompt_id, edition, family_safe, brain_prompts!inner(community_id)").eq("segment", "all").limit(2000);
  if (error) { poolCache = { at: Date.now(), ids: [] }; return []; }
  const dev = process.env.NODE_ENV === "development";
  const latest = new Map<string, { id: string; edition: number }>();
  for (const r of (data ?? []) as unknown as { id: string; prompt_id: string; edition: number; family_safe: boolean; brain_prompts: { community_id: string | null } | { community_id: string | null }[] }[]) {
    const owner = (Array.isArray(r.brain_prompts) ? r.brain_prompts[0] : r.brain_prompts)?.community_id ?? null;
    if ((owner && !dev) || !r.family_safe) continue;
    const cur = latest.get(r.prompt_id);
    if (!cur || r.edition > cur.edition) latest.set(r.prompt_id, { id: r.id, edition: r.edition });
  }
  const ids = [...latest.values()].map((b) => b.id);
  poolCache = { at: Date.now(), ids };
  return ids;
}

/** A game's boards: unplayed in this room first. */
export async function pickBrainBoards(count: number, seen: string[]): Promise<string[]> {
  const pool = await brainPool();
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const fresh = shuffle(pool.filter((id) => !seen.includes(`brain:${id}`)));
  const old = shuffle(pool.filter((id) => seen.includes(`brain:${id}`)));
  return [...fresh, ...old].slice(0, count);
}

/** Loads a board: its question and answers. */
export async function loadBrainBoard(id: string): Promise<{ question: string; answers: BoardAnswer[] } | null> {
  const { data } = await createServiceClient().from("brain_boards").select("answers, brain_prompts!inner(text)").eq("id", id).maybeSingle();
  const row = data as unknown as { answers: BoardAnswer[]; brain_prompts: { text: string } | { text: string }[] } | null;
  if (!row || !Array.isArray(row.answers) || !row.answers.length) return null;
  const prompt = (Array.isArray(row.brain_prompts) ? row.brain_prompts[0] : row.brain_prompts)?.text ?? "";
  return { question: prompt, answers: row.answers };
}

/** The board's slots before anything's found. */
export function freshSlots(answers: BoardAnswer[]): BrainState["slots"] {
  return [...answers].sort((a, b) => a.rank - b.rank).map((a) => ({ rank: a.rank, points: a.points, label: null, finder: null }));
}

/** A guess against the board: the answer it finds, "found" when it names one already found, or null. */
export function judgeBrainGuess(text: string, st: BrainState, sec: BrainSecret): BoardAnswer | "found" | null {
  const found = st.slots.filter((s) => s.finder).map((s) => s.rank);
  const hit = matchGuess(text, sec.answers, found);
  if (hit) return hit;
  return matchGuess(text, sec.answers, []) ? "found" : null;
}

/** Every slot shown (the board is over). */
export function revealAll(st: BrainState, sec: BrainSecret): BrainState["slots"] {
  const labels = new Map(sec.answers.map((a) => [a.rank, a.label]));
  return st.slots.map((s) => ({ ...s, label: labels.get(s.rank) ?? s.label }));
}

export const boardCleared = (st: BrainState) => st.slots.every((s) => s.finder);
