/**
 * Checking level codes before they reach a queue or the board (levels picks 2026-11-11, pick 15A): the format for
 * every game, and Super Mario Maker 2's own check bits, so a typo is caught in chat instead of on stream.
 *
 * Mario Maker 2 course and maker IDs are 9 characters shown XXX-XXX-XXX, from a 30-character alphabet with no vowels
 * and no Z. Read backwards as a base-30 number, an ID is 44 bits:
 *
 *    A (4)  B (6)     C (20)        D (1)  E (1)  F (12)
 *    1000   checksum  low id bits   maker  1      high id bits
 *
 * The id is F then C (32 bits) XOR 0x1680E07C, and B must be (id - 31) mod 64. D says whether it's a course (0) or a
 * maker (1). Worked out from https://nintendo-wiki.pretendo.network/docs/misc/datastore-codes as our own code: math on
 * the string only, nothing is looked up. What it catches (scripts/test-levels.ts, on 20 published IDs): every wrong
 * character from the 4th to the 9th, about 4 in 5 in the 3rd, and about 6 in 7 swapped neighbours. The 1st and 2nd
 * characters hold the top of the id, which the check bits don't cover, so a typo there gets through as a real-looking
 * ID (the game says it can't find the course).
 *
 * Fortnite island codes and Fall Guys share codes are 12 digits shown XXXX-XXXX-XXXX with no check inside, so only
 * the format is checked; a pasted play.fn.gg/island/… or fortnite.com/@…/… link gives its code.
 *
 * Geometry Dash level IDs (curation picks 14A) are numbers (1 to 10 digits, no leading zero); the format is all there
 * is to check. Minecraft seeds (15A) are a whole number Java and Bedrock both take (a 64-bit integer), or a word or
 * phrase, which the game turns into a number itself; a word seed passes the word filter.
 *
 * Client-safe and pure (scripts/test-levels.ts).
 */

import { isBlockedText } from "@/lib/text/filter";
import { LEVEL_GAMES, type LevelGame } from "./games";

export const SMM2_ALPHABET = "0123456789BCDFGHJKLMNPQRSTVWXY";

export type CodeKind = "course" | "maker" | "island" | "share" | "gd" | "seed";
export type CodeProblem = "empty" | "format" | "typo" | "maker" | "range" | "words";

export type CodeCheck =
  | { ok: true; code: string; kind: CodeKind }
  | { ok: false; problem: CodeProblem; line: string; kind?: CodeKind };

const TWO_40 = 2 ** 40;

/** What a Mario Maker 2 ID says about itself: course or maker, its id, and whether the check bits agree. */
export function decodeSmm2(nine: string): { valid: boolean; kind: "course" | "maker"; id: number } | null {
  if (nine.length !== 9) return null;
  let n = 0;
  for (let i = 8; i >= 0; i--) {
    const v = SMM2_ALPHABET.indexOf(nine[i]);
    if (v < 0) return null;
    n = n * 30 + v;
  }
  // Exactly 44 bits starting 1000: 8 * 2^40 up to (but not) 9 * 2^40.
  const fixed = Math.floor(n / TWO_40) === 8;
  const b = Math.floor(n / 2 ** 34) % 64;
  const c = Math.floor(n / 2 ** 14) % 2 ** 20;
  const d = Math.floor(n / 2 ** 13) % 2;
  const e = Math.floor(n / 2 ** 12) % 2;
  const f = n % 2 ** 12;
  const id = ((f * 2 ** 20 + c) ^ 0x1680e07c) >>> 0;
  const sum = (((id - 31) % 64) + 64) % 64;
  return { valid: fixed && e === 1 && b === sum, kind: d === 1 ? "maker" : "course", id };
}

/** The 9 characters of a Mario Maker 2 ID from what someone typed (any case, spaces or no dashes, a label around
 *  it), or null. O and I aren't in the alphabet, so they're read as 0 and 1 (the check still has to pass). */
export function readSmm2(input: string): string | null {
  const up = input.toUpperCase().replace(/O/g, "0").replace(/I/g, "1");
  const found: string[] = [];
  const bare = up.replace(/[\s\-_.–—]/g, "");
  if (/^[0-9A-Z]{9}$/.test(bare)) found.push(bare);
  // One word that is the ID ("W0P-8X8-XLF", "w0p8x8xlf,"), wherever it sits in the message.
  const words = up.split(/\s+/).map((w) => w.replace(/^[^0-9A-Z]+|[^0-9A-Z]+$/g, "")).filter(Boolean);
  for (const w of words) {
    const m = /^([0-9A-Z]{3})[-_.–—]?([0-9A-Z]{3})[-_.–—]?([0-9A-Z]{3})$/.exec(w);
    if (m) found.push(m[1] + m[2] + m[3]);
  }
  // Three groups with spaces between ("W0P 8X8 XLF") inside a longer message.
  for (let i = 0; i + 2 < words.length; i++) {
    if (words[i].length === 3 && words[i + 1].length === 3 && words[i + 2].length === 3 && /^[0-9A-Z]{9}$/.test(words[i] + words[i + 1] + words[i + 2])) {
      found.push(words[i] + words[i + 1] + words[i + 2]);
    }
  }
  // An ID never has a vowel or Z: prefer a candidate that could be one, else the first (so its line can say why).
  return found.find((f) => [...f].every((ch) => SMM2_ALPHABET.includes(ch))) ?? found[0] ?? null;
}

