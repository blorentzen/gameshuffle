import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { DAILY_FACTS, type CharacterFacts } from "@/data/originals/daily-facts";
import { SMASH_FACTS, smashWeightClass } from "@/data/originals/daily-facts-smash";
import { ULTIMATE } from "@/data/smash/ultimate";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's character in six
 * tries. Pure and client-safe; the same answer for everyone on a given UTC day.
 *
 * The game rotates by weekday (ROTATION): Mario Kart 8 Deluxe, Mario Kart
 * World and Mario Party. Each guess fills a row of real facts (checked against
 * the wikis, src/data/originals/daily-facts.ts): each column says whether it
 * matches the answer, is close, or which way to go (lighter/heavier,
 * earlier/later). After guess 3 a written clue unlocks; on guess 5 the
 * answer's silhouette. Each puzzle walks its own fixed shuffle, so a character
 * doesn't repeat until that roster has cycled. The roster ORDER feeds the
 * shuffle, so never reorder or filter a roster: it would change past answers.
 */

export const MAX_GUESSES = 6;
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-09-29";

/** How a column compares: exact match, an ordered scale (lighter/heavier), or a year (earlier/later, close within 3). */
export type TraitKind = "match" | "ordered" | "year";
export interface TraitDef {
  label: string; short: string; kind: TraitKind; order?: string[];
  /** How the free starter clue says this column (only broad columns have one). */
  starter?: (value: string | number) => string;
  /** The starter as a short tag for the share text (default: the value). */
  starterTag?: (value: string | number) => string;
  /** Ordered columns: what up and down mean (default heavier / lighter). */
  dirWords?: [string, string];
}
export type TraitValue = string | number | null;

export interface DailyCharacter {
  name: string;
  img: string;
  /** One value per puzzle trait, in the puzzle's trait order. */
  traits: TraitValue[];
  /** The written clue that unlocks after guess 3. */
  clue: string | null;
}

export interface DailyPuzzle {
  id: string;
  /** The game, as players know it. */
  game: string;
  /** The columns shown after each guess. */
  traits: TraitDef[];
  characters: DailyCharacter[];
  /** Seed for this puzzle's answer order. */
  seed: number;
  /** Columns the free starter clue may give away: broad ones only, never species or exact years. */
  starter: number[];
}

const WEIGHT: TraitDef = { label: "Weight class", short: "Weight", kind: "ordered", order: ["Light", "Medium", "Heavy"], starter: (v) => `Today's character is in the ${v} weight class.` };
const SPECIES: TraitDef = { label: "Species", short: "Species", kind: "match" };
const SERIES: TraitDef = { label: "First series", short: "Series", kind: "match", starter: (v) => `Today's character first appeared in a ${v} game.` };
const DEBUT: TraitDef = { label: "Debut year", short: "Debut", kind: "year" };
const KART_DEBUT: TraitDef = { label: "Mario Kart debut", short: "Kart debut", kind: "year" };
const PARTY_DEBUT: TraitDef = { label: "Mario Party debut", short: "Party debut", kind: "year" };
const SUPERSTARS_COL: TraitDef = { label: "In Superstars", short: "Superstars", kind: "match", starter: (v) => (v === "Yes" ? "Today's character is playable in Mario Party Superstars too." : "Today's character isn't playable in Mario Party Superstars."), starterTag: (v) => (v === "Yes" ? "In Superstars" : "Not in Superstars") };

const FIRST_SMASH_NAMES: Record<string, string> = {
  "64": "the original Super Smash Bros. on the N64",
  "Melee": "Super Smash Bros. Melee",
  "Brawl": "Super Smash Bros. Brawl",
  "Smash 4": "Super Smash Bros. for 3DS / Wii U",
  "Ultimate": "Super Smash Bros. Ultimate",
};
const SMASH_SERIES: TraitDef = { label: "Series", short: "Series", kind: "match" };
const FIRST_SMASH: TraitDef = {
  label: "First Smash", short: "First Smash", kind: "ordered", order: ["64", "Melee", "Brawl", "Smash 4", "Ultimate"], dirWords: ["later", "earlier"],
  starter: (v) => `Today's fighter was first playable in ${FIRST_SMASH_NAMES[String(v)] ?? v}.`,
  starterTag: (v) => (v === "64" ? "Smash 64" : String(v)),
};
const SMASH_WEIGHT: TraitDef = { ...WEIGHT, starter: (v) => `Today's fighter is in the ${v} weight class.` };
const THIRD_PARTY: TraitDef = { label: "Third party", short: "3rd party", kind: "match" };

