/**
 * Tool looks: one saved look per account for each free tool (dice, coin,
 * timer, wheel), used on the free tool pages, the GS Pro overlay, the Layout
 * preview and the control room (approved 2026-10-20, picks items 9 to 14).
 *
 * Stored in `streamer_module_defaults` (game_slug "*") under the existing
 * module ids (dice, coin, timer) plus "wheel". Visitors keep the same shape in
 * localStorage. Client-safe: the server side is `looksServer.ts`.
 *
 * GS Pro choices (dice materials other than smooth, the picture coin face and
 * "Match my brand") are kept when saved but only drawn while the account has
 * GS Pro, the same rule as brand themes (src/lib/profile/proLooks.ts).
 */

import { EIGHT_BALL_ANSWERS, type EightBallAnswer } from "@/data/eight-ball";
import { DEFAULT_FILL_STYLE, DEFAULT_THEME_ID, USER_THEME_ID, WHEEL_THEMES, getFillStyle, type FillStyle } from "@/lib/wheel/themes";

export type ToolLookId = "dice" | "coin" | "timer" | "wheel";
export const TOOL_LOOK_IDS: ToolLookId[] = ["dice", "coin", "timer", "wheel"];

export function isToolLookId(v: unknown): v is ToolLookId {
  return typeof v === "string" && (TOOL_LOOK_IDS as string[]).includes(v);
}

// ---------- Colors ----------

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v.trim());
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** Mix `a` toward `b` by `t` (0 to 1), in sRGB. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** The dice library's own light/dark rule (dice-box: r*.299 + g*.587 + b*.114 > 175 = dark pips). */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 175;
}

/** Pip color for a die body: the same choice the physics dice make, so both kinds match. */
export function pipFor(dieColor: string): string {
  return isLightColor(dieColor) ? "#1b2740" : "#ffffff";
}

/** Brand colors handed to a look (from the owner's brand theme). */
export interface LookBrand {
  primary: string;
  accent: string;
  name: string;
  /** The site's own brand (no theme picked, or no GS Pro). */
  isDefault: boolean;
}

// ---------- Dice ----------

export type DiceTable = "green" | "navy" | "wood";
export const DICE_TABLES: { id: DiceTable; label: string }[] = [
  { id: "green", label: "Green felt" },
  { id: "navy", label: "Navy felt" },
  { id: "wood", label: "Wood" },
];

export type DiceMaterial = "smooth" | "wooden" | "rust";
export interface DiceMaterialDef {
  id: DiceMaterial;
  label: string;
  pro: boolean;
  /** dice-box theme folder under public/assets/dice-box/themes. */
  theme: string;
  /** dice-box die name: "dpip" (pips) or "d6" (numerals). */
  die: "dpip" | "d6";
  /** Takes the chosen die color. */
  tinted: boolean;
}
export const DICE_MATERIALS: DiceMaterialDef[] = [
  { id: "smooth", label: "Smooth", pro: false, theme: "smooth-pip", die: "dpip", tinted: true },
  { id: "wooden", label: "Wooden", pro: true, theme: "wooden", die: "d6", tinted: false },
  { id: "rust", label: "Rust", pro: true, theme: "rust", die: "d6", tinted: true },
];

export function diceMaterial(id: string | null | undefined): DiceMaterialDef {
  return DICE_MATERIALS.find((m) => m.id === id) ?? DICE_MATERIALS[0];
}

export const DICE_COLORS: { value: string; label: string }[] = [
  { value: "#ffffff", label: "White" },
  { value: "#d6343f", label: "Red" },
  { value: "#2f66ec", label: "Blue" },
  { value: "#1f1f24", label: "Black" },
  { value: "#e0a72c", label: "Gold" },
  { value: "#2e9e57", label: "Green" },
  { value: "#7b3fe4", label: "Purple" },
];

export interface DiceLook {
  dieColor: string;
  defaultCount: number;
  table: DiceTable;
  /** GS Pro beyond "smooth". */
  material: DiceMaterial;
  /** GS Pro: the dice take the brand theme's main color. */
  matchBrand: boolean;
  /** The overlay draws the table under the dice (off by default). */
  showTable: boolean;
}

export const DEFAULT_DICE_LOOK: DiceLook = {
  dieColor: "#ffffff",
  defaultCount: 2,
  table: "green",
  material: "smooth",
  matchBrand: false,
  showTable: false,
};

// ---------- Coin ----------

export type CoinFinish = "gold" | "silver" | "blue" | "color";
export const COIN_FINISHES: { id: CoinFinish; label: string }[] = [
  { id: "gold", label: "Classic gold" },
  { id: "silver", label: "Silver" },
  { id: "blue", label: "Site blue" },
  { id: "color", label: "Your color" },
];

