import "server-only";

/**
 * Crawler-facing URLs for the deck cluster (deck pages + Battle Boxes).
 *
 * Canonicals are built from SITE_URL and the slug, never from the frontmatter
 * `canonical` field: that field once held the bare domain, which redirects to
 * www, so every deck page pointed its canonical at a redirect.
 *
 * Share images: frontmatter `og_image` paths were written before the art
 * existed (there is no public/decks/ folder), so a path only counts when the
 * file is really in public/. Anything else falls back to the deck index's
 * share image, which always exists. The deck pages are statically generated,
 * so the file check runs at build time, where public/ is on disk.
 *
 * Never add a static opengraph-image file inside the dynamic [deck] or [slug]
 * folders instead: it breaks the production build in this repo.
 */

import fs from "node:fs";
import path from "node:path";
import { SITE_URL } from "@/lib/seo";

export const DECKS_INDEX_URL = `${SITE_URL}/pokemon-tcg/decks`;

/** The deck index's share image (src/app/pokemon-tcg/decks/opengraph-image.jpg). */
export const DECKS_SHARE_IMAGE = `${DECKS_INDEX_URL}/opengraph-image.jpg`;

export function deckUrl(slug: string): string {
  return `${DECKS_INDEX_URL}/${slug}`;
}

export function battleBoxUrl(slug: string): string {
  return `${DECKS_INDEX_URL}/battle-box/${slug}`;
}

/** Absolute share image URL for a frontmatter `og_image`, or the fallback. */
export function shareImage(ogImage: string | null | undefined): string {
  const src = (ogImage ?? "").trim();
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith("/") && !src.includes("..")) {
    const file = path.join(process.cwd(), "public", src);
    if (fs.existsSync(file)) return `${SITE_URL}${src}`;
  }
  return DECKS_SHARE_IMAGE;
}
