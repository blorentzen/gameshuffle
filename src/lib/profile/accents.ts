/**
 * Profile accent palette (personalization). A per-profile accent tints the v2
 * chrome (active tab, section headings, featured ring) on top of the brand
 * theme. Client-safe: shared by the /u display + the account editor.
 */

export interface ProfileAccent {
  key: string;
  label: string;
  color: string;
  /** Contrast-safe text color to sit ON the accent (buttons, fills). */
  on: string;
}

const DARK_INK = "#16172a";

export const PROFILE_ACCENTS: ProfileAccent[] = [
  { key: "indigo", label: "Indigo", color: "#5b6cff", on: "#ffffff" },
  { key: "violet", label: "Violet", color: "#8b5cf6", on: "#ffffff" },
  { key: "magenta", label: "Magenta", color: "#d6409f", on: "#ffffff" },
  { key: "rose", label: "Rose", color: "#f43f5e", on: "#ffffff" },
  { key: "amber", label: "Amber", color: "#f59e0b", on: DARK_INK },
  { key: "emerald", label: "Emerald", color: "#10b981", on: DARK_INK },
  { key: "cyan", label: "Cyan", color: "#06b6d4", on: DARK_INK },
  { key: "slate", label: "Slate", color: "#64748b", on: "#ffffff" },
];

const BY_KEY = new Map(PROFILE_ACCENTS.map((a) => [a.key, a]));

/** Resolve a stored accent key → hex color, or null (fall back to brand). */
export function resolveAccent(key: string | null | undefined): string | null {
  if (!key) return null;
  return BY_KEY.get(key)?.color ?? null;
}

/** Contrast-safe on-color for a stored accent key, or null. */
export function resolveAccentOn(key: string | null | undefined): string | null {
  if (!key) return null;
  return BY_KEY.get(key)?.on ?? null;
}
