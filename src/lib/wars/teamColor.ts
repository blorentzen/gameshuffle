import "server-only";

/**
 * A team's color from its logo (the overlay's Team colors look, and war tables for a team whose card has no color).
 * The logo's main colorful hue: clear and see-through pixels, greys, near-black and near-white say little about a
 * team, so they don't count. A logo with almost no color gives null (then the lettered logo's color is used).
 */

import sharp from "sharp";
import { tagColor } from "./look";

const cache = new Map<string, Promise<string | null>>();
const ALLOWED = new Set(["mkcentral.com", "gs-ugc.empac.co", "cdn.empac.co"]);

/** The main colorful hue of a picture's pixels (RGBA), or null when under 6% of what's opaque is colorful. */
export function mainColor(px: Buffer): string | null {
  const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let opaque = 0, colorful = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    opaque++;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 510;
    const d = (max - min) / 255;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.28 || l < 0.12 || l > 0.92) continue;
    colorful++;
    const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    const k = Math.floor(h * 2) % 12;
    const w = s;
    buckets[k].w += w; buckets[k].r += r * w; buckets[k].g += g * w; buckets[k].b += b * w;
  }
  if (!opaque || colorful / opaque < 0.06) return null;
  const top = buckets.reduce((a, b) => (b.w > a.w ? b : a));
  return `#${[top.r, top.g, top.b].map((v) => Math.round(v / top.w).toString(16).padStart(2, "0")).join("")}`;
}

/** The logo's main color (cached per url), or null when it can't be read or has no color to speak of. */
export function logoColor(url: string): Promise<string | null> {
  let host: string;
  try { host = new URL(url).host; } catch { return Promise.resolve(null); }
  if (!ALLOWED.has(host)) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) }).catch(() => null);
      if (!res?.ok) return null;
      const raw = await sharp(Buffer.from(await res.arrayBuffer())).resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer().catch(() => null);
      return raw ? mainColor(raw) : null;
    })());
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return cache.get(url)!;
}

export async function teamColor(team: { tag: string; logo: string | null }): Promise<string> {
  return (team.logo ? await logoColor(team.logo).catch(() => null) : null) ?? tagColor(team.tag);
}
