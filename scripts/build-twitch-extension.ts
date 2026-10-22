/**
 * Builds GameShuffle's Twitch extension (twitch-extension/) into the zip Twitch
 * hosts: one HTML page per place it shows (video_component, mobile, panel,
 * config) at the root, card.js/panel.js/config.js with their CSS, fonts and the
 * logo. Twitch serves these files itself; everything else comes from
 * gameshuffle.co (/api/twitch-ext/*).
 *
 *   npm run ext:build          → twitch-extension/gameshuffle-twitch-extension.zip (calls www.gameshuffle.co)
 *   npm run ext:dev            → twitch-extension/dist only, calling http://localhost:3000
 *   … --api=https://dev.gameshuffle.co   → a zip for Twitch's Hosted Test against the dev site
 *
 * Try a dev build with `python3 -m http.server 8788 -d twitch-extension/dist`, then
 * http://localhost:8788/video_component.html?channel=196723 (Nova's dev channel;
 * add &user=<Twitch id> to play as a viewer who shared, &role=broadcaster for the
 * streamer). Outside Twitch the extension signs in through the dev server's
 * /api/twitch-ext/dev-token (twitch-extension/src/host.ts).
 *
 * In Twitch's developer console the extension needs: Allowlist for URL Fetching
 * Domains = the API base below, Allowlist for Image Domains = the same plus
 * https://cdn.empac.co. Minified with source maps alongside, so a reviewer can
 * read it.
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const apiArg = args.find((a) => a.startsWith("--api="))?.slice("--api=".length);
const api = apiArg ?? (dev ? "http://localhost:3000" : "https://www.gameshuffle.co");
const root = "twitch-extension";
const out = path.join(root, "dist");
const zip = path.join(root, "gameshuffle-twitch-extension.zip");
const PAGES = ["video_component.html", "mobile.html", "panel.html", "config.html"];

async function main() {
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(api)) throw new Error(`--api must be an origin like https://dev.gameshuffle.co (got ${api})`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: {
      card: path.join(root, "src/card.tsx"),
      panel: path.join(root, "src/panel.tsx"),
      config: path.join(root, "src/config.tsx"),
    },
    bundle: true,
    outdir: out,
    format: "iife",
    target: ["es2020", "safari15"],
    minify: !dev,
    sourcemap: dev ? "inline" : "linked",
    jsx: "automatic",
    loader: { ".woff2": "file" },
    assetNames: "assets/[name]-[hash]",
    tsconfig: "tsconfig.json",
    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      "process.env.GS_API_BASE": JSON.stringify(api),
    },
    logLevel: "warning",
  });
  for (const page of PAGES) copyFileSync(path.join(root, page), path.join(out, page));
  copyFileSync("public/images/fg/logos/gameshuffle-primary.svg", path.join(out, "logo-color.svg"));

  const kb = (f: string) => (existsSync(path.join(out, f)) ? `${Math.round(statSync(path.join(out, f)).size / 1024)} KB` : "missing");
  console.log(`built ${out} (calls ${api}): card.js ${kb("card.js")}, card.css ${kb("card.css")}, panel.js ${kb("panel.js")}, config.js ${kb("config.js")}`);
  if (dev) return;
  rmSync(zip, { force: true });
  // Twitch wants the pages at the zip's root, so zip from inside dist.
  execFileSync("/usr/bin/zip", ["-r", "-q", path.resolve(zip), "."], { cwd: out });
  console.log(`zipped ${zip} (${Math.round(statSync(zip).size / 1024)} KB). Upload it in the developer console: your extension ▸ Files ▸ Upload.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
