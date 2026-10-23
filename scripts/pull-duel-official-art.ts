/**
 * Pulls the official artwork for Daily Duel / Trainer Road trainers who have no Supporter card of
 * their own into public/images/duel/trainers/<person>.webp, and writes each picture's path and
 * shape to src/data/originals/duel/official-art.generated.ts. Sources: scripts/data/duel-official-art.json
 * (official Pokémon sites only). Each picture is cut to leave out text baked into it, laid on white
 * (some sources are transparent, some white) and trimmed to the figure. Skips files that already
 * exist unless --force; --only <person,person> limits it.
 *
 *   npx tsx scripts/pull-duel-official-art.ts [--force] [--only wattson,clair]
 *
 * The credit and the face point for each person live in src/data/originals/duel/trainer-cards.ts
 * (OFFICIAL_ART); a person shows their official picture only when both are there.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Row = { url: string; page: string; crop?: [number, number, number, number] };
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/duel-official-art.json"), "utf8")) as { people: Record<string, Row> };
const force = process.argv.includes("--force");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? new Set(process.argv[onlyAt + 1].split(",")) : null;
const UA = "Mozilla/5.0 (compatible; GameShuffleArt/1.0; +https://www.gameshuffle.co)";
const DIR = path.join(process.cwd(), "public/images/duel/trainers");
const OUT = path.join(process.cwd(), "src/data/originals/duel/official-art.generated.ts");

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let made = 0, skipped = 0;
  const failed: string[] = [];
  for (const [person, row] of Object.entries(manifest.people)) {
    if (only && !only.has(person)) continue;
    const file = path.join(DIR, `${person}.webp`);
    if (!force && fs.existsSync(file)) { skipped++; continue; }
    try {
      let img = sharp(await fetchImage(row.url));
      if (row.crop) img = img.extract({ left: row.crop[0], top: row.crop[1], width: row.crop[2], height: row.crop[3] });
      const flat = await img.flatten({ background: "#ffffff" }).png().toBuffer();
      const trimmed = await sharp(flat).trim({ background: "#ffffff", threshold: 12 }).png().toBuffer();
      await sharp(trimmed).webp({ quality: 90 }).toFile(file);
      made++;
    } catch (e) {
      failed.push(`${person}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Every picture on disk that the manifest lists, with its shape.
  const rows: string[] = [];
  for (const person of Object.keys(manifest.people).sort()) {
    const file = path.join(DIR, `${person}.webp`);
    if (!fs.existsSync(file)) continue;
    const { width = 1, height = 1 } = await sharp(file).metadata();
    rows.push(`  ${JSON.stringify(person)}: { img: "/images/duel/trainers/${person}.webp", ratio: ${+(width / height).toFixed(4)} },`);
  }
  fs.writeFileSync(OUT, `// Written by scripts/pull-duel-official-art.ts: each official picture's path and its width over height. Don't edit by hand.\n\nexport const DUEL_OFFICIAL_ART: Record<string, { img: string; ratio: number }> = {\n${rows.join("\n")}\n};\n`);
  console.log(`made ${made}, skipped ${skipped} (already there), failed ${failed.length}; ${rows.length} pictures in ${path.relative(process.cwd(), OUT)}`);
  for (const f of failed) console.log("  " + f);
})();
