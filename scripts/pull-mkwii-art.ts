/**
 * Pulls the Mario Kart Wii randomizer's art into public/images/mario-kart-wii/ as webp:
 *   characters/<slug>.webp  the in-game character select icons (64px in the game, drawn at 128)
 *   vehicles/<slug>.webp    the in-game Time Trial vehicle icons (drawn at twice their size)
 *   tracks/<slug>.webp      each course's view, 640x352 (Nintendo UK press screenshots where the wiki has them)
 *   battle/<slug>.webp      each battle arena's view, 640x352
 *   cups/<slug>.webp        the in-game cup icons, 128px
 *   mario-kart-wii-keyart.webp  the official poster artwork, cropped to 16:9 for headers
 * Sources: scripts/data/mkwii-art.json (Super Mario Wiki file names; the wiki's API resolves each to its
 * file, following redirects). Skips files that already exist unless --force.
 *
 *   npx tsx scripts/pull-mkwii-art.ts [--force] [--only tracks|battle|characters|vehicles|cups]
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Row = { name: string; slug: string; file: string; band?: [number, number] };
type Manifest = {
  characters: Row[]; vehicles: Row[]; tracks: Row[]; battle: Row[]; cups: Row[];
  keyart: { file: string; slug: string; crop: [number, number, number, number] };
};
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/mkwii-art.json"), "utf8")) as Manifest;
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const OUT = path.join(process.cwd(), "public/images/mario-kart-wii");

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

async function save(dir: string, slug: string, buf: Buffer, kind: "icon" | "vehicle" | "view" | "cup", band?: [number, number]) {
  const file = path.join(OUT, dir, `${slug}.webp`);
  if (!force && fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(buf);
  if (band) {
    // A view from a race or battle intro: keep the band between the game's corner text, centred at 640:352.
    const { width = 0, height = 0 } = await sharp(buf).metadata();
    const top = Math.round(height * band[0]);
    const h = Math.round(height * band[1]) - top;
    const w = Math.min(width, Math.round((h * 640) / 352));
    img = sharp(await img.extract({ left: Math.round((width - w) / 2), top, width: w, height: h }).toBuffer());
  }
  if (kind === "icon") img = img.resize(128, 128, { fit: "contain", background: transparent, kernel: "lanczos3" });
  else if (kind === "cup") img = img.resize(128, 128, { fit: "contain", background: transparent });
  else if (kind === "vehicle") {
    const { width = 90 } = await sharp(buf).metadata();
    img = img.trim().resize({ width: Math.round(width * 2), kernel: "lanczos3" });
  } else img = img.resize(640, 352, { fit: "cover", position: "centre" });
  await img.webp({ quality: kind === "view" ? 80 : 90 }).toFile(file);
  return true;
}

(async () => {
  const groups: [keyof Omit<Manifest, "keyart">, "icon" | "vehicle" | "view" | "cup"][] = [
    ["characters", "icon"], ["vehicles", "vehicle"], ["tracks", "view"], ["battle", "view"], ["cups", "cup"],
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
        if (await save(group, row.slug, await fetchImage(url), kind, row.band)) made++;
        else skipped++;
      } catch (e) {
        failed.push(`${group}/${row.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  // The header art: the official poster, cropped to its racers at 16:9.
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
