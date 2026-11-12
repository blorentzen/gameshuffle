/**
 * Shared art puller for the retro Mario Kart randomizers (Mario Kart DS, Mario Kart 7, Super Mario Kart): resolves
 * Super Mario Wiki file names through the wiki's API (redirects followed), downloads each file from the wiki's file
 * host and saves it as webp under public/images/<game>/<group>/<slug>.webp, shaped by the group's kind:
 *   pixel  in-game pixel art, scaled up by a whole number with nearest-neighbour, lossless (edges stay sharp)
 *   model  a render or artwork, trimmed and fitted into w x h (optionally with white joined to the edge made clear)
 *   icon   a small in-game icon, fitted into w x h with smooth resampling
 *   view   a picture of a course, fitted to cover w x h
 * plus the header art: a crop of one picture, 1600x900. Skips files that already exist unless `force`.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export type ArtKind =
  | { kind: "pixel"; scale: number }
  | { kind: "model"; w: number; h: number; white?: boolean }
  | { kind: "icon"; w: number; h: number }
  | { kind: "view"; w: number; h: number };
export type ArtRow = { name: string; slug: string; file: string; white?: boolean };
export type ArtManifest = Record<string, unknown> & { keyart?: { file: string; slug: string; crop: [number, number, number, number] } };

const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}
async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** File name → its URL on the wiki's image host, 40 at a time, redirects followed. */
export async function resolveWikiFiles(files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const q = new URLSearchParams({ action: "query", titles: batch.map((f) => `File:${f}`).join("|"), prop: "imageinfo", iiprop: "url", redirects: "1", format: "json", formatversion: "2" });
    const d = (await getJson(`https://www.mariowiki.com/api.php?${q}`)) as {
      query: { pages: { title: string; imageinfo?: { url: string }[] }[]; normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[] };
    };
    const byTitle = new Map(d.query.pages.map((p) => [p.title, p.imageinfo?.[0]?.url ?? null]));
    const norm = new Map((d.query.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((d.query.redirects ?? []).map((n) => [n.from, n.to]));
    for (const f of batch) {
      let t = `File:${f}`;
      t = norm.get(t) ?? t;
      t = redir.get(t) ?? t;
      const url = byTitle.get(t);
      if (url) out.set(f, url);
    }
  }
  return out;
}

/** Artwork on white: the white joined to the picture's edge goes transparent (a flood fill from the border), so
 *  white inside the picture stays. */
async function cutWhite(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const near = (i: number) => data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
    seen[y * w + x] = 1;
    if (!near(at(x, y))) continue;
    data[at(x, y) + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function saveOne(file: string, buf: Buffer, k: ArtKind, white: boolean) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const src = white ? await cutWhite(buf) : buf;
  if (k.kind === "pixel") {
    const meta = await sharp(src).metadata();
    await sharp(src).resize((meta.width ?? 0) * k.scale, (meta.height ?? 0) * k.scale, { kernel: "nearest" }).webp({ lossless: true }).toFile(file);
  } else if (k.kind === "model") {
    await sharp(await sharp(src).trim().toBuffer()).resize(k.w, k.h, { fit: "contain", background: transparent, kernel: "lanczos3" }).webp({ quality: 88, alphaQuality: 95 }).toFile(file);
  } else if (k.kind === "icon") {
    await sharp(src).resize(k.w, k.h, { fit: "contain", background: transparent, kernel: "lanczos3" }).webp({ quality: 90, alphaQuality: 95 }).toFile(file);
  } else {
    await sharp(src).resize(k.w, k.h, { fit: "cover", position: "centre" }).webp({ quality: 80 }).toFile(file);
  }
}

/** Pulls every group in `groups` (and the header art) from the manifest into `outDir`. Prints what it made. */
export async function pullWikiArt(o: { manifest: ArtManifest; outDir: string; groups: [string, ArtKind][]; force?: boolean; only?: string | null }) {
  const rows = (g: string) => (o.manifest[g] as ArtRow[] | undefined) ?? [];
  const all = o.groups.flatMap(([g]) => rows(g).map((r) => r.file)).concat(o.manifest.keyart ? [o.manifest.keyart.file] : []);
  const urls = await resolveWikiFiles(all);
  let made = 0, skipped = 0;
  const failed: string[] = [];
  for (const [group, kind] of o.groups) {
    if (o.only && group !== o.only) continue;
    for (const row of rows(group)) {
      const file = path.join(o.outDir, group, `${row.slug}.webp`);
      if (!o.force && fs.existsSync(file)) { skipped++; continue; }
      const url = urls.get(row.file);
      if (!url) { failed.push(`${group}/${row.name}: no file ${row.file}`); continue; }
      try {
        await saveOne(file, await fetchImage(url), kind, !!row.white || (kind.kind === "model" && !!kind.white));
        made++;
      } catch (e) {
        failed.push(`${group}/${row.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  const key = o.manifest.keyart;
  if (key && !o.only) {
    const keyFile = path.join(o.outDir, `${key.slug}.webp`);
    if (o.force || !fs.existsSync(keyFile)) {
      const url = urls.get(key.file);
      if (!url) failed.push(`keyart: no file ${key.file}`);
      else {
        const [left, top, width, height] = key.crop;
        await sharp(await fetchImage(url)).extract({ left, top, width, height }).resize(1600, 900).flatten({ background: "#ffffff" }).webp({ quality: 82 }).toFile(keyFile);
        made++;
      }
    } else skipped++;
  }
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}`);
  for (const f of failed) console.log("  " + f);
}

/** `--force` and `--only <group>` from the command line. */
export function artArgs() {
  const onlyAt = process.argv.indexOf("--only");
  return { force: process.argv.includes("--force"), only: onlyAt >= 0 ? process.argv[onlyAt + 1] : null };
}