export interface CoinLook {
  finish: CoinFinish;
  /** Used by the "Your color" finish. */
  color: string;
  /** One or two characters for each side. */
  heads: string;
  tails: string;
  /** GS Pro: heads shows the account's profile picture. */
  picture: boolean;
  /** GS Pro: the coin takes the brand theme's colors. */
  matchBrand: boolean;
}

export const DEFAULT_COIN_LOOK: CoinLook = {
  finish: "gold",
  color: "#e0336d",
  heads: "H",
  tails: "T",
  picture: false,
  matchBrand: false,
};

export const COIN_COLORS: { value: string; label: string }[] = [
  { value: "#e0336d", label: "Pink" },
  { value: "#d6343f", label: "Red" },
  { value: "#e8590c", label: "Orange" },
  { value: "#2e9e57", label: "Green" },
  { value: "#0e7490", label: "Teal" },
  { value: "#7b3fe4", label: "Purple" },
  { value: "#1f1f24", label: "Black" },
];

/** Keep the first two characters (emoji-safe), trimmed. Empty = the side's default. */
export function coinLetter(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const chars = Array.from(v.trim());
  return chars.length ? chars.slice(0, 2).join("") : fallback;
}

/** Everything the coin drawing needs, worked out once so the page, overlay and preview match. */
export interface CoinPaint {
  light: string;
  base: string;
  dark: string;
  ink: string;
  heads: { text: string; image: string | null };
  tails: { text: string };
}

const FINISH_PAINT: Record<Exclude<CoinFinish, "color">, { light: string; base: string; dark: string; ink: string }> = {
  gold: { light: "#ffe08a", base: "#e0a72c", dark: "#b07a14", ink: "#6b4a06" },
  silver: { light: "#ffffff", base: "#c9ced8", dark: "#8f97a6", ink: "#3b4252" },
  blue: { light: "#7aa2ff", base: "#2f66ec", dark: "#1d47c7", ink: "#ffffff" },
};

function paintFor(base: string, highlight?: string) {
  return {
    light: mixHex(highlight ?? base, "#ffffff", 0.42),
    base,
    dark: mixHex(base, "#000000", 0.32),
    ink: isLightColor(base) ? "#2a2f3a" : "#ffffff",
  };
}

export function coinPaint(look: CoinLook, opts: { pro: boolean; brand?: LookBrand | null; avatarUrl?: string | null }): CoinPaint {
  const brand = opts.pro && look.matchBrand && opts.brand ? opts.brand : null;
  const colors = brand
    ? paintFor(brand.primary, brand.accent)
    : look.finish === "color"
      ? paintFor(isHex(look.color) ? look.color : DEFAULT_COIN_LOOK.color)
      : FINISH_PAINT[look.finish];
  const image = opts.pro && look.picture && opts.avatarUrl ? opts.avatarUrl : null;
  return { ...colors, heads: { text: look.heads, image }, tails: { text: look.tails } };
}

// ---------- Timer ----------

export interface TimerLook {
  /** "brand" follows the brand theme, else a hex. */
  accentColor: string;
  defaultSeconds: number;
}

export const DEFAULT_TIMER_LOOK: TimerLook = { accentColor: "brand", defaultSeconds: 300 };

// ---------- Wheel ----------

export interface WheelLook {
  /** A wheel theme id, or "user" for the account's own colors. */
  themeId: string;
  fillStyle: FillStyle;
}

export const DEFAULT_WHEEL_LOOK: WheelLook = { themeId: DEFAULT_THEME_ID, fillStyle: DEFAULT_FILL_STYLE };

// ---------- Shapes ----------

export interface ToolLooks {
  dice: DiceLook;
  coin: CoinLook;
  timer: TimerLook;
  wheel: WheelLook;
}

export type LookFor<T extends ToolLookId> = ToolLooks[T];

export const DEFAULT_LOOKS: ToolLooks = {
  dice: DEFAULT_DICE_LOOK,
  coin: DEFAULT_COIN_LOOK,
  timer: DEFAULT_TIMER_LOOK,
  wheel: DEFAULT_WHEEL_LOOK,
};

type Raw = Record<string, unknown> | null | undefined;

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeDiceLook(raw: Raw): DiceLook {
  const r = raw ?? {};
  return {
    dieColor: isHex(r.dieColor) ? (r.dieColor as string).trim().toLowerCase() : DEFAULT_DICE_LOOK.dieColor,
    defaultCount: clampInt(r.defaultCount, 1, 6, DEFAULT_DICE_LOOK.defaultCount),
    table: DICE_TABLES.some((t) => t.id === r.table) ? (r.table as DiceTable) : DEFAULT_DICE_LOOK.table,
    material: DICE_MATERIALS.some((m) => m.id === r.material) ? (r.material as DiceMaterial) : DEFAULT_DICE_LOOK.material,
    matchBrand: bool(r.matchBrand, false),
    showTable: bool(r.showTable, false),
  };
}

