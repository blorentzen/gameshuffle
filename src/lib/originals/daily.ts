import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's character in six
 * tries. Pure and client-safe; the same answer for everyone on a given UTC day.
 *
 * The game rotates by weekday (ROTATION): Mario Kart 8 Deluxe, Mario Kart
 * World and Mario Party. Each puzzle has its own traits; after each guess you
 * learn whether each trait matches the answer, and whether the answer comes
 * earlier or later in A to Z. Each puzzle walks its own fixed shuffle, so a
 * character doesn't repeat until that roster has cycled.
 */

export const MAX_GUESSES = 6;
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-09-29";

export interface DailyCharacter {
  name: string;
  img: string;
  /** One value per puzzle trait, in the puzzle's trait order. */
  traits: string[];
}

export interface DailyPuzzle {
  id: string;
  /** The game, as players know it. */
  game: string;
  /** The traits hinted after each guess. */
  traits: string[];
  characters: DailyCharacter[];
  /** Seed for this puzzle's answer order. */
  seed: number;
}

// Our own groupings, used as a hint. Anyone not listed is in "Friends".
const MK8DX_GROUPS: Record<string, string[]> = {
  "Mario family": ["Mario", "Luigi", "Peach", "Daisy", "Rosalina", "Tanooki Mario", "Cat Peach", "Pauline", "Peachette"],
  "Babies": ["Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Baby Rosalina"],
  "Metal and gold": ["Metal Mario", "Pink Gold Peach"],
  "Koopalings": ["Lemmy", "Larry", "Wendy", "Ludwig", "Iggy", "Roy", "Morton"],
  "Bowser's crew": ["Bowser", "Bowser Jr.", "Dry Bowser", "Dry Bones", "Kamek", "King Boo", "Petey Piranha"],
  "Kong family": ["Donkey Kong", "Diddy Kong", "Funky Kong"],
  "Wario bros": ["Wario", "Waluigi"],
  "Nintendo guests": ["Inkling", "Link", "Villager", "Isabelle", "Mii"],
};
const MKW_GROUPS: Record<string, string[]> = {
  "Mario family": ["Mario", "Luigi", "Peach", "Daisy", "Rosalina", "Pauline"],
  "Babies": ["Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Baby Rosalina"],
  "Bowser's crew": ["Bowser", "Bowser Jr.", "Dry Bones", "King Boo", "Hammer Bro", "Koopa", "Goomba", "Lakitu", "Shy Guy", "Piranha Plant", "Monty Mole", "Rocky Wrench", "Spike", "Chargin' Chuck", "Fishbone"],
  "Wario bros": ["Wario", "Waluigi"],
  "Creatures": ["Cow", "Dolphin", "Penguin", "Snowman", "Cheep Cheep", "Pokey", "Wiggler", "Sidestepper", "Stingby", "Swoop", "Peepa", "Conkdor", "Cataquack", "Coin Coffer", "BB", "Pianta"],
};
const PARTY_GROUPS: Record<string, string[]> = {
  "Mario family": ["Mario", "Luigi", "Peach", "Daisy", "Rosalina", "Pauline"],
  "Wario bros": ["Wario", "Waluigi"],
  "Bowser's crew": ["Bowser", "Bowser Jr.", "Goomba", "Shy Guy", "Koopa Troopa", "Monty Mole", "Boo", "Spike", "Ninji"],
};

function groupIn(groups: Record<string, string[]>, name: string): string {
  for (const [g, names] of Object.entries(groups)) if (names.includes(name)) return g;
  return "Friends";
}

type KartChar = { name: string; img: string; weight: string };

const superstarsNames = new Set(SUPERSTARS.characters.map((c) => c.name));

export const PUZZLES: Record<string, DailyPuzzle> = {
  "mk8dx-character": {
    id: "mk8dx-character",
    game: "Mario Kart 8 Deluxe",
    traits: ["Weight class", "Group"],
    characters: (mk8dx as { characters: KartChar[] }).characters
      .map((c) => ({ name: c.name, img: c.img, traits: [c.weight, groupIn(MK8DX_GROUPS, c.name)] })),
    seed: 20260929,
  },
  "mkworld-character": {
    id: "mkworld-character",
    game: "Mario Kart World",
    traits: ["Weight class", "Group"],
    characters: (mkworld as { characters: KartChar[] }).characters
      .map((c) => ({ name: c.name, img: c.img, traits: [c.weight, groupIn(MKW_GROUPS, c.name)] })),
    seed: 20261001,
  },
  "party-character": {
    id: "party-character",
    game: "Mario Party",
    traits: ["Group", "Superstars"],
    characters: JAMBOREE.characters.map((c) => ({
      name: c.name,
      img: `${JAMBOREE.assetBase}${c.img}`,
      traits: [groupIn(PARTY_GROUPS, c.name), superstarsNames.has(c.name) ? "In Superstars" : "Jamboree only"],
    })),
    seed: 20261002,
  },
};

