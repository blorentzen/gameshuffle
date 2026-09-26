/**
 * Populate the board-game catalog (`bgg_games`) once, with cover art cached in R2.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-board-games.ts
 *     [--limit N] [--skip-images] [--refresh] [--yes-prod]
 *
 * Why a script: production can't talk to BoardGameGeek (they block datacenter
 * IPs), so the catalog must be filled from a laptop. This is the "populate once"
 * pattern we use for Scrydex — a curated set, not a bulk mirror. Sources:
 *   1. the curated STARTER_BOARD_GAMES list (name → resolved via BGG search)
 *   2. BGG's current "hot" list (ids)
 *
 * For each game we fetch details (`/thing?stats=1`), then download the cover,
 * resize it (600px cover + 160px thumb, webp) and upload both to R2 under
 * `board-games/<id>.webp` / `board-games/<id>-thumb.webp`. The R2 URLs are
 * written into `image_url` / `thumbnail_url` with `stale_after` pushed ~10 years
 * out so the lazy cache refresh never overwrites them with hotlinked BGG URLs.
 *
 * Auth: BGG requires a registered application token (BGG_API_TOKEN) since
 * 2025-10-27; registration is also where commercial use gets approved.
 *
 * Attribution: game data and images come from BoardGameGeek and require a
 * visible credit (rendered next to the picker + on night pages). Commercial use
 * additionally needs BGG's sign-off — request a license before prod launch.
 *
 * Safe to re-run: existing rows with R2 art are skipped unless --refresh.
 * Pointing at production requires --yes-prod (writes rows + prod R2 objects).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import sharp from "sharp";
import { createServiceClient } from "../src/lib/supabase/admin";
import { bggHot, bggThings } from "../src/lib/bgg/client";
import { parseBggSearch, type BggGame } from "../src/lib/bgg/parse";
import { BGG_BASE_URL, lengthBucket } from "../src/lib/bgg/config";
import { STARTER_BOARD_GAMES } from "../src/data/board-game-catalog";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = Number(opt("--limit") ?? 0) || Infinity;
const SKIP_IMAGES = flag("--skip-images");
const REFRESH = flag("--refresh");

const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const isProd = ref === "hzmmmuzuioybydejdmhg";
if (!ref) { console.error("✗ NEXT_PUBLIC_SUPABASE_URL not set"); process.exit(1); }
if (isProd && !flag("--yes-prod")) { console.error("✗ Pointed at PRODUCTION. Re-run with --yes-prod if that is intended (writes bgg_games + prod R2)."); process.exit(1); }
// r2.ts reads its env at module load, and static imports are hoisted above the
// dotenv call above — so it is loaded inside main() once .env.local is in place.
type R2 = typeof import("../src/lib/storage/r2");
let r2: R2;

const db = createServiceClient();
const log = (s: string) => console.log(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAR_FUTURE = new Date(Date.now() + 3650 * 86_400_000).toISOString();
const UA: Record<string, string> = { "User-Agent": "GameShuffle catalog populate (contact: support@gameshuffle.co)", Accept: "application/xml" };
if (process.env.BGG_API_TOKEN) UA.Authorization = `Bearer ${process.env.BGG_API_TOKEN}`;
else console.warn("! BGG_API_TOKEN is not set — BGG has required a registered app token since 2025-10-27; expect 401s. Register at boardgamegeek.com/applications.");

/** Polite BGG GET with 202-queued + 429 retry. ~1 req/s. */
async function bgg(path: string, attempt = 0): Promise<string> {
  await sleep(1100);
  const res = await fetch(`${BGG_BASE_URL}${path}`, { headers: UA });
  if ((res.status === 202 || res.status === 429 || res.status === 503) && attempt < 6) {
    await sleep(2500 * (attempt + 1));
    return bgg(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`BGG ${path} → ${res.status}`);
  return res.text();
}

/** usersrated per item id from a /thing?stats=1 payload (parseBggThings drops it). */
function usersRated(xml: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of xml.matchAll(/<item[^>]*\bid="(\d+)"[\s\S]*?<usersrated value="(\d+)"/g)) out.set(Number(m[1]), Number(m[2]));
  return out;
}

/** Resolve a curated name to the most-rated BGG boardgame with that exact name. */
async function resolveName(name: string): Promise<number | null> {
  let hits = parseBggSearch(await bgg(`/search?type=boardgame&exact=1&query=${encodeURIComponent(name)}`));
  if (!hits.length) hits = parseBggSearch(await bgg(`/search?type=boardgame&query=${encodeURIComponent(name)}`));
  if (!hits.length) return null;
  const lower = name.toLowerCase();
  const exact = hits.filter((h) => h.name.toLowerCase() === lower);
  const pool = (exact.length ? exact : hits).slice(0, 6);
  if (pool.length === 1) return pool[0].id;
  const xml = await bgg(`/thing?stats=1&id=${pool.map((h) => h.id).join(",")}`);
  const rated = usersRated(xml);
  return pool.map((h) => h.id).sort((a, b) => (rated.get(b) ?? 0) - (rated.get(a) ?? 0))[0];
}

