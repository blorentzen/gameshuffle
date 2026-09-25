/**
 * Pull lifestyle photography into public/images/lifestyle/, from Magnific
 * (the former Freepik, premium seat) or Pexels.
 *
 * Two modes, because picking stock is a judgement call and search ranking is
 * not. `search` downloads free previews to a scratch folder so they can
 * actually be LOOKED at; `pull` commits one chosen id and writes its
 * provenance into src/data/lifestyle-imagery.ts. Nothing lands in public/ that
 * nobody saw, and on Magnific nothing spends a seat download until then.
 *
 * Two sources because they are good at different things. Magnific is the
 * premium library and the one worth spending a hand-pick on. Pexels is free,
 * covers video, and its licence permits commercial use with no attribution, so
 * it is the right default for breadth.
 *
 * AI-GENERATED CONTENT IS EXCLUDED on Magnific by default. The whole point of
 * this pass was replacing one AI-generated trophy render, and the library is
 * now full of the same stuff. `--ai` opts back in deliberately.
 *
 *   npx tsx scripts/fetch-lifestyle-imagery.ts search magnific "board game night friends"
 *   npx tsx scripts/fetch-lifestyle-imagery.ts search pexels "esports tournament crowd"
 *   npx tsx scripts/fetch-lifestyle-imagery.ts pull magnific hero-game-nights 428434096
 *
 * Keys: MAGNIFIC_API_KEY, PEXELS_API_KEY in .env.local.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const SCRATCH = join(process.cwd(), ".lifestyle-candidates");
const PUBLIC_DIR = join(process.cwd(), "public", "images", "lifestyle");
const MANIFEST = join(process.cwd(), "src", "data", "lifestyle-imagery.ts");

/** Every slot is a wide band, so portrait candidates are wasted review time. */
const PER_PAGE = 16;

interface Candidate {
  id: string;
  /** Free, watermark-free preview, for review only. */
  previewUrl: string;
  width: number;
  height: number;
  author: string;
  /** The asset's page, not the file. */
  pageUrl: string;
}

// ── Magnific (formerly Freepik) ────────────────────────────────────────────

const FP = "https://api.freepik.com/v1";

function fpHeaders(): Record<string, string> {
  const key = process.env.MAGNIFIC_API_KEY;
  if (!key) die("MAGNIFIC_API_KEY is not set in .env.local");
  return { "x-freepik-api-key": key! };
}

