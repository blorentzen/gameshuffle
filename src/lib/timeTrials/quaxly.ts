/**
 * Reading a Quaxly time trials list (migration picks 2026-10-29, all as recommended). Pure and
 * client-safe: the site's paste import and the Discord "Save to GameShuffle" command both use it.
 *
 * What Quaxly sends for `/dx display_time` (Mario Kart 8 Deluxe) and `/display_time` (Mario Kart
 * World), as an embed: a title with the speed and items ("150cc Shrooms"), section headings
 * ("Nitro tracks"), then one line per track, `**MKS**: \`1:36.990\``, followed on the next line by
 * the holder's name when it's a server board. With a player picked, the list is that player's own
 * times. Copied from Discord on a computer the markdown is gone: "MKS: 1:36.990".
 *
 * Tracks are read from the community's standard Mario Kart 8 Deluxe abbreviations first (the same
 * ones lounge and war bots use: MKS, rMMM, dYC, bPP...), then by name, so Mario Kart World's
 * full names and anything else still match.
 */

import { parseTime } from "./rules";
import { matchTrack, plainName, TT_GAMES, ttTracks, type TtClass, type TtGame, type TtTrack } from "./tracks";

/** The 96 Mario Kart 8 Deluxe abbreviations, four per cup in the game's cup order (ttTracks("mk8dx") order). */
const MK8DX_ABBR = [
  "MKS", "WP", "SSC", "TR",
  "MC", "TH", "TM", "SGF",
  "SA", "DS", "Ed", "MW",
  "CC", "BDD", "BC", "RR",
  "rMMM", "rMC", "rCCB", "rTT",
  "rDDD", "rDP3", "rRRy", "rDKJ",
  "rWS", "rSL", "rMP", "rYV",
  "rTTC", "rPPS", "rGV", "rRRd",
  "dYC", "dEA", "dDD", "dMC",
  "dWGM", "dRR", "dIIO", "dHC",
  "dBP", "dCL", "dWW", "dAC",
  "dNBC", "dRiR", "dSBS", "dBB",
  "bPP", "bTC", "bCMo", "bCMa",
  "bTB", "bSR", "bSG", "bNH",
  "bNYM", "bMC3", "bKD", "bWP",
  "bSS", "bSL", "bMG", "bSHS",
  "bLL", "bBL", "bRRM", "bMT",
  "bBB", "bPG", "bMM", "bRR7",
  "bAD", "bRP", "bDKS", "bYI",
  "bBR", "bMC", "bWS", "bSSy",
  "bAtD", "bDC", "bMH", "bSCS",
  "bLAL", "bSW", "bKC", "bVV",
  "bRA", "bDKM", "bDCt", "bPPC",
  "bMD", "bRIW", "bBC3", "bRRw",
];

/**
 * Other spellings seen in lists, lowercase → the standard one. Checked 2026-10-29 against the
 * sj-io/mk8dx speedrun package's 96-track table (github.com/sj-io/mk8dx, data-raw/tracks.csv),
 * which agrees on all 96 except that it writes 3DS Rainbow Road as bRR. Never alias anything
 * that could mean two tracks ("bCM" is Choco Mountain or Coconut Mall).
 */
const ABBR_ALIASES: Record<string, string> = { brr: "bRR7", rdp: "rDP3" };

let abbrMap: Map<string, TtTrack> | null = null;
function byAbbr(code: string): TtTrack | null {
  if (!abbrMap) {
    abbrMap = new Map();
    const tracks = ttTracks("mk8dx");
    MK8DX_ABBR.forEach((a, i) => { if (tracks[i]) abbrMap!.set(a.toLowerCase(), tracks[i]); });
  }
  const key = code.trim().toLowerCase();
  return abbrMap.get(key) ?? (ABBR_ALIASES[key] ? abbrMap.get(ABBR_ALIASES[key].toLowerCase()) ?? null : null);
}

/**
 * Mario Kart World short names (research 2026-10-30): MKCentral's own track codes and a Japanese time
 * trial list agree on all 30 Grand Prix courses; the ten SNES courses from version 1.8.0 rest on the
 * French World Timesheet and the MKWorld Players' Page news. CC1/CC2 and PS1/PS2 are the same course
 * in two cups. Note "MKW" in a paste usually means Mario Kart Wii, so it never picks the game.
 */
