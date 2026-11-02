/**
 * How a war overlay looks (overlay looks picks 2026-10-31, https://claude.ai/artifact/978WaHqftmK17ogWAWe19J, all as
 * recommended; Britton: plenty to customize, with GS Pro or the monthly Supporter level as the obvious way to unlock
 * more). Pure, client-safe.
 *
 * Free: all four layouts, Dark / Light / See-through, ice or team colors, Rubik or GameShuffle's font, every piece and
 * moment, which team sits on the left. Paid looks (GS Pro or Supporter looks, the MMR card's rule): brand themes, your
 * own two colors, the MMR card's other fonts, and hiding the GameShuffle line.
 *
 * Free choices travel in the OBS link (`lookParams`). Paid ones only show from a look saved to an account that has
 * looks (war_looks, wars-m2.sql); anything else is drawn as its free version (`freeLook`).
 */

import { BRAND_THEMES } from "@/lib/theme/brand";
import { FONTS, type MmrFont } from "@/lib/mmr/look";

export type WarLayout = "bug" | "strip" | "corner" | "list";
export type WarSurface = "dark" | "light" | "glass";
export type WarFont = Exclude<MmrFont, "google">;
export type WarBrand = "inside" | "mark" | "off";

export interface WarPieces { logos: boolean; markers: boolean; race: boolean; comeback: boolean; places: boolean }
export interface WarMoments { race: boolean; caught: boolean; final: boolean }

export interface WarLook {
  layout: WarLayout;
  surface: WarSurface;
  /** "ice" (the app's colors), "teams" (each team's color glows from its side), a brand theme id, or "custom". */
  colors: string;
  c1: string;
  c2: string;
  font: WarFont;
  pieces: WarPieces;
  moments: WarMoments;
  /** Which team is on the left: the channel's own team, or the other one (for the other team's stream). */
  side: "us" | "them";
  brand: WarBrand;
}

export const WAR_LAYOUTS: { id: WarLayout; label: string; where: string; size: [number, number] }[] = [
  { id: "bug", label: "Scorebug", where: "Bottom center", size: [1000, 230] },
  { id: "strip", label: "Top strip", where: "Full width, top", size: [1920, 110] },
  { id: "corner", label: "Corner card", where: "A corner", size: [520, 300] },
  { id: "list", label: "Race list", where: "A side column", size: [440, 800] },
];
export const layoutInfo = (id: WarLayout) => WAR_LAYOUTS.find((l) => l.id === id) ?? WAR_LAYOUTS[0];

export const WAR_SURFACES: { id: WarSurface; label: string }[] = [
  { id: "dark", label: "Dark" }, { id: "light", label: "Light" }, { id: "glass", label: "See-through" },
];

export const WAR_BRANDS = BRAND_THEMES.filter((t) => t.id !== "default" && t.id !== "custom");
export const FREE_COLORS = ["ice", "teams"] as const;
export const WAR_COLORS: { id: string; label: string; paid: boolean }[] = [
  { id: "ice", label: "Ice", paid: false },
  { id: "teams", label: "Team colors", paid: false },
  ...WAR_BRANDS.map((t) => ({ id: t.id, label: t.name, paid: true })),
  { id: "custom", label: "Your two colors", paid: true },
];

export const WAR_FONTS: { id: WarFont; label: string; paid: boolean }[] = [
  { id: "rubik", label: "Rubik Italic", paid: false },
  { id: "gabarito", label: "GameShuffle", paid: false },
  { id: "kanit", label: "Kanit Italic", paid: true }, { id: "exo", label: "Exo 2 Italic", paid: true }, { id: "titan", label: "Titan One", paid: true },
  { id: "mplus", label: "M PLUS Rounded", paid: true }, { id: "russo", label: "Russo One", paid: true }, { id: "lilita", label: "Lilita One", paid: true },
  { id: "bungee", label: "Bungee", paid: true }, { id: "bebas", label: "Bebas Neue", paid: true }, { id: "chakra", label: "Chakra Petch", paid: true },
  { id: "fredoka", label: "Fredoka", paid: true }, { id: "grotesk", label: "Space Grotesk", paid: true },
];

