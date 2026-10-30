/**
 * What's on an MMR card (pure, client-safe; "What's on the card" picks, 2026-10-21, all as
 * recommended). Every piece a card can show has a switch, grouped Who, Numbers, Tonight and
 * Season, in this file's order. Free: every piece, the four presets, the big number (MMR or
 * world rank), recent events 3 or 5, and a switch per moment. GS Pro: your own order, a line
 * of your own, tonight's goal, and more saved looks (look.ts).
 *
 * This is the one registry of pieces: ids, labels, groups, which are new or GS Pro, and each
 * piece as a short value (`pieceText`). The card's layouts map over it, and so can any later
 * layout (the planned rolling layout shows one piece at a time from this same list). Icons
 * live beside the card, keyed by the same ids (src/components/mmr/pieceIcons.ts).
 *
 * Each layout gives some pieces a spot of their own (the name, the big number, the bar) and
 * has room for a fixed number of details. When more details are on than it fits, the extras
 * take turns in the last slot, changing every 8 seconds, in list order (`fitSlots`).
 */

import type { MmrLayout } from "./look";
import { MMR_GAMES, fmtMmr, placeWord, signed, type MmrView } from "./rules";
import { goalText, type GoalProgress } from "./goal";
import { formatOf, topShare } from "@/lib/lounge/season";
import { countryName } from "@/lib/lounge/countries";

export type MmrPiece =
  | "name" | "cc" | "game" | "division" | "line"
  | "mmr" | "world" | "country" | "top" | "peak" | "progress"
  | "delta" | "tonight" | "streak" | "goal"
  | "last10" | "recent" | "events" | "avg";

export type MmrPieceGroup = "who" | "numbers" | "tonight" | "season";

export interface PieceDef {
  id: MmrPiece;
  group: MmrPieceGroup;
  /** The studio's switch label. */
  label: string;
  /** A short line under the switch. */
  note?: string;
  /** Added in the "What's on the card" round: tagged New in the studio. */
  isNew?: boolean;
  /** GS Pro: tried in the preview, saved only with GS Pro. */
  pro?: boolean;
}

/** Every piece, in list order (the order details fill a layout's slots unless GS Pro sets its own). */
export const PIECES: PieceDef[] = [
  { id: "name", group: "who", label: "Lounge name" },
  { id: "cc", group: "who", label: "Country" },
  { id: "game", group: "who", label: "Game" },
  { id: "division", group: "who", label: "Division name", note: "The emblem has its own setting." },
  { id: "line", group: "who", label: "A line of your own", note: "Up to 40 characters, like Road to Master.", pro: true },
  { id: "mmr", group: "numbers", label: "MMR", note: "With world rank as the big number, turn this off to leave MMR off the card." },
  { id: "world", group: "numbers", label: "World rank" },
  { id: "country", group: "numbers", label: "Country rank", note: "Like #412 in the US.", isNew: true },
  { id: "top", group: "numbers", label: "Top %", note: "Your world rank against everyone who played this season, like Top 9%.", isNew: true },
  { id: "peak", group: "numbers", label: "Season peak" },
  { id: "progress", group: "numbers", label: "Progress to the next division" },
  { id: "delta", group: "tonight", label: "Last change", note: "The change and place from your latest event." },
  { id: "tonight", group: "tonight", label: "Tonight's run" },
  { id: "streak", group: "tonight", label: "Win streak", note: "Shows from two wins in a row.", isNew: true },
  { id: "goal", group: "tonight", label: "Tonight's goal", note: "Set it under Tonight's goal above.", pro: true },
  { id: "last10", group: "season", label: "Last 10" },
  { id: "recent", group: "season", label: "Recent events", note: "Place, tier and change for your latest events.", isNew: true },
  { id: "events", group: "season", label: "Events and win %", note: "Like 142 events, 61% won.", isNew: true },
  { id: "avg", group: "season", label: "Average score", isNew: true },
];

