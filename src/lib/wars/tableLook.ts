/**
 * How a war table picture looks (table look picks 2026-11-09, all as recommended). Pure, client-safe.
 *
 * Free: the three layouts (Stacked, the default; Side by side; Classic), medals for 1st to 3rd, each team's color
 * (its card's, else picked from its logo), and what's behind it when nothing is uploaded (the two teams' colors, or
 * Competitive's checker). Paid looks (GS Pro or Supporter looks, the war overlay's and the MMR card's rule): a brand
 * theme or your own two colors for the frame, the MMR card's other fonts, a light version, and no gameshuffle.co line.
 * They show while the account that added GameShuffle Competitive to the server has looks; otherwise the table is drawn
 * with their free versions (`freeTableLook`), and the saved choice is kept.
 *
 * One look per war channel (war_channels.table_look, wars-m7.sql), set on the Teams page or from the table form; a
 * table can be drawn in another layout without changing the channel's (war_tables.layout).
 */

import { BRAND_THEMES } from "@/lib/theme/brand";

export type TableLayout = "stacked" | "sides" | "classic";
export type TableFont = "gabarito" | "bebas" | "chakra" | "fredoka" | "grotesk";
/** Behind the table when no background is uploaded. */
export type TableGround = "teams" | "checker";

export interface TableLook {
  layout: TableLayout;
  /** Medals for 1st to 3rd (places as text when off). */
  medals: boolean;
  ground: TableGround;
  /** The frame's colors (header bar, the line between teams): "teams", a brand theme id, or "custom" (c1, c2). */
  frame: string;
  c1: string;
  c2: string;
  font: TableFont;
  light: boolean;
  /** The gameshuffle.co line in the corner. */
  brand: boolean;
}

export const TABLE_LAYOUTS: { id: TableLayout; label: string; line: string }[] = [
  { id: "stacked", label: "Stacked", line: "One team above the other, big logos, totals on the right." },
  { id: "sides", label: "Side by side", line: "Each team under a header in its color. Wider and shorter." },
  { id: "classic", label: "Classic", line: "The first GameShuffle table, with bigger logos and medals." },
];
export const layoutLabel = (id: TableLayout) => TABLE_LAYOUTS.find((l) => l.id === id)?.label ?? "Stacked";

export const TABLE_GROUNDS: { id: TableGround; label: string }[] = [
  { id: "teams", label: "The two teams' colors" },
  { id: "checker", label: "Competitive's checker" },
];

const THEMES = BRAND_THEMES.filter((t) => t.id !== "default" && t.id !== "custom");
export const TABLE_FRAMES: { id: string; label: string; paid: boolean }[] = [
  { id: "teams", label: "Team colors", paid: false },
  ...THEMES.map((t) => ({ id: t.id, label: t.name, paid: true })),
  { id: "custom", label: "Your two colors", paid: true },
];

export const TABLE_FONTS: { id: TableFont; label: string; paid: boolean }[] = [
  { id: "gabarito", label: "GameShuffle", paid: false },
  { id: "bebas", label: "Bebas Neue", paid: true },
  { id: "chakra", label: "Chakra Petch", paid: true },
  { id: "fredoka", label: "Fredoka", paid: true },
  { id: "grotesk", label: "Space Grotesk", paid: true },
];

export const DEFAULT_TABLE_LOOK: TableLook = {
  layout: "stacked",
  medals: true,
  ground: "teams",
  frame: "teams",
  c1: "#8cc8f0",
  c2: "#f2c14e",
  font: "gabarito",
  light: false,
  brand: true,
};

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
export const isTableLayout = (v: unknown): v is TableLayout => TABLE_LAYOUTS.some((l) => l.id === v);

/** Any stored or sent look, made safe (unknown values fall back to the default). */
export function cleanTableLook(raw: unknown): TableLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof TableLook, unknown>>;
  const d = DEFAULT_TABLE_LOOK;
  return {
    layout: pick(r.layout, TABLE_LAYOUTS.map((l) => l.id), d.layout),
    medals: typeof r.medals === "boolean" ? r.medals : d.medals,
    ground: pick(r.ground, TABLE_GROUNDS.map((g) => g.id), d.ground),
    frame: pick(r.frame, TABLE_FRAMES.map((f) => f.id), d.frame),
    c1: typeof r.c1 === "string" && HEX.test(r.c1) ? r.c1.toLowerCase() : d.c1,
    c2: typeof r.c2 === "string" && HEX.test(r.c2) ? r.c2.toLowerCase() : d.c2,
    font: pick(r.font, TABLE_FONTS.map((f) => f.id), d.font),
    light: typeof r.light === "boolean" ? r.light : d.light,
    brand: typeof r.brand === "boolean" ? r.brand : d.brand,
  };
}

