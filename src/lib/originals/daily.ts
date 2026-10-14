import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { DAILY_FACTS, PARTY_GAMES_PLAYED, type CharacterFacts } from "@/data/originals/daily-facts";
import { SMASH_FACTS, smashWeightClass } from "@/data/originals/daily-facts-smash";
import { DAILY_CLUES } from "@/data/originals/daily-clues";
import { ULTIMATE } from "@/data/smash/ultimate";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { heroArt } from "@/lib/heroes/art";
import type { HeroGame } from "@/lib/heroes/types";
import { OVERWATCH_FACTS, RIVALS_FACTS } from "@/data/originals/daily-facts-heroes";
import { ALLSTARS_NODS, ALLSTARS_ROSTER, DEBUT_GAME_SAY, DEBUT_PLATFORM, FIRST_KART_OVERRIDE, FIRST_SMASH_OVERRIDE, KART_FACTS_KEY, PLATFORM_GENERATION, PLATFORM_PHRASE, SERIES_GROUP } from "@/data/originals/daily-allstars";
import { gsDay } from "@/lib/time/gsClock";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's character in six
 * tries. Pure and client-safe; the same answer for everyone on a given Pacific
 * day (a new puzzle at midnight Pacific, src/lib/time/gsClock.ts).
 *
 * The game rotates by weekday (ROTATIONS, in dated eras): Mario Kart 8
 * Deluxe, Mario Kart World, Mario Party and Smash. The Overwatch and Marvel
 * Rivals puzzles are built but unscheduled until an era adds them (preview
 * with /daily?puzzle=overwatch-hero in dev). Each guess fills a row of real facts (checked against
 * the wikis, src/data/originals/daily-facts.ts): each column says whether it
 * matches the answer or is close. Harder rules from 2026-10-14 (Britton's
 * picks, https://claude.ai/artifact/DEgSfQBjJGEf6TAxgWfpvT): no free starter
 * column, no arrows (compareTrait still works out the direction for break
 * mode, the Daily never shows it), a broad written clue after guess 4 and the
 * answer's silhouette on the last guess only. Each puzzle walks its own fixed shuffle, so a character
 * doesn't repeat until that roster has cycled. The roster ORDER feeds the
 * shuffle, so never reorder or filter a roster: it would change past answers.
 */

/** The most guesses any puzzle allows (All-Stars: 5 plus the Last chance). Per puzzle: guessLimits(). */
export const MAX_GUESSES = 6;
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-09-29";

/** How a column compares: exact match, an ordered scale (lighter/heavier), a year (earlier/later, close within 3), or a count (more/fewer). */
export type TraitKind = "match" | "ordered" | "year" | "count";
export interface TraitDef {
  label: string; short: string; kind: TraitKind; order?: string[];
  /** How the free starter clue says this column (only broad columns have one); null skips a value. */
  starter?: (value: string | number) => string | null;
  /** The starter as a short tag for the share text (default: the value). */
  starterTag?: (value: string | number) => string;
  /** Ordered columns: what up and down mean (default heavier / lighter). */
  dirWords?: [string, string];
  /** Year and count columns: how far apart still counts as close (default 3).
   *  Ordered columns: how many steps apart counts as close (default none). */
  within?: number;
  /** Match columns: values that count as close (same region, a related species). */
  near?: (guess: string, answer: string) => boolean;
}
export type TraitValue = string | number | null;

export interface DailyCharacter {
  name: string;
  img: string;
  /** One value per puzzle trait, in the puzzle's trait order. */
  traits: TraitValue[];
  /** The written clue that unlocks after guess 3. */
  clue: string | null;
  /** Hints that unlock as the guesses go (All-Stars): `after` = guesses made before it shows. */
  ladder?: LadderHint[];
}

export interface LadderHint { after: number; text: string }

export interface DailyPuzzle {
  id: string;
  /** The game, as players know it. */
  game: string;
  /** The columns shown after each guess. */
  traits: TraitDef[];
  characters: DailyCharacter[];
  /** Seed for this puzzle's answer order. */
  seed: number;
  /** Columns the free starter clue may give away: broad ones only, never species or exact years. Unused while STARTER_CLUE is off. */
  starter: number[];
  /** The columns the Daily shows, by index into traits (default: all). The rest stay for break mode and trivia. */
  play?: number[];
  /** What's guessed ("character", "fighter", "hero"). Default "character". */
  noun?: string;
  /** What yellow means, for the legend and How it works. Default "within 3 years". */
  closeNote?: string;
  /** What the arrows mean. Default "↑ heavier or later · ↓ lighter or earlier". */
  arrowNote?: string;
  /** The late hint: the answer's silhouette (default), or a blurred portrait when the art fills its square. */
  reveal?: "silhouette" | "blur";
  /** Guesses in the main game (default 6). */
  guesses?: number;
  /** One more guess after the main game, with the silhouette: keeps a streak, isn't a win. */
  lastChance?: boolean;
  /** Don't show the game's name to players (one big pool has no single game). */
  hideGame?: boolean;
}

/** The main game's guesses, and the total with the Last chance. */
export function guessLimits(p: DailyPuzzle): { main: number; total: number } {
  const main = p.guesses ?? MAX_GUESSES;
  return { main, total: main + (p.lastChance ? 1 : 0) };
}
/** The game's name as players see it, or null when the puzzle doesn't show one. */
export function puzzleLabel(p: DailyPuzzle): string | null {
  return p.hideGame ? null : p.game;
}
/** Guesses made before the silhouette shows: the Last chance, or the last guess. */
export function silhouetteAfter(p: DailyPuzzle): number {
  const { main } = guessLimits(p);
  return p.lastChance ? main : main - 1;
}
/** The hints showing after `made` guesses. */
export function ladderShown(c: DailyCharacter, made: number): LadderHint[] {
  return (c.ladder ?? []).filter((h) => h.after <= made);
}

const WEIGHT: TraitDef = { label: "Weight class", short: "Weight", kind: "ordered", order: ["Light", "Medium", "Heavy"], starter: (v) => `Today's character is in the ${v} weight class.` };
const DEBUT: TraitDef = { label: "Debut year", short: "Debut", kind: "year" };

// Mario Kart: crew, the first Mario Kart by name, and a per-game fourth column.
const CREW_STARTER: Record<string, string | null> = {
  "Mario's crew": "Today's character is one of Mario's crew.",
  "Bowser's crew": "Today's character is one of Bowser's crew.",
  Kongs: "Today's character is a Kong.",
  "Wario & Waluigi": null, // two names: that's nearly the answer
  Guests: "Today's character is a guest from another series.",
  "Everyone else": "Today's character isn't in Mario's, Bowser's or anyone else's crew.",
};
const CREW: TraitDef = { label: "Crew", short: "Crew", kind: "match", starter: (v) => CREW_STARTER[String(v)] ?? null };

/** Every Mario Kart in release order, as the column shows it, and in full for sentences. */
export const KART_GAMES = ["Super Mario Kart", "64", "Super Circuit", "Double Dash", "DS", "Wii", "7", "8", "8 Deluxe", "Tour", "World"] as const;
export const KART_GAME_NAMES: Record<string, string> = {
  "Super Mario Kart": "Super Mario Kart", "64": "Mario Kart 64", "Super Circuit": "Mario Kart: Super Circuit",
  "Double Dash": "Mario Kart: Double Dash!!", DS: "Mario Kart DS", Wii: "Mario Kart Wii", "7": "Mario Kart 7",
  "8": "Mario Kart 8", "8 Deluxe": "Mario Kart 8 Deluxe", Tour: "Mario Kart Tour", World: "Mario Kart World",
};
/**
 * The game a kart debut year means (the facts keep the year playable, Tour and
 * DLC included): 2015 is Mario Kart 8's Animal Crossing pack, 2019 to 2023 Tour.
 */
export function firstKart(year: number | null): string | null {
  if (year === null) return null;
  const byYear: Record<number, string> = { 1992: "Super Mario Kart", 1996: "64", 2001: "Super Circuit", 2003: "Double Dash", 2005: "DS", 2008: "Wii", 2011: "7", 2014: "8", 2015: "8", 2017: "8 Deluxe", 2025: "World" };
  if (byYear[year]) return byYear[year];
  return year >= 2019 && year <= 2023 ? "Tour" : null;
}
const FIRST_KART: TraitDef = { label: "First Mario Kart", short: "First MK", kind: "ordered", order: [...KART_GAMES], dirWords: ["later", "earlier"], within: 1 };
/** Racers who are a version of someone else on the 8 Deluxe roster (Baby, Metal, Pink Gold, Tanooki, Cat, Dry, Peachette). */
const KART_VARIANTS = new Set(["Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Baby Rosalina", "Metal Mario", "Pink Gold Peach", "Tanooki Mario", "Cat Peach", "Dry Bowser", "Peachette"]);
const VARIANT: TraitDef = { label: "Variant", short: "Variant", kind: "match" };
const HOME: TraitDef = { label: "Home series", short: "Home", kind: "match" };
const KART_CLOSE = "within 3 years, or the game just before or after";

// Mario Party: crew, how many Mario Party games, the first one by name.
// (Jamboree has no character Dice Blocks: everyone rolls the same 1-10 block.)
const PARTY_GAMES: TraitDef = { label: "Mario Party games", short: "MP games", kind: "count", within: 2, dirWords: ["more", "fewer"] };
/** Every Mario Party in release order, as the column shows it (Mario Party-e and the arcade games aside). */
export const PARTY_GAME_ORDER = ["Mario Party", "Mario Party 2", "Mario Party 3", "Mario Party 4", "Mario Party 5", "Mario Party 6", "Mario Party Advance", "Mario Party 7", "Mario Party 8", "Mario Party DS", "Mario Party 9", "Island Tour", "Mario Party 10", "Star Rush", "The Top 100", "Super Mario Party", "Superstars", "Jamboree"] as const;
/** The game a Mario Party debut year means, for the years the roster uses (2005 is Mario Party 7, 2007 Mario Party 8). */
export function firstParty(year: number | null): string | null {
  if (year === null) return null;
  const byYear: Record<number, string> = { 1998: "Mario Party", 1999: "Mario Party 2", 2000: "Mario Party 3", 2002: "Mario Party 4", 2003: "Mario Party 5", 2004: "Mario Party 6", 2005: "Mario Party 7", 2007: "Mario Party 8", 2012: "Mario Party 9", 2013: "Island Tour", 2015: "Mario Party 10", 2016: "Star Rush", 2017: "The Top 100", 2018: "Super Mario Party", 2021: "Superstars", 2024: "Jamboree" };
  return byYear[year] ?? null;
}
const FIRST_PARTY: TraitDef = { label: "First Mario Party", short: "First MP", kind: "ordered", order: [...PARTY_GAME_ORDER], dirWords: ["later", "earlier"], within: 1 };
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

// Hero shooters: role, then the facts in daily-facts-heroes.ts.
function roleLabel(game: HeroGame, name: string): string | null {
  const h = game.heroes.find((x) => x.name === name);
  if (!h) return null;
  return game.roles.find((r) => r.id === h.role)?.label ?? (h.role === "all" ? "Every role" : null);
}
const HERO_ROLE = (noun: string): TraitDef => ({
  label: "Role", short: "Role", kind: "match",
  // "a Tank", "a Vanguard", but "a Damage hero" / "a Support hero" (those read as nouns only with "hero").
  starter: (v) => (v === "Every role" ? `Today's ${noun} can play every role.` : `Today's ${noun} is a ${v === "Damage" || v === "Support" ? `${v} ${noun}` : v}.`),
});
const OW_REGION: Record<string, string> = Object.fromEntries(Object.values(OVERWATCH_FACTS).map((f) => [f.origin, f.region]));
const sameGroup = (groups: string[][]) => (a: string, b: string) => groups.some((g) => g.includes(a) && g.includes(b));
const OW_SPECIES: TraitDef = { label: "Species", short: "Species", kind: "match", near: sameGroup([["Human", "Human (cybernetic)"], ["Omnic", "Robot"]]) };
const OW_ORIGIN: TraitDef = { label: "Origin", short: "Origin", kind: "match", near: (a, b) => !!OW_REGION[a] && OW_REGION[a] !== "Unknown" && OW_REGION[a] === OW_REGION[b] };
const OW_AFFILIATION: TraitDef = {
  label: "Affiliation", short: "Group", kind: "match",
  starter: (v) => (v === "Other" ? "Today's hero isn't with Overwatch, Talon or another of the big groups." : `Today's hero is with ${v === "Junkers" || v === "Shambali" ? "the " : ""}${v}.`),
};
const OW_RELEASED: TraitDef = { label: "Released", short: "Released", kind: "year", within: 1 };
const MR_SPECIES: TraitDef = { label: "Species", short: "Species", kind: "match", near: sameGroup([["Human", "Mutate"], ["Mutate", "Mutant"]]) };
const MR_TEAM: TraitDef = {
  label: "Team", short: "Team", kind: "match",
  starter: (v) => (v === "Solo" ? "Today's hero is a solo act." : v === "Villains" ? "Today's hero is a villain." : `Today's hero is one of the ${v}.`),
};
const MR_DEBUT: TraitDef = { label: "Comic debut", short: "Comic debut", kind: "year" };
const SEASONS = ["Launch", "Season 1", "Season 1.5", "Season 2", "Season 2.5", "Season 3", "Season 3.5", "Season 4", "Season 4.5", "Season 5", "Season 5.5", "Season 6", "Season 6.5", "Season 7", "Season 7.5", "Season 8", "Season 8.5", "Season 9", "Season 9.5", "Season 10"];
const MR_JOINED: TraitDef = { label: "Joined", short: "Joined", kind: "ordered", order: SEASONS, dirWords: ["later", "earlier"] };

/** This puzzle's own clue (about this game), else the older clue shared across puzzles. */
function clueFor(puzzle: string, name: string, shared: string | null | undefined): string | null {
  return DAILY_CLUES[puzzle]?.[name] ?? shared ?? null;
}

function facts(name: string): CharacterFacts | null {
  return DAILY_FACTS[name] ?? null;
}

type KartChar = { name: string; img: string; weight: string };

const superstarsNames = new Set(SUPERSTARS.characters.map((c) => c.name));

export const PUZZLES: Record<string, DailyPuzzle> = {
  "mk8dx-character": {
    id: "mk8dx-character",
    game: "Mario Kart 8 Deluxe",
    traits: [WEIGHT, CREW, FIRST_KART, VARIANT, DEBUT],
    characters: (mk8dx as { characters: KartChar[] }).characters.map((c) => {
      const f = facts(c.name);
      return { name: c.name, img: c.img, clue: clueFor("mk8dx-character", c.name, f?.clue), traits: [c.weight, f?.crew ?? null, firstKart(f?.kartDebutYear ?? null), KART_VARIANTS.has(c.name) ? "Yes" : "No", f?.debutYear ?? null] };
    }),
    seed: 20260929,
    starter: [0, 1],
    closeNote: KART_CLOSE,
  },
  "mkworld-character": {
    id: "mkworld-character",
    game: "Mario Kart World",
    traits: [WEIGHT, CREW, FIRST_KART, HOME, DEBUT],
    characters: (mkworld as { characters: KartChar[] }).characters.map((c) => {
      const f = facts(c.name);
      return { name: c.name, img: c.img, clue: clueFor("mkworld-character", c.name, f?.clue), traits: [c.weight, f?.crew ?? null, firstKart(f?.kartDebutYear ?? null), f?.home ?? null, f?.debutYear ?? null] };
    }),
    seed: 20261001,
    starter: [0, 1],
    closeNote: KART_CLOSE,
  },
  "party-character": {
    id: "party-character",
    game: "Mario Party",
    traits: [CREW, PARTY_GAMES, FIRST_PARTY, SUPERSTARS_COL, DEBUT],
    characters: JAMBOREE.characters.map((c) => {
      const f = facts(c.name);
      return {
        name: c.name,
        img: `${JAMBOREE.assetBase}${c.img}`,
        clue: clueFor("party-character", c.name, f?.clue),
        traits: [f?.crew ?? null, PARTY_GAMES_PLAYED[c.name] ?? null, firstParty(f?.partyDebutYear ?? null), superstarsNames.has(c.name) ? "Yes" : "No", f?.debutYear ?? null],
      };
    }),
    seed: 20261002,
    starter: [0, 3],
    // Debut stays in the facts for break mode; the Daily plays Mario Party on four columns.
    play: [0, 1, 2, 3],
    closeNote: "within 2 games, or the game just before or after",
    arrowNote: "↑ more or later · ↓ fewer or earlier",
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
        clue: clueFor("smash-fighter", f.name, x?.clue),
        traits: [x?.series ?? null, x?.firstSmash ?? null, x?.debutYear ?? null, x ? smashWeightClass(x.weight) : null, x ? (x.thirdParty ? "Yes" : "No") : null],
      };
    }),
    seed: 20261015,
    starter: [1, 3],
    noun: "fighter",
  },
  // Not in the rotation yet: add an era with a future start day to schedule them.
  "overwatch-hero": {
    id: "overwatch-hero",
    game: "Overwatch",
    traits: [HERO_ROLE("hero"), OW_SPECIES, OW_ORIGIN, OW_AFFILIATION, OW_RELEASED],
    characters: Object.entries(OVERWATCH_FACTS).map(([name, f]) => ({
      name, img: heroArt(OVERWATCH.slug, name), clue: f.clue,
      traits: [roleLabel(OVERWATCH, name), f.species, f.origin, f.affiliation, f.released],
    })),
    seed: 20261007,
    starter: [0, 3],
    noun: "hero",
    closeNote: "same continent, a related species, or within a year",
    arrowNote: "↑ later · ↓ earlier",
    reveal: "blur",
  },
  "rivals-hero": {
    id: "rivals-hero",
    game: "Marvel Rivals",
    traits: [HERO_ROLE("hero"), MR_SPECIES, MR_TEAM, MR_DEBUT, MR_JOINED],
    characters: Object.entries(RIVALS_FACTS).map(([name, f]) => ({
      name, img: heroArt(MARVEL_RIVALS.slug, name), clue: f.clue,
      traits: [roleLabel(MARVEL_RIVALS, name), f.species, f.team, f.comicDebut, f.joined],
    })),
    seed: 20261008,
    starter: [0, 2],
    noun: "hero",
    closeNote: "a related species or within 3 years",
    arrowNote: "↑ later · ↓ earlier",
    reveal: "blur",
  },
};

