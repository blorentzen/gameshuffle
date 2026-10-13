/**
 * The knowledge games, built from the Daily's checked facts (src/lib/originals/
 * daily.ts PUZZLES: Mario Kart, Mario Party, Smash, Overwatch, Marvel Rivals).
 * No AI and nothing to approve: every question is a fact we've already
 * checked, worded by a template for its column.
 *
 *   Higher or Lower   two characters, which is heavier / came first
 *   Odd One Out       three share a fact, one doesn't
 *   Fact or Fiction   a true fact, or the same sentence with another character's value
 *   Closest Guess     the year of a debut, closest scores
 *   Scramble          a one-word name, letters shuffled
 *
 * Questions lean toward the game on stream (just in time) when it has facts.
 */

import { KART_GAME_NAMES, PUZZLES, type DailyCharacter, type DailyPuzzle, type TraitDef } from "@/lib/originals/daily";
import { randomizerPublic } from "@/lib/games-visibility";
import type { BreakOption } from "../types";
import {
  type BreakGame, type MakeContext, type RoundDraft,
  chatLine, choiceKey, closestAwards, count, pick, rightAwards, shuffle, tally,
} from "./common";

/** Which GameShuffle games each fact set belongs to (for "the game on stream"). */
export const PUZZLE_GAMES: Record<string, string[]> = {
  "mk8dx-character": ["mario-kart-8-deluxe"],
  "mkworld-character": ["mario-kart-world"],
  "party-character": ["super-mario-party-jamboree", "mario-party-superstars", "mario-party", "mario-party-2", "mario-party-3"],
  "smash-fighter": ["super-smash-bros-ultimate"],
  "overwatch-hero": ["overwatch"],
  "rivals-hero": ["marvel-rivals"],
};

const SMASH_NAMES: Record<string, string> = { "64": "the first Smash (64)", Melee: "Melee", Brawl: "Brawl", "Smash 4": "Smash 4", Ultimate: "Ultimate" };
/** Crews (the Daily's Mario Kart and Mario Party column) as a sentence says them. */
const CREW_SAID: Record<string, string> = {
  "Mario's crew": "one of Mario's crew", "Bowser's crew": "one of Bowser's crew", Kongs: "a Kong",
  Guests: "a guest from another series", "Everyone else": "not in anyone's crew",
};
const kartName = (v: string | number) => KART_GAME_NAMES[String(v)] ?? String(v);
/** Values that say nothing ("Other", "Unknown", MK8DX's "Any" weight for Miis). */
const NOTHING = new Set(["Other", "Unknown", "Any", "Every role", "Solo"]);

export function publicPuzzles(): DailyPuzzle[] {
  return Object.values(PUZZLES).filter((p) => (PUZZLE_GAMES[p.id] ?? []).some((slug) => randomizerPublic(slug)));
}

/** Fact sets for the game on stream first, then the rest. */
export function puzzleOrder(gameOnStream: string | null): string[] {
  const all = publicPuzzles().map((p) => p.id);
  if (!gameOnStream) return all;
  const own = all.filter((id) => PUZZLE_GAMES[id]?.includes(gameOnStream));
  return [...own, ...all.filter((id) => !own.includes(id))];
}

/** The game on stream most of the time (when it has facts), any game otherwise. */
function choosePuzzle(ctx: MakeContext): DailyPuzzle | null {
  const ids = ctx.puzzles.filter((id) => PUZZLES[id]);
  if (!ids.length) return null;
  const own = ctx.gameOnStream ? ids.filter((id) => PUZZLE_GAMES[id]?.includes(ctx.gameOnStream!)) : [];
  const id = own.length && ctx.rand() < 0.7 ? pick(own, ctx.rand) : pick(ids, ctx.rand);
  return PUZZLES[id];
}

