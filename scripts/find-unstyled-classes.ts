/**
 * Catches styles lost in a CSS edit: class names that had CSS at a git ref,
 * have none now, and are still used in a component. A big edit once dropped a
 * block of account.css that live screens still used (Platform ▸ Switches
 * rendered with a browser list indent, Shop orders and Notifications lost
 * their layout) and nothing failed. Run it after large CSS edits and before a
 * release.
 *
 *   npx tsx scripts/find-unstyled-classes.ts [--since <ref>]   lost since <ref> (default origin/main); exits 1 if any
 *   npx tsx scripts/find-unstyled-classes.ts --all             every BEM class used with no CSS (information only)
 *
 * Template-built classes (`foo__bar--${x}`) and CDS's own `empac-*` classes are skipped.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const all = args.includes("--all");
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : "origin/main";

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) walk(p, ext, out); }
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const classesIn = (css: string) => new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const now = classesIn(walk(join(ROOT, "src"), /\.css$/).map((f) => readFileSync(f, "utf8")).join("\n"));

/** BEM classes each component uses (literal class names only). */
const used = new Map<string, Set<string>>();
for (const file of ["src/components", "src/app"].flatMap((d) => walk(join(ROOT, d), /\.tsx$/))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    for (const tok of (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
      if (!tok.includes("__") || !/^[a-z][\w-]*[a-z0-9]$/.test(tok) || tok.startsWith("empac-")) continue;
      const set = used.get(tok) ?? new Set<string>();
      set.add(relative(ROOT, file));
      used.set(tok, set);
    }
  }
}

// /usr/bin/git first: a stale Intel-only git in /usr/local/bin can shadow it on Apple silicon.
const GIT = existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";
const git = (...a: string[]) => execFileSync(GIT, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

let before: Set<string> | null = null;
if (!all) {
  const files = git("ls-tree", "-r", "--name-only", since, "--", "src").split("\n").filter((f) => f.endsWith(".css"));
  before = classesIn(files.map((f) => git("show", `${since}:${f}`)).join("\n"));
}

const hits = [...used].filter(([cls]) => !now.has(cls) && (all || before!.has(cls))).sort((a, b) => a[0].localeCompare(b[0]));
for (const [cls, files] of hits) console.log(`${cls}  ←  ${[...files].join(", ")}`);
console.log(all
  ? `\n${hits.length} class${hits.length === 1 ? "" : "es"} used with no CSS (many are hooks or styled by a parent)`
  : `\n${hits.length} class${hits.length === 1 ? " has" : "es have"} lost CSS since ${since}`);
process.exit(!all && hits.length ? 1 : 0);