/**
 * The puzzle for each weekday of the (Pacific) calendar day, Sunday first, in eras by start day. Only ever
 * append an era with a start day that hasn't been played yet: a day's puzzle, and
 * so its answer, must never change once it has run.
 */

// ─── All-Stars: one big pool (src/data/originals/daily-allstars.ts) ─────────────
const AS_SERIES: TraitDef = { label: "Series", short: "Series", kind: "match" };
const AS_PLATFORM: TraitDef = {
  label: "Debut console", short: "Console", kind: "match",
  near: (g, a) => (PLATFORM_GENERATION[g] ?? []).some((x) => (PLATFORM_GENERATION[a] ?? []).includes(x)),
};
const AS_SMASH: TraitDef = { label: "First Smash", short: "First Smash", kind: "ordered", order: ["64", "Melee", "Brawl", "Smash 4", "Ultimate"], within: 1 };
const AS_KART: TraitDef = { label: "First Mario Kart", short: "First MK", kind: "ordered", order: [...KART_GAMES], within: 1 };

const tidy = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
/** The debut game for the last fact hint, unless its title gives the name away. */
function debutGameHint(name: string, game: string): string {
  const said = DEBUT_GAME_SAY[game];
  if (said) return `Debuted in ${said.replace(/\.$/, "")}.`;
  const n = tidy(name).replace(/s$/, ""), g = tidy(game.replace(/\s*\(.*\)\s*/g, " "));
  if (n && (g.includes(n) || n.includes(g))) return "Debuted in a game named after them.";
  return `Debuted in ${game.replace(/\.$/, "")}.`;
}

