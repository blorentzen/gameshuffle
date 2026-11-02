import "server-only";

/** A team's color for the overlay's Team colors look: its logo's main color, else its lettered logo's color. */

import sharp from "sharp";
import { tagColor } from "./look";

const cache = new Map<string, Promise<string | null>>();
const ALLOWED = new Set(["mkcentral.com", "gs-ugc.empac.co", "cdn.empac.co"]);

function logoColor(url: string): Promise<string | null> {
  let host: string;
  try { host = new URL(url).host; } catch { return Promise.resolve(null); }
  if (!ALLOWED.has(host)) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) }).catch(() => null);
      if (!res?.ok) return null;
      const stats = await sharp(Buffer.from(await res.arrayBuffer())).resize(48, 48, { fit: "cover" }).stats().catch(() => null);
      if (!stats) return null;
      const { r, g, b } = stats.dominant;
      // Near-white or near-black logos say little about the team: fall back to the lettered color.
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 40 || min > 220 || max - min < 24) return null;
      return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    })());
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return cache.get(url)!;
}

export async function teamColor(team: { tag: string; logo: string | null }): Promise<string> {
  return (team.logo ? await logoColor(team.logo).catch(() => null) : null) ?? tagColor(team.tag);
}