/** The paid choices a look uses, in words (empty = all free). */
export function tablePaidUsed(look: TableLook): string[] {
  const out: string[] = [];
  const frame = TABLE_FRAMES.find((f) => f.id === look.frame);
  if (frame?.paid) out.push(look.frame === "custom" ? "your own colors" : `the ${frame.label} theme`);
  const font = TABLE_FONTS.find((f) => f.id === look.font);
  if (font?.paid) out.push(font.label);
  if (look.light) out.push("the light version");
  if (!look.brand) out.push("no gameshuffle.co line");
  return out;
}

/** The look with every paid choice swapped for its free version. */
export function freeTableLook(look: TableLook): TableLook {
  return {
    ...look,
    frame: TABLE_FRAMES.find((f) => f.id === look.frame)?.paid ? "teams" : look.frame,
    font: TABLE_FONTS.find((f) => f.id === look.font)?.paid ? "gabarito" : look.font,
    light: false,
    brand: true,
  };
}

/** The frame's two colors, or null for "teams" (the frame follows the teams). */
export function frameColors(look: TableLook): { a: string; b: string; on: string } | null {
  if (look.frame === "custom") return { a: look.c1, b: look.c2, on: readableOn(look.c1) };
  const t = THEMES.find((x) => x.id === look.frame);
  return t ? { a: t.primary, b: t.accent, on: t.on } : null;
}

// ── Team colors that read ───────────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("")}`;
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const x = lum(toRgb(a)), y = lum(toRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const readableOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#0b0e13") ? "#ffffff" : "#0b0e13");

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]: [number, number, number]): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** The surface team-colored text sits on: the rows' near-black, or the light version's white. */
export const SURFACE = { dark: "#0a0c14", light: "#ffffff" } as const;

/**
 * A team color made readable as text on the table (4.5:1 against its surface): lighter on dark, darker on light,
 * keeping the hue. Greys stay greys.
 */
export function readableTeamColor(color: string, light: boolean): string {
  if (!HEX.test(color)) return light ? "#1f2a44" : "#e8edf3";
  const bg = light ? SURFACE.light : SURFACE.dark;
  const [h, s, l0] = toHsl(toRgb(color));
  let l = l0;
  for (let i = 0; i < 60 && contrast(toHex(fromHsl([h, s, l])), bg) < 4.5; i++) l = light ? l - 0.02 : l + 0.02;
  return toHex(fromHsl([h, s, Math.max(0, Math.min(1, l))]));
}

/** Readable colors that stand apart, for a team whose own color is too close to another team's. */
const SPARE = ["#8cc8f0", "#f2c14e", "#57d49a", "#ff8a7a", "#b69cff", "#ff8fc7", "#7ee0e0", "#d8e86a"];

/** How far apart two colors look: hue for colorful ones, lightness for greys. */
function apart(a: string, b: string): boolean {
  const [h1, s1, l1] = toHsl(toRgb(a));
  const [h2, s2, l2] = toHsl(toRgb(b));
  if (s1 < 0.18 || s2 < 0.18) return Math.abs(l1 - l2) > 0.25 || (s1 < 0.18) !== (s2 < 0.18);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return dh > 28;
}

/**
 * Each team's color as the table draws it, made readable. A color set on the team's card is always used; one picked
 * from a logo or a tag that's too close to a color already on the table gets the first spare that stands apart.
 */
export function tableColors(teams: { color: string; own: boolean }[], light: boolean): string[] {
  const out: (string | null)[] = teams.map((t) => (t.own ? readableTeamColor(t.color, light) : null));
  teams.forEach((t, i) => {
    if (t.own) return;
    let c = readableTeamColor(t.color, light);
    const taken = out.filter((x): x is string => !!x);
    if (taken.some((o) => !apart(o, c))) {
      const spare = SPARE.map((x) => readableTeamColor(x, light)).find((x) => taken.every((o) => apart(o, x)));
      if (spare) c = spare;
    }
    out[i] = c;
  });
  return out as string[];
}