export const WAR_BRANDINGS: { id: WarBrand; label: string; paid: boolean }[] = [
  { id: "inside", label: "Built by GameShuffle", paid: false },
  { id: "mark", label: "Mark only", paid: false },
  { id: "off", label: "Off", paid: true },
];

export const PIECE_LABELS: { id: keyof WarPieces; label: string }[] = [
  { id: "logos", label: "Logos" }, { id: "markers", label: "Race markers" }, { id: "race", label: "Race and track" },
  { id: "comeback", label: "Comeback line" }, { id: "places", label: "This race's places" },
];
export const MOMENT_LABELS: { id: keyof WarMoments; label: string }[] = [
  { id: "race", label: "A race lands" }, { id: "caught", label: "Can't be caught" }, { id: "final", label: "Final" },
];

export const DEFAULT_WAR_LOOK: WarLook = {
  layout: "bug",
  surface: "dark",
  colors: "ice",
  c1: "#8cc8f0",
  c2: "#f2c14e",
  font: "rubik",
  pieces: { logos: true, markers: true, race: true, comeback: true, places: false },
  moments: { race: true, caught: true, final: true },
  side: "us",
  brand: "inside",
};

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Any stored or typed look, made safe (unknown values fall back to the default). */
export function cleanLook(raw: unknown): WarLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof WarLook, unknown>>;
  const d = DEFAULT_WAR_LOOK;
  const pieces = (r.pieces && typeof r.pieces === "object" ? r.pieces : {}) as Partial<Record<keyof WarPieces, unknown>>;
  const moments = (r.moments && typeof r.moments === "object" ? r.moments : {}) as Partial<Record<keyof WarMoments, unknown>>;
  return {
    layout: pick(r.layout, WAR_LAYOUTS.map((l) => l.id), d.layout),
    surface: pick(r.surface, WAR_SURFACES.map((s) => s.id), d.surface),
    colors: pick(r.colors, WAR_COLORS.map((c) => c.id), d.colors),
    c1: typeof r.c1 === "string" && HEX.test(r.c1) ? r.c1.toLowerCase() : d.c1,
    c2: typeof r.c2 === "string" && HEX.test(r.c2) ? r.c2.toLowerCase() : d.c2,
    font: pick(r.font, WAR_FONTS.map((f) => f.id), d.font),
    pieces: {
      logos: bool(pieces.logos, d.pieces.logos), markers: bool(pieces.markers, d.pieces.markers), race: bool(pieces.race, d.pieces.race),
      comeback: bool(pieces.comeback, d.pieces.comeback), places: bool(pieces.places, d.pieces.places),
    },
    moments: { race: bool(moments.race, d.moments.race), caught: bool(moments.caught, d.moments.caught), final: bool(moments.final, d.moments.final) },
    side: r.side === "them" ? "them" : "us",
    brand: pick(r.brand, WAR_BRANDINGS.map((b) => b.id), d.brand),
  };
}

/** The paid choices a look uses, by label (empty = all free). */
export function paidUsed(look: WarLook): string[] {
  const out: string[] = [];
  const color = WAR_COLORS.find((c) => c.id === look.colors);
  if (color?.paid) out.push(look.colors === "custom" ? "your own colors" : `the ${color.label} theme`);
  const font = WAR_FONTS.find((f) => f.id === look.font);
  if (font?.paid) out.push(font.label);
  if (look.brand === "off") out.push("no GameShuffle line");
  return out;
}

/** The look with every paid choice swapped for its free version (a lapsed plan, or a link without a saved look). */
export function freeLook(look: WarLook): WarLook {
  return {
    ...look,
    colors: FREE_COLORS.includes(look.colors as (typeof FREE_COLORS)[number]) ? look.colors : "ice",
    font: WAR_FONTS.find((f) => f.id === look.font)?.paid ? "rubik" : look.font,
    brand: look.brand === "off" ? "mark" : look.brand,
  };
}

// ── The OBS link ──────────────────────────────────────────────────────────────────────────────