export const PIECE_IDS = PIECES.map((p) => p.id);
export const pieceDef = (id: MmrPiece) => PIECES.find((p) => p.id === id)!;
export const PRO_PIECES = PIECES.filter((p) => p.pro).map((p) => p.id);
export const FREE_PIECES = PIECES.filter((p) => !p.pro).map((p) => p.id);

export const PIECE_GROUPS: { id: MmrPieceGroup; label: string }[] = [
  { id: "who", label: "Who" },
  { id: "numbers", label: "Numbers" },
  { id: "tonight", label: "Tonight" },
  { id: "season", label: "Season" },
];

// ── Moments ───────────────────────────────────────────────────────────────

export type MmrMoment = "pop" | "roll" | "streak" | "peak" | "division" | "milestone" | "goal";

export const MOMENTS: { id: MmrMoment; label: string; note: string; pro?: boolean }[] = [
  { id: "pop", label: "The change pops", note: "The change shows big while the card steps back." },
  { id: "roll", label: "The number moves", note: "Rolls like a reel or counts up to the new number." },
  { id: "streak", label: "Three wins in a row", note: "A flame tag while the streak lasts." },
  { id: "peak", label: "A new season peak", note: "A gold New peak tag until your next event." },
  { id: "division", label: "A new division", note: "A banner, sparks and the layout's own move." },
  { id: "milestone", label: "A world milestone", note: "A laurel banner the first time you reach the world top 1,000, 250, 100 or 10." },
  { id: "goal", label: "Reaching tonight's goal", note: "A gold Goal reached banner.", pro: true },
];
export const MOMENT_IDS = MOMENTS.map((m) => m.id);

// ── A look's pieces ───────────────────────────────────────────────────────

export interface MmrInfo {
  on: Record<MmrPiece, boolean>;
  /** The big number: MMR (world rank in the details), or world rank (MMR in the details). */
  big: "mmr" | "world";
  /** How many recent events the list shows. */
  recent: 3 | 5;
  /** GS Pro: your own order of the pieces (null = list order). */
  order: MmrPiece[] | null;
  /** GS Pro: a line of your own on the card. */
  line: string;
  moments: Record<MmrMoment, boolean>;
  /** Strip, Sticker and Rolling's MMR slide: tonight's run and/or last 10 under the number instead of their usual spot. */
  under: MmrUnder;
  /** The Overlay panel's "Type !mmr in chat" line (only drawn while GameShuffle's bot is in the streamer's chat). */
  chat: boolean;
}

export type MmrUnder = "none" | "tonight" | "last10" | "both";
export const UNDER_CHOICES: { v: MmrUnder; label: string }[] = [
  { v: "none", label: "Nothing" }, { v: "tonight", label: "Tonight's run" }, { v: "last10", label: "Last 10" }, { v: "both", label: "Both" },
];
/** The layouts with a line under the number. */
export const UNDER_LAYOUTS: MmrLayout[] = ["strip", "sticker", "rolling"];
const UNDER_PIECES: Record<MmrUnder, MmrPiece[]> = { none: [], tonight: ["tonight"], last10: ["last10"], both: ["tonight", "last10"] };

/** The pieces under the number on this layout: picked, switched on, and (on Rolling) only while the MMR slide is on. */
export function underPieces(info: Pick<MmrInfo, "under" | "on">, layout: MmrLayout): MmrPiece[] {
  if (!UNDER_LAYOUTS.includes(layout)) return [];
  if (layout === "rolling" && !info.on.mmr) return [];
  return UNDER_PIECES[info.under].filter((p) => info.on[p]);
}

export const LINE_MAX = 40;

const onFor = (ids: MmrPiece[]): Record<MmrPiece, boolean> =>
  Object.fromEntries(PIECE_IDS.map((id) => [id, ids.includes(id)])) as Record<MmrPiece, boolean>;
const allMoments = (): Record<MmrMoment, boolean> => Object.fromEntries(MOMENT_IDS.map((m) => [m, true])) as Record<MmrMoment, boolean>;