/** "the United States", "the Junkers": places and groups that read with "the". */
const THE = new Set(["United States", "United Kingdom", "Netherlands", "Philippines", "Junkers", "Shambali"]);
const the = (v: string) => (THE.has(v) ? `the ${v}` : v);

const usable = (v: unknown): v is string | number => v !== null && v !== undefined && v !== "" && !NOTHING.has(String(v));
const option = (key: string, c: DailyCharacter, sub?: string): BreakOption => ({ key, label: c.name, img: c.img || null, ...(sub ? { sub } : {}) });

/** A year or a count, or the position on an ordered scale (weight class, first Smash, season joined). */
function rank(t: TraitDef, v: string | number): number | null {
  if (t.kind === "year" || t.kind === "count") return typeof v === "number" ? v : Number(v);
  if (t.kind === "ordered" && t.order) {
    const i = t.order.indexOf(String(v));
    return i >= 0 ? i : null;
  }
  return null;
}

/** Up to `tries` attempts at a round whose key this channel hasn't seen. */
function attempt(tries: number, make: () => RoundDraft | null, ctx: MakeContext): RoundDraft | null {
  for (let i = 0; i < tries; i += 1) {
    const d = make();
    if (d && (!d.key || !ctx.skip(d.key))) return d;
  }
  return null;
}

// ─── Higher or Lower ─────────────────────────────────────────────────────────

const HOL: Record<string, { ask: (game: string) => string; high: boolean; said: (v: string | number) => string }> = {
  "Debut year": { ask: () => "Which one debuted first?", high: false, said: (v) => String(v) },
  "First Mario Kart": { ask: () => "Which one raced in Mario Kart first?", high: false, said: kartName },
  "First Mario Party": { ask: () => "Which one joined Mario Party first?", high: false, said: (v) => String(v) },
  "Mario Party games": { ask: () => "Which one is playable in more Mario Party games?", high: true, said: (v) => `${v} game${Number(v) === 1 ? "" : "s"}` },
  Released: { ask: () => "Which hero came to Overwatch first?", high: false, said: (v) => String(v) },
  "Comic debut": { ask: () => "Which hero was in comics first?", high: false, said: (v) => String(v) },
  "Weight class": { ask: (game) => `Which one is heavier in ${game}?`, high: true, said: (v) => String(v) },
  "First Smash": { ask: () => "Which fighter was in Smash first?", high: false, said: (v) => SMASH_NAMES[String(v)] ?? String(v) },
  Joined: { ask: () => "Which hero joined Marvel Rivals first?", high: false, said: (v) => (v === "Launch" ? "launch" : String(v)) },
};

export const higherLower: BreakGame = {
  id: "higher-lower",
  make: (ctx) => attempt(30, () => {
    const p = choosePuzzle(ctx);
    if (!p) return null;
    const traits = p.traits.map((t, i) => ({ t, i })).filter(({ t }) => HOL[t.label]);
    if (!traits.length) return null;
    const { t, i } = pick(traits, ctx.rand);
    const pool = p.characters.filter((c) => usable(c.traits[i]) && rank(t, c.traits[i]!) !== null);
    if (pool.length < 2) return null;
    const [a, b] = shuffle(pool, ctx.rand);
    const ra = rank(t, a.traits[i]!)!, rb = rank(t, b.traits[i]!)!;
    if (ra === rb) return null;
    const spec = HOL[t.label];
    const winner = (spec.high ? ra > rb : ra < rb) ? "1" : "2";
    return {
      key: `hol:${p.id}:${t.label}:${[a.name, b.name].sort().join("|")}`,
      round: { layout: "choice", prompt: spec.ask(p.game), options: [option("1", a), option("2", b)], hint: "Type 1 or 2", tag: p.game },
      secret: { correct: winner, values: [spec.said(a.traits[i]!), spec.said(b.traits[i]!)], names: [a.name, b.name] },
    };
  }, ctx),
  accept: (text) => choiceKey(text, 2),
  judge: ({ secret }, answers, meta) => {
    const correct = String(secret.correct);
    const names = secret.names as string[];
    const values = secret.values as string[];
    const counts = count(answers);
    const right = counts[correct] ?? 0;
    const win = correct === "1" ? 0 : 1;
    const text = `${names[win]}: ${values[win]}. ${names[1 - win]}: ${values[1 - win]}.`;
    // Chat's streak: the room's most-picked answer was right.
    const roomRight = answers.length > 0 && right > answers.length - right;
    const streak = roomRight ? (meta.chatStreak ?? 0) + 1 : 0;
    return {
      awards: rightAwards(answers, new Set([correct]), 2),
      reveal: { text, correct: [correct], counts, answered: answers.length, right },
      line: chatLine(`Higher or Lower: ${names[win]} (${values[win]} vs ${values[1 - win]}). ${tally(right, answers.length)}.${streak >= 3 ? ` Chat streak: ${streak}!` : ""}`),
      meta: { chatStreak: streak },
    };
  },
};

