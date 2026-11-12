/**
 * Pulls the Super Mario Bros. Wonder randomizer's art into public/images/super-mario-bros-wonder/ as webp:
 *   characters/<slug>.webp   the official character renders, trimmed, standing in a 512px square (transparent)
 *   badges/<slug>.webp       the badges: official artwork or the game's own icons, 256px square (transparent); the
 *                            Switch 2 Edition's badges are crops of the badge screen, so the dark screen around each
 *                            badge is cut away first
 *   super-mario-bros-wonder-keyart.webp   the official key art, cropped to 16:9 for headers
 * Sources: scripts/data/wonder-art.json (Super Mario Wiki file names, each with the official page it came from; the
 * wiki's API resolves each to its file, following redirects). Skips files that already exist unless --force.
 *
 *   npx tsx scripts/pull-wonder-art.ts [--force] [--only characters|badges|keyart]
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Row = { name: string; slug: string; file: string; source: string; kind?: "art" | "icon" | "crop" };
type Manifest = {
  characters: Row[];
  badges: Row[];
  keyart: { file: string; slug: string; source: string; crop: [number, number, number, number] };
};
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/wonder-art.json"), "utf8")) as Manifest;
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const OUT = path.join(process.cwd(), "public/images/super-mario-bros-wonder");

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

/**
 * A badge cropped from the game's badge screen: everything joined to the picture's edge that's close to the screen's
 * dark color goes transparent (a flood fill from the border), so only the badge is left.
 */
async function cutScreen(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) => (y * w + x) * 4;
  // The screen's color: the darkest corner (the badges are bright).
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => [data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]]);
  const [br, bg, bb] = corners.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];
  const near = (i: number) => Math.hypot(data[i] - br, data[i + 1] - bg, data[i + 2] - bb) < 60;
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

async function save(dir: string, slug: string, buf: Buffer, kind: "character" | "art" | "icon" | "crop") {
  const file = path.join(OUT, dir, `${slug}.webp`);
  if (!force && fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(kind === "crop" ? await cutScreen(buf) : buf);
  if (kind === "character") img = sharp(await img.trim().toBuffer()).resize(512, 512, { fit: "contain", background: transparent, position: "bottom", kernel: "lanczos3" });
  else img = sharp(await img.trim().toBuffer()).resize(256, 256, { fit: "contain", background: transparent, kernel: "lanczos3" });
  await img.webp({ quality: 88, alphaQuality: 95 }).toFile(file);
  return true;
}

(async () => {
  const all = [...manifest.characters, ...manifest.badges].map((r) => r.file).concat(manifest.keyart.file);
  const urls = await resolve(all);
  let made = 0, skipped = 0;
  const failed: string[] = [];
  const groups: [keyof Pick<Manifest, "characters" | "badges">, (r: Row) => "character" | "art" | "icon" | "crop"][] = [
    ["characters", () => "character"],
    ["badges", (r) => r.kind ?? "icon"],
  ];
  for (const [group, kindOf] of groups) {
    if (only && group !== only) continue;
    for (const row of manifest[group]) {
      const url = urls.get(row.file);
      if (!url) { failed.push(`${group}/${row.name}: no file ${row.file}`); continue; }
      try {
        if (await save(group, row.slug, await fetchImage(url), kindOf(row))) made++;
        else skipped++;
      } catch (e) {
        failed.push(`${group}/${row.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  // The header art: the official key art at 16:9.
  const keyFile = path.join(OUT, `${manifest.keyart.slug}.webp`);
  if (only && only !== "keyart") { /* --only another group skips the header art */ }
  else if (force || !fs.existsSync(keyFile)) {
    const url = urls.get(manifest.keyart.file);
    if (!url) failed.push(`keyart: no file ${manifest.keyart.file}`);
    else {
      const [left, top, width, height] = manifest.keyart.crop;
      fs.mkdirSync(OUT, { recursive: true });
      await sharp(await fetchImage(url)).extract({ left, top, width, height }).resize(1600, 900).webp({ quality: 82 }).toFile(keyFile);
      made++;
    }
  } else skipped++;
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}`);
  for (const f of failed) console.log("  " + f);
})();
