/**
 * Builds Chat Brain Daily, the Facebook Instant Game (instant-game/), into the
 * zip Meta hosts: index.html at the root, main.js + main.css, fonts, logos and
 * fbapp-config.json. Upload it in the Meta App Dashboard ▸ Instant Games ▸ Web
 * Hosting, then push the build to testing or production there.
 *
 *   npx tsx scripts/build-instant-game.ts          → instant-game/gameshuffle-instant.zip (calls www.gameshuffle.co)
 *   npx tsx scripts/build-instant-game.ts --dev    → instant-game/dist only, calling http://localhost:3000
 *
 * Serve a dev build with `python3 -m http.server 8787 -d instant-game/dist`: outside
 * Facebook the game uses a stand-in for the SDK (instant-game/src/host.ts).
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const dev = process.argv.includes("--dev");
const root = "instant-game";
const out = path.join(root, "dist");
const zip = path.join(root, "gameshuffle-instant.zip");

async function main() {
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

  if (!dev) {
    rmSync(zip, { force: true });
    // index.html has to sit at the zip's root, so zip from inside dist.
    execFileSync("/usr/bin/zip", ["-r", "-q", path.resolve(zip), "."], { cwd: out });
    console.log(`zipped ${zip} (${Math.round(statSync(zip).size / 1024)} KB)`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