/** Coin configs saved before looks had { style, headsColor, tailsColor }. */
export function normalizeCoinLook(raw: Raw): CoinLook {
  const r = raw ?? {};
  let finish: CoinFinish = COIN_FINISHES.some((f) => f.id === r.finish) ? (r.finish as CoinFinish) : "gold";
  let color = isHex(r.color) ? (r.color as string).trim().toLowerCase() : DEFAULT_COIN_LOOK.color;
  if (!r.finish && isHex(r.headsColor) && (r.headsColor as string).toLowerCase() !== "#e6b23c") {
    finish = "color";
    color = (r.headsColor as string).toLowerCase();
  }
  return {
    finish,
    color,
    heads: coinLetter(r.heads, DEFAULT_COIN_LOOK.heads),
    tails: coinLetter(r.tails, DEFAULT_COIN_LOOK.tails),
    picture: bool(r.picture, false),
    matchBrand: bool(r.matchBrand, false),
  };
}

export function normalizeTimerLook(raw: Raw): TimerLook {
  const r = raw ?? {};
  const accent = r.accentColor === "brand" || isHex(r.accentColor) ? (r.accentColor as string) : DEFAULT_TIMER_LOOK.accentColor;
  return { accentColor: accent, defaultSeconds: clampInt(r.defaultSeconds, 60, 24 * 3600, DEFAULT_TIMER_LOOK.defaultSeconds) };
}

export function normalizeWheelLook(raw: Raw): WheelLook {
  const r = raw ?? {};
  const id = typeof r.themeId === "string" ? r.themeId : "";
  const themeId = id === USER_THEME_ID || WHEEL_THEMES.some((t) => t.id === id) ? id : DEFAULT_WHEEL_LOOK.themeId;
  return { themeId, fillStyle: getFillStyle(typeof r.fillStyle === "string" ? r.fillStyle : null) };
}

export function normalizeLook<T extends ToolLookId>(tool: T, raw: unknown): LookFor<T> {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  switch (tool) {
    case "dice": return normalizeDiceLook(r) as LookFor<T>;
    case "coin": return normalizeCoinLook(r) as LookFor<T>;
    case "timer": return normalizeTimerLook(r) as LookFor<T>;
    default: return normalizeWheelLook(r) as LookFor<T>;
  }
}

// ---------- GS Pro choices ----------

/** The look as an account without GS Pro sees it: GS Pro choices back to their free version. */
export function freeLook<T extends ToolLookId>(tool: T, look: LookFor<T>): LookFor<T> {
  if (tool === "dice") return { ...(look as DiceLook), material: "smooth", matchBrand: false } as LookFor<T>;
  if (tool === "coin") return { ...(look as CoinLook), picture: false, matchBrand: false } as LookFor<T>;
  return look;
}

/**
 * What to store when an account saves a look. With GS Pro everything is kept;
 * without it the GS Pro fields keep whatever was stored before (so a lapsed
 * member's choices come back when GS Pro does) and new GS Pro choices are
 * refused quietly.
 */
export function mergeForSave<T extends ToolLookId>(tool: T, incoming: LookFor<T>, stored: LookFor<T> | null, pro: boolean): LookFor<T> {
  if (pro) return incoming;
  const base = stored ?? DEFAULT_LOOKS[tool];
  if (tool === "dice") {
    const s = base as DiceLook;
    return { ...(incoming as DiceLook), material: s.material, matchBrand: s.matchBrand } as LookFor<T>;
  }
  if (tool === "coin") {
    const s = base as CoinLook;
    return { ...(incoming as CoinLook), picture: s.picture, matchBrand: s.matchBrand } as LookFor<T>;
  }
  return incoming;
}

// ---------- Dice, worked out ----------

/** The dice as drawn: brand color applied, GS Pro material only while GS Pro. */
export function diceDrawn(look: DiceLook, opts: { pro: boolean; brand?: LookBrand | null }) {
  const dieColor = opts.pro && look.matchBrand && opts.brand ? opts.brand.primary : look.dieColor;
  const material = opts.pro ? diceMaterial(look.material) : DICE_MATERIALS[0];
  return { dieColor, pipColor: pipFor(dieColor), material, table: look.table };
}

// ---------- 8-ball ----------

/** A GS Pro account's own 8-ball answers (Tool looks ▸ Oracle): kept classics plus their own, neutral tone. */
export function eightBallPool(cfg: { disabled?: string[]; custom?: string[] } | null | undefined): EightBallAnswer[] {
  if (!cfg) return EIGHT_BALL_ANSWERS;
  const off = new Set(cfg.disabled ?? []);
  const kept = EIGHT_BALL_ANSWERS.filter((a) => !off.has(a.text));
  const own = (cfg.custom ?? []).filter((t) => typeof t === "string" && t.trim()).map((text) => ({ text: text.trim(), tone: "neutral" as const }));
  const pool = [...kept, ...own];
  return pool.length ? pool : EIGHT_BALL_ANSWERS;
}
