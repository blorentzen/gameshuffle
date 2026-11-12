/**
 * Pulls the Super Smash Bros. Melee randomizer's art into public/images/super-smash-bros-melee/ as webp:
 *   fighters/<slug>-<n>.webp  the character select screen's player-slot portrait for costume n (in-game art, 136x188)
 *   stages/<slug>.webp        each stage's view from the game's debug camera, cropped to 640x360
 *   super-smash-bros-melee-keyart.webp  the official group artwork, cropped to 16:9 for headers
 * Sources: scripts/data/melee-art.json (file names on Super Mario Wiki or SmashWiki; each wiki's API resolves them,
 * following redirects). Skips files that already exist unless --force.
 *
 *   npx tsx scripts/pull-melee-art.ts [--force] [--only fighters|stages]
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Wiki = "mario" | "smash";
type Fighter = { name: string; slug: string; costumes: number; wiki: Wiki; file: string };
type Stage = { name: string; slug: string; wiki: Wiki; file: string };
type Manifest = { fighters: Fighter[]; stages: Stage[]; keyart: { wiki: Wiki; file: string; slug: string; crop: [number, number, number, number] } };

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/melee-art.json"), "utf8")) as Manifest;
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const OUT = path.join(process.cwd(), "public/images/super-smash-bros-melee");
const API: Record<Wiki, string> = { mario: "https://www.mariowiki.com/api.php", smash: "https://www.ssbwiki.com/api.php" };

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

/** File name → its URL on that wiki's image host, 40 at a time, redirects followed. */
async function resolve(wiki: Wiki, files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const q = new URLSearchParams({ action: "query", titles: batch.map((f) => `File:${f}`).join("|"), prop: "imageinfo", iiprop: "url", redirects: "1", format: "json", formatversion: "2" });
    const d = (await getJson(`${API[wiki]}?${q}`)) as {
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

async function save(file: string, buf: Buffer, kind: "portrait" | "stage") {
  if (!force && fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Portraits keep their size and transparency; stage views are 4:3 captures, cropped to the middle at 16:9.
  const img = kind === "portrait" ? sharp(buf) : sharp(buf).resize(640, 360, { fit: "cover", position: "centre" });
  await img.webp({ quality: kind === "portrait" ? 90 : 80 }).toFile(file);
  return true;
}

(async () => {
  const fighterFiles = manifest.fighters.flatMap((f) => Array.from({ length: f.costumes }, (_, i) => ({ f, n: i + 1, file: f.file.replace("{n}", String(i + 1)) })));
  const [mario, smash] = await Promise.all([
    resolve("mario", [...fighterFiles.map((x) => x.file), manifest.keyart.file]),
    resolve("smash", manifest.stages.map((s) => s.file)),
  ]);
  const urls: Record<Wiki, Map<string, string>> = { mario, smash };
  let made = 0, skipped = 0;
  const failed: string[] = [];
  if (!only || only === "fighters") {
    for (const { f, n, file } of fighterFiles) {
      const url = urls[f.wiki].get(file);
      if (!url) { failed.push(`fighters/${f.name} ${n}: no file ${file}`); continue; }
      try {
        if (await save(path.join(OUT, "fighters", `${f.slug}-${n}.webp`), await fetchImage(url), "portrait")) made++;
        else skipped++;
      } catch (e) { failed.push(`fighters/${f.name} ${n}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  if (!only || only === "stages") {
    for (const s of manifest.stages) {
      const url = urls[s.wiki].get(s.file);
      if (!url) { failed.push(`stages/${s.name}: no file ${s.file}`); continue; }
      try {
        if (await save(path.join(OUT, "stages", `${s.slug}.webp`), await fetchImage(url), "stage")) made++;
        else skipped++;
      } catch (e) { failed.push(`stages/${s.name}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  // The header art: the official group artwork, cropped to the cast at 16:9.
  const keyFile = path.join(OUT, `${manifest.keyart.slug}.webp`);
  if (only) { /* --only skips the header art */ }
  else if (force || !fs.existsSync(keyFile)) {
    const url = urls[manifest.keyart.wiki].get(manifest.keyart.file);
    if (!url) failed.push(`keyart: no file ${manifest.keyart.file}`);
    else {
      const [left, top, width, height] = manifest.keyart.crop;
      await sharp(await fetchImage(url)).extract({ left, top, width, height }).webp({ quality: 82 }).toFile(keyFile);
      made++;
    }
  } else skipped++;
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}`);
  for (const f of failed) console.log("  " + f);
})();