function facts(name: string): CharacterFacts | null {
  return DAILY_FACTS[name] ?? null;
}

type KartChar = { name: string; img: string; weight: string };

const superstarsNames = new Set(SUPERSTARS.characters.map((c) => c.name));

export const PUZZLES: Record<string, DailyPuzzle> = {
  "mk8dx-character": {
    id: "mk8dx-character",
    game: "Mario Kart 8 Deluxe",
    traits: [WEIGHT, SPECIES, SERIES, DEBUT, KART_DEBUT],
    characters: (mk8dx as { characters: KartChar[] }).characters.map((c) => {
      const f = facts(c.name);
      return { name: c.name, img: c.img, clue: f?.clue ?? null, traits: [c.weight, f?.species ?? null, f?.series ?? null, f?.debutYear ?? null, f?.kartDebutYear ?? null] };
    }),
    seed: 20260929,
    starter: [0, 2],
  },
  "mkworld-character": {
    id: "mkworld-character",
    game: "Mario Kart World",
    traits: [WEIGHT, SPECIES, SERIES, DEBUT, KART_DEBUT],
    characters: (mkworld as { characters: KartChar[] }).characters.map((c) => {
      const f = facts(c.name);
      return { name: c.name, img: c.img, clue: f?.clue ?? null, traits: [c.weight, f?.species ?? null, f?.series ?? null, f?.debutYear ?? null, f?.kartDebutYear ?? null] };
    }),
    seed: 20261001,
    starter: [0, 2],
  },
  "party-character": {
    id: "party-character",
    game: "Mario Party",
    traits: [SPECIES, SERIES, DEBUT, PARTY_DEBUT, SUPERSTARS_COL],
    characters: JAMBOREE.characters.map((c) => {
      const f = facts(c.name);
      return {
        name: c.name,
        img: `${JAMBOREE.assetBase}${c.img}`,
        clue: f?.clue ?? null,
        traits: [f?.species ?? null, f?.series ?? null, f?.debutYear ?? null, f?.partyDebutYear ?? null, superstarsNames.has(c.name) ? "Yes" : "No"],
      };
    }),
    seed: 20261002,
    starter: [1, 4],
  },
  "smash-fighter": {
    id: "smash-fighter",
    game: "Smash Ultimate",
    traits: [SMASH_SERIES, FIRST_SMASH, DEBUT, SMASH_WEIGHT, THIRD_PARTY],
    characters: ULTIMATE.fighters.map((f) => {
      const x = SMASH_FACTS[f.name];
      return {
        name: f.name,
        img: `${ULTIMATE.assetBase}${f.img}`,
        clue: x?.clue ?? null,
        traits: [x?.series ?? null, x?.firstSmash ?? null, x?.debutYear ?? null, x ? smashWeightClass(x.weight) : null, x ? (x.thirdParty ? "Yes" : "No") : null],
      };
    }),
    seed: 20261015,
    starter: [1, 3],
  },
};

/**
 * The puzzle for each UTC weekday, Sunday first, in eras by start day. Only ever
 * append an era with a start day that hasn't been played yet: a day's puzzle, and
 * so its answer, must never change once it has run.
 */
const ROTATIONS: { from: string; days: string[] }[] = [
  {
    from: DAILY_EPOCH, // Mario Kart 8 Deluxe gets three days as the flagship.
    days: ["mk8dx-character", "mk8dx-character", "mkworld-character", "party-character", "mk8dx-character", "mkworld-character", "party-character"],
  },
  {
    // Smash Ultimate takes Thursday. Only Thursdays change, so the first changed
    // day is Thu Oct 15: this must be live before then, or move the date.
    from: "2026-10-12",
    days: ["mk8dx-character", "mk8dx-character", "mkworld-character", "party-character", "smash-fighter", "mkworld-character", "party-character"],
  },
];

