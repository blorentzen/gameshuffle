/**
 * Writes src/data/sitemap-lastmod.json: the date each public route's content
 * last changed, for the sitemap's <lastmod>. A page's date is the newest git
 * commit touching its route folder or any extra content file listed in DEPS.
 * Uncommitted changes count as today, so running this before a release commit
 * dates the pages that release touches.
 *
 * Run: npm run sitemap:lastmod   (then commit the JSON with the release)
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP = "src/app";
const OUT = "src/data/sitemap-lastmod.json";

/** Content that lives outside a route's folder. */
const DEPS: Record<string, string[]> = {
  "/randomizers/mario-kart-8-deluxe": ["src/data/randomizer-landings.ts", "src/data/mk8dx-data.json", "src/components/randomizer"],
  "/randomizers/mario-kart-world": ["src/data/randomizer-landings.ts", "src/data/mkworld-data.json", "src/components/randomizer"],
  "/randomizers/super-mario-party-jamboree": ["src/data/randomizer-landings.ts", "src/data/party/jamboree.ts", "src/components/party"],
  "/randomizers/mario-party-superstars": ["src/data/randomizer-landings.ts", "src/data/party/superstars.ts", "src/components/party"],
  "/randomizers/super-smash-bros-ultimate": ["src/data/randomizer-landings.ts", "src/data/smash", "src/components/smash"],
  "/competitive-mario-kart": ["src/data/marketing-apps.ts"],
  "/mario-kart-tournaments": ["src/data/marketing-apps.ts"],
  "/host-a-tournament": ["src/data/marketing-apps.ts"],
  "/pokemon-tcg-companion": ["src/data/marketing-apps.ts"],
  "/help": ["src/lib/help"],
  "/tier-list-maker/[template]": ["src/data/tier-templates.ts"],
  "/bingo-card-generator/[template]": ["src/data/bingo-templates.ts"],
  "/truth-or-dare/[set]": ["src/data/truth-or-dare.ts"],
};

const today = new Date().toISOString().slice(0, 10);

/** Share images sit in route folders but aren't page content. */
const IGNORE = [":(exclude,glob)**/opengraph-image.*", ":(exclude,glob)**/twitter-image.*"];

function gitDate(paths: string[]): string | null {
  const spec = ["--", ...paths, ...IGNORE];
  const dirty = execFileSync("git", ["status", "--porcelain", ...spec], { encoding: "utf8" }).trim();
  if (dirty) return today;
  const d = execFileSync("git", ["log", "-1", "--format=%cs", ...spec], { encoding: "utf8" }).trim();
  return d || null;
}

/** Route folders that hold a page.tsx, as URL paths (route groups stripped). */
function routes(dir: string, out: Map<string, string> = new Map()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) {
      if (name === "page.tsx") {
        const url = "/" + relative(APP, dir).split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
        out.set(url === "/" ? "/" : url.replace(/\/$/, ""), dir);
      }
      continue;
    }
    if (name === "api" || name.startsWith("_")) continue;
    routes(full, out);
  }
  return out;
}

const result: Record<string, string> = {};
for (const [url, dir] of [...routes(APP)].sort()) {
  // The root folder holds every route, so the homepage only counts its own file.
  const own = url === "/" ? [join(APP, "page.tsx")] : [dir];
  const date = gitDate([...own, ...(DEPS[url] ?? [])]);
  if (date) result[url] = date;
}
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${Object.keys(result).length} routes to ${OUT}`);
