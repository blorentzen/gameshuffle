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

export function getBrandTheme(id: string | null | undefined): BrandTheme {
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