function buildAllStars(): DailyPuzzle {
  const art = (id: string) => new Map(PUZZLES[id].characters.map((c) => [c.name, c.img]));
  const smashArt = art("smash-fighter"), worldArt = art("mkworld-character"), dxArt = art("mk8dx-character"), partyArt = art("party-character");
  const characters: DailyCharacter[] = ALLSTARS_ROSTER.map((e) => {
    const key = e.key ?? e.name;
    const sm = e.src === "smash" ? SMASH_FACTS[e.name] : null;
    const kf = e.src === "smash" ? (e.name in KART_FACTS_KEY ? (KART_FACTS_KEY[e.name] ? DAILY_FACTS[KART_FACTS_KEY[e.name]!] : null) : DAILY_FACTS[e.name]) : DAILY_FACTS[key];
    const series = sm ? sm.series : kf ? (SERIES_GROUP[kf.series] ?? kf.series) : null;
    const debutGame = sm ? sm.debutGame : kf?.debutGame ?? null;
    const debutYear = sm ? sm.debutYear : kf?.debutYear ?? null;
    const platform = debutGame ? DEBUT_PLATFORM[debutGame] ?? null : null;
    const firstSmash = sm ? sm.firstSmash : FIRST_SMASH_OVERRIDE[e.name] ?? "Never";
    const kart = FIRST_KART_OVERRIDE[e.name] ?? firstKart(kf?.kartDebutYear ?? null) ?? "Never";
    // Mario Kart 8 Deluxe's cutouts first: World's newer racers come as framed cards.
    const img = e.src === "smash" ? smashArt.get(e.name) : dxArt.get(key) ?? worldArt.get(key) ?? partyArt.get(key);
    const nods = ALLSTARS_NODS[e.name] ?? [];
    const ladder: LadderHint[] = [
      ...nods.map((text, i) => ({ after: i, text })),
      ...(debutYear && platform ? [{ after: 3, text: `Debuted in ${debutYear} ${PLATFORM_PHRASE[platform] ?? `on ${platform}`}.` }] : []),
      ...(debutGame ? [{ after: 4, text: debutGameHint(e.name, debutGame) }] : []),
    ];
    return { name: e.name, img: img ?? "", clue: null, ladder, traits: [series, debutYear, platform, firstSmash, kart] };
  });
  return {
    id: "allstars",
    game: "All-Stars",
    hideGame: true,
    traits: [AS_SERIES, DEBUT, AS_PLATFORM, AS_SMASH, AS_KART],
    characters,
    seed: 20261019,
    starter: [],
    guesses: 5,
    lastChance: true,
    closeNote: "a debut within 3 years, the same console generation, or the game just before or after",
  };
}
PUZZLES["allstars"] = buildAllStars();

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
  {
    // All-Stars every day (Britton, 2026-10-14): one pool of 130 characters
    // instead of a game a day. Starts the day after it shipped, so every
    // earlier answer stays exactly as it was.
    from: "2026-10-15",
    days: ["allstars", "allstars", "allstars", "allstars", "allstars", "allstars", "allstars"],
  },
];