async function cacheImage(id: number, url: string | null, kind: "cover" | "thumb"): Promise<string | null> {
  if (!url) return null;
  const res = await fetch(url, { headers: { "User-Agent": UA["User-Agent"] } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const out = await sharp(buf).rotate().resize({ width: kind === "cover" ? 600 : 160, height: kind === "cover" ? 600 : 160, fit: "inside", withoutEnlargement: true }).webp({ quality: kind === "cover" ? 80 : 74 }).toBuffer();
  return r2.uploadToR2(`board-games/${id}${kind === "thumb" ? "-thumb" : ""}.webp`, new Uint8Array(out), "image/webp");
}

async function main() {
  r2 = await import("../src/lib/storage/r2");
  if (!SKIP_IMAGES && !r2.isR2Configured()) { console.error("✗ R2 is not configured (R2_* env). Use --skip-images to populate data only."); process.exit(1); }
  log(`populate-board-games → ${ref}${isProd ? " (PRODUCTION)" : ""}${SKIP_IMAGES ? " · data only" : " · with R2 art"}`);

  // 1. candidate ids ----------------------------------------------------------
  const ids = new Set<number>();
  const unresolved: string[] = [];
  try {
    const hot = await bggHot();
    hot.forEach((h) => ids.add(h.id));
    log(`  hot list: ${hot.length}`);
  } catch (e) { log(`  hot list skipped: ${(e as Error).message}`); }

  const names = STARTER_BOARD_GAMES.map((g) => g.name).slice(0, LIMIT);
  log(`  resolving ${names.length} curated names (≈${Math.ceil(names.length * 1.3 / 60)} min at BGG's rate)…`);
  for (const [i, name] of names.entries()) {
    try {
      const id = await resolveName(name);
      if (id) ids.add(id); else unresolved.push(name);
    } catch (e) { unresolved.push(`${name} (${(e as Error).message.slice(0, 40)})`); }
    if ((i + 1) % 25 === 0) log(`    …${i + 1}/${names.length}`);
  }

  // 2. skip rows that already carry R2 art unless --refresh ---------------------
  const all = [...ids];
  const { data: existing } = await db.from("bgg_games").select("id, image_url").in("id", all);
  const done = new Set((existing ?? []).filter((r) => typeof r.image_url === "string" && r.image_url.includes("/board-games/")).map((r) => r.id as number));
  const todo = REFRESH ? all : all.filter((id) => !done.has(id));
  log(`  candidates ${all.length} · already populated ${done.size} · to fetch ${todo.length}`);

  // 3. details in batches of 20 → rows (+ art) ----------------------------------
  let written = 0, arted = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    let games: BggGame[] = [];
    try { games = await (async () => { await sleep(1100); return bggThings(batch); })(); }
    catch (e) { log(`  ! thing batch failed: ${(e as Error).message}`); continue; }
    const rows = [];
    for (const g of games) {
      let cover: string | null = null, thumb: string | null = null;
      if (!SKIP_IMAGES) {
        try { cover = await cacheImage(g.id, g.imageUrl, "cover"); thumb = await cacheImage(g.id, g.thumbnailUrl ?? g.imageUrl, "thumb"); if (cover) arted++; }
        catch (e) { log(`  ! art failed for ${g.name}: ${(e as Error).message.slice(0, 60)}`); }
      }
      rows.push({
        id: g.id, name: g.name, year: g.year,
        thumbnail_url: thumb ?? g.thumbnailUrl, image_url: cover ?? g.imageUrl,
        min_players: g.minPlayers, max_players: g.maxPlayers, playing_time: g.playingTime, min_playtime: g.minPlaytime, max_playtime: g.maxPlaytime,
        weight: g.weight, length_bucket: lengthBucket(g.playingTime),
        fetched_at: new Date().toISOString(),
        // our R2 copy must never be replaced by a lazy refresh; without art, keep the normal TTL
        stale_after: cover ? FAR_FUTURE : new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
    }
    if (rows.length) {
      const { error } = await db.from("bgg_games").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`bgg_games upsert: ${error.message}`);
      written += rows.length;
    }
    log(`    …${Math.min(i + 20, todo.length)}/${todo.length}`);
  }

  log(`\n✓ ${written} games written, ${arted} covers cached to R2`);
  if (unresolved.length) log(`  unresolved names (${unresolved.length}): ${unresolved.join("; ")}`);
}

main().catch((e) => { console.error("\n✗", e instanceof Error ? e.message : e); process.exit(1); });
