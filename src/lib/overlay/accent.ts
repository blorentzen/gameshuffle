/**
 * Resolve a stored overlay accent value into a usable CSS color.
 *
 * Streamers set each tool's accent to either the global **brand theme** (the
 * default) or a **custom** hex. Storing the sentinel `"brand"` keeps the tool
 * linked to the brand theme, so changing the theme re-skins every tool at once;
 * a hex is a per-tool override. Empty/missing also falls back to the brand.
 *
 * `--brand-primary` / `--brand-accent` are set on the overlay root per streamer
 * (see OverlayClient `brandStyle`) and default to the site brand elsewhere, so
 * the returned `var(--brand-*)` always resolves.
 */
export function resolveOverlayAccent(value: string | null | undefined): string {
  if (!value || value === "brand") return "var(--brand-primary)";
  if (value === "brand-accent") return "var(--brand-accent)";
  return value;
}

/** True when the value follows the brand theme (vs a custom hex). */
export function isBrandAccent(value: string | null | undefined): boolean {
  return !value || value === "brand" || value === "brand-accent";
}