/** The rotation in effect on a day. */
export function rotationFor(day: string): string[] {
  let days = ROTATIONS[0].days;
  for (const r of ROTATIONS) if (r.from <= day) days = r.days;
  return days;
}

/** Today's rotation (kept for callers that show the week). */
export const ROTATION: string[] = rotationFor(gsDay());

/** Today's puzzle day: the Pacific calendar day (a new puzzle at midnight Pacific). */
export function dayKey(d: Date = new Date()): string {
  return gsDay(d);
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

/** Dev only: play a puzzle every day (`/daily?puzzle=overwatch-hero`), for trying one before it's scheduled. */
let previewId: string | null = null;
export function previewPuzzle(id: string | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  previewId = id && PUZZLES[id] ? id : null;
  return !!previewId;
}

export function puzzleFor(day: string): DailyPuzzle {
  if (previewId) return PUZZLES[previewId];
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

const STARTER_MIN_SHARED = 4;

export interface StarterClue { trait: number; label: string; short: string; value: string | number; sentence: string; tag: string }

/**
 * The free fact everyone gets before guess one: one broad column of today's
 * answer, picked by the day so it's the same for everyone (results stay comparable).
 */
export function starterFor(day: string): StarterClue | null {
  if (!STARTER_CLUE) return null;
  const p = puzzleFor(day);
  const a = answerFor(day);
  const n = p.starter.length;
  for (let k = 0; k < n; k++) {
    const trait = p.starter[(puzzleNumber(day) + k) % n];
    const def = p.traits[trait];
    const value = a.traits[trait];
    if (value === null || !def.starter) continue;
    // A free column should narrow things down, not name the answer: skip values fewer than 4 share.
    if (p.characters.filter((c) => c.traits[trait] === value).length < STARTER_MIN_SHARED) continue;
    const sentence = def.starter(value);
    if (sentence) return { trait, label: def.label, short: def.short, value, sentence, tag: def.starterTag ? def.starterTag(value) : String(value) };
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

/** Guesses after which the clue and the silhouette unlock (the silhouette is for the last guess only). */
export const CLUE_AFTER = 4;
export const SILHOUETTE_AFTER = MAX_GUESSES - 1;
/** The free starter column before guess 1 (off since 2026-10-14: it gave away two thirds of the roster). */
export const STARTER_CLUE = false;
/** The written clue (off from 2026-10-14 until the clue ladder arrives: the old clues each fit one character). */
export const WRITTEN_CLUE = false;
const CLOSE_YEARS = 3;
export const DEFAULT_CLOSE_NOTE = "within 3 years";
export const DEFAULT_ARROW_NOTE = "↑ heavier or later · ↓ lighter or earlier";

/** The columns this puzzle shows in the Daily. */
export function playColumns(puzzle: DailyPuzzle): number[] {
  return puzzle.play ?? puzzle.traits.map((_, i) => i);
}
export function playTraits(puzzle: DailyPuzzle): TraitDef[] {
  return playColumns(puzzle).map((i) => puzzle.traits[i]);
}

export function compareTrait(def: TraitDef, guess: TraitValue, answer: TraitValue): TraitCell {
  if (guess === null || answer === null) return { value: guess, status: guess === answer ? "match" : "miss", dir: null };
  if (guess === answer) return { value: guess, status: "match", dir: null };
  if ((def.kind === "year" || def.kind === "count") && typeof guess === "number" && typeof answer === "number") {
    return { value: guess, status: Math.abs(guess - answer) <= (def.within ?? CLOSE_YEARS) ? "close" : "miss", dir: answer > guess ? "up" : "down" };
  }
  if (def.kind === "ordered" && def.order) {
    const gi = def.order.indexOf(String(guess)), ai = def.order.indexOf(String(answer));
    if (gi >= 0 && ai >= 0) return { value: guess, status: def.within && Math.abs(ai - gi) <= def.within ? "close" : "miss", dir: ai > gi ? "up" : "down" };
  }
  if (def.near && def.near(String(guess), String(answer))) return { value: guess, status: "close", dir: null };
  return { value: guess, status: "miss", dir: null };
}

export function hintFor(guess: string, answer: DailyCharacter, puzzle: DailyPuzzle): GuessHint | null {
  const g = puzzle.characters.find((c) => c.name === guess);
  if (!g) return null;
  return {
    name: g.name,
    correct: g.name === answer.name,
    cells: playColumns(puzzle).map((i) => compareTrait(puzzle.traits[i], g.traits[i], answer.traits[i])),
  };
}

/** The shareable result: one row per guess (each column, then the answer). */
export function shareText(day: string, hints: GuessHint[], solved: boolean): string {
  const p = puzzleFor(day);
  const { main } = guessLimits(p);
  const sq = (c: TraitCell) => (c.status === "match" ? "🟩" : c.status === "close" ? "🟨" : "⬛");
  // The Last chance row ends in a ring buoy instead of the flag.
  const rows = hints.map((h, i) => `${h.cells.map(sq).join("")}${h.correct ? (i >= main ? "🛟" : "🏁") : "❌"}`);
  const starter = starterFor(day);
  const label = puzzleLabel(p);
  const score = !solved ? `X/${main}` : hints.length > main ? "saved on the last chance" : `${hints.length}/${main}`;
  return [`The Daily Shuffle #${puzzleNumber(day)}${label ? ` · ${label}` : ""} ${score}`, ...(starter ? [`Started from ${starter.tag}`] : []), ...rows, "gameshuffle.co/daily"].join("\n");
}

/**
 * Checks a finished game against the day's answer, so an account result can't
 * be made up: the guesses must be real, distinct characters from the day's
 * puzzle, and the game must be over (solved, or out of guesses). Null if it
 * isn't a finished game.
 */
export function judgeGame(day: string, guesses: string[]): { guesses: number; solved: boolean } | null {
  const { total } = guessLimits(puzzleFor(day));
  if (!Array.isArray(guesses) || guesses.length < 1 || guesses.length > total) return null;
  if (new Set(guesses).size !== guesses.length) return null;
  const roster = puzzleFor(day).characters;
  if (!guesses.every((g) => roster.some((c) => c.name === g))) return null;
  const answer = answerFor(day).name;
  const at = guesses.indexOf(answer);
  if (at >= 0 && at !== guesses.length - 1) return null; // nothing after the right answer
  const solved = at >= 0;
  if (!solved && guesses.length < total) return null;
  return { guesses: guesses.length, solved };
}

export interface DailyStats { played: number; won: number; streak: number; best: number; dist: number[]; /** Solved on the Last chance: keeps the streak, isn't a win. */ saved?: number }

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
  let won = 0, saved = 0;
  for (const [day, r] of byDay) {
    if (!r.solved) continue;
    solvedDays.add(day);
    // A Last chance save keeps the streak going but isn't a win.
    if (r.guesses > guessLimits(puzzleFor(day)).main) { saved += 1; continue; }
    won += 1;
    if (r.guesses >= 1 && r.guesses <= MAX_GUESSES) dist[r.guesses - 1] += 1;
  }
  let streak = 0;
  let d = solvedDays.has(today) ? today : addDays(today, -1);
  while (solvedDays.has(d)) { streak += 1; d = addDays(d, -1); }
  let best = 0, run = 0, last: string | null = null;
  for (const day of [...solvedDays].sort()) {
    run = last && addDays(day, -1) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return { played: byDay.size, won, streak, best, dist, saved };
}