const MKWORLD_ABBR: Record<string, string> = {
  MBC: "Mario Bros. Circuit", CC: "Crown City", CC1: "Crown City", CC2: "Crown City", WS: "Whistlestop Summit", DKS: "DK Spaceport",
  rDH: "Desert Hills", rSGB: "Shy Guy Bazaar", rWS: "Wario Stadium", rAF: "Airship Fortress", rDKP: "DK Pass", SP: "Starview Peak",
  rSHS: "Sky-High Sundae", rWSh: "Wario Shipyard", rKTB: "Koopa Troopa Beach", KTB: "Koopa Troopa Beach", FO: "Faraway Oasis",
  PS: "Peach Stadium", PS1: "Peach Stadium", PS2: "Peach Stadium", rPB: "Peach Beach", SSS: "Salty Salty Speedway", rDDJ: "Dino Dino Jungle",
  GBR: "Great ? Block Ruins", CCF: "Cheep Cheep Falls", DD: "Dandelion Depths", BCi: "Boo Cinema", DBB: "Dry Bones Burnout",
  rMMM: "Moo Moo Meadows", rCM: "Choco Mountain", rTF: "Toad's Factory", BC: "Bowser's Castle", AH: "Acorn Heights", rMC: "Mario Circuit",
  RR: "Rainbow Road",
  rMC1: "SNES Mario Circuit 1", rMC2: "SNES Mario Circuit 2", rMC3: "SNES Mario Circuit 3", rGV1: "SNES Ghost Valley 1",
  rGV2: "SNES Ghost Valley 2", rGV3: "SNES Ghost Valley 3", rCI1: "SNES Choco Island 1", rCI2: "SNES Choco Island 2",
  rKB1: "SNES Koopa Beach 1", rVL1: "SNES Vanilla Lake 1",
};
let worldMap: Map<string, TtTrack> | null = null;
function byWorldAbbr(code: string): TtTrack | null {
  if (!worldMap) {
    worldMap = new Map();
    const byName = new Map(ttTracks("mkworld").map((t) => [t.name, t]));
    for (const [abbr, name] of Object.entries(MKWORLD_ABBR)) { const t = byName.get(name); if (t) worldMap.set(abbr.toLowerCase(), t); }
  }
  return worldMap.get(code.trim().toLowerCase()) ?? null;
}

/** A Mario Kart World track from its short name (MKCentral's track codes). */
export function worldTrack(code: string): TtTrack | null {
  return byWorldAbbr(code);
}

/** Every short name the reader knows for a game, for the import page's list (abbreviation, track). */
export function shortNames(game: TtGame): { abbr: string; name: string }[] {
  if (game === "mk8dx") return MK8DX_ABBR.map((abbr) => ({ abbr, name: byAbbr(abbr)?.name ?? "" })).filter((r) => r.name);
  return Object.entries(MKWORLD_ABBR).map(([abbr, name]) => ({ abbr, name }));
}

/** For the tests: every abbreviation with its track. */
export function abbreviationTable(): { abbr: string; track: TtTrack | null }[] {
  return MK8DX_ABBR.map((abbr) => ({ abbr, track: byAbbr(abbr) }));
}

export type QuaxlyItems = "shrooms" | "none" | null;

export interface QuaxlyRow {
  /** The text the row came from. */
  line: string;
  trackId: string | null;
  trackName: string | null;
  /** What the list called the track. */
  trackText: string;
  timeMs: number | null;
  /** The name under the time on a server board, else null. */
  holder: string | null;
  /** Matched by AI or a learned short name (the check table tags it). */
  via?: "ai" | "learned" | null;
  video?: string | null;
}

export interface QuaxlyList {
  game: TtGame;
  cc: TtClass;
  items: QuaxlyItems;
  title: string | null;
  rows: QuaxlyRow[];
  /** True when rows have holders under them (a server board or a role), so only some are yours. */
  hasHolders: boolean;
}

