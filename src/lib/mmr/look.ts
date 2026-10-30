/**
 * How an MMR card looks (pure, client-safe). One look = a layout plus its theme.
 * Free: every layout, emblem frame and surface, division colors / GameShuffle blue /
 * a profile accent, solid / gradient / glyph backgrounds, roll or count, one saved look,
 * and "Built by GameShuffle" on the card. GS Pro: brand themes and your own two colors,
 * stripes and dots, your own picture or GIF, fonts, a two-color border, foil, your
 * picture as the emblem, hiding the GameShuffle line, and more saved looks.
 * Gradients are a glow on the card's own surface, never a full-color fill (Britton, 2026-10-20).
 * What's on the card (the pieces, the big number, the moments) is `info`, from pieces.ts.
 * Feedback round (2026-10-29, picks https://claude.ai/artifact/5UPZ1gdJ62AgrQLbcaaMLW, all as recommended):
 * the default font is Rubik Black Italic (self-hosted; GameShuffle's font stays a free choice, and
 * looks saved on the old default "gs" moved to it), about a dozen Google Fonts plus any Google Font by
 * name for paid looks, the country as a code, a flag or both (new looks start on the flag), any one
 * accent color and a border color of its own for free, and a Line up choice (left or center).
 * Paid looks come with GS Pro or Supporter looks (src/lib/support/looks.ts).
 */

import { BRAND_THEMES } from "@/lib/theme/brand";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";
import { isMmrGame, splitDivision, type MmrGame } from "./rules";
import { DEFAULT_INFO, cleanInfo, freeInfo, proPiecesUsed, type MmrInfo } from "./pieces";
import { DEFAULT_ROLLING, cleanRolling, freeRolling, proRollingUsed, type MmrRolling } from "./rolling";

export type MmrLayout = "deck" | "panel" | "strip" | "sticker" | "rolling";
export type MmrSurface = "dark" | "light" | "glass";
export type MmrFill = "solid" | "gradient" | "glyphs" | "stripes" | "dots" | "picture";
export type MmrFrame = "tile" | "crest" | "coin" | "name" | "off" | "picture";
export type MmrFont =
  | "rubik" | "gabarito"
  | "kanit" | "exo" | "titan" | "mplus" | "russo" | "lilita" | "bungee" | "bebas" | "chakra" | "fredoka" | "grotesk"
  | "google";
const FONT_IDS: readonly MmrFont[] = ["rubik", "gabarito", "kanit", "exo", "titan", "mplus", "russo", "lilita", "bungee", "bebas", "chakra", "fredoka", "grotesk", "google"];
/** The two free fonts: the default and GameShuffle's own. */
export const FREE_FONTS: readonly MmrFont[] = ["rubik", "gabarito"];
/** The country beside the name: the two-letter code, its flag, or both. */
export type MmrCountry = "code" | "flag" | "both";
/** A one-color border's color: the accent, white, the division's color, or your own. */
export type MmrEdge = "accent" | "white" | "division" | "custom";
/** Where the number (and a lone panel tile) sits. */
export type MmrAlign = "left" | "center";
export type MmrBorder = "none" | "one" | "two";
export type MmrBrand = "inside" | "tab" | "mark" | "off";

export interface MmrLook {
  id: string;
  name: string;
  game: MmrGame;
  layout: MmrLayout;
  surface: MmrSurface;
  /** "division", "gs", "accent", a brand theme id, or "custom". */
  colors: string;
  /** "Your color": a profile accent key, or any color as #rrggbb (free). */
  accent: string;
  custom: [string, string];
  fill: MmrFill;
  /** Your own background (GS Pro): a URL in our picture storage. */
  picture: string | null;
  emblem: MmrFrame;
  font: MmrFont;
  /** "Any Google Font" (paid looks): the family name and the weight /api/mmr/font found for it. */
  fontName: string;
  fontWeight: number;
  /** The country piece as a code, a flag or both. */
  country: MmrCountry;
  border: MmrBorder;
  /** A one-color border's color (free), and your own when `edge` is "custom". */
  edge: MmrEdge;
  edgeColor: string;
  foil: boolean;
  /** Line up: the number (and a lone panel tile) on the left or centered. */
  align: MmrAlign;
  brand: MmrBrand;
  /** How the number moves when it changes (the "number moves" moment can turn it off). */
  number: "roll" | "count";
  /** What's on the card: each piece's switch, the big number, recent events, GS Pro's order and line, the moments. */
  info: MmrInfo;
  /** The Rolling layout's shape, name and emblem, motion, time per slide and progress mark (rolling.ts). */
  rolling: MmrRolling;
}