const PIECE_KEYS: [keyof WarPieces, string][] = [["logos", "l"], ["markers", "m"], ["race", "r"], ["comeback", "c"], ["places", "p"]];
const MOMENT_KEYS: [keyof WarMoments, string][] = [["race", "r"], ["caught", "c"], ["final", "f"]];

/** A look's free choices as the link's query (only what differs from the default). */
export function lookParams(look: WarLook): URLSearchParams {
  const q = new URLSearchParams();
  const f = freeLook(look);
  const d = DEFAULT_WAR_LOOK;
  if (f.layout !== d.layout) q.set("layout", f.layout);
  if (f.surface !== d.surface) q.set("surface", f.surface);
  if (f.colors !== d.colors) q.set("colors", f.colors);
  if (f.font !== d.font) q.set("font", f.font);
  const pieces = PIECE_KEYS.filter(([k]) => f.pieces[k]).map(([, c]) => c).join("");
  if (pieces !== PIECE_KEYS.filter(([k]) => d.pieces[k]).map(([, c]) => c).join("")) q.set("show", pieces || "-");
  const moments = MOMENT_KEYS.filter(([k]) => f.moments[k]).map(([, c]) => c).join("");
  if (moments !== "rcf") q.set("moments", moments || "-");
  if (f.side === "them") q.set("side", "them");
  if (f.brand !== d.brand) q.set("gs", f.brand);
  return q;
}

/** The look a link's query asks for (always free: paid choices need a saved look). */
export function lookFromParams(q: { get(k: string): string | null }): WarLook {
  const d = DEFAULT_WAR_LOOK;
  const show = q.get("show");
  const moments = q.get("moments");
  return freeLook(cleanLook({
    layout: q.get("layout") ?? d.layout,
    surface: q.get("surface") ?? d.surface,
    colors: q.get("colors") ?? d.colors,
    font: q.get("font") ?? d.font,
    pieces: show == null ? d.pieces : Object.fromEntries(PIECE_KEYS.map(([k, c]) => [k, show.includes(c)])),
    moments: moments == null ? d.moments : Object.fromEntries(MOMENT_KEYS.map(([k, c]) => [k, moments.includes(c)])),
    side: q.get("side") ?? "us",
    brand: q.get("gs") ?? d.brand,
  }));
}

// ── Drawing ───────────────────────────────────────────────────────────────────────────────────

/** A lettered logo's color, the same for a team everywhere (the drawn card and the overlay share it). */
const TINTS = ["#1f5f9a", "#5b2a8a", "#2b6a4a", "#8a3b1f", "#3b3f8f", "#7a6a12", "#6a1f2a", "#1f4f6a"];
export const tagColor = (tag: string) => TINTS[[...tag].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

/** The accent pair a look draws with: ice by default, the brand theme's, or your own. */
export function accents(look: WarLook): { a: string; b: string } {
  if (look.colors === "custom") return { a: look.c1, b: look.c2 };
  const t = WAR_BRANDS.find((x) => x.id === look.colors);
  return t ? { a: t.primary, b: t.accent } : { a: "#8cc8f0", b: "#f2c14e" };
}

/** The font's family stack, weight and style (Rubik is self-hosted, --gs-font-mmr). */
export function warFont(look: WarLook): [string, number, "normal" | "italic"] {
  return FONTS[look.font] ?? FONTS.rubik;
}

const GOOGLE: Partial<Record<WarFont, string>> = {
  kanit: "Kanit:ital,wght@1,900", exo: "Exo+2:ital,wght@1,900", titan: "Titan+One", mplus: "M+PLUS+Rounded+1c:wght@900",
  russo: "Russo+One", lilita: "Lilita+One", bungee: "Bungee", bebas: "Bebas+Neue", chakra: "Chakra+Petch:wght@700",
  fredoka: "Fredoka:wght@700", grotesk: "Space+Grotesk:wght@700",
};
/** The Google Fonts stylesheet a paid font needs, or null (the free fonts are self-hosted). */
export const warFontSheet = (look: WarLook): string | null => (GOOGLE[look.font] ? `https://fonts.googleapis.com/css2?family=${GOOGLE[look.font]}&display=swap` : null);