export type MmrPresetId = "number" | "division" | "standard" | "everything";

/** Presets set the free switches; GS Pro pieces (tonight's goal, your own line) keep what the player chose. */
export const PRESETS: { id: MmrPresetId; label: string; note: string; on: MmrPiece[] }[] = [
  { id: "number", label: "Just the number", note: "The big number and your lounge name.", on: ["name", "mmr"] },
  { id: "division", label: "Number and division", note: "Adds your division, the last change and your progress.", on: ["name", "mmr", "division", "delta", "progress"] },
  { id: "standard", label: "Standard", note: "The usual card, plus your win streak.", on: ["name", "cc", "game", "division", "mmr", "world", "peak", "progress", "delta", "tonight", "streak", "last10"] },
  { id: "everything", label: "Everything", note: "Every piece on. Extras take turns.", on: FREE_PIECES },
];

/** A new look: Standard, with tonight's goal on (it only shows once a GS Pro goal is set). */
export const DEFAULT_INFO: MmrInfo = {
  on: onFor([...PRESETS[2].on, "goal"]),
  big: "mmr",
  recent: 3,
  order: null,
  line: "",
  moments: allMoments(),
  under: "none",
  chat: true,
};

/** The preset these switches match, or null for your own mix. */
export function presetOf(info: MmrInfo): MmrPresetId | null {
  return PRESETS.find((p) => FREE_PIECES.every((id) => info.on[id] === p.on.includes(id)))?.id ?? null;
}

export function applyPreset(info: MmrInfo, id: MmrPresetId): MmrInfo {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return info;
  const on = { ...info.on };
  for (const p of FREE_PIECES) on[p] = preset.on.includes(p);
  return { ...info, on };
}

/** The old five switches (before 2026-10-21), as `show` on a saved look. */
export type LegacyStat = "progress" | "world" | "tonight" | "last10" | "peak";
const LEGACY_STATS: LegacyStat[] = ["progress", "world", "tonight", "last10", "peak"];

/** What each layout drew before pieces had switches. A saved look keeps exactly that. */
const LEGACY_SPOTS: Record<MmrLayout, MmrPiece[]> = {
  deck: ["name", "cc", "game", "mmr", "world", "peak", "progress", "delta", "tonight", "goal", "last10"],
  panel: ["name", "game", "division", "mmr", "world", "peak", "progress", "delta", "tonight", "goal", "last10"],
  strip: ["name", "division", "mmr", "progress", "delta", "goal", "last10"],
  sticker: ["name", "division", "mmr", "delta", "goal"],
  // Rolling came after the pieces had switches, so no old look uses it.
  rolling: ["name", "cc", "game", "division", "mmr", "world", "peak", "progress", "delta", "tonight", "goal", "last10"],
};

/** A look saved before the pieces had switches: what its layout showed then, with every moment on. */
export function legacyInfo(show: Record<string, unknown>, layout: MmrLayout): MmrInfo {
  const ids = LEGACY_SPOTS[layout].filter((id) => !(LEGACY_STATS as string[]).includes(id) || show[id] !== false);
  return { ...DEFAULT_INFO, on: onFor(ids), moments: allMoments() };
}

