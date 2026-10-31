/**
 * MKCentral's division medals (2026-10-30, picks https://claude.ai/artifact/TgmgR5U7oRfGYfRQ8S3qHo):
 * mushrooms for Iron and Bronze, flowers for Silver and Gold, stars for Platinum and Sapphire,
 * lightning for Ruby and Diamond, and the crown for Master (black and ice) and Grandmaster (black
 * and crimson). 128px PNGs, hosted with the site for now (public/images/comp-mario-kart/levels;
 * a copy of the CDN folder, which lacks grandmaster.png: point MEDAL_BASE at
 * https://cdn.empac.co/gameshuffle/images/comp-mario-kart/levels once it has it). The website's
 * pages that show them credit MKCentral (`MedalCredit`); overlays and shared things don't.
 * Placement has no medal and keeps our drawn question mark.
 */

export const MEDAL_BASE = "/images/comp-mario-kart/levels";

/** The medal files' size: anything drawn larger than this goes soft (bigger files are on the way). */
export const MEDAL_PX = 128;

const SITE = (process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co").replace(/\/$/, "");

const FILES: Record<string, string> = {
  Iron: "iron",
  Bronze: "bronze",
  Silver: "silver",
  Gold: "gold",
  Platinum: "platinum",
  Sapphire: "sapphire",
  Ruby: "ruby",
  Diamond: "diamond",
  Master: "master",
  Grandmaster: "grandmaster",
};

/** The medal for a division's base name ("Silver", not "Silver 1"), or null (Placement, unknown names). */
export function medalSrc(base: string): string | null {
  const file = FILES[base];
  return file ? `${MEDAL_BASE}/${file}.png` : null;
}

/** The medal's full address, for places off the site (Discord embeds). */
export function medalUrl(base: string): string | null {
  const src = medalSrc(base);
  return src ? (src.startsWith("http") ? src : `${SITE}${src}`) : null;
}
