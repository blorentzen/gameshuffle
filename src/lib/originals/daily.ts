import mk8dx from "@/data/mk8dx-data.json";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's Mario Kart 8
 * Deluxe character in six tries. Pure and client-safe; the same answer for
 * everyone on a given UTC day.
 *
 * After each guess you learn: the weight class (match or not), the group
 * (match or not), and whether the answer comes earlier or later in A to Z.
 */

export const MAX_GUESSES = 6;
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-09-29";

export interface DailyCharacter { name: string; img: string; weight: string; group: string }

/** Our own groupings, used as a hint. Anyone not listed is a "Friend". */
const GROUPS: Record<string, string[]> = {
  "Mario family": ["Mario", "Luigi", "Peach", "Daisy", "Rosalina", "Tanooki Mario", "Cat Peach", "Pauline", "Peachette"],
  "Babies": ["Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Baby Rosalina"],
  "Metal and gold": ["Metal Mario", "Pink Gold Peach"],
  "Koopalings": ["Lemmy", "Larry", "Wendy", "Ludwig", "Iggy", "Roy", "Morton"],
  "Bowser's crew": ["Bowser", "Bowser Jr.", "Dry Bowser", "Dry Bones", "Kamek", "King Boo", "Petey Piranha"],
  "Kong family": ["Donkey Kong", "Diddy Kong", "Funky Kong"],
  "Wario bros": ["Wario", "Waluigi"],
  "Nintendo guests": ["Inkling", "Link", "Villager", "Isabelle", "Mii"],
};

function groupOf(name: string): string {
  for (const [g, names] of Object.entries(GROUPS)) if (names.includes(name)) return g;
  return "Friends";
}

export const DAILY_CHARACTERS: DailyCharacter[] = ((mk8dx as { characters: { name: string; img: string; weight: string }[] }).characters)
  .map((c) => ({ name: c.name, img: c.img, weight: c.weight, group: groupOf(c.name) }));

export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function puzzleNumber(day: string): number {
  return Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / 86400000) + 1;
}

/** Today's answer: a fixed shuffle of the roster walked one per day, so there are no repeats until it cycles. */
export function answerFor(day: string): DailyCharacter {
  const list = [...DAILY_CHARACTERS];
  let h = 20260929;
  const rand = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const n = ((puzzleNumber(day) - 1) % list.length + list.length) % list.length;
  return list[n];
}

export interface GuessHint {
  name: string;
  correct: boolean;
  weight: boolean;
  group: boolean;
  /** Where the answer is from this guess in A to Z. */
  alpha: "earlier" | "later" | "same";
}

export function hintFor(guess: string, answer: DailyCharacter): GuessHint | null {
  const g = DAILY_CHARACTERS.find((c) => c.name === guess);
  if (!g) return null;
  const cmp = answer.name.localeCompare(g.name);
  return { name: g.name, correct: g.name === answer.name, weight: g.weight === answer.weight, group: g.group === answer.group, alpha: cmp < 0 ? "earlier" : cmp > 0 ? "later" : "same" };
}

/** The shareable result: one row per guess (weight, group, answer). */
export function shareText(day: string, hints: GuessHint[], solved: boolean): string {
  const sq = (b: boolean) => (b ? "🟩" : "⬛");
  const rows = hints.map((h) => `${sq(h.weight)}${sq(h.group)}${h.correct ? "🏁" : "❌"}`);
  return [`The Daily Shuffle #${puzzleNumber(day)} ${solved ? hints.length : "X"}/${MAX_GUESSES}`, ...rows, "gameshuffle.co/daily"].join("\n");
}