/** Discord markdown off: **bold**, __underline__, `code`, > quotes, list bullets. */
export function plainDiscord(text: string): string {
  return text
    .replace(/```[a-z]*\n?|```/gi, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(^|\n)\s*>\s?/g, "$1")
    .replace(/(^|\n)\s*[-•]\s+/g, "$1")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/​/g, "");
}

const TIME_TEXT = /(\d{1,2}[:'.]\d{2}[."':,]\d{1,3})/;
/** A list's closing line, never a holder. */
const SUMMARY = /^(total|average|avg|sum|overall)\b/i;
/** A place on a line after a time: "4/9", "# 4 / 9", "4th", "#4". */
const PLACE_TEXT = /^#?\s*\d{1,4}(\s*\/\s*\d{1,5}|st|nd|rd|th)?$/i;
const ROW = /^\s*([^:]{1,40}?)\s*[:\-–]\s*(\d{1,2}[:'.]\d{2}[."':,]\d{1,3})\s*(.*)$/;
const HEADING = /^(nitro|retro|dlc|bcp|booster|wave\s*\d|base|bonus|new|original|super mario kart|snes)\b.*$|\btracks?\s*$|\bcourses?\s*$|\bcup\s*$/i;

/** Speed and items from a title line ("150cc Shrooms", "200cc No items", "Shroomless"). */
export function readTitle(line: string): { cc: TtClass | null; items: QuaxlyItems } | null {
  const cc = line.match(/\b(150|200)\s*cc\b/i);
  const none = /shroomless|no[\s-]?items?|without items|\bnita\b|\bni\b/i.test(line);
  const shrooms = !none && /shrooms?|mushrooms?|\bitems?\b/i.test(line);
  if (!cc && !none && !shrooms) return null;
  return { cc: cc ? (Number(cc[1]) as TtClass) : null, items: none ? "none" : shrooms ? "shrooms" : null };
}

/**
 * Short names players taught the reader (picked a track for a name it didn't know): the player's own,
 * plus ones three players agree on. Lowercase name → track id.
 */
export type Learned = Map<string, string>;

/** A track from a list's name for it: the game's short names first, then learned ones, then the name. */
export function trackFor(text: string, game: TtGame, learned?: Learned | null): TtTrack | null {
  const t = text.trim();
  const a = game === "mk8dx" ? byAbbr(t) : byWorldAbbr(t);
  if (a) return a;
  const id = learned?.get(t.toLowerCase());
  if (id) { const l = ttTracks(game).find((x) => x.id === id); if (l) return l; }
  return matchTrack(t, game);
}

/** Whether a track came from a learned short name (for the check table's tag). */
export function learnedHit(text: string, game: TtGame, learned?: Learned | null): boolean {
  const t = text.trim();
  if ((game === "mk8dx" ? byAbbr(t) : byWorldAbbr(t)) || !learned?.has(t.toLowerCase())) return false;
  return !matchTrack(t, game);
}

function parseAs(lines: string[], game: TtGame, learned?: Learned | null): QuaxlyList {
  const classes = TT_GAMES[game].classes;
  let cc: TtClass = classes[0];
  let items: QuaxlyItems = null;
  let title: string | null = null;
  const rows: QuaxlyRow[] = [];
  let last: QuaxlyRow | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    // A blank line or a summary ("total time: 2h 54m…, average ranking: 3.4") ends a row: what follows isn't its holder.
    if (!line || SUMMARY.test(line)) { last = null; continue; }
    const m = line.match(ROW);
    if (m) {
      const track = trackFor(m[1], game, learned);
      const row: QuaxlyRow = { line: line.slice(0, 200), trackId: track?.id ?? null, trackName: track?.name ?? null, trackText: m[1].trim(), timeMs: parseTime(m[2]), holder: null };
      // A name on the same line after the time ("MKS: 1:36.990 qwacks") is the holder. A place out of
      // a total ("1:38.991 - 4/9", Quaxly's own-player view) or a bare place ("#4", "4th") isn't a name.
      const after = m[3].replace(/^[\s|·,–-]+/, "").replace(/\(.*?\)|\[.*?\]/g, "").trim();
      if (after && !TIME_TEXT.test(after) && !PLACE_TEXT.test(after)) row.holder = after.slice(0, 60);
      rows.push(row);
      last = row;
      continue;
    }
    if (rows.length === 0 && !title) {
      const t = readTitle(line);
      if (t) {
        title = line.slice(0, 80);
        if (t.cc && (classes as number[]).includes(t.cc)) cc = t.cc;
        items = t.items;
        continue;
      }
    }
    if (HEADING.test(line) || readTitle(line)) { last = null; continue; }
    // The line under a time is its holder.
    if (last && !last.holder && !TIME_TEXT.test(line) && line.length <= 60) {
      last.holder = line;
      last = null;
      continue;
    }
    last = null;
  }
  return { game, cc, items, title, rows: rows.slice(0, 400), hasHolders: rows.some((r) => r.holder) };
}