// ─── Odd One Out ─────────────────────────────────────────────────────────────

function oddPrompt(p: DailyPuzzle, label: string, v: string): string | null {
  switch (label) {
    case "Weight class": return `Three of these are ${v} in ${p.game}. Which one isn't?`;
    case "Species": return `Three of these are the same species (${v}). Which one isn't?`;
    case "Crew":
      if (v === "Everyone else") return "Three of these aren't in anyone's crew. Which one is?";
      if (v === "Kongs") return "Three of these are Kongs. Which one isn't?";
      if (v === "Guests") return "Three of these are guests from other series. Which one isn't?";
      return v === "Wario & Waluigi" ? null : `Three of these are in ${v}. Which one isn't?`;
    case "First Mario Kart": return `Three of these first raced in ${kartName(v)}. Which one didn't?`;
    case "Home series": return `Three of these call ${v} home. Which one doesn't?`;
    case "Variant": return v === "Yes" ? "Three of these are a version of another racer. Which one isn't?" : null;
    case "First Mario Party": return `Three of these were first playable in ${v === "Mario Party" ? "the first Mario Party" : v}. Which one wasn't?`;
    case "Series": return `Three of these come from ${v}. Which one doesn't?`;
    case "First Smash": return `Three of these were first playable in ${SMASH_NAMES[v] ?? v}. Which one wasn't?`;
    case "Third party": return v === "Yes" ? "Three of these are third-party fighters. Which one isn't?" : "Three of these aren't third-party fighters. Which one is?";
    case "Role": return p.id === "overwatch-hero" ? `Three of these are ${v} heroes. Which one isn't?` : `Three of these are ${v}s. Which one isn't?`;
    case "Origin": return `Three of these are from ${the(v)}. Which one isn't?`;
    case "Affiliation": return `Three of these are with ${the(v)}. Which one isn't?`;
    case "Team": return v === "Villains" ? "Three of these are villains. Which one isn't?" : `Three of these are part of the ${v}. Which one isn't?`;
    case "In Superstars": return v === "Yes" ? "Three of these are playable in Mario Party Superstars. Which one isn't?" : null;
    default: return null;
  }
}

/** A column's label mid-sentence: "weight class", "first Mario Kart", but "Mario Party games" keeps its name. */
const NAMES_FIRST = new Set(["Mario", "Smash", "Overwatch"]);
function inLine(label: string): string {
  const [first, ...rest] = label.split(" ");
  return [NAMES_FIRST.has(first) ? first : first.toLowerCase(), ...rest].join(" ");
}