export const DEFAULT_LOOK: MmrLook = {
  id: "main",
  name: "My card",
  game: "mkworld12p",
  layout: "deck",
  surface: "dark",
  colors: "gs",
  accent: "indigo",
  custom: ["#ff2d95", "#00e5ff"],
  fill: "glyphs",
  picture: null,
  emblem: "tile",
  font: "rubik",
  fontName: "",
  fontWeight: 400,
  country: "flag",
  border: "none",
  edge: "accent",
  edgeColor: "#ffd25a",
  foil: false,
  align: "left",
  brand: "inside",
  number: "roll",
  info: DEFAULT_INFO,
  rolling: DEFAULT_ROLLING,
};

export const MAX_LOOKS = { free: 1, pro: 10 } as const;

const BRANDS = BRAND_THEMES.filter((t) => t.id !== "default");

/** The studio's choices, in order. `pro` options can be tried in the preview; saving them needs GS Pro. */
export const LOOK_CHOICES: { id: keyof MmrLook; label: string; opts: { v: string | boolean; label: string; pro?: boolean }[] }[] = [
  { id: "layout", label: "Layout", opts: [{ v: "deck", label: "Deck card" }, { v: "panel", label: "Overlay panel" }, { v: "strip", label: "Squares strip" }, { v: "sticker", label: "Sticker" }, { v: "rolling", label: "Rolling" }] },
  { id: "surface", label: "Surface", opts: [{ v: "dark", label: "Dark" }, { v: "light", label: "Light" }, { v: "glass", label: "See-through" }] },
  { id: "colors", label: "Colors", opts: [
    { v: "division", label: "Division colors" }, { v: "gs", label: "GameShuffle blue" }, { v: "accent", label: "Your color" },
    ...BRANDS.map((t) => ({ v: t.id, label: t.name, pro: true })),
    { v: "custom", label: "Your two colors", pro: true },
  ] },
  { id: "fill", label: "Background", opts: [
    { v: "solid", label: "Solid" }, { v: "gradient", label: "Glow" }, { v: "glyphs", label: "Glyphs" },
    { v: "stripes", label: "Stripes", pro: true }, { v: "dots", label: "Dots", pro: true }, { v: "picture", label: "Your picture or GIF", pro: true },
  ] },
  { id: "emblem", label: "Emblem", opts: [
    { v: "tile", label: "Tile" }, { v: "crest", label: "Crest" }, { v: "coin", label: "Coin" }, { v: "name", label: "Name only" }, { v: "off", label: "Off" },
    { v: "picture", label: "Your picture", pro: true },
  ] },
  { id: "font", label: "Font", opts: [
    { v: "rubik", label: "Rubik Italic" }, { v: "gabarito", label: "GameShuffle" },
    { v: "kanit", label: "Kanit Italic", pro: true }, { v: "exo", label: "Exo 2 Italic", pro: true }, { v: "titan", label: "Titan One", pro: true },
    { v: "mplus", label: "M PLUS Rounded", pro: true }, { v: "russo", label: "Russo One", pro: true }, { v: "lilita", label: "Lilita One", pro: true },
    { v: "bungee", label: "Bungee", pro: true }, { v: "bebas", label: "Bebas Neue", pro: true }, { v: "chakra", label: "Chakra Petch", pro: true },
    { v: "fredoka", label: "Fredoka", pro: true }, { v: "grotesk", label: "Space Grotesk", pro: true }, { v: "google", label: "Any Google Font", pro: true },
  ] },
  { id: "border", label: "Border", opts: [{ v: "none", label: "None" }, { v: "one", label: "One color" }, { v: "two", label: "Two colors", pro: true }] },
  { id: "foil", label: "Finish", opts: [{ v: false, label: "Plain" }, { v: true, label: "Foil", pro: true }] },
  { id: "brand", label: "GameShuffle branding", opts: [
    { v: "inside", label: "Built by GameShuffle" }, { v: "tab", label: "Tab under the card" }, { v: "mark", label: "Mark only" },
    { v: "off", label: "Hide", pro: true },
  ] },
];

