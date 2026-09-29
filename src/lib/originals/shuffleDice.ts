/**
 * Shuffle Dice rules (a GameShuffle Original, prototype for playtesting). Pure.
 *
 * Five dice, each with a Star, two Coins, a Mushroom, a Shell and a Bomb. On
 * your turn roll all five; Bombs are set aside automatically. Keep at least one
 * other die, then re-roll the rest or bank. Every die set aside and none busted:
 * "hot dice", roll all five again. Your third Bomb in a turn busts it.
 *   Coin 1 · Star 3 · every third Mushroom in a turn +5 · Shell: steal 1 from the leader when you bank.
 * First to TARGET wins.
 */

export type Face = "star" | "coin" | "mushroom" | "shell" | "bomb";
export const FACES: Face[] = ["star", "coin", "coin", "mushroom", "shell", "bomb"];
export const DICE = 5;
export const BUST_BOMBS = 3;
export const TARGET = 40;
export const FACE_POINTS: Record<Face, number> = { star: 3, coin: 1, mushroom: 0, shell: 0, bomb: 0 };
export const MUSHROOM_SET = 3;
export const MUSHROOM_BONUS = 5;

export interface TurnState {
  /** Faces set aside this turn (kept and bombs), across hot-dice resets. */
  kept: Face[];
  /** The current roll, not yet kept. */
  roll: Face[];
  bombs: number;
  bust: boolean;
}

export function rollDice(n: number, rand: () => number = Math.random): Face[] {
  return Array.from({ length: n }, () => FACES[Math.floor(rand() * FACES.length)]);
}

export function newTurn(rand: () => number = Math.random): TurnState {
  return applyRoll({ kept: [], roll: [], bombs: 0, bust: false }, rollDice(DICE, rand));
}

/** Put a fresh roll on the table: bombs go straight to the kept pile. */
export function applyRoll(t: TurnState, roll: Face[]): TurnState {
  const bombs = roll.filter((f) => f === "bomb").length;
  const total = t.bombs + bombs;
  return { kept: [...t.kept, ...roll.filter((f) => f === "bomb")], roll: roll.filter((f) => f !== "bomb"), bombs: total, bust: total >= BUST_BOMBS };
}

/** Dice left to roll in this cycle (hot dice resets to five). */
export function diceInHand(t: TurnState): number {
  const setAside = t.kept.length % DICE;
  return setAside === 0 && t.kept.length > 0 ? DICE : DICE - setAside;
}

/** Keep some of the current roll (indexes into `roll`), then roll what's left. */
export function keepAndRoll(t: TurnState, keepIdx: number[], rand: () => number = Math.random): TurnState | "keep_one" {
  if (t.bust) return t;
  const keep = t.roll.filter((_, i) => keepIdx.includes(i));
  if (!keep.length && t.roll.length) return "keep_one";
  const kept = [...t.kept, ...keep];
  const left = DICE - (kept.length % DICE);
  const n = kept.length % DICE === 0 ? DICE : left;
  return applyRoll({ ...t, kept, roll: [] }, rollDice(n, rand));
}

/** Points a set of faces is worth (stars, coins and mushroom sets). */
export function facesPoints(faces: Face[]): number {
  const base = faces.reduce((a, f) => a + FACE_POINTS[f], 0);
  const mush = faces.filter((f) => f === "mushroom").length;
  return base + Math.floor(mush / MUSHROOM_SET) * MUSHROOM_BONUS;
}

/** What banking now would score: kept dice plus whatever you keep from the current roll. */
export function bankValue(t: TurnState, keepIdx: number[]): { points: number; shells: number } {
  if (t.bust) return { points: 0, shells: 0 };
  const faces = [...t.kept, ...t.roll.filter((_, i) => keepIdx.includes(i))];
  return { points: facesPoints(faces), shells: faces.filter((f) => f === "shell").length };
}

/** Apply a bank to the scores: your points, plus each Shell steals 1 from the leader (not from yourself). */
export function bank(scores: number[], player: number, value: { points: number; shells: number }): number[] {
  const next = [...scores];
  next[player] += value.points;
  for (let s = 0; s < value.shells; s++) {
    const leader = next.reduce((best, v, i) => (i !== player && v > (best < 0 ? -1 : next[best]) ? i : best), -1);
    if (leader >= 0 && next[leader] > 0) { next[leader] -= 1; next[player] += 1; }
  }
  return next;
}
