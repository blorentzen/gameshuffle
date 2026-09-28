/**
 * Migration drift check: is every migration in supabase/ actually applied?
 *
 * Migrations here are applied by hand in the Supabase SQL editor and tracked in
 * supabase/PENDING-MIGRATIONS.md, which is also maintained by hand. That drifts
 * silently: on 2026-09-26 two migrations (discord-logging, discord-automod) turned
 * out never to have been applied AND never to have been listed, so the features
 * behind them had been dead since they shipped. They were found by accident.
 *
 * This walks every supabase/*.sql, pulls out what each one creates (tables,
 * views, columns), and asks the live database whether each thing exists.
 *
 *   npm run migrations:check                 # the database in .env.local (dev)
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run migrations:check
 *                                            # any other project, e.g. prod
 *
 * Exits 1 when anything is missing, so it can gate a release.
 *
 * What it deliberately does not check: functions, policies, grants, indexes,
 * triggers and constraints. Those need SQL access, not the REST API. A missing
 * table or column is what breaks a feature outright, so that is what this covers.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "supabase");

// Bundles and read-only checks, not migrations.
const SKIP = new Set(["APPLY-NOW.sql", "APPLY-NEXT.sql", "APPLY-STEP2-DESTRUCTIVE.sql", "VERIFY-PRIVACY.sql"]);

type Expect = { file: string; kind: "table" | "view" | "column"; table: string; column?: string };

function loadEnv(): { url: string; key: string } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    env[t.slice(0, t.indexOf("=")).trim()] = t.slice(t.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** Comments out, so a commented-out statement is not mistaken for a live one. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

const ident = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;

/**
 * Split into statements, then read each one on its own. Pairing an ADD COLUMN
 * with the ALTER TABLE it belongs to is the whole point: matching the first
 * table in a file to the first column in the file gets it wrong whenever a
 * migration creates one table and alters another.
 */
function parse(file: string, sql: string, dropped: Set<string>): Expect[] {
  const out: Expect[] = [];
  for (const stmt of stripComments(sql).split(";")) {
    const s = stmt.trim();
    let m: RegExpMatchArray | null;

    if ((m = s.match(new RegExp(String.raw`^create\s+table\s+(?:if\s+not\s+exists\s+)?${ident}`, "i")))) {
      out.push({ file, kind: "table", table: m[1].toLowerCase() });
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${ident}`, "i")))) {
      out.push({ file, kind: "view", table: m[1].toLowerCase() });
      continue;
    }
    if ((m = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${ident}`, "i")))) {
      const table = m[1].toLowerCase();
      for (const c of s.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        const column = c[1].toLowerCase();
        if (!dropped.has(`${table}.${column}`)) out.push({ file, kind: "column", table, column });
      }
    }
  }
  return out;
}

/** Columns and tables some later migration removes on purpose. */
function collectDrops(files: string[]): { cols: Set<string>; tables: Set<string> } {
  const cols = new Set<string>();
  const tables = new Set<string>();
  for (const f of files) {
    for (const stmt of stripComments(fs.readFileSync(path.join(DIR, f), "utf8")).split(";")) {
      const s = stmt.trim();
      const t = s.match(new RegExp(String.raw`^drop\s+(?:table|view)\s+(?:if\s+exists\s+)?${ident}`, "i"));
      if (t) tables.add(t[1].toLowerCase());
      const a = s.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${ident}`, "i"));
      if (a) {
        for (const c of s.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
          cols.add(`${a[1].toLowerCase()}.${c[1].toLowerCase()}`);
        }
      }
    }
  }
  return { cols, tables };
}

async function main() {
  const { url, key } = loadEnv();
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(2);
  }
  const project = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? url;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !SKIP.has(f)).sort();
  const drops = collectDrops(files);
  const expects = files.flatMap((f) => parse(f, fs.readFileSync(path.join(DIR, f), "utf8"), drops.cols))
    .filter((e) => !drops.tables.has(e.table));

  // Check each distinct object once, however many files mention it.
  //
  // A real GET, never { head: true }: PostgREST answers HEAD with no body, so
  // the error comes back with an empty message and no code, and a missing table
  // is indistinguishable from a present one. The first version of this script
  // did exactly that and reported a fake table as applied.
  type Result = "ok" | "missing" | { unknown: string };
  const cache = new Map<string, Result>();
  async function check(e: Expect): Promise<Result> {
    const k = e.kind === "column" ? `${e.table}.${e.column}` : e.table;
    if (cache.has(k)) return cache.get(k)!;
    const { error } = await db.from(e.table).select(e.kind === "column" ? e.column! : "*").limit(1);
    let r: Result = "ok";
    if (error) {
      // Missing table: PGRST205 / 42P01. Missing column: 42703 / PGRST204.
      // Anything else is reported rather than waved through as present.
      r = /PGRST205|PGRST204|42703|42P01/.test(`${error.code} ${error.message}`)
        ? "missing"
        : { unknown: `${error.code ?? "?"} ${error.message || "(no message)"}` };
    }
    cache.set(k, r);
    return r;
  }

  const missingByFile = new Map<string, string[]>();
  const unknown: string[] = [];
  for (const e of expects) {
    const r = await check(e);
    const label = e.kind === "column" ? `${e.table}.${e.column}` : `${e.kind} ${e.table}`;
    if (r === "missing") missingByFile.set(e.file, [...(missingByFile.get(e.file) ?? []), label]);
    else if (r !== "ok") unknown.push(`${label} (${e.file}): ${r.unknown}`);
  }

  console.log(`Checked ${files.length} migrations, ${cache.size} distinct objects, against project ${project}.`);
  if (unknown.length) {
    console.log(`\nCould not decide ${new Set(unknown).size} object(s); treat these as unverified:\n`);
    for (const u of [...new Set(unknown)]) console.log(`  ${u}`);
  }
  if (missingByFile.size === 0) {
    console.log(unknown.length ? "\nNothing confirmed missing." : "Every table, view and column they create exists.");
    if (unknown.length) process.exit(1);
    return;
  }
  console.log(`\n${missingByFile.size} migration(s) have not been applied here:\n`);
  for (const [file, labels] of missingByFile) {
    console.log(`  ${file}`);
    for (const l of [...new Set(labels)]) console.log(`      missing ${l}`);
  }
  console.log("\nApply them in the Supabase SQL editor, then record them in supabase/PENDING-MIGRATIONS.md.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
