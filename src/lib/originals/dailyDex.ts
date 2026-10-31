import { DEX_ROWS } from "@/data/originals/daily-dex-facts";
import { DEX_NODS } from "@/data/originals/daily-dex-nods";
import { DEX_DEBUT, DEX_GEN_DEFAULTS, DEX_REGION } from "@/data/originals/daily-dex";
import { DEX_EPOCH, DEX_PUZZLE_ID, answerFor, puzzleNumber, type DailyCharacter, type DailyPuzzle, type DailySchedule, type LadderHint, type TraitDef } from "@/lib/originals/daily";

/**
 * The Daily Dex (a GameShuffle Original): guess today's Pokémon from all
 * 1,025. Britton's picks, 2026-10-16 (https://claude.ai/artifact/6aZh3NmUmLk85Y7gQzq9Uk):
 * any Pokémon can be the answer, arrows on generation, height and weight, five
 * guesses and a last chance that shows the name's first letter and length
 * (no art, no silhouettes: the Pokémon imagery rule), its own streak.
 *
 * Same engine as the Daily Shuffle (src/lib/originals/daily.ts) on its own
 * calendar (DEX), so the Shuffle's answers never move. Facts come from
 * PokeAPI's open data (scripts/build-daily-dex.ts), the nods are ours
 * (src/data/originals/daily-dex-nods.ts). The roster is National Pokédex
 * order and feeds the answer shuffle: new Pokémon only go on the end.
 */

export { DEX_EPOCH };

const TYPE_SEP = " / ";
const typeSet = (v: string) => new Set(v.split(TYPE_SEP));

const GEN: TraitDef = { label: "Generation", short: "Gen", kind: "count", within: 1, dirWords: ["newer", "older"] };
const TYPES: TraitDef = {
  label: "Types", short: "Types", kind: "match",
  same: (g, a) => { const x = typeSet(g), y = typeSet(a); return x.size === y.size && [...x].every((t) => y.has(t)); },
  near: (g, a) => { const y = typeSet(a); return [...typeSet(g)].some((t) => y.has(t)); },
};
const STAGE_LABEL: Record<string, string> = { Single: "Doesn't evolve", First: "First", Middle: "Middle", Final: "Final" };
const STAGE: TraitDef = { label: "Evolution stage", short: "Stage", kind: "match", format: (v) => STAGE_LABEL[String(v)] ?? String(v) };
const COLOR: TraitDef = { label: "Pokédex color", short: "Color", kind: "match" };
const HEIGHT: TraitDef = { label: "Height", short: "Height", kind: "measure", dirWords: ["taller", "shorter"], format: (v) => `${Number(v).toFixed(1)} m` };
const WEIGHT: TraitDef = { label: "Weight", short: "Weight", kind: "measure", dirWords: ["heavier", "lighter"], format: (v) => `${Number(v).toFixed(1)} kg` };

const letters = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
/** Whether a line spells out the name (Hypno is "the Hypnosis Pokémon", Claydol "the Clay Doll Pokémon"). */
export function namesIt(name: string, text: string): boolean {
  const core = letters(name);
  return core.length >= 4 && letters(text).includes(core);
}

/** The category and region hint, after three misses (just the region when the category spells the name). */
function categoryHint(name: string, genus: string, gen: number): string {
  const region = DEX_REGION[name] ?? DEX_GEN_DEFAULTS[gen].region;
  return namesIt(name, genus) ? `It was first found in ${region}.` : `It's known as the ${genus} Pokémon, first found in ${region}.`;
}
/** The debut game hint, after four misses. */
function debutHint(name: string, gen: number): string {
  return `First appeared in ${DEX_DEBUT[name] ?? DEX_GEN_DEFAULTS[gen].game}.`;
}

function buildDex(): DailyPuzzle {
  const characters: DailyCharacter[] = DEX_ROWS.map(([, name, gen, types, stage, color, height, weight, genus]) => {
    const nods = DEX_NODS[name] ?? [];
    const ladder: LadderHint[] = [
      ...nods.map((text, i) => ({ after: i, text })),
      { after: 3, text: categoryHint(name, genus, gen) },
      { after: 4, text: debutHint(name, gen) },
    ];
    return { name, img: "", clue: null, types, ladder, traits: [gen, types.join(TYPE_SEP), stage, color, height, weight] };
  });
  return {
    id: DEX_PUZZLE_ID,
    game: "Pokémon",
    hideGame: true,
    noun: "Pokémon",
    traits: [GEN, TYPES, STAGE, COLOR, HEIGHT, WEIGHT],
    characters,
    seed: 20261016,
    starter: [],
    guesses: 5,
    lastChance: true,
    reveal: "letters",
    arrows: true,
    closeNote: "one generation apart, a type in common, or a height or weight within 25%",
    arrowNote: "↑ the answer is newer, taller or heavier · ↓ older, shorter or lighter",
  };
}

export const DEX_PUZZLE: DailyPuzzle = buildDex();

export const DEX: DailySchedule = {
  id: "dex",
  title: "The Daily Dex",
  link: "gameshuffle.co/daily-dex",
  epoch: DEX_EPOCH,
  puzzleOn: () => DEX_PUZZLE,
};

/** One square of the last-chance reveal: the first letter, a blank letter, a space between words, or punctuation shown as it is. */
export type RevealCell = { kind: "first"; ch: string } | { kind: "blank" } | { kind: "gap" } | { kind: "mark"; ch: string };

/**
 * The last chance: the name's first letter, then a blank per letter, with
 * spaces and punctuation shown as they are ("P _ _ _ _ _ _", "M _ .  _ _ _ _").
 * Only the very first letter is given, never the start of a second word.
 */
export function letterReveal(name: string): RevealCell[] {
  let first = true;
  return [...name].map((ch): RevealCell => {
    if (/\p{L}/u.test(ch)) {
      if (first) { first = false; return { kind: "first", ch: ch.toUpperCase() }; }
      return { kind: "blank" };
    }
    return ch === " " ? { kind: "gap" } : { kind: "mark", ch };
  });
}

/** How many letters the name has (punctuation and spaces aside), for the reveal's spoken label. */
export function letterCount(name: string): number {
  return [...name].filter((ch) => /\p{L}/u.test(ch)).length;
}

/** Plain letters for searching: "Flabébé" → "Flabebe", "Farfetch’d" → "Farfetch'd", "Nidoran♀" → "Nidoran F". */
export function dexSearchValue(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").replace("♀", " F").replace("♂", " M");
}

/** Today's Daily Dex number and answer. */
export const dexNumber = (day: string) => puzzleNumber(day, DEX);
export const dexAnswer = (day: string) => answerFor(day, DEX);
