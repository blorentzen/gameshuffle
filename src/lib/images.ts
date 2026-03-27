import { resolveCdnUrl } from "./assets";

/**
 * Asset interface for all game imagery.
 * Components render a placeholder when src is null — no component
 * should break due to missing art.
 */
export interface GameAsset {
  src: string | null;
  alt: string;
  credit?: string;
  placeholderColor?: string;
}

/**
 * Default placeholder color (CDS brand blue).
 */
export const DEFAULT_PLACEHOLDER_COLOR = "#0E75C1";

/**
 * Transforms a game data image path for use in the app.
 * Post-CDN migration: full CDN URLs pass through unchanged.
 * Legacy paths are caught by resolveCdnUrl as a safety net.
 */
export function getImagePath(path: string): string {
  return resolveCdnUrl(path);
}

/**
 * Resolves a GameAsset to an image src.
 * Returns null if the asset has no src.
 */
export function resolveAsset(asset: GameAsset): string | null {
  if (!asset.src) return null;
  return getImagePath(asset.src);
}