/** The puzzle for each UTC weekday, Sunday first. Mario Kart 8 Deluxe gets three days as the flagship. */
export const ROTATION: string[] = [
  "mk8dx-character",   // Sun
  "mk8dx-character",   // Mon
  "mkworld-character", // Tue
  "party-character",   // Wed
  "mk8dx-character",   // Thu
  "mkworld-character", // Fri
  "party-character",   // Sat
];

export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
}

export function puzzleNumber(day: string): number {
  return Math.floor((dayMs(day) - dayMs(DAILY_EPOCH)) / 86400000) + 1;
}

export function puzzleFor(day: string): DailyPuzzle {
  return PUZZLES[ROTATION[new Date(dayMs(day)).getUTCDay()]];
}

function shuffled(p: DailyPuzzle): DailyCharacter[] {
  const list = [...p.characters];
  let h = p.seed;
  const rand = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

/** Today's answer: the nth day this puzzle has run since the epoch picks the nth character of its shuffle. */
export function answerFor(day: string): DailyCharacter {
  const p = puzzleFor(day);
  const days = puzzleNumber(day);
  // How many days up to and including this one ran the same puzzle.
  let n = 0;
  if (days >= 1) {
    const weeks = Math.floor((days - 1) / 7);
    n = weeks * ROTATION.filter((id) => id === p.id).length;
    for (let d = weeks * 7; d < days; d++) if (puzzleFor(addDays(DAILY_EPOCH, d)).id === p.id) n += 1;
  } else {
    n = days; // before launch (only in tests): any stable index will do
  }
  const list = shuffled(p);
  return list[(((n - 1) % list.length) + list.length) % list.length];
}

export interface GuessHint {
  name: string;
  correct: boolean;
  /** Per trait, whether it matches the answer. */
  traits: boolean[];
  /** Where the answer is from this guess in A to Z. */
  alpha: "earlier" | "later" | "same";
}

export function hintFor(guess: string, answer: DailyCharacter, puzzle: DailyPuzzle): GuessHint | null {
  const g = puzzle.characters.find((c) => c.name === guess);
  if (!g) return null;
  const cmp = answer.name.localeCompare(g.name);
  return {
    name: g.name,
    correct: g.name === answer.name,
    traits: g.traits.map((t, i) => t === answer.traits[i]),
    alpha: cmp < 0 ? "earlier" : cmp > 0 ? "later" : "same",
  };
}

/** The shareable result: one row per guess (each trait, then the answer). */
export function shareText(day: string, hints: GuessHint[], solved: boolean): string {
  const sq = (b: boolean) => (b ? "🟩" : "⬛");
  const rows = hints.map((h) => `${h.traits.map(sq).join("")}${h.correct ? "🏁" : "❌"}`);
  return [`The Daily Shuffle #${puzzleNumber(day)} · ${puzzleFor(day).game} ${solved ? hints.length : "X"}/${MAX_GUESSES}`, ...rows, "gameshuffle.co/daily"].join("\n");
}

/**
 * Checks a finished game against the day's answer, so an account result can't
 * be made up: the guesses must be real, distinct characters from the day's
 * puzzle, and the game must be over (solved, or out of guesses). Null if it
 * isn't a finished game.
 */
export function judgeGame(day: string, guesses: string[]): { guesses: number; solved: boolean } | null {
  if (!Array.isArray(guesses) || guesses.length < 1 || guesses.length > MAX_GUESSES) return null;
  if (new Set(guesses).size !== guesses.length) return null;
  const roster = puzzleFor(day).characters;
  if (!guesses.every((g) => roster.some((c) => c.name === g))) return null;
  const answer = answerFor(day).name;
  const at = guesses.indexOf(answer);
  if (at >= 0 && at !== guesses.length - 1) return null; // nothing after the right answer
  const solved = at >= 0;
  if (!solved && guesses.length < MAX_GUESSES) return null;
  return { guesses: guesses.length, solved };
}

export interface DailyStats { played: number; won: number; streak: number; best: number; dist: number[] }

/**
 * Stats from an account's results, across every puzzle in the rotation. The
 * current streak is consecutive solved days ending today, or yesterday if
 * today isn't played yet.
 */
export function statsFrom(rows: { day: string; guesses: number; solved: boolean }[], today: string = dayKey()): DailyStats {
  // One result per day counts, even if a day somehow holds two puzzles.
  const byDay = new Map<string, { guesses: number; solved: boolean }>();
  for (const r of rows) if (!byDay.has(r.day)) byDay.set(r.day, r);
  const dist = Array(MAX_GUESSES).fill(0) as number[];
  const solvedDays = new Set<string>();
  for (const [day, r] of byDay) if (r.solved) { solvedDays.add(day); if (r.guesses >= 1 && r.guesses <= MAX_GUESSES) dist[r.guesses - 1] += 1; }
  let streak = 0;
  let d = solvedDays.has(today) ? today : addDays(today, -1);
  while (solvedDays.has(d)) { streak += 1; d = addDays(d, -1); }
  let best = 0, run = 0, last: string | null = null;
  for (const day of [...solvedDays].sort()) {
    run = last && addDays(day, -1) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return { played: byDay.size, won: solvedDays.size, streak, best, dist };
}
