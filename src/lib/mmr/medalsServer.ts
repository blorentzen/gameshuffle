import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { medalSrc } from "./medals";

/**
 * A medal as a data URI for the share-card renderer (next/og), read from public/ so it works on any
 * deployment without fetching our own site; null when the division has no medal.
 */
const cache = new Map<string, Promise<string | null>>();
export function medalData(base: string): Promise<string | null> {
  const src = medalSrc(base);
  if (!src) return Promise.resolve(null);
  if (src.startsWith("http")) return Promise.resolve(src);
  if (!cache.has(src)) {
    cache.set(src, readFile(join(process.cwd(), "public", src)).then((b) => `data:image/png;base64,${b.toString("base64")}`).catch(() => null));
  }
  return cache.get(src)!;
}
