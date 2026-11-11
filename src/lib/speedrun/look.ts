/**
 * How the speedrun overlay looks (launch picks 2026-11-10, all as recommended: the MMR card's split). Pure and
 * client-safe.
 *
 * Free: every layout and number, the surface (dark, light, see-through), GameShuffle blue or one color of your own,
 * glyphs, glow or solid behind the panel, Rubik or GameShuffle's font, "Built by GameShuffle" or the mark alone.
 * GS Pro or Supporter looks (`hasLooks`, one rule across GameShuffle): brand themes, two colors of your own, stripes
 * and dots, the MMR card's other fonts, a two-color border, hiding the GameShuffle line, a line of your own.
 *
 * Paid choices can be tried in the setup preview and are kept when saved; the OBS overlay draws them only while the
 * runner has looks, else their free versions (`freeSpeedrunLook`).
 *
 * Colors become CSS variables (`speedrunVars`) worked out here as plain hex and rgba, because OBS before version 31
 * draws browser sources with Chromium 103, which has no color-mix().
 */

import { BRAND_THEMES } from "@/lib/theme/brand";
import { FONTS, fontStylesheet, luminance, shade } from "@/lib/mmr/look";
import type { SpeedrunBrand, SpeedrunFill, SpeedrunFont, SpeedrunLook, SpeedrunSurface } from "./types";

const BRANDS = BRAND_THEMES.filter((t) => t.id !== "default" && t.id !== "custom");
const HEX = /^#[0-9a-f]{6}$/i;

export interface LookOption<T> { v: T; label: string; paid?: boolean }

export const SURFACES: LookOption<SpeedrunSurface>[] = [
  { v: "dark", label: "Dark" }, { v: "light", label: "Light" }, { v: "glass", label: "See-through" },
];
export const COLORS: LookOption<string>[] = [
  { v: "gs", label: "GameShuffle blue" }, { v: "accent", label: "Your color" },
  ...BRANDS.map((t) => ({ v: t.id, label: t.name, paid: true })),
  { v: "custom", label: "Your two colors", paid: true },
];
export const FILLS: LookOption<SpeedrunFill>[] = [
  { v: "glyphs", label: "Glyphs" }, { v: "glow", label: "Glow" }, { v: "solid", label: "Solid" },
  { v: "stripes", label: "Stripes", paid: true }, { v: "dots", label: "Dots", paid: true },
];
export const FONT_CHOICES: LookOption<SpeedrunFont>[] = [
  { v: "rubik", label: "Rubik Italic" }, { v: "gabarito", label: "GameShuffle" },
  { v: "kanit", label: "Kanit Italic", paid: true }, { v: "exo", label: "Exo 2 Italic", paid: true }, { v: "titan", label: "Titan One", paid: true },
  { v: "mplus", label: "M PLUS Rounded", paid: true }, { v: "russo", label: "Russo One", paid: true }, { v: "lilita", label: "Lilita One", paid: true },
  { v: "bungee", label: "Bungee", paid: true }, { v: "bebas", label: "Bebas Neue", paid: true }, { v: "chakra", label: "Chakra Petch", paid: true },
  { v: "fredoka", label: "Fredoka", paid: true }, { v: "grotesk", label: "Space Grotesk", paid: true },
];
export const BRANDINGS: LookOption<SpeedrunBrand>[] = [
  { v: "inside", label: "Built by GameShuffle" }, { v: "mark", label: "GameShuffle mark only" }, { v: "off", label: "Hide it", paid: true },
];

export const LINE_MAX = 40;

/** The default look: the Column, PB, sum of best and attempts, dark GameShuffle blue with the glyphs. */
export const DEFAULT_SPEEDRUN_STYLE = {
  surface: "dark" as SpeedrunSurface,
  colors: "gs",
  accent: "#5b8cff",
  custom: ["#ff2d95", "#00e5ff"] as [string, string],
  fill: "glyphs" as SpeedrunFill,
  font: "rubik" as SpeedrunFont,
  border: "none" as const,
  brand: "inside" as SpeedrunBrand,
};

const pick = <T extends string>(v: unknown, list: readonly LookOption<T>[], d: T): T => (list.some((o) => o.v === v) ? (v as T) : d);

/**
 * The style half of a look, cleaned. Looks saved before the launch carry `theme` (a brand theme id, never used yet) and
 * no colors: a theme id becomes the colors.
 */
export function cleanStyle(o: Record<string, unknown>): Omit<SpeedrunLook, "layout" | "position" | "stats"> {
  const d = DEFAULT_SPEEDRUN_STYLE;
  const legacy = typeof o.theme === "string" && COLORS.some((c) => c.v === o.theme) ? o.theme : null;
  const custom = Array.isArray(o.custom) && o.custom.length === 2 && o.custom.every((c) => typeof c === "string" && HEX.test(c))
    ? [String(o.custom[0]).toLowerCase(), String(o.custom[1]).toLowerCase()] as [string, string] : d.custom;
  return {
    surface: pick(o.surface, SURFACES, d.surface),
    colors: pick(o.colors ?? legacy, COLORS, d.colors),
    accent: typeof o.accent === "string" && HEX.test(o.accent) ? o.accent.toLowerCase() : d.accent,
    custom,
    fill: pick(o.fill, FILLS, d.fill),
    font: pick(o.font, FONT_CHOICES, d.font),
    border: o.border === "two" ? "two" : "none",
    brand: pick(o.brand, BRANDINGS, d.brand),
    line: typeof o.line === "string" && o.line.trim() ? o.line.replace(/\s+/g, " ").trim().slice(0, LINE_MAX) : null,
  };
}

