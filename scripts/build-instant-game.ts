/**
 * Builds GameShuffle's Facebook Instant Game (instant-game/: the Daily Shuffle,
 * the Daily Dex and Chat Brain Daily) into the zip Meta hosts: index.html at the
 * root, main.js + main.css, fonts, logos and fbapp-config.json.
 *
 *   npm run instant:kit       → the zip, plus instant-game/facebook-kit/ opened in Finder:
 *                               numbered folders in the order the App Dashboard asks for them
 *                               (zip + upload comment, app icon, game artwork, screenshots,
 *                               gameplay video, then the older Details page's sizes) and
 *                               LISTING.md with every field's text
 *   npm run instant:upload    → the zip, sent straight to Web Hosting through Meta's upload API
 *                               (needs FB_INSTANT_APP_ID and FB_INSTANT_UPLOAD_TOKEN in .env.local)
 *   npm run instant:dev       → instant-game/dist only, calling http://localhost:3000
 *   npx tsx scripts/build-instant-game.ts   → instant-game/gameshuffle-instant.zip only
 *
 * Add --no-open to skip opening Finder. Serve a dev build with
 * `python3 -m http.server 8787 -d instant-game/dist`: outside Facebook the game uses
 * a stand-in for the SDK (instant-game/src/host.ts). The kit's artwork comes from
 * scripts/render-instant-game-art.tsx; screenshots and the video were filmed from
 * the dev build (instant-game/listing/).
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const kit = args.includes("--kit");
const upload = args.includes("--upload");
const root = "instant-game";
const out = path.join(root, "dist");
const zip = path.join(root, "gameshuffle-instant.zip");
const listing = path.join(root, "listing");
const kitDir = path.join(root, "facebook-kit");
/** Meta's upload API version (developers.facebook.com/documentation/games/launch/upload-bundle, 2026-10-18). */
const GRAPH = "https://graph.facebook.com/v24.0";
const GUIDE_URL = "https://claude.ai/artifact/CAc8Au8C9k7xpxXvut4Wsh";

/** What this build is, for Web Hosting's version list: the day and the commit (+ when there are changes not yet committed). */
function versionNote(): string {
  const git = (...a: string[]) => { try { return execFileSync("/usr/bin/git", a, { encoding: "utf8" }).trim(); } catch { return ""; } };
  const sha = git("rev-parse", "--short", "HEAD");
  const dirty = git("status", "--porcelain", "--", "instant-game/src", "instant-game/index.html", "instant-game/fbapp-config.json") ? "+" : "";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  return `${day}${sha ? ` (${sha}${dirty})` : ""}: Daily Shuffle, Daily Dex, Chat Brain`;
}

async function buildGame() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: { main: path.join(root, "src/main.tsx") },
    bundle: true,
    outdir: out,
    format: "iife",
    target: ["es2020", "safari15"],
    minify: !dev,
    sourcemap: dev,
    jsx: "automatic",
    loader: { ".woff2": "file" },
    assetNames: "assets/[name]-[hash]",
    tsconfig: "tsconfig.json",
    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      "process.env.GS_API_BASE": JSON.stringify(dev ? "http://localhost:3000" : "https://www.gameshuffle.co"),
    },
    logLevel: "warning",
  });
  copyFileSync(path.join(root, "index.html"), path.join(out, "index.html"));
  copyFileSync(path.join(root, "fbapp-config.json"), path.join(out, "fbapp-config.json"));
  copyFileSync("public/images/fg/logos/gameshuffle-wht.svg", path.join(out, "logo.svg"));
  copyFileSync("public/images/fg/logos/gameshuffle-primary.svg", path.join(out, "logo-color.svg"));

  const kb = (f: string) => `${Math.round(statSync(path.join(out, f)).size / 1024)} KB`;
  console.log(`built ${out} (${dev ? "dev, calls localhost:3000" : "production, calls www.gameshuffle.co"}): main.js ${kb("main.js")}, main.css ${existsSync(path.join(out, "main.css")) ? kb("main.css") : "missing"}`);
  if (dev) return;
  rmSync(zip, { force: true });
  // index.html has to sit at the zip's root, so zip from inside dist.
  execFileSync("/usr/bin/zip", ["-r", "-q", path.resolve(zip), "."], { cwd: out });
  console.log(`zipped ${zip} (${Math.round(statSync(zip).size / 1024)} KB)`);
}

