/**
 * Shared helper: is a tier-list item / bingo prompt an image (an http(s) URL
 * ending in an image extension) rather than text? Used by the setup cards to
 * preview thumbnails and by the overlays to render <img> instead of text —
 * mirroring the free tier-list maker. Server-safe (no client deps).
 */

const IMG_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

export function isImageUrl(v: string): boolean {
  return IMG_URL_RE.test(v.trim());
}