/**
 * Reads a Quaxly list (pasted text, or an embed flattened by embedText). With no game given, it
 * tries both and keeps the one more rows match. Null when there's no line with a track and time.
 */
export function readQuaxly(text: string, game?: TtGame, learned?: Learned | null): QuaxlyList | null {
  const lines = plainDiscord(text).split(/\r?\n/).slice(0, 800);
  const tries = (game ? [game] : (["mk8dx", "mkworld"] as TtGame[])).map((g) => parseAs(lines, g, learned));
  const score = (l: QuaxlyList) => l.rows.filter((r) => r.trackId && r.timeMs).length;
  const best = tries.sort((a, b) => score(b) - score(a))[0];
  return best && best.rows.length ? best : null;
}

/** A Discord embed as the text a person would copy: title, description, then each field. */
export function embedText(embed: { title?: string | null; description?: string | null; author?: { name?: string | null } | null; fields?: { name?: string | null; value?: string | null }[] | null; footer?: { text?: string | null } | null }): string {
  const parts = [embed.title, embed.description, ...(embed.fields ?? []).flatMap((f) => [f.name, f.value])];
  return parts.filter((p): p is string => !!p && !!p.trim()).join("\n");
}

/** Names that are the same person's on a list: lowercase, no accents, punctuation or spaces. */
export function nameKey(name: string): string {
  return plainName(name).replace(/\s+/g, "");
}

/**
 * Whose rows are yours (pick 3A): on a list with holders, rows whose holder is one of your
 * names; on a list without them, all of them when `ownList` says the list is yours.
 */
export function yourRows(list: QuaxlyList, names: string[], ownList: boolean): { mine: QuaxlyRow[]; others: QuaxlyRow[] } {
  const keys = new Set(names.map(nameKey).filter((k) => k.length >= 2));
  if (!list.hasHolders) return ownList ? { mine: list.rows, others: [] } : { mine: [], others: list.rows };
  const mine: QuaxlyRow[] = [];
  const others: QuaxlyRow[] = [];
  for (const r of list.rows) (r.holder && keys.has(nameKey(r.holder)) ? mine : others).push(r);
  return { mine, others };
}

/**
 * Only new or faster times (migration pick 5A): drops rows that can't be read, keeps the fastest
 * per track, and skips any that aren't faster than the best already saved (`bests`: track id → ms).
 */
export function newBests(rows: QuaxlyRow[], bests: Map<string, number>, tooFast?: (r: QuaxlyRow) => boolean): { save: QuaxlyRow[]; already: number; unclear: number; tooFast: number } {
  const fastest = new Map<string, QuaxlyRow>();
  let unclear = 0;
  let fast = 0;
  for (const r of rows) {
    if (!r.trackId || !r.timeMs) { unclear++; continue; }
    if (tooFast?.(r)) { fast++; continue; }
    const had = fastest.get(r.trackId);
    if (!had || (had.timeMs ?? Infinity) > r.timeMs) fastest.set(r.trackId, r);
  }
  const save: QuaxlyRow[] = [];
  let already = 0;
  for (const r of fastest.values()) {
    const best = bests.get(r.trackId!);
    if (best != null && best <= r.timeMs!) already++;
    else save.push(r);
  }
  return { save, already, unclear, tooFast: fast };
}
