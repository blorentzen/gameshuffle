/**
 * Base path for all game asset images.
 * Change this to the CDN URL when migrating (e.g., "https://cdn.empac.co").
 * All image paths in the game data JSON are relative to this base.
 */
export const IMAGE_BASE_PATH = "";

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
 * Current data uses paths like "/files/images/fg/mk8dx/characters/mario.png"
 * which need to map to "/images/fg/mk8dx/characters/mario.png" in Next.js public/.
 */
export function getImagePath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/files\/images\//, "/images/");
  return `${IMAGE_BASE_PATH}${normalized}`;
}

/**
 * Resolves a GameAsset to an image src, applying path transforms.
 * Returns null if the asset has no src.
 */
export function resolveAsset(asset: GameAsset): string | null {
  if (!asset.src) return null;
  return getImagePath(asset.src);
}
