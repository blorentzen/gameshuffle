/**
 * Brand themes — a streamer's customer-facing channel identity.
 *
 * A brand theme resolves to a small set of `--brand-*` CSS custom properties
 * that customer-facing surfaces (the OBS overlay, the public `/live` page)
 * apply on their root element. Baseline `--brand-*` defaults live in
 * `globals.css` (= the GameShuffle site brand), so `'default'` emits no
 * overrides and the feature is purely additive.
 *
 * Presets are built on the same palettes as the wheel themes (see
 * `lib/wheel/themes`) so a streamer's brand stays cohesive with their wheel;
 * each preset also maps to a `wheelThemeId` so a new wheel can default to the
 * brand palette. A custom-color builder is a deferred follow-on.
 */

import type { CSSProperties } from "react";
import { shade } from "@/lib/wheel/color";

export interface BrandTheme {
  id: string;
  name: string;
  /** Primary brand color (headers, accents, key chrome). */
  primary: string;
  /** Secondary accent. */
  accent: string;
  /** CSS gradient string for headers / bands. */
  gradient: string;
  /** Text/icon color that reads on `primary` / `gradient`. */
  on: string;
  /** Matching wheel theme id (for seeding a new wheel's palette). */
  wheelThemeId: string;
}

export const BRAND_THEMES: BrandTheme[] = [
  {
    id: "default",
    name: "Default",
    primary: "#0e75c1",
    accent: "#7048e8",
    gradient: "linear-gradient(135deg, #0a5f99, #0e75c1)",
    on: "#ffffff",
    wheelThemeId: "classic",
  },
  {
    id: "midnight",
    name: "Midnight",
    primary: "#2b3a67",
    accent: "#c6a24e",
    gradient: "linear-gradient(135deg, #16223f, #2b3a67)",
    on: "#f3ead2",
    wheelThemeId: "midnight",
  },
  {
    id: "neon",
    name: "Neon",
    primary: "#ff2d95",
    accent: "#00e5ff",
    gradient: "linear-gradient(135deg, #ff2d95, #7a5cff)",
    on: "#ffffff",
    wheelThemeId: "neon",
  },
  {
    id: "sunset",
    name: "Sunset",
    primary: "#ff6b6b",
    accent: "#ff9f43",
    gradient: "linear-gradient(135deg, #ff6b6b, #ff9f43)",
    on: "#ffffff",
    wheelThemeId: "sunset",
  },
  {
    id: "forest",
    name: "Forest",
    primary: "#2f9e44",
    accent: "#157a52",
    gradient: "linear-gradient(135deg, #157a52, #2f9e44)",
    on: "#ffffff",
    wheelThemeId: "forest",
  },
  {
    id: "candy",
    name: "Candy",
    primary: "#ff8fab",
    accent: "#a0e7e5",
    gradient: "linear-gradient(135deg, #ff8fab, #b4a7f5)",
    on: "#43314f",
    wheelThemeId: "candy",
  },
];

export const DEFAULT_BRAND_THEME_ID = "default";

const BY_ID = new Map(BRAND_THEMES.map((t) => [t.id, t]));

export const brandThemeIds = BRAND_THEMES.map((t) => t.id);

/** The custom-theme id. A stored value of `custom:#primary:#accent` resolves
 * to a `BrandTheme` with this id, its gradient + on-color derived from the two
 * chosen colors so a streamer gets a coherent theme from just Primary + Accent. */
export const CUSTOM_BRAND_THEME_ID = "custom";

const CUSTOM_RE = /^custom:(#[0-9a-fA-F]{6}):(#[0-9a-fA-F]{6})$/;

/** True for a well-formed `custom:#rrggbb:#rrggbb` stored value. */
export function isCustomThemeValue(value: string | null | undefined): boolean {
  return typeof value === "string" && CUSTOM_RE.test(value);
}

/** Serialize a Primary + Accent pair into the stored `custom:…` string. */
export function serializeCustomTheme(primary: string, accent: string): string {
  return `custom:${primary.toLowerCase()}:${accent.toLowerCase()}`;
}

/** Relative luminance (sRGB) → pick a text/icon color that reads on `hex`. */
function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.4152 * b;
  return lum > 0.42 ? "#1f2430" : "#ffffff";
}

/** Build a full `BrandTheme` from just Primary + Accent — gradient (darker→base
 * at 135°) and on-color are derived so the two-picker builder yields a cohesive
 * theme. `wheelThemeId` stays "classic" (custom themes don't seed a wheel). */
export function buildCustomTheme(primary: string, accent: string): BrandTheme {
  return {
    id: CUSTOM_BRAND_THEME_ID,
    name: "Custom",
    primary,
    accent,
    gradient: `linear-gradient(135deg, ${shade(primary, -0.22)}, ${primary})`,
    on: readableOn(primary),
    wheelThemeId: "classic",
  };
}

export function getBrandTheme(id: string | null | undefined): BrandTheme {
  if (typeof id === "string") {
    const m = CUSTOM_RE.exec(id);
    if (m) return buildCustomTheme(m[1], m[2]);
  }
  return (id && BY_ID.get(id)) || BRAND_THEMES[0];
}

/**
 * The `--brand-*` overrides for a theme, to spread onto a surface root's
 * `style`. Returns `{}` for the default theme so the `:root` baselines (the
 * site brand) stay in effect — nothing to override.
 */
export function brandCssVars(theme: BrandTheme): CSSProperties {
  if (theme.id === DEFAULT_BRAND_THEME_ID) return {};
  return {
    "--brand-primary": theme.primary,
    "--brand-accent": theme.accent,
    "--brand-gradient": theme.gradient,
    "--brand-on": theme.on,
  } as CSSProperties;
}