export const oddOneOut: BreakGame = {
  id: "odd-one-out",
  make: (ctx) => attempt(40, () => {
    const p = choosePuzzle(ctx);
    if (!p) return null;
    const traits = p.traits.map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== "year" && t.kind !== "count");
    if (!traits.length) return null;
    const { t, i } = pick(traits, ctx.rand);
    const groups = new Map<string, DailyCharacter[]>();
    for (const c of p.characters) {
      const v = c.traits[i];
      if (!usable(v)) continue;
      const k = String(v);
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    const big = [...groups.entries()].filter(([, cs]) => cs.length >= 3);
    if (!big.length) return null;
    const [v, members] = pick(big, ctx.rand);
    const prompt = oddPrompt(p, t.label, v);
    if (!prompt) return null;
    const outsiders = p.characters.filter((c) => usable(c.traits[i]) && String(c.traits[i]) !== v);
    if (!outsiders.length) return null;
    const odd = pick(outsiders, ctx.rand);
    const three = shuffle(members, ctx.rand).slice(0, 3);
    const order = shuffle([...three, odd], ctx.rand);
    const oddKey = String(order.indexOf(odd) + 1);
    return {
      key: `ooo:${p.id}:${t.label}:${v}:${odd.name}`,
      round: { layout: "choice", prompt, options: order.map((c, n) => option(String(n + 1), c)), hint: "Type 1 to 4", tag: p.game },
      secret: { correct: oddKey, odd: odd.name, oddValue: String(odd.traits[i]), label: t.label },
    };
  }, ctx),
  accept: (text) => choiceKey(text, 4),
  judge: ({ secret }, answers) => {
    const correct = String(secret.correct);
    const counts = count(answers);
    const right = counts[correct] ?? 0;
    const text = `${secret.odd} is the odd one out (${inLine(String(secret.label))}: ${secret.oddValue}).`;
    return {
      awards: rightAwards(answers, new Set([correct]), 2),
      reveal: { text, correct: [correct], counts, answered: answers.length, right },
      line: chatLine(`Odd One Out: ${secret.odd} (${secret.oddValue}). ${tally(right, answers.length)}.`),
    };
  },
};

// ─── Fact or Fiction ─────────────────────────────────────────────────────────

function statement(p: DailyPuzzle, label: string, name: string, v: string | number): string | null {
  const s = String(v);
  switch (label) {
    case "Weight class": return `${name} is in the ${s} weight class in ${p.game}.`;
    case "Species": return name.toLowerCase().includes(s.toLowerCase()) ? null : `${name}'s species is ${s.replace(" (cybernetic)", ", with cybernetics")}.`;
    case "Crew": return CREW_SAID[s] && s !== "Wario & Waluigi" ? `${name} is ${CREW_SAID[s]}.` : null;
    case "First Mario Kart": return `${name} first raced in ${kartName(s)}.`;
    case "Home series": return `${name}'s home series is ${s}.`;
    case "First Mario Party": return `${name} was first playable in ${s === "Mario Party" ? "the first Mario Party" : s}.`;
    case "Mario Party games": return `${name} is playable in ${s} Mario Party game${s === "1" ? "" : "s"}.`;
    case "Series": return `${name} comes from the ${s} series.`;
    case "Debut year": return `${name} first appeared in ${s}.`;
    case "First Smash": return `${name} was first playable in ${SMASH_NAMES[s] ?? s}.`;
    case "Role": return p.id === "overwatch-hero" ? `${name} is a ${s} hero in Overwatch.` : `${name} is a ${s} in Marvel Rivals.`;
    case "Origin": return `${name} is from ${the(s)}.`;
    case "Affiliation": return `${name} is with ${the(s)}.`;
    case "Released": return `${name} came to Overwatch in ${s}.`;
    case "Team": return s === "Villains" ? `${name} is a villain in Marvel Rivals.` : `${name} is part of the ${s}.`;
    case "Comic debut": return `${name} first appeared in comics in ${s}.`;
    case "Joined": return `${name} joined Marvel Rivals ${s === "Launch" ? "at launch" : `in ${s}`}.`;
    default: return null;
  }
}
/** Yes/no columns: one sentence, true when the value is Yes, and how the truth reads when it's No. */
const YES_NO: Record<string, { says: (name: string) => string; not: (name: string) => string }> = {
  "Third party": { says: (name) => `${name} is a third-party fighter in Smash.`, not: (name) => `${name} isn't a third-party fighter.` },
  Variant: { says: (name) => `${name} is a version of another racer.`, not: (name) => `${name} isn't a version of another racer.` },
  "In Superstars": { says: (name) => `${name} is playable in Mario Party Superstars.`, not: (name) => `${name} isn't playable in Mario Party Superstars.` },
};