/** The kit: one folder per App Dashboard step, in order, plus the text to paste. */
function makeKit(note: string) {
  rmSync(kitDir, { recursive: true, force: true });
  const step = (name: string) => { const d = path.join(kitDir, name); mkdirSync(d, { recursive: true }); return d; };
  const copy = (from: string, dir: string, as?: string) => {
    if (!existsSync(from)) { console.warn(`  missing ${from}`); return; }
    copyFileSync(from, path.join(dir, as ?? path.basename(from)));
  };
  const zipDir = step("1 Upload this zip");
  copy(zip, zipDir);
  writeFileSync(path.join(zipDir, "comment.txt"), `${note}\n`);
  copy(path.join(listing, "art/app-icon-1024.png"), step("2 Settings Basic"));
  const art = step("3 Game artwork");
  for (const f of ["icon-800.png", "cover-landscape-1200x630.jpg", "cover-square-1080.jpg", "banner-1200x400.jpg"]) copy(path.join(listing, "art", f), art);
  const shots = step("4 Screenshots");
  const shotDir = path.join(listing, "screenshots");
  if (existsSync(shotDir)) for (const f of readdirSync(shotDir).filter((x) => /\.(jpg|png)$/.test(x)).sort()) copy(path.join(shotDir, f), shots);
  const video = step("5 Gameplay video");
  copy(path.join(listing, "gameplay.mp4"), video, "gameplay-portrait-9x16.mp4");
  copy(path.join(listing, "gameplay-landscape.mp4"), video, "gameplay-landscape-16x9.mp4");
  // Meta's older Details page asks for other sizes, and a 16:9 or square video.
  const older = step("6 Only if Meta asks");
  for (const f of ["small-icon-16.png", "cover-800x150.jpg", "cover-1600x300.jpg", "cover-1600x300.png", "banner-1200x630.jpg", "banner-1200x630.png", "splash-750x1334.jpg"]) copy(path.join(listing, "art/older-sizes", f), older);
  copy(path.join(listing, "gameplay-square.mp4"), older);
  const banners = step("7 Banners and splash screens");
  const banDir = path.join(listing, "art/banners");
  if (existsSync(banDir)) for (const f of readdirSync(banDir).sort()) copy(path.join(banDir, f), banners);
  copy(path.join(listing, "LISTING.md"), kitDir);
  // Double-click in Finder to open the step-by-step guide.
  writeFileSync(path.join(kitDir, "Setup guide.webloc"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${GUIDE_URL}</string></dict></plist>\n`);
  console.log(`kit ready: ${kitDir}`);
  if (!args.includes("--no-open") && process.platform === "darwin") execFileSync("/usr/bin/open", [kitDir]);
}

function envLocal(): Record<string, string> {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
}

/**
 * Meta's two-step upload: an upload session, then the zip. The token comes from
 * Instant Games ▸ Web Hosting ▸ "Get Asset Upload Access Token" (starts with GG) or a
 * System User token (starts with EAA, doesn't expire). The new version lands in Web
 * Hosting's list; staging it for testing and pushing it live stay in the dashboard.
 */
async function sendToMeta(note: string) {
  const env = { ...envLocal(), ...process.env };
  const appId = env.FB_INSTANT_APP_ID, token = env.FB_INSTANT_UPLOAD_TOKEN;
  if (!appId || !token) {
    console.error("Add FB_INSTANT_APP_ID (the game app's ID) and FB_INSTANT_UPLOAD_TOKEN (Web Hosting ▸ Get Asset Upload Access Token) to .env.local, then run this again.");
    process.exit(1);
  }
  const bytes = readFileSync(zip);
  const name = path.basename(zip);
  const start = await fetch(`${GRAPH}/${appId}/uploads?${new URLSearchParams({ file_name: name, file_length: String(bytes.length), file_type: "application/zip", access_token: token })}`, { method: "POST" });
  const session = (await start.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!start.ok || !session.id) { console.error("Meta didn't start the upload:", session.error?.message ?? start.status); process.exit(1); }
  const space = token.startsWith("GG") ? "gg_graph_api" : "fb_game_bundle";
  const sent = await fetch(`https://rupload.facebook.com/${space}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, Offset: "0", "X-Entity-Length": String(bytes.length), type: "BUNDLE", comment: note, name },
    body: bytes,
  });
  const result = await sent.text();
  if (!sent.ok) { console.error(`Meta refused the zip (${sent.status}):`, result); process.exit(1); }
  console.log("uploaded to Web Hosting:", result);
  console.log("Next: Instant Games ▸ Web Hosting ▸ this version ▸ stage it for testing, play it, then push it to production.");
}

async function main() {
  await buildGame();
  if (dev) return;
  const note = versionNote();
  if (kit) makeKit(note);
  if (upload) await sendToMeta(note);
}

main().catch((err) => { console.error(err); process.exit(1); });
