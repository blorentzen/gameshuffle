/**
 * Team tags in in-game names, the way results screens show them: "Ω umikofy", "FRVR♪ichor", "FRVRTRA$H", "[KC] Riley",
 * "Jalen FRVR". A tag sits at the front or the back of a name, with a space, a symbol or nothing between it and the
 * name; a team's tag is what several of its names share there. Pure, client-safe.
 */

/** What can sit between a tag and a name: spaces, punctuation, symbols (not $, which names use) and the private-use glyphs the game draws as boxes. */
const SEP = /[\s\p{P}\p{Sm}\p{Sk}\p{So}\p{Co}\p{Cf}]/u;
const SPACE = /\s/u;
/** The longest tag looked for in names (MKCentral's tags run to 5 or so). */
const MAX_TAG = 8;

const chars = (s: string) => Array.from(s.normalize("NFC").trim());

/** a ranks above b: compared number by number, the first difference decides. */
function above(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function trimSep(cs: string[]): string[] {
  let a = 0;
  let b = cs.length;
  while (a < b && SEP.test(cs[a])) a++;
  while (b > a && SEP.test(cs[b - 1])) b--;
  return cs.slice(a, b);
}

/** A tag or a team as compared: letters and digits only, lowercase ("[KC]", "KC" and "ｋｃ" are one tag). */
export const tagKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** `edge`: the name shows where the tag ends (a separator, or capitals running into lowercase: "FRVRnsn"). */
export interface TagHit { side: "front" | "back"; len: number; shown: string; edge: boolean }

const LOWER = /\p{Ll}/u;
const capitals = (cs: string[]) => cs.length >= 2 && cs.some((c) => /\p{Lu}/u.test(c)) && !cs.some((c) => LOWER.test(c));

/**
 * Every piece at the front or back of a name that could be a tag, by tagKey: where it is, how many characters of the
 * name it takes (separators after it included), and how it's written. The front wins when both ends have the same tag.
 */
function pieces(name: string, opts: { max: number; spaces: boolean }): Map<string, TagHit> {
  const cs = chars(name);
  const n = cs.length;
  const out = new Map<string, TagHit>();
  for (const side of ["front", "back"] as const) {
    for (let len = 1; len < n; len++) {
      const raw = side === "front" ? cs.slice(0, len) : cs.slice(n - len);
      const core = trimSep(raw);
      if (!core.length) continue;
      if (core.length > opts.max) break;
      if (!opts.spaces && core.some((c) => SPACE.test(c))) continue;
      if (!trimSep(side === "front" ? cs.slice(len) : cs.slice(0, n - len)).length) continue;
      const key = tagKey(core.join(""));
      if (!key) continue;
      const next = side === "front" ? cs[len] : cs[n - len - 1];
      const edge = raw.length > core.length || SEP.test(next) || (capitals(core) && LOWER.test(next));
      const had = out.get(key);
      if (!had || (had.side === side && len > had.len)) out.set(key, { side, len, shown: core.join(""), edge: edge || !!had?.edge });
    }
  }
  return out;
}

/** Where a team's tag sits in a name, if it's there (front or back, any separator or none). */
export function tagAt(name: string, tag: string): TagHit | null {
  const key = tagKey(tag);
  if (!key) return null;
  return pieces(name, { max: 24, spaces: true }).get(key) ?? null;
}

/** The name with a tag taken off its front or back, and the separators next to it. */
export function stripTag(name: string, hit: TagHit): string {
  const cs = chars(name);
  const rest = hit.side === "front" ? cs.slice(hit.len) : cs.slice(0, cs.length - hit.len);
  let a = 0;
  let b = rest.length;
  if (hit.side === "front") while (a < b && SEP.test(rest[a])) a++;
  else while (b > a && SEP.test(rest[b - 1])) b--;
  return rest.slice(a, b).join("").trim() || name.trim();
}

/** A name without a team's tag at its front or back ("KC Riley", "Riley [KC]", "KCRiley" → "Riley"); unchanged without it. */
export function withoutTag(name: string, tag: string): string {
  const hit = tagAt(name, tag);
  return hit ? stripTag(name, hit) : name.trim();
}

export interface TagGroup {
  /** The tag as most of its names write it ("FRVR", "Ω"). */
  tag: string;
  /** The names' places in the list, top to bottom. */
  rows: number[];
  /** Each of those names without the tag, in the same order. */
  names: string[];
}

/**
 * Sorts names into teams by the tag they share. `size` is how many players a team has when that's known (12 players
 * in 2 teams: 6): a tag shared by exactly that many wins, then by more names, then the longer tag (FRVR over FR), then
 * the one at the front. A shared piece covering fewer than half a team isn't a tag. Names left over go in `rest`.
 */
export function groupByTag(names: string[], size: number | null): { groups: TagGroup[]; rest: number[] } {
  const found = names.map((n) => pieces(n, { max: MAX_TAG, spaces: false }));
  const left = new Set(names.keys());
  const groups: TagGroup[] = [];
  const min = size ? Math.max(2, Math.ceil(size / 2)) : 2;
  for (;;) {
    const holders = new Map<string, number[]>();
    for (const i of left) for (const key of found[i].keys()) holders.set(key, [...(holders.get(key) ?? []), i]);
    let best: { key: string; rows: number[]; score: number[] } | null = null;
    for (const [key, rows] of holders) {
      if (rows.length < min || (size && rows.length > size)) continue;
      // Most of the names have to show where the tag ends, or it's names that happen to start alike ("Sam", "Sky").
      if (rows.filter((i) => found[i].get(key)!.edge).length * 2 < rows.length) continue;
      const front = rows.filter((i) => found[i].get(key)!.side === "front").length;
      const score = [size && rows.length === size ? 1 : 0, rows.length, [...key].length, front];
      if (!best || above(score, best.score)) best = { key, rows, score };
    }
    if (!best) break;
    const shown = new Map<string, number>();
    for (const i of best.rows) { const s = found[i].get(best.key)!.shown; shown.set(s, (shown.get(s) ?? 0) + 1); }
    const tag = [...shown].sort((a, b) => b[1] - a[1])[0][0];
    const rows = [...best.rows].sort((a, b) => a - b);
    groups.push({ tag, rows, names: rows.map((i) => stripTag(names[i], found[i].get(best!.key)!)) });
    for (const i of rows) left.delete(i);
  }
  groups.sort((a, b) => a.rows[0] - b.rows[0]);
  return { groups, rest: [...left].sort((a, b) => a - b) };
}

/**
 * The split for a list with no teams given: tries 2, 3, 4, 6, 8 and 12 teams and keeps the one that puts the most
 * names into teams of exactly the right size.
 */
export function bestSplit(names: string[]): { groups: TagGroup[]; rest: number[]; size: number | null } {
  let best: { groups: TagGroup[]; rest: number[]; size: number | null; score: number[] } | null = null;
  for (const teams of [2, 3, 4, 6, 8, 12]) {
    if (names.length % teams || names.length / teams < 2) continue;
    const size = names.length / teams;
    const { groups, rest } = groupByTag(names, size);
    const exact = groups.filter((g) => g.rows.length === size).length;
    const score = [rest.length === 0 && exact === groups.length ? 1 : 0, names.length - rest.length, exact, size];
    if (!best || above(score, best.score)) best = { groups, rest, size, score };
  }
  // Teams found for under half the room are more likely names that happen to look alike.
  if (best && (names.length - best.rest.length) * 2 >= names.length) return { groups: best.groups, rest: best.rest, size: best.size };
  return { groups: [], rest: [...names.keys()], size: null };
}

/** The same player under two names: one is the other with more on the end ("umiko" and "umikofy"), or they share their first five letters. */
export function samePlayer(a: string, b: string): boolean {
  const x = tagKey(a);
  const y = tagKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 3 && l.startsWith(s)) return true;
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return i >= 5;
}
