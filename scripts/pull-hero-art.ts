/**
 * Pulls the official hero portraits for the hero shooters into
 * public/images/<game>/heroes/<slug>.webp (256px squares, transparent).
 * Sources: scripts/data/hero-art.json. Skips files that already exist unless
 * --force; --only <game> limits it to one game.
 *
 *   npx tsx scripts/pull-hero-art.ts [--force] [--only overwatch]
 *
 * When the monthly roster check reports a new hero: add their portrait URL to
 * the manifest, run this, then add the hero to src/data/heroes/<game>.ts.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { heroSlug } from "../src/lib/heroes/art";

type Row = { name: string; url: string; fallback?: { url: string; cropBox?: [number, number, number, number] | null } };
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/hero-art.json"), "utf8")) as { games: Record<string, Row[]> };
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const SIZE = 256;

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A full-body render: crop to the figure, then take the top square (head and shoulders). */
async function bust(buf: Buffer, crop?: [number, number, number, number] | null): Promise<Buffer> {
  let img = sharp(buf);
  if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2] - crop[0], height: crop[3] - crop[1] });
  else img = img.trim();
  const trimmed = await img.png().toBuffer();
  const { width = SIZE } = await sharp(trimmed).metadata();
  return sharp(trimmed).extract({ left: 0, top: 0, width, height: Math.min(width, (await sharp(trimmed).metadata()).height ?? width) }).png().toBuffer();
}

(async () => {
  let made = 0, skipped = 0;
  const failed: string[] = [];
  for (const [game, rows] of Object.entries(manifest.games)) {
    if (only && game !== only) continue;
    const dir = path.join(process.cwd(), "public/images", game, "heroes");
    fs.mkdirSync(dir, { recursive: true });
    for (const row of rows) {
      const file = path.join(dir, `${heroSlug(row.name)}.webp`);
      if (!force && fs.existsSync(file)) { skipped++; continue; }
      try {
        let buf: Buffer;
        try {
          buf = await fetchImage(row.url);
        } catch (e) {
          if (!row.fallback) throw e;
          buf = await bust(await fetchImage(row.fallback.url), row.fallback.cropBox);
        }
        await sharp(buf).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 86 }).toFile(file);
        made++;
      } catch (e) {
        failed.push(`${game}/${row.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}`);
  for (const f of failed) console.log("  " + f);
})();