async function magnificSearch(term: string, allowAi: boolean): Promise<Candidate[]> {
  const q = new URLSearchParams({ term, limit: String(PER_PAGE), order: "relevance" });
  q.set("filters[content_type][photo]", "1");
  q.set("filters[orientation][landscape]", "1");
  q.set("filters[people][include]", "1");
  if (!allowAi) q.set("filters[ai-generated][excluded]", "1");

  const res = await fetch(`${FP}/resources?${q}`, { headers: fpHeaders() });
  if (!res.ok) die(`Magnific ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    data: {
      id: number; url: string; title: string;
      image: { source: { url: string; size: string } };
      author: { name: string };
    }[];
  };
  return body.data.map((r) => {
    const [w, h] = r.image.source.size.split("x").map(Number);
    return {
      id: String(r.id),
      previewUrl: r.image.source.url.replace(/^http:/, "https:"),
      width: w || 0,
      height: h || 0,
      author: r.author.name,
      pageUrl: r.url,
    };
  });
}

/** Spends one download from the premium seat. Only ever called from `pull`. */
async function magnificDownload(id: string): Promise<{ buf: Buffer; filename: string }> {
  const res = await fetch(`${FP}/resources/${id}/download`, { headers: fpHeaders() });
  if (!res.ok) die(`Magnific download ${res.status}: ${await res.text()}`);
  const { data } = (await res.json()) as { data: { filename: string; url: string } };
  const file = await fetch(data.url);
  if (!file.ok) die(`Magnific CDN ${file.status}`);
  return { buf: Buffer.from(await file.arrayBuffer()), filename: data.filename };
}

// ── Pexels ─────────────────────────────────────────────────────────────────

const PX = "https://api.pexels.com/v1";

function pxHeaders(): Record<string, string> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) die("PEXELS_API_KEY is not set in .env.local");
  return { Authorization: key! };
}

interface PexelsPhoto {
  id: number; width: number; height: number; url: string; photographer: string;
  src: { original: string; large2x: string; large: string };
}

async function pexelsSearch(term: string): Promise<Candidate[]> {
  const q = new URLSearchParams({
    query: term, per_page: String(PER_PAGE), orientation: "landscape", size: "large",
  });
  const res = await fetch(`${PX}/search?${q}`, { headers: pxHeaders() });
  if (!res.ok) die(`Pexels ${res.status}: ${await res.text()}`);
  const { photos } = (await res.json()) as { photos: PexelsPhoto[] };
  return photos.map((p) => ({
    id: String(p.id),
    previewUrl: p.src.large,
    width: p.width,
    height: p.height,
    author: p.photographer,
    pageUrl: p.url,
  }));
}

async function pexelsDownload(id: string): Promise<{ buf: Buffer; filename: string; meta: PexelsPhoto }> {
  const res = await fetch(`${PX}/photos/${id}`, { headers: pxHeaders() });
  if (!res.ok) die(`Pexels ${res.status}: ${await res.text()}`);
  const p = (await res.json()) as PexelsPhoto;
  // large2x is 1880px: enough for a full-bleed band at 2x on a laptop, and
  // next/image re-encodes per request anyway.
  const file = await fetch(p.src.large2x);
  if (!file.ok) die(`Pexels CDN ${file.status}`);
  return { buf: Buffer.from(await file.arrayBuffer()), filename: `${id}.jpg`, meta: p };
}

// ── Shared ─────────────────────────────────────────────────────────────────

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function save(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Widest we ever render one of these: a full-bleed band on a 2x laptop. The
 * premium originals are 6000px and 15MB, which is a lot of git history for a
 * backdrop that ships at 34% opacity behind a gradient — and next/image
 * re-encodes to webp/avif per request anyway, so the extra source pixels never
 * reach a browser.
 */
const MAX_WIDTH = 2400;

/** In place, via sips, so no image dependency enters the project. */
function downscale(path: string) {
  const { width } = dimensions(path);
  if (width <= MAX_WIDTH) return;
  execFileSync("sips", ["-Z", String(MAX_WIDTH), "-s", "format", "jpeg",
    "-s", "formatOptions", "82", path, "--out", path], { stdio: "ignore" });
}

/** Read back what actually landed on disk; the API's numbers describe the
 *  original, not the file we saved. */
function dimensions(path: string): { width: number; height: number } {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] ?? 0);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1] ?? 0);
  if (!width || !height) throw new Error(`could not read dimensions of ${path}`);
  return { width, height };
}

async function search(source: string, term: string, allowAi: boolean) {
  const rows = source === "pexels" ? await pexelsSearch(term) : await magnificSearch(term, allowAi);
  const dir = join(SCRATCH, source);
  mkdirSync(dir, { recursive: true });
  console.log(`\n${source} — "${term}" — ${rows.length} candidates${source === "magnific" && !allowAi ? " (AI excluded)" : ""}\n`);
  for (const c of rows) {
    await save(c.previewUrl, join(dir, `${c.id}.jpg`));
    console.log(`  ${c.id.padEnd(11)} ${`${c.width}x${c.height}`.padEnd(12)} ${c.author}`);
    console.log(`  ${" ".repeat(11)} ${c.pageUrl}`);
  }
  console.log(`\nPreviews in ${dir}. Review, then:`);
  console.log(`  npx tsx scripts/fetch-lifestyle-imagery.ts pull ${source} <slot> <id>\n`);
}

async function pull(source: string, slot: string, id: string) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  // Written to a staging name first; the final name carries a content hash.
  const dest = join(PUBLIC_DIR, `${slot}.staging.jpg`);

  let credit: { source: string; photographer: string; url: string; licence: string };

  if (source === "pexels") {
    const { buf, meta } = await pexelsDownload(id);
    writeFileSync(dest, buf);
    credit = { source: "pexels", photographer: meta.photographer, url: meta.url, licence: "Pexels Licence" };
  } else {
    // Resolve the author and page URL from search-by-id before spending the
    // download, so a failed lookup does not cost a seat credit.
    const res = await fetch(`${FP}/resources?filters[ids]=${id}&limit=1`, { headers: fpHeaders() });
    if (!res.ok) die(`Magnific lookup ${res.status}: ${await res.text()}`);
    const meta = ((await res.json()) as { data: { url: string; author: { name: string } }[] }).data[0];
    if (!meta) die(`Magnific has no resource ${id}`);

    const { buf, filename } = await magnificDownload(id);
    if (filename.endsWith(".zip")) {
      die(`Magnific returned a zip (${filename}). That resource is not a plain photo — pick another.`);
    }
    writeFileSync(dest, buf);
    credit = {
      source: "magnific", photographer: meta.author.name, url: meta.url,
      licence: "Freepik Premium Licence",
    };
  }

  downscale(dest);

  // Content hash in the filename. Swapping the photo in a slot otherwise
  // reuses the URL, and every layer that caches by URL — the browser, the CDN,
  // Next's own optimizer — happily serves the old one. (That bit me the first
  // time round: the server had the new file and the page rendered the old.)
  const bytes = readFileSync(dest);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const finalName = `${slot}.${hash}.jpg`;
  // Clear any previous file for this slot, staging included, before writing.
  for (const f of readdirSync(PUBLIC_DIR)) {
    if (f.startsWith(`${slot}.`)) rmSync(join(PUBLIC_DIR, f));
  }
  const finalPath = join(PUBLIC_DIR, finalName);
  writeFileSync(finalPath, bytes);

  const { width, height } = dimensions(finalPath);
  const entry = `  "${slot}": {
    src: "/images/lifestyle/${finalName}",
    width: ${width},
    height: ${height},
    alt: "",
    credit: {
      source: "${credit.source}",
      photographer: ${JSON.stringify(credit.photographer)},
      url: ${JSON.stringify(credit.url)},
      licence: ${JSON.stringify(credit.licence)},
    },
  },`;

  if (!existsSync(MANIFEST)) die(`manifest missing at ${MANIFEST}`);
  let src = readFileSync(MANIFEST, "utf8");
  const anchor = "export const LIFESTYLE: Partial<Record<LifestyleSlot, LifestylePhoto>> = {";
  if (!src.includes(anchor)) die("manifest anchor not found; did the file change shape?");
  // Replace an existing entry for this slot rather than stacking duplicates.
  const existing = new RegExp(`\\n  "${slot}": \\{[\\s\\S]*?\\n  \\},`);
  src = existing.test(src)
    ? src.replace(existing, "\n" + entry)
    : src.replace(`${anchor};`, `${anchor}\n${entry}\n};`).replace(`${anchor}}`, `${anchor}\n${entry}\n}`);
  writeFileSync(MANIFEST, src);

  console.log(`\n  ${slot} <- ${source} ${id} by ${credit.photographer}`);
  console.log(`  public/images/lifestyle/${finalName}  ${width}x${height}`);
  console.log(`  manifest updated\n`);
}

// Wrapped rather than top-level await: tsx transpiles these to CJS, where
// top-level await is not available.
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--ai");
  const allowAi = process.argv.includes("--ai");
  const [mode, source, ...rest] = args;
  const SOURCES = ["magnific", "pexels"];

  if (mode === "search" && SOURCES.includes(source) && rest.length) {
    await search(source, rest.join(" "), allowAi);
  } else if (mode === "pull" && SOURCES.includes(source) && rest.length === 2) {
    await pull(source, rest[0], rest[1]);
  } else {
    console.log(`Usage:
  npx tsx scripts/fetch-lifestyle-imagery.ts search <magnific|pexels> "<query>" [--ai]
  npx tsx scripts/fetch-lifestyle-imagery.ts pull   <magnific|pexels> <slot> <id>

Slots: hero-game-nights hero-tournaments hero-community
       door-play door-compete door-community door-stream

--ai   include AI-generated results (Magnific only; excluded by default)`);
    process.exit(1);
  }
}

main();