/** The number's two ways of moving (Moments). */
export const NUMBER_CHOICES: { v: MmrLook["number"]; label: string }[] = [{ v: "roll", label: "Roll" }, { v: "count", label: "Count up" }];

/** The GS Pro choices this look uses, by label. */
export function proUsed(look: MmrLook): string[] {
  const out: string[] = [];
  for (const c of LOOK_CHOICES) {
    const o = c.opts.find((x) => x.v === look[c.id]);
    if (o?.pro) out.push(o.label);
  }
  return [...out, ...proPiecesUsed(look.info), ...proRollingUsed(look.rolling)];
}

/** What a free card shows for a look saved with GS Pro choices (kept, not lost, if Pro ends). */
export function freeLook(look: MmrLook): MmrLook {
  const pro = (id: keyof MmrLook) => LOOK_CHOICES.find((c) => c.id === id)?.opts.find((o) => o.v === look[id])?.pro;
  return {
    ...look,
    colors: pro("colors") ? "gs" : look.colors,
    fill: pro("fill") ? "gradient" : look.fill,
    emblem: pro("emblem") ? "tile" : look.emblem,
    font: FREE_FONTS.includes(look.font) ? look.font : "rubik",
    border: look.border === "two" ? "one" : look.border,
    foil: false,
    brand: look.brand === "off" ? "inside" : look.brand,
    info: freeInfo(look.info),
    rolling: freeRolling(look.rolling),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** The weights /api/mmr/font tries, heaviest first. */
export const FONT_WEIGHTS = [900, 800, 700, 600, 400];
/** A Google Font family name as typed: letters, digits and spaces, up to 40 characters. */
export function cleanFontName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** A look from untrusted input (the studio, the database), with every value checked. */
export function cleanLook(raw: unknown, fallbackId = "main"): MmrLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  const colorIds = LOOK_CHOICES.find((c) => c.id === "colors")!.opts.map((o) => String(o.v));
  const custom = Array.isArray(r.custom) && r.custom.length === 2 && r.custom.every((c) => typeof c === "string" && HEX.test(c)) ? [String(r.custom[0]), String(r.custom[1])] as [string, string] : d.custom;
  const picture = typeof r.picture === "string" && /^https:\/\/[^\s"'<>]+$/.test(r.picture) ? r.picture : null;
  const layout = pick(r.layout, ["deck", "panel", "strip", "sticker", "rolling"] as const, d.layout);
  return {
    id: typeof r.id === "string" && /^[a-z0-9-]{1,24}$/.test(r.id) ? r.id : fallbackId,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : d.name,
    game: isMmrGame(r.game) ? r.game : d.game,
    layout,
    surface: pick(r.surface, ["dark", "light", "glass"] as const, d.surface),
    colors: colorIds.includes(String(r.colors)) ? String(r.colors) : d.colors,
    accent: PROFILE_ACCENTS.some((a) => a.key === r.accent) || (typeof r.accent === "string" && HEX.test(r.accent)) ? String(r.accent).toLowerCase() : d.accent,
    custom,
    fill: pick(r.fill, ["solid", "gradient", "glyphs", "stripes", "dots", "picture"] as const, d.fill),
    picture,
    emblem: pick(r.emblem, ["tile", "crest", "coin", "name", "off", "picture"] as const, d.emblem),
    // "gs" was the default until 2026-10-29 (GameShuffle's font): those looks moved to the new default.
    font: r.font === "gs" ? "rubik" : pick(r.font, FONT_IDS, d.font),
    fontName: cleanFontName(r.fontName),
    fontWeight: FONT_WEIGHTS.includes(Number(r.fontWeight)) ? Number(r.fontWeight) : 400,
    // Looks saved before flags keep the code; new looks start on the flag.
    country: pick(r.country, ["code", "flag", "both"] as const, "code"),
    border: pick(r.border, ["none", "one", "two"] as const, d.border),
    edge: pick(r.edge, ["accent", "white", "division", "custom"] as const, d.edge),
    edgeColor: typeof r.edgeColor === "string" && HEX.test(r.edgeColor) ? r.edgeColor.toLowerCase() : d.edgeColor,
    foil: r.foil === true,
    align: r.align === "center" ? "center" : "left",
    brand: pick(r.brand, ["inside", "tab", "mark", "off"] as const, d.brand),
    number: r.number === "count" ? "count" : "roll",
    // A look saved before the pieces had switches has `show` instead: it keeps exactly what its layout showed.
    info: cleanInfo(r.info, r.show, layout),
    rolling: cleanRolling(r.rolling),
  };
}

// ── Division looks ────────────────────────────────────────────────────────

export interface DivisionLook {
  base: string;
  level: number | null;
  /** Light and dark shades: the emblem's metal or gem. */
  c: string;
  c2: string;
  kind: "metal" | "gem" | "crown" | "placement";
  /** Metals: 1-3 chevrons, 4 a star. Gems: 1 outline, 2 solid, 3 ringed, 4 ringed with sparkles. */
  mark: number;
  laurel?: boolean;
}

const DIVISION_LOOKS: Record<string, Omit<DivisionLook, "base" | "level">> = {
  Iron: { c: "#a3a9b4", c2: "#4b505b", kind: "metal", mark: 1 },
  Bronze: { c: "#e09a5c", c2: "#7a4420", kind: "metal", mark: 2 },
  Silver: { c: "#d7dde6", c2: "#6f7886", kind: "metal", mark: 3 },
  Gold: { c: "#ffd25a", c2: "#a87310", kind: "metal", mark: 4 },
  Platinum: { c: "#8fe6f0", c2: "#23798c", kind: "gem", mark: 1 },
  Sapphire: { c: "#6f9bff", c2: "#1f3fb5", kind: "gem", mark: 2 },
  Ruby: { c: "#ff6680", c2: "#a3122e", kind: "gem", mark: 3 },
  Diamond: { c: "#d6f6ff", c2: "#4b93b3", kind: "gem", mark: 4 },
  Master: { c: "#c39bff", c2: "#5a24b0", kind: "crown", mark: 1 },
  Grandmaster: { c: "#ffcf4a", c2: "#c2254f", kind: "crown", mark: 2, laurel: true },
};
const PLACEMENT: Omit<DivisionLook, "base" | "level"> = { c: "#b6bccb", c2: "#4a5063", kind: "placement", mark: 0 };

export function divisionLook(name: string): DivisionLook {
  const { base, level } = splitDivision(name || "Placement");
  return { base, level, ...(DIVISION_LOOKS[base] ?? PLACEMENT) };
}

// ── Colors on the card ────────────────────────────────────────────────────

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (a: number[]) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Toward black (amt < 0) or white (amt > 0). */
export const shade = (h: string, amt: number) => rgbHex(hexRgb(h).map((v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
export const luminance = (h: string) => {
  const [r, g, b] = hexRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** g2 + hl2 glow from the corners; hl is the accent for bars, borders and chips. */
export function palette(look: MmrLook, div: DivisionLook): { g2: string; hl: string; hl2: string } {
  if (look.colors === "division") return { g2: shade(div.c2, -0.04), hl: div.c, hl2: div.c2 };
  if (look.colors === "gs") return { g2: "#4b5cf5", hl: "#5b8cff", hl2: "#c949e9" };
  if (look.colors === "accent") {
    const a = HEX.test(look.accent) ? look.accent : PROFILE_ACCENTS.find((x) => x.key === look.accent)?.color ?? "#5b6cff";
    return { g2: shade(a, -0.1), hl: a, hl2: shade(a, 0.4) };
  }
  if (look.colors === "custom") return { g2: look.custom[0], hl: look.custom[1], hl2: look.custom[0] };
  const t = BRANDS.find((b) => b.id === look.colors);
  return t ? { g2: t.primary, hl: t.accent, hl2: t.primary } : { g2: "#4b5cf5", hl: "#5b8cff", hl2: "#c949e9" };
}

const GS = 'var(--gs-font-display), "Gabarito", "Outfit", system-ui, sans-serif';
/** Each font: its family stack, weight and style. Rubik is self-hosted (mmrFonts.ts, --gs-font-mmr). */
export const FONTS: Record<Exclude<MmrFont, "google">, [string, number, "normal" | "italic"]> = {
  rubik: [`var(--gs-font-mmr), "Rubik", ${GS}`, 900, "italic"],
  gabarito: [GS, 800, "normal"],
  kanit: [`"Kanit", ${GS}`, 900, "italic"],
  exo: [`"Exo 2", ${GS}`, 900, "italic"],
  titan: [`"Titan One", ${GS}`, 400, "normal"],
  mplus: [`"M PLUS Rounded 1c", ${GS}`, 900, "normal"],
  russo: [`"Russo One", ${GS}`, 400, "normal"],
  lilita: [`"Lilita One", ${GS}`, 400, "normal"],
  bungee: [`"Bungee", ${GS}`, 400, "normal"],
  bebas: [`"Bebas Neue", ${GS}`, 400, "normal"],
  chakra: [`"Chakra Petch", ${GS}`, 700, "normal"],
  fredoka: [`"Fredoka", ${GS}`, 700, "normal"],
  grotesk: [`"Space Grotesk", ${GS}`, 700, "normal"],
};
const GOOGLE_FAMILY: Partial<Record<MmrFont, string>> = {
  kanit: "Kanit:ital,wght@1,900", exo: "Exo+2:ital,wght@1,900", titan: "Titan+One", mplus: "M+PLUS+Rounded+1c:wght@900",
  russo: "Russo+One", lilita: "Lilita+One", bungee: "Bungee", bebas: "Bebas+Neue", chakra: "Chakra+Petch:wght@700",
  fredoka: "Fredoka:wght@700", grotesk: "Space+Grotesk:wght@700",
};
/** A family name as Google's stylesheet address wants it ("Exo 2" → "Exo+2"). */
export const googleFamily = (name: string) => cleanFontName(name).split(" ").map(encodeURIComponent).join("+");

/** The look's font: family stack, weight and style ("Any Google Font" falls back to the default until it has a name). */
export function fontOf(look: Pick<MmrLook, "font" | "fontName" | "fontWeight">): [string, number, "normal" | "italic"] {
  if (look.font === "google") {
    const name = cleanFontName(look.fontName);
    return name ? [`"${name}", ${GS}`, look.fontWeight || 400, "normal"] : FONTS.rubik;
  }
  return FONTS[look.font] ?? FONTS.rubik;
}

/** The Google Fonts stylesheet for a look's font, or null (the free fonts are self-hosted). */
export function fontStylesheet(look: Pick<MmrLook, "font" | "fontName" | "fontWeight">): string | null {
  const fam = look.font === "google" ? (cleanFontName(look.fontName) ? `${googleFamily(look.fontName)}:wght@${look.fontWeight || 400}` : null) : GOOGLE_FAMILY[look.font];
  return fam ? `https://fonts.googleapis.com/css2?family=${fam}&display=swap` : null;
}

/** CSS variables for a card in a division. */
export function lookVars(look: MmrLook, div: DivisionLook): Record<string, string> {
  const p = palette(look, div);
  const light = look.surface === "light" && look.fill !== "picture";
  const acc = light ? (luminance(p.hl) > 0.3 ? shade(p.hl, -0.5) : p.hl) : luminance(p.hl) < 0.12 ? shade(p.hl, 0.45) : p.hl;
  const [fam, fw, fs] = fontOf(look);
  const edge = look.edge === "white" ? "#ffffff" : look.edge === "division" ? div.c : look.edge === "custom" ? look.edgeColor : p.hl;
  return {
    "--mmr-g2": p.g2,
    "--mmr-hl": p.hl,
    "--mmr-hl2": p.hl2,
    "--mmr-acc": acc,
    "--mmr-on": luminance(p.hl) > 0.4 ? "#17172b" : "#ffffff",
    "--mmr-dc": div.c,
    "--mmr-dc2": div.c2,
    "--mmr-dtext": light ? shade(div.c2, -0.15) : div.c,
    "--mmr-dslot": shade(div.c2, -0.2),
    "--mmr-font": fam,
    "--mmr-fw": String(fw),
    "--mmr-fs": fs,
    "--mmr-edge": edge,
    ...(look.fill === "picture" && look.picture ? { "--mmr-picture": `url("${look.picture.replace(/"/g, "")}")` } : {}),
  };
}
