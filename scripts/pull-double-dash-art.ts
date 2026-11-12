/**
 * Pulls the Mario Kart: Double Dash!! randomizer's art into public/images/mario-kart-double-dash/ as webp:
 *   characters/<slug>.webp  the in-game character select icons (64px in the game, drawn at 128)
 *   karts/<slug>.webp       the official kart artwork, trimmed, 320px wide (white backgrounds made transparent)
 *   items/<slug>.webp       the in-game special item icons (64px, drawn at 128)
 *   tracks/<slug>.webp      the in-game course select pictures, 640x352
 *   battle/<slug>.webp      the in-game battle course pictures, 640x352
 *   cups/<slug>.webp        the in-game cup icons, 128px
 *   modes/<slug>.webp       the in-game battle mode icons, 272x160
 *   mario-kart-double-dash-keyart.webp  the official box art scene, cropped to 16:9 for headers
 * Sources: scripts/data/double-dash-art.json (Super Mario Wiki file names; the wiki's API resolves each to its file,
 * following redirects). Skips files that already exist unless --force.
 *
 *   npx tsx scripts/pull-double-dash-art.ts [--force] [--only characters|karts|items|tracks|battle|cups|modes]
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Row = { name: string; slug: string; file: string; white?: boolean };
type Group = "characters" | "karts" | "items" | "tracks" | "battle" | "cups" | "modes";
type Manifest = Record<Group, Row[]> & { keyart: { file: string; slug: string; crop: [number, number, number, number] } };
type Kind = "icon" | "kart" | "view" | "cup" | "mode";

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/double-dash-art.json"), "utf8")) as Manifest;
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const OUT = path.join(process.cwd(), "public/images/mario-kart-double-dash");

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
async function resolve(files: string[]): Promise<Map<string, string>> {
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

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/** Kart artwork on white: the white joined to the picture's edge goes transparent (a flood fill from the border), so
 *  the kart's own white parts (the Parade Kart's trim, the Toad Kart's seat) stay. */
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

async function save(dir: Group, row: Row, buf: Buffer, kind: Kind) {
  const file = path.join(OUT, dir, `${row.slug}.webp`);
  if (!force && fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(row.white ? await cutWhite(buf) : buf);
  if (kind === "icon") img = img.resize(128, 128, { fit: "contain", background: transparent, kernel: "lanczos3" });
  else if (kind === "cup") img = img.resize(128, 128, { fit: "contain", background: transparent });
  else if (kind === "mode") img = img.resize(272, 160, { fit: "contain", background: transparent });
  else if (kind === "kart") img = sharp(await img.trim().toBuffer()).resize(320, 260, { fit: "contain", background: transparent, kernel: "lanczos3" });
  else img = img.resize(640, 352, { fit: "cover", position: "centre" });
  await img.webp({ quality: kind === "view" ? 80 : 88, alphaQuality: 95 }).toFile(file);
  return true;
}

(async () => {
  const groups: [Group, Kind][] = [
    ["characters", "icon"], ["karts", "kart"], ["items", "icon"], ["tracks", "view"], ["battle", "view"], ["cups", "cup"], ["modes", "mode"],
  ];
  const all = groups.flatMap(([g]) => manifest[g].map((r) => r.file)).concat(manifest.keyart.file);
  const urls = await resolve(all);
  let made = 0, skipped = 0;
  const failed: string[] = [];
  for (const [group, kind] of groups) {
    if (only && group !== only) continue;
    for (const row of manifest[group]) {
      const url = urls.get(row.file);
      if (!url) { failed.push(`${group}/${row.name}: no file ${row.file}`); continue; }
      try {
        if (await save(group, row, await fetchImage(url), kind)) made++;
        else skipped++;
      } catch (e) {
        failed.push(`${group}/${row.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  // The header art: the official box art scene, cropped to the racers at 16:9.
  const keyFile = path.join(OUT, `${manifest.keyart.slug}.webp`);
  if (only) { /* --only skips the header art */ }
  else if (force || !fs.existsSync(keyFile)) {
    const url = urls.get(manifest.keyart.file);
    if (!url) failed.push(`keyart: no file ${manifest.keyart.file}`);
    else {
      const [left, top, width, height] = manifest.keyart.crop;
      await sharp(await fetchImage(url)).extract({ left, top, width, height }).resize(1600, 900).webp({ quality: 82 }).toFile(keyFile);
      made++;
    }
  } else skipped++;
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}`);
  for (const f of failed) console.log("  " + f);
})();