export const factOrFiction: BreakGame = {
  id: "fact-or-fiction",
  make: (ctx) => attempt(40, () => {
    const p = choosePuzzle(ctx);
    if (!p) return null;
    const i = Math.floor(ctx.rand() * p.traits.length);
    const t = p.traits[i];
    const c = pick(p.characters, ctx.rand);
    const real = c.traits[i];
    if (!usable(real)) return null;
    let text: string | null;
    let truth: boolean;
    let trueText: string | null;
    let shown: string | number = real;
    const yesNo = YES_NO[t.label];
    if (yesNo) {
      text = yesNo.says(c.name);
      truth = String(real) === "Yes";
      trueText = truth ? text : yesNo.not(c.name);
    } else {
      truth = ctx.rand() < 0.5;
      if (!truth) {
        // Another character's value from the same column; for years, a close one so it isn't obvious.
        const others = [...new Set(p.characters.map((o) => o.traits[i]).filter((v): v is string | number => usable(v) && String(v) !== String(real)))];
        const near = t.kind === "year" ? others.filter((v) => Math.abs(Number(v) - Number(real)) <= 8)
          : t.kind === "count" ? others.filter((v) => Math.abs(Number(v) - Number(real)) <= 4) : others;
        const from = near.length ? near : others;
        if (!from.length) return null;
        shown = pick(from, ctx.rand);
      }
      text = statement(p, t.label, c.name, shown);
      trueText = statement(p, t.label, c.name, real);
    }
    // Both sentences must read: a fiction's reveal says the true one.
    if (!text || !trueText) return null;
    return {
      key: `fof:${p.id}:${t.label}:${c.name}:${String(shown)}`,
      round: { layout: "choice", prompt: text, options: [{ key: "T", label: "Fact" }, { key: "F", label: "Fiction" }], hint: "Type T or F", tag: p.game },
      secret: { correct: truth ? "T" : "F", trueText },
    };
  }, ctx),
  accept: (text) => {
    const t = text.trim().toLowerCase().replace(/[.!]$/, "");
    if (["t", "true", "fact"].includes(t)) return "T";
    if (["f", "false", "fiction"].includes(t)) return "F";
    return null;
  },
  judge: ({ secret }, answers) => {
    const correct = String(secret.correct);
    const counts = count(answers);
    const right = counts[correct] ?? 0;
    const verdict = correct === "T" ? "Fact" : "Fiction";
    const text = correct === "T" ? `Fact. ${secret.trueText}` : `Fiction. ${secret.trueText}`;
    return {
      awards: rightAwards(answers, new Set([correct]), 1),
      reveal: { text, correct: [correct], counts, answered: answers.length, right },
      line: chatLine(`Fact or Fiction: ${verdict}! ${correct === "F" ? `${secret.trueText} ` : ""}${tally(right, answers.length)}.`),
    };
  },
};

// ─── Closest Guess ───────────────────────────────────────────────────────────

const YEAR_ASK: Record<string, (name: string) => string> = {
  "Debut year": (n) => `What year did ${n} first appear?`,
  Released: (n) => `What year did ${n} come to Overwatch?`,
  "Comic debut": (n) => `What year did ${n} first appear in comics?`,
};