/** The paid choices a look uses, in words (empty = all free). */
export function speedrunPaidUsed(look: SpeedrunLook): string[] {
  const out: string[] = [];
  const color = COLORS.find((c) => c.v === look.colors);
  if (color?.paid) out.push(look.colors === "custom" ? "your two colors" : `the ${color.label} theme`);
  if (FILLS.find((f) => f.v === look.fill)?.paid) out.push(`${look.fill === "dots" ? "dots" : "stripes"} behind it`);
  const font = FONT_CHOICES.find((f) => f.v === look.font);
  if (font?.paid) out.push(font.label);
  if (look.border === "two") out.push("a two-color border");
  if (look.line) out.push("your own line");
  else if (look.brand === "off") out.push("no GameShuffle line");
  return out;
}

/** The look with every paid choice swapped for its free version (no looks, or a lapsed plan). */
export function freeSpeedrunLook(look: SpeedrunLook): SpeedrunLook {
  return {
    ...look,
    colors: COLORS.find((c) => c.v === look.colors)?.paid ? "gs" : look.colors,
    fill: FILLS.find((f) => f.v === look.fill)?.paid ? "glyphs" : look.fill,
    font: FONT_CHOICES.find((f) => f.v === look.font)?.paid ? "rubik" : look.font,
    border: "none",
    brand: look.brand === "off" ? "inside" : look.brand,
    line: null,
  };
}

// ── Drawing ───────────────────────────────────────────────────────────────

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h: string, a: number) => `rgba(${rgb(h).join(", ")}, ${a})`;

/** The look's three colors: g2 and hl2 glow from the corners, hl lights the current row, bars and the tile. */
export function speedrunPalette(look: SpeedrunLook): { g2: string; hl: string; hl2: string } {
  if (look.colors === "accent") {
    const a = HEX.test(look.accent) ? look.accent : "#5b8cff";
    return { g2: shade(a, -0.18), hl: a, hl2: shade(a, 0.35) };
  }
  if (look.colors === "custom") return { g2: look.custom[0], hl: look.custom[1], hl2: look.custom[0] };
  const t = BRANDS.find((b) => b.id === look.colors);
  return t ? { g2: t.primary, hl: t.accent, hl2: t.primary } : { g2: "#4b5cf5", hl: "#5b8cff", hl2: "#c949e9" };
}

/** CSS variables for the canvas (`.sr-cv`): colors for the surface, the font, and the pattern behind the panel. */
export function speedrunVars(look: SpeedrunLook): Record<string, string> {
  const p = speedrunPalette(look);
  const light = look.surface === "light";
  // On dark and see-through, a very dark color lifts so the current row still reads; on light, a pale one deepens.
  const hl = light ? (luminance(p.hl) > 0.35 ? shade(p.hl, -0.45) : p.hl) : luminance(p.hl) < 0.1 ? shade(p.hl, 0.45) : p.hl;
  const [family, weight, style] = FONTS[look.font] ?? FONTS.rubik;
  const bg = light ? "#f5f6fb" : look.surface === "glass" ? "rgba(8, 11, 24, 0.5)" : look.colors === "gs" ? "#11162e" : shade(p.g2, -0.82);
  return {
    "--sr-bg": bg,
    "--sr-g2": p.g2,
    "--sr-hl": hl,
    "--sr-hl2": p.hl2,
    "--sr-glow-1": rgba(p.g2, light ? 0.18 : look.surface === "glass" ? 0.24 : 0.36),
    "--sr-glow-2": rgba(p.hl2, light ? 0.1 : 0.17),
    "--sr-now-1": rgba(hl, light ? 0.22 : 0.52),
    "--sr-now-2": rgba(p.hl2, light ? 0.08 : 0.22),
    "--sr-pat": rgba(hl, light ? 0.1 : 0.12),
    "--sr-on": luminance(p.hl) > 0.45 ? "#14172b" : "#ffffff",
    "--sr-edge-1": p.hl,
    "--sr-edge-2": p.hl2 === p.hl ? shade(p.hl, 0.4) : p.hl2,
    "--sr-font-big": family,
    "--sr-fw-big": String(weight),
    "--sr-fs-big": style,
  };
}

/** The surface, background and border as classes on the canvas. */
export const speedrunClasses = (look: SpeedrunLook) => `sr-surf-${look.surface} sr-fill-${look.fill}${look.border === "two" ? " sr-border-two" : ""}`;

/** The Google Fonts stylesheet a paid font needs, or null (Rubik and GameShuffle's font are self-hosted). */
export const speedrunFontSheet = (look: SpeedrunLook): string | null => fontStylesheet({ font: look.font, fontName: "", fontWeight: 0 });
