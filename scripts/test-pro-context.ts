/**
 * Every in-app Pro wall passes a `?from=` key, and the pitch page keys its
 * headline on it. The failure mode is silent: a typo'd key renders the generic
 * headline and nobody notices, so the wall goes back to telling people nothing.
 * This asserts the two sides agree.
 *
 *   npx tsx scripts/test-pro-context.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { proContextFor, PRO_CONTEXT_KEYS } from "../src/lib/marketing/pro-context";

let failures = 0;

console.log("\nEvery declared key resolves to usable copy:");
for (const key of PRO_CONTEXT_KEYS) {
  const c = proContextFor(key);
  const ok = !!c && c.headline.length > 0 && c.lede.length > 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${key.padEnd(14)} ${c?.headline ?? "(none)"}`);
}

console.log("\nUnknown keys fall back rather than throwing:");
for (const bad of [null, "", "nope", "WHEELS", "../../etc"]) {
  const ok = proContextFor(bad) === null;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${JSON.stringify(bad)}`);
}

// The real risk: a link passes a key the table does not have.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

console.log("\nEvery ?from= used in the app is a key the page knows:");
const used = new Map<string, string>();
for (const file of walk("src")) {
  for (const m of readFileSync(file, "utf8").matchAll(/\/gs-pro\?from=([a-z-]+)/g)) {
    used.set(m[1], file);
  }
}
if (used.size === 0) {
  console.log("  FAIL  no ?from= links found — the walls stopped passing context");
  failures++;
}
for (const [key, file] of used) {
  const ok = proContextFor(key) !== null;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${key.padEnd(14)} ${file}`);
}

console.log(failures === 0 ? `\nAll ${used.size} Pro walls carry a key the page understands.\n` : `\n${failures} FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