export const formatSmm2 = (nine: string) => `${nine.slice(0, 3)}-${nine.slice(3, 6)}-${nine.slice(6, 9)}`;
export const formatTwelve = (digits: string) => `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;

/** The 12 digits of a Fortnite island code or Fall Guys share code (from a link too, for Fortnite), or null. */
export function readTwelve(input: string, game: LevelGame): string | null {
  const t = input.trim();
  if (game === "fortnite") {
    // play.fn.gg/island/1234-5678-9012, fortnite.com/@maker/1234-5678-9012?v=3, fortnite.com/creative/island-codes/…
    const link = /(?:fn\.gg|fortnite\.com)\/[^\s?#]*?(\d{4})-?(\d{4})-?(\d{4})(?!\d)/i.exec(t);
    if (link) return link[1] + link[2] + link[3];
  }
  const bare = t.replace(/[\s\-_.–—]/g, "");
  if (/^\d{12}$/.test(bare)) return bare;
  const m = /(?:^|\D)(\d{4})[\s\-_.]?(\d{4})[\s\-_.]?(\d{4})(?!\d)/.exec(t);
  return m ? m[1] + m[2] + m[3] : null;
}

/** The lines a refused code gets, in chat and on the page (no name in front; chat adds "@name"). */
export function problemLine(game: LevelGame, problem: CodeProblem): string {
  const g = LEVEL_GAMES[game];
  if (problem === "empty") return `Add a ${g.codeWord}: ${g.shape}.`;
  if (problem === "maker") return "That's a maker ID. Send one of their course IDs instead.";
  if (problem === "typo") return "That course ID has a typo somewhere. Check it in the game and send it again.";
  if (game === "geometry-dash") return "That doesn't look like a Geometry Dash level ID. It's the number on the level's info, like 128.";
  if (game === "minecraft") {
    if (problem === "range") return "That number is too big for a seed. Seeds go up to 19 digits.";
    if (problem === "words") return "That seed has words we don't allow. Try another.";
    return "That doesn't look like a seed. Use the number from /seed, or the word you typed for the world.";
  }
  return game === "super-mario-maker-2"
    ? "That doesn't look like a course ID. They're 9 letters and numbers: XXX-XXX-XXX."
    : `That doesn't look like a ${g.name} ${g.codeWord}. They're 12 numbers: XXXX-XXXX-XXXX.`;
}

function refuse(game: LevelGame, problem: CodeProblem, kind?: CodeKind): CodeCheck {
  return { ok: false, problem, line: problemLine(game, problem), ...(kind ? { kind } : {}) };
}

/**
 * Check a code for a game. A good one comes back formatted (XXX-XXX-XXX or XXXX-XXXX-XXXX) with its kind. Levels
 * only: a Mario Maker 2 maker ID is refused with its own line (`kind: "maker"`), since queues and the board take
 * course IDs.
 */
export function checkCode(game: LevelGame, input: string | null | undefined): CodeCheck {
  const raw = (input ?? "").trim();
  if (!raw) return refuse(game, "empty");
  if (game === "super-mario-maker-2") {
    const nine = readSmm2(raw);
    if (!nine) return refuse(game, "format");
    const d = decodeSmm2(nine);
    if (!d) return refuse(game, "format");
    if (!d.valid) return refuse(game, "typo");
    if (d.kind === "maker") return refuse(game, "maker", "maker");
    return { ok: true, code: formatSmm2(nine), kind: "course" };
  }
  if (game === "geometry-dash") {
    const id = readGd(raw);
    return id ? { ok: true, code: id, kind: "gd" } : refuse(game, "format");
  }
  if (game === "minecraft") return checkSeed(raw);
  const twelve = readTwelve(raw, game);
  if (!twelve) return refuse(game, "format");
  return { ok: true, code: formatTwelve(twelve), kind: game === "fortnite" ? "island" : "share" };
}

/** A Geometry Dash level ID from what someone typed ("ID 128", "128", "#91240"), or null. */
export function readGd(input: string): string | null {
  const t = input.trim();
  if (/^#?\d{1,10}$/.test(t.replace(/[\s,]/g, ""))) {
    const n = t.replace(/[\s,#]/g, "").replace(/^0+(?=\d)/, "");
    return n === "0" ? null : n;
  }
  const words = t.split(/\s+/).map((w) => w.replace(/^[#([]+/, "").replace(/[)\].,!?:;]+$/, "")).filter((w) => /^\d{1,10}$/.test(w));
  const n = words[0]?.replace(/^0+(?=\d)/, "");
  return n && n !== "0" ? n : null;
}

// A 64-bit integer, the range both editions take (written out: the build targets ES2017, before BigInt literals).
const SEED_MIN = BigInt("-9223372036854775808");
const SEED_MAX = BigInt("9223372036854775807");

/**
 * A Minecraft seed: a whole number in range (kept as the number, "-0042" read as "-42"), or a word or phrase (kept
 * as typed, spaces tidied, up to 32 characters, past the word filter).
 */
export function checkSeed(input: string): CodeCheck {
  const raw = input.trim().replace(/^\/seed\s*/i, "").replace(/^seed:?\s*/i, "").replace(/^\[|\]$/g, "").trim();
  if (!raw) return refuse("minecraft", "empty");
  if (/^[+-]?\d+$/.test(raw)) {
    const big = BigInt(raw);
    if (big < SEED_MIN || big > SEED_MAX) return refuse("minecraft", "range");
    return { ok: true, code: big.toString(), kind: "seed" };
  }
  const words = raw.replace(/\s+/g, " ");
  if (words.length > 32 || /[\u0000-\u001f]/.test(words)) return refuse("minecraft", "format");
  if (isBlockedText(words)) return refuse("minecraft", "words");
  return { ok: true, code: words, kind: "seed" };
}
