/**
 * Reading a typed name in chat: Zoomed In, Roster Rush and Emoji Puzzle all
 * ask chat to type a character or a game, and chat types it loosely
 * ("pac man", "zss", "Soldier 76", "rosalina"). Pure.
 *
 * A guess matches a name when, after tidying (case, accents, punctuation,
 * "&" as "and", a leading "the"):
 *   - it's the name, with or without spaces;
 *   - it's a nickname we list (NICKNAMES);
 *   - it's one half of a paired name ("Rosalina & Luma", "Pyra/Mythra");
 *   - it's a first or last word only one name on the list has ("Luna" for
 *     Luna Snow), four letters or more;
 *   - it's one typo off (two for long names), when that's the only name it
 *     could be. Digits never count as a typo.
 */

/** Lower case, no accents or punctuation, "&" as "and", no leading "the". */
export function tidy(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

const compact = (s: string) => s.replace(/ /g, "");

/** Nicknames chat uses, by tidied nickname → the roster's own name. */
const NICKNAMES: Record<string, string> = {
  dk: "Donkey Kong",
  ddd: "King Dedede",
  dedede: "King Dedede",
  zss: "Zero Suit Samus",
  gnw: "Mr. Game & Watch",
  "game and watch": "Mr. Game & Watch",
  gw: "Mr. Game & Watch",
  pt: "Pokémon Trainer",
  "k rool": "King K. Rool",
  krool: "King K. Rool",
  "dr mario": "Dr. Mario",
  doc: "Dr. Mario",
  "bowser junior": "Bowser Jr.",
  "bowser jr": "Bowser Jr.",
  jr: "Bowser Jr.",
  "little mac": "Little Mac",
  falcon: "Captain Falcon",
  cf: "Captain Falcon",
  ganon: "Ganondorf",
  ics: "Ice Climbers",
  rob: "R.O.B.",
  "pkmn trainer": "Pokémon Trainer",
  soldier: "Soldier: 76",
  "soldier 76": "Soldier: 76",
  torb: "Torbjörn",
  hammond: "Wrecking Ball",
  jq: "Junker Queen",
  rein: "Reinhardt",
  widow: "Widowmaker",
  dva: "D.Va",
  spidey: "Spider-Man",
  cap: "Captain America",
  "dr strange": "Doctor Strange",
  strange: "Doctor Strange",
  rocket: "Rocket Raccoon",
  "star lord": "Star-Lord",
  jeff: "Jeff the Land Shark",
  "pink gold peach": "Pink Gold Peach",
  metal: "Metal Mario",
};

export interface NameMatcher {
  /** The name on the list this guess means, or null. */
  match: (raw: string) => string | null;
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

const digitsOf = (s: string) => s.replace(/[^0-9]/g, "");

/**
 * A matcher for one list of names (a roster, or a puzzle's answer and the
 * other ways to say it). `words: false` turns off single-word matches (a game
 * title shouldn't count from "zombies" alone).
 */
export function nameMatcher(names: readonly string[], opts: { extra?: Record<string, string>; words?: boolean } = {}): NameMatcher {
  const extra = opts.extra ?? {};
  const exact = new Map<string, string>();
  const add = (key: string, name: string) => {
    const k = tidy(key);
    if (!k) return;
    if (!exact.has(k)) exact.set(k, name);
    const c = compact(k);
    if (!exact.has(c)) exact.set(c, name);
  };
  for (const n of names) {
    add(n, n);
    // One half of a paired name: "Rosalina & Luma", "Pyra/Mythra".
    for (const part of n.split(/\s*(?:&|\/|\band\b)\s*/i)) if (part.trim().length >= 4 && part.trim() !== n) add(part, n);
  }
  const byTidy = new Map(names.map((n) => [tidy(n), n]));
  for (const [nick, name] of Object.entries({ ...NICKNAMES, ...extra })) {
    const real = byTidy.get(tidy(name));
    if (real && !exact.has(tidy(nick))) add(nick, real);
  }
  // First or last words only one name has.
  const wordOwners = new Map<string, Set<string>>();
  for (const n of names) {
    const words = tidy(n).split(" ");
    if (words.length < 2) continue;
    for (const w of [words[0], words[words.length - 1]]) {
      if (w.length < 4) continue;
      if (!wordOwners.has(w)) wordOwners.set(w, new Set());
      wordOwners.get(w)!.add(n);
    }
  }
  const singleWords = new Map<string, string>();
  if (opts.words !== false) for (const [w, owners] of wordOwners) if (owners.size === 1 && !exact.has(w)) singleWords.set(w, [...owners][0]);
  const keys = [...new Set(names.map((n) => tidy(n)))];

  return {
    match(raw) {
      const t = tidy(raw);
      if (!t || t.length > 40) return null;
      const hit = exact.get(t) ?? exact.get(compact(t)) ?? singleWords.get(t);
      if (hit) return hit;
      if (t.length < 5) return null;
      const limit = t.length >= 9 ? 2 : 1;
      let found: string | null = null;
      for (const k of keys) {
        if (digitsOf(k) !== digitsOf(t)) continue;
        if (editDistance(t, k, limit) <= limit || editDistance(compact(t), compact(k), limit) <= limit) {
          const name = byTidy.get(k)!;
          if (found && found !== name) return null; // could be either: not a match
          found = name;
        }
      }
      return found;
    },
  };
}

/** Everyday chat that is never an answer to a typed round ("lol", "gg", emotes). */
const CHATTER = new Set([
  "lol", "lmao", "lmfao", "rofl", "haha", "hahaha", "hehe", "gg", "ggs", "ggwp", "wp", "pog", "poggers", "pogchamp", "kekw", "kek", "lul", "lulw",
  "omg", "omfg", "wtf", "xd", "xdd", "o7", "f", "w", "l", "ez", "rip", "brb", "afk", "hi", "hello", "hey", "yo", "sup", "bye", "gn", "ty", "thx",
  "thanks", "np", "nice", "wow", "yes", "no", "ok", "okay", "true", "same", "idk", "hmm", "hm", "huh", "what", "why", "sus", "based", "bruh",
  "monkas", "pepega", "sadge", "copium", "hype", "lets go", "letsgo", "lfg", "clip it", "clipit", "first",
]);

/** Short text that could be a typed answer: has letters, isn't everyday chat. */
export function typedAnswer(text: string, max = 32): string | null {
  const t = text.trim();
  if (t.length < 2 || t.length > max || t.startsWith("!") || !/[a-z]/i.test(t)) return null;
  if (CHATTER.has(tidy(t))) return null;
  return t;
}