export const closestGuess: BreakGame = {
  id: "closest-guess",
  make: (ctx) => attempt(30, () => {
    const p = choosePuzzle(ctx);
    if (!p) return null;
    const years = p.traits.map((t, i) => ({ t, i })).filter(({ t }) => t.kind === "year" && YEAR_ASK[t.label]);
    if (!years.length) return null;
    const { t, i } = pick(years, ctx.rand);
    const c = pick(p.characters, ctx.rand);
    const y = Number(c.traits[i]);
    if (!Number.isFinite(y) || y < 1900) return null;
    return {
      key: `cg:${p.id}:${t.label}:${c.name}`,
      round: { layout: "number", prompt: YEAR_ASK[t.label](c.name), hint: "Type a year", min: 1900, max: 2100, img: c.img || null, tag: p.game },
      secret: { answer: y },
    };
  }, ctx),
  accept: (text, round) => {
    const m = text.trim().match(/^(\d{4})$/);
    if (!m || round.layout !== "number") return null;
    const n = Number(m[1]);
    return n >= round.min && n <= round.max ? String(n) : null;
  },
  judge: ({ secret }, answers) => {
    const y = Number(secret.answer);
    const { awards, winners } = closestAwards(answers, y, 1);
    const exact = answers.filter((a) => Number(a.answer) === y).length;
    return {
      awards,
      reveal: { text: `It was ${y}.`, number: y, answered: answers.length, right: exact, winners },
      line: chatLine(`Closest Guess: ${y}. ${winners.length ? `Closest: ${winners.slice(0, 3).map((w) => `${w.name} (${w.detail})`).join(", ")}.` : "Nobody guessed."}`),
    };
  },
};

// ─── Scramble ────────────────────────────────────────────────────────────────

/** One-word names, plain letters, 4 to 9 long, from every public fact set. */
function scrambleWords(puzzles: string[]): { word: string; game: string; noun: string }[] {
  const out = new Map<string, { word: string; game: string; noun: string }>();
  for (const id of puzzles) {
    const p = PUZZLES[id];
    if (!p) continue;
    for (const c of p.characters) {
      if (/^[A-Za-z]{4,9}$/.test(c.name) && !out.has(c.name.toLowerCase())) out.set(c.name.toLowerCase(), { word: c.name, game: p.game, noun: p.noun ?? "character" });
    }
  }
  return [...out.values()];
}

export const scramble: BreakGame = {
  id: "scramble",
  make: (ctx) => {
    const own = ctx.gameOnStream ? ctx.puzzles.filter((id) => PUZZLE_GAMES[id]?.includes(ctx.gameOnStream!)) : [];
    const words = scrambleWords(own.length && ctx.rand() < 0.7 ? own : ctx.puzzles);
    return attempt(30, () => {
      if (!words.length) return null;
      const w = pick(words, ctx.rand);
      const letters = w.word.toUpperCase().split("");
      let tiles = shuffle(letters, ctx.rand);
      for (let n = 0; n < 6 && tiles.join("") === letters.join(""); n += 1) tiles = shuffle(letters, ctx.rand);
      if (tiles.join("") === letters.join("")) return null;
      return {
        key: `scr:${w.word.toLowerCase()}`,
        round: { layout: "word", prompt: `Unscramble this ${w.noun} from ${w.game}`, tiles, hint: "Type the name", tag: w.game },
        secret: { word: w.word },
      };
    }, ctx);
  },
  accept: (text) => {
    const t = text.trim();
    return /^[A-Za-z]{3,15}$/.test(t) ? t.toLowerCase() : null;
  },
  judge: ({ secret }, answers) => {
    const word = String(secret.word);
    const right = new Set([word.toLowerCase()]);
    const n = answers.filter((a) => right.has(a.answer)).length;
    return {
      awards: rightAwards(answers, right, 2),
      reveal: { text: `It was ${word}.`, word, answered: answers.length, right: n },
      line: chatLine(`Scramble: ${word}! ${tally(n, answers.length)}.`),
    };
  },
};