/** The pieces in their order: GS Pro's own order with anything it leaves out after, else list order. */
export function pieceOrder(info: Pick<MmrInfo, "order">): MmrPiece[] {
  if (!info.order) return PIECE_IDS.slice();
  const seen = new Set<MmrPiece>();
  const out: MmrPiece[] = [];
  for (const id of [...info.order, ...PIECE_IDS]) if (PIECE_IDS.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

/** Pieces from untrusted input. `layout` decides what an old look (with `show`) keeps. */
export function cleanInfo(raw: unknown, legacyShow: unknown, layout: MmrLayout): MmrInfo {
  if (!raw || typeof raw !== "object") {
    return legacyShow && typeof legacyShow === "object" ? legacyInfo(legacyShow as Record<string, unknown>, layout) : { ...DEFAULT_INFO, on: { ...DEFAULT_INFO.on }, moments: allMoments() };
  }
  const r = raw as Record<string, unknown>;
  const rawOn = (r.on && typeof r.on === "object" ? r.on : {}) as Record<string, unknown>;
  const rawMoments = (r.moments && typeof r.moments === "object" ? r.moments : {}) as Record<string, unknown>;
  const on = Object.fromEntries(PIECE_IDS.map((id) => [id, typeof rawOn[id] === "boolean" ? rawOn[id] : DEFAULT_INFO.on[id]])) as Record<MmrPiece, boolean>;
  const moments = Object.fromEntries(MOMENT_IDS.map((id) => [id, rawMoments[id] !== false])) as Record<MmrMoment, boolean>;
  let order: MmrPiece[] | null = Array.isArray(r.order) ? pieceOrder({ order: r.order.filter((v): v is MmrPiece => typeof v === "string" && (PIECE_IDS as string[]).includes(v)) }) : null;
  if (order && order.join() === PIECE_IDS.join()) order = null;
  const line = typeof r.line === "string" ? r.line.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, LINE_MAX) : "";
  const under: MmrUnder = r.under === "tonight" || r.under === "last10" || r.under === "both" ? r.under : "none";
  return { on, big: r.big === "world" ? "world" : "mmr", recent: r.recent === 5 ? 5 : 3, order, line, moments, under, chat: r.chat !== false };
}

/** The GS Pro choices in these pieces, by label (tonight's goal is GS Pro through the goal itself). */
export function proPiecesUsed(info: MmrInfo): string[] {
  const out: string[] = [];
  if (info.order && info.order.join() !== PIECE_IDS.join()) out.push("Your own order");
  if (info.on.line && info.line.trim()) out.push("A line of your own");
  return out;
}

/** What a free card shows: list order and no line of your own (the text and order are kept, not lost). */
export function freeInfo(info: MmrInfo): MmrInfo {
  return { ...info, order: null, on: { ...info.on, line: false } };
}

// ── Layouts: spots of their own, and room for details ─────────────────────

/** A piece on the card, or MMR itself when world rank is the big number. */
export type Shown = MmrPiece | "mmr";

export const LAYOUT_SPOTS: Record<MmrLayout, { fixed: MmrPiece[]; slots: number; name: string }> = {
  // The deck card: name, flag and game up top, the number with its change and the last ten, a bar
  // with the next division and world rank. Details are chips over the bar.
  deck: { fixed: ["name", "cc", "game", "division", "mmr", "world", "progress", "delta", "last10", "recent"], slots: 3, name: "The deck card" },
  // The overlay panel: world rank top right, the streak and goal as chips in its foot. Details are tiles.
  panel: { fixed: ["name", "cc", "game", "division", "mmr", "world", "delta", "streak", "goal", "recent"], slots: 6, name: "The overlay panel" },
  // The strip: name, division and progress, the squares and the number. One detail under the name
  // (progress joins the details when it doesn't fit beside the division; MmrCard measures that).
  strip: { fixed: ["name", "cc", "division", "mmr", "progress", "delta", "last10"], slots: 1, name: "The squares strip" },
  // The sticker: the number, name (with the flag) and division, the change in a corner. One detail under them.
  sticker: { fixed: ["name", "cc", "division", "mmr", "delta"], slots: 1, name: "The sticker" },
  // Rolling: every piece is a slide (rolling.ts), so nothing here takes turns in a slot.
  rolling: { fixed: PIECE_IDS, slots: 0, name: "Rolling" },
};

/** World rank is the big number (only while the player has one). */
export const bigIsWorld = (info: MmrInfo, v: Pick<MmrView, "worldRank">) => info.big === "world" && v.worldRank != null;

/** The details a layout shows, in order, leaving out pieces with nothing to show (`has`).
 *  When world rank is the big number, MMR takes world rank's place in the order while its switch is on. */
export function detailsFor(layout: MmrLayout, info: MmrInfo, has: (p: Shown) => boolean, worldBig = false, loose: MmrPiece[] = []): Shown[] {
  // `loose`: pieces that lost their own spot this time (the strip's progress when it doesn't fit) and join the details.
  const fixed = LAYOUT_SPOTS[layout].fixed.filter((p) => !loose.includes(p));
  // Pieces under the number have that spot instead.
  const under = underPieces(info, layout);
  const out: Shown[] = [];
  for (const id of pieceOrder(info)) {
    if (id === "world" && worldBig) {
      // Deck and panel give world rank a spot of their own, where MMR goes instead (its switch can leave it off).
      if (!fixed.includes("world") && info.on.mmr && has("mmr")) out.push("mmr");
      continue;
    }
    if (fixed.includes(id) || under.includes(id) || !info.on[id] || !has(id)) continue;
    out.push(id);
  }
  return out;
}

/** Fits details into a layout's slots: the first ones stay, and the rest take turns in the last slot. */
export function fitSlots<T>(details: T[], slots: number): { shown: T[]; turns: T[] } {
  if (slots < 1) return { shown: [], turns: [] };
  if (details.length <= slots) return { shown: details.slice(), turns: [] };
  return { shown: details.slice(0, slots - 1), turns: details.slice(slots - 1) };
}

/** How often the extras take turns. */
export const TURN_MS = 8000;

// ── Each piece as a short value ───────────────────────────────────────────

export interface PieceText {
  /** A small label (a panel tile's caption). Empty when the value says it all. */
  label: string;
  /** The value on its own ("#412"). */
  value: string;
  /** The whole thing as one chip ("#412 in the US"). */
  chip: string;
  /** The chip at its shortest, still whole, for the strip's narrow slot ("#412 in the US", "MKW 12P"). */
  short: string;
}

/** The games at their shortest, for the strip's slot. */
export const GAME_TINY: Record<MmrView["game"], string> = { mkworld12p: "MKW 12P", mkworld24p: "MKW 24P", mk8dx: "MK8DX" };

/** "the US", "France": a country's short name for "#412 in the US" (the code when the name is long). */
export function countryShort(code: string): string {
  const c = code.toUpperCase();
  const the: Record<string, string> = { US: "the US", GB: "the UK", AE: "the UAE", NL: "the Netherlands", PH: "the Philippines", DO: "the Dominican Republic" };
  if (the[c]) return the[c];
  const name = countryName(c);
  return name.length <= 14 ? name : c;
}

/** World rank against the season's players, as a percent (null when either is missing). */
export function topPercent(rank: number | null | undefined, total: number | null | undefined): number | null {
  if (!rank || !total || rank < 1 || total < 1 || rank > total) return null;
  return (rank / total) * 100;
}

/** "Top 9%", "Top 0.4%" (rounded up, so never better than true). */
export function topText(rank: number | null | undefined, total: number | null | undefined): string | null {
  const t = topShare(rank, total);
  return t ? `T${t.slice(1)}` : null;
}

/** This season's win share as a whole percent (null before any event). */
export const winPercent = (events: number, wins: number) => (events > 0 ? Math.round((wins / events) * 100) : null);

const tierWord = (t: string | null) => (t === "SQ" ? "Squad queue" : t ? `Tier ${t}` : null);
const dayWord = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Los_Angeles" });

/** One recent event as "Tue · Tier C · Free-for-all" (its place and change are drawn beside it). */
export function recentWhen(e: MmrView["recent"][number]): string {
  const f = formatOf(e);
  return [dayWord(e.at), tierWord(e.tier), f === "FFA" ? "Free-for-all" : f].filter(Boolean).join(" · ");
}

export const toNextText = (v: Pick<MmrView, "next" | "toNext" | "division">) =>
  v.next && v.toNext != null ? `${fmtMmr(v.toNext)} to ${v.next.name}` : v.division === "Placement" ? "In placement" : "Top division";

/** A piece as a short value, or null when there's nothing to show (no country rank yet, a streak under two). */
export function pieceText(p: Shown, v: MmrView, info: MmrInfo, goal?: GoalProgress | null): PieceText | null {
  const one = (label: string, value: string, chip: string, short = chip): PieceText => ({ label, value, chip, short });
  switch (p) {
    case "name": return one("", v.name, v.name);
    case "cc": return v.country ? one("Country", v.country, v.country) : null;
    case "game": return one("Game", MMR_GAMES[v.game].short, MMR_GAMES[v.game].short, GAME_TINY[v.game]);
    case "division": return one("Division", v.division, v.division);
    case "line": return info.line.trim() ? one("", info.line.trim(), info.line.trim()) : null;
    case "mmr": return v.mmr != null ? one("MMR", fmtMmr(v.mmr), `${fmtMmr(v.mmr)} MMR`) : null;
    case "world": return v.worldRank ? one("World", `#${fmtMmr(v.worldRank)}`, `#${fmtMmr(v.worldRank)} world`) : null;
    case "country": {
      if (!v.countryRank || !v.country) return null;
      const where = countryShort(v.country);
      return one(`In ${where}`, `#${fmtMmr(v.countryRank)}`, `#${fmtMmr(v.countryRank)} in ${where}`, `#${fmtMmr(v.countryRank)} in ${where.length <= 8 ? where : v.country.toUpperCase()}`);
    }
    case "top": { const t = topText(v.worldRank, v.totalPlayers); return t ? one("This season", t, t) : null; }
    case "peak": return v.peak != null ? one("Season peak", fmtMmr(v.peak), `Peak ${fmtMmr(v.peak)}`) : null;
    case "progress": {
      // With no next division, say where the player is rather than repeat the number.
      if (!v.next || v.toNext == null) return one("Division", v.division === "Placement" ? "In placement" : "Top division", toNextText(v));
      return one(`To ${v.next.name}`, fmtMmr(v.toNext), toNextText(v));
    }
    case "delta": return v.last ? one("Last change", signed(v.last.delta), `${signed(v.last.delta)}${v.last.place ? ` · ${placeWord(v.last.place)}` : ""}`) : null;
    case "tonight": {
      const t = v.tonight;
      const chip = `Tonight ${signed(t.delta)} · ${t.w}-${t.l}`;
      return one("Tonight", `${signed(t.delta)} · ${t.w}-${t.l}`, chip, chip.length <= 18 ? chip : `Tonight ${signed(t.delta)}`);
    }
    case "streak": return v.streak >= 2 ? one("Win streak", `${v.streak} wins`, `${v.streak} wins in a row`) : null;
    case "goal": return goal ? one("Tonight's goal", goalText(goal), goalText(goal), goal.reached ? `${fmtMmr(goal.goal)} reached` : goalText(goal)) : null;
    case "last10": {
      if (!v.squares.length) return null;
      const w = v.squares.filter((s) => s !== "l").length;
      return one("Last 10", `${w}-${v.squares.length - w}`, `Last 10: ${w}-${v.squares.length - w}`);
    }
    case "recent": {
      const list = v.recent.slice(0, info.recent);
      if (!list.length) return null;
      const places = list.map((e) => (e.place ? placeWord(e.place) : signed(e.delta)));
      return one(`Last ${list.length}`, places.join(", "), places.join(" · "), places.slice(0, 3).join(" · "));
    }
    case "events": {
      if (!v.season.events) return null;
      const pct = winPercent(v.season.events, v.season.wins);
      const count = `${fmtMmr(v.season.events)} ${v.season.events === 1 ? "event" : "events"}`;
      return one("Events", `${fmtMmr(v.season.events)} · ${pct}% won`, `${count} · ${pct}% won`, `${fmtMmr(v.season.events)} · ${pct}% won`);
    }
    case "avg": return v.season.avgScore != null ? one("Average score", v.season.avgScore.toFixed(1), `Avg score ${v.season.avgScore.toFixed(1)}`, `Avg ${v.season.avgScore.toFixed(1)}`) : null;
  }
}