/** The rotation in effect on a day. */
export function rotationFor(day: string): string[] {
  let days = ROTATIONS[0].days;
  for (const r of ROTATIONS) if (r.from <= day) days = r.days;
  return days;
}

/** Today's rotation (kept for callers that show the week). */
export const ROTATION: string[] = rotationFor(new Date().toISOString().slice(0, 10));

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
  return PUZZLES[rotationFor(day)[new Date(dayMs(day)).getUTCDay()]];
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
  // Walked day by day so a later rotation era never renumbers earlier runs.
  let n = 0;
  if (days >= 1) {
    for (let d = 0; d < days; d++) if (puzzleFor(addDays(DAILY_EPOCH, d)).id === p.id) n += 1;
  } else {
    n = days; // before launch (only in tests): any stable index will do
  }
  const list = shuffled(p);
  return list[(((n - 1) % list.length) + list.length) % list.length];
}

export interface StarterClue { trait: number; label: string; short: string; value: string | number; sentence: string; tag: string }

/**
 * The free fact everyone gets before guess one: one broad column of today's
 * answer, picked by the day so it's the same for everyone (results stay comparable).
 */
export function starterFor(day: string): StarterClue | null {
  const p = puzzleFor(day);
  const a = answerFor(day);
  const n = p.starter.length;
  for (let k = 0; k < n; k++) {
    const trait = p.starter[(puzzleNumber(day) + k) % n];
    const def = p.traits[trait];
    const value = a.traits[trait];
    if (value !== null && def.starter) return { trait, label: def.label, short: def.short, value, sentence: def.starter(value), tag: def.starterTag ? def.starterTag(value) : String(value) };
  }
  return null;
}

/** One column of a guess: match, close (years within 3), or miss, and for ordered/year columns which way the answer is. */
export interface TraitCell {
  value: TraitValue;
  status: "match" | "close" | "miss";
  /** ordered: "up" = the answer is heavier; year: "up" = the answer is later. */
  dir: "up" | "down" | null;
}

export interface GuessHint {
  name: string;
  correct: boolean;
  cells: TraitCell[];
}

/** Guesses after which the clue and the silhouette unlock. */
export const CLUE_AFTER = 3;
export const SILHOUETTE_AFTER = 4;
const CLOSE_YEARS = 3;

export function compareTrait(def: TraitDef, guess: TraitValue, answer: TraitValue): TraitCell {
  if (guess === null || answer === null) return { value: guess, status: guess === answer ? "match" : "miss", dir: null };
  if (guess === answer) return { value: guess, status: "match", dir: null };
  if (def.kind === "year" && typeof guess === "number" && typeof answer === "number") {
    return { value: guess, status: Math.abs(guess - answer) <= CLOSE_YEARS ? "close" : "miss", dir: answer > guess ? "up" : "down" };
  }
  if (def.kind === "ordered" && def.order) {
    const gi = def.order.indexOf(String(guess)), ai = def.order.indexOf(String(answer));
    if (gi >= 0 && ai >= 0) return { value: guess, status: "miss", dir: ai > gi ? "up" : "down" };
  }
  return { value: guess, status: "miss", dir: null };
}

export function hintFor(guess: string, answer: DailyCharacter, puzzle: DailyPuzzle): GuessHint | null {
  const g = puzzle.characters.find((c) => c.name === guess);
  if (!g) return null;
  return {
    name: g.name,
    correct: g.name === answer.name,
    cells: puzzle.traits.map((def, i) => compareTrait(def, g.traits[i], answer.traits[i])),
  };
}

/** The shareable result: one row per guess (each column, then the answer). */
export function shareText(day: string, hints: GuessHint[], solved: boolean): string {
  const sq = (c: TraitCell) => (c.status === "match" ? "🟩" : c.status === "close" ? "🟨" : "⬛");
  const rows = hints.map((h) => `${h.cells.map(sq).join("")}${h.correct ? "🏁" : "❌"}`);
  const starter = starterFor(day);
  return [`The Daily Shuffle #${puzzleNumber(day)} · ${puzzleFor(day).game} ${solved ? hints.length : "X"}/${MAX_GUESSES}`, ...(starter ? [`Started from ${starter.tag}`] : []), ...rows, "gameshuffle.co/daily"].join("\n");
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
