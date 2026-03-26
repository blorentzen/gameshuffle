/**
 * Base path for all game asset images.
 * Change this to the CDN URL when migrating (e.g., "https://cdn.empac.co").
 * All image paths in the game data JSON are relative to this base.
 */
export const IMAGE_BASE_PATH = "";

/**
 * Transforms a game data image path for use in the app.
 * Current data uses paths like "/files/images/fg/mk8dx/characters/mario.png"
 * which need to map to "/images/fg/mk8dx/characters/mario.png" in Next.js public/.
 */
export function getImagePath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/files\/images\//, "/images/");
  return `${IMAGE_BASE_PATH}${normalized}`;
}
