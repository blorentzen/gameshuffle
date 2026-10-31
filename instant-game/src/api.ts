/** Calls to gameshuffle.co (/api/instant/brain). The base is set at build time. */

// Replaced at build time by scripts/build-instant-game.ts (esbuild define).
const BASE = process.env.GS_API_BASE ?? "https://www.gameshuffle.co";
const URL_ = `${BASE}/api/instant/brain`;

export interface Question { id: string; text: string; category: string; answered: boolean }
export interface Board { id: string; question: string; slots: { rank: number; points: number }[] }
export interface View { day: string; question: Question | null; board: Board | null; progress: { answers: number; boards: number; goal: number } | null }
export type Guess = { result: "hit"; rank: number; label: string; points: number } | { result: "found"; rank: number } | { result: "miss" } | { result: "gone" };

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(data.message ?? data.error ?? "failed");
  return data;
}

export async function loadView(anon: string): Promise<View> {
  const res = await fetch(`${URL_}?anon=${encodeURIComponent(anon)}`);
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as View;
}

export const sendAnswer = (promptId: string, answer: string, anon: string) =>
  post<{ ok: true; same: number; line: string }>({ action: "answer", promptId, answer, anon });

export const sendGuess = (boardId: string, guess: string, found: number[]) =>
  post<Guess>({ action: "guess", boardId, guess, found });

export const revealBoard = (boardId: string) =>
  post<{ answers: { rank: number; label: string; points: number }[] }>({ action: "reveal", boardId });

// ─── The dailies' leaderboard (/api/instant/daily) ──────────────────────────
const DAILY_URL = `${BASE}/api/instant/daily`;

export interface BoardRow { place: number; name: string; points: number; seconds: number | null; you: boolean; tag: "guest" | "discord" | null }
export interface DailyBoard { ready: boolean; rows: BoardRow[]; you: BoardRow | null; total: number }
export interface DailyStanding { onBoard: boolean; name: string | null; board: DailyBoard | null }

async function dailyPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(DAILY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(data.message ?? data.error ?? "failed");
  return data;
}

export async function loadStanding(game: string, secret: string | undefined): Promise<DailyStanding> {
  const res = await fetch(`${DAILY_URL}?game=${game}${secret ? `&secret=${encodeURIComponent(secret)}` : ""}`);
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as DailyStanding;
}

/** The solve-time clock starts on our side too, so a leaderboard time can't be made up later. Never blocks the game. */
export const startClock = (game: string, secret: string) => dailyPost<{ ok: boolean }>({ action: "start", game, secret }).catch(() => null);

export const joinBoard = (name: string, secret: string) => dailyPost<{ ok: true; name: string }>({ action: "join", name, secret });

export const sendDailyResult = (game: string, day: string, guesses: string[], secret: string) =>
  dailyPost<{ ok: true; points: number | null }>({ action: "result", game, day, guesses, secret });
