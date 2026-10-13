// Every trivia team name passes the word filter, fits a team name (2 to 40), uses no long dashes, and appears once.
// Run: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-trivia-team-names.ts
import { TEAM_NAMES } from "../src/data/trivia-team-names";
import { isBlockedText } from "../src/lib/text/filter";

let fail = 0;
const seen = new Map<string, string>();
for (const [theme, names] of Object.entries(TEAM_NAMES)) {
  if (names.length < 20) { fail++; console.log(`✗ ${theme}: only ${names.length} names`); }
  for (const { name } of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) { fail++; console.log(`✗ "${name}" in ${theme} and ${seen.get(key)}`); }
    seen.set(key, theme);
    if (name.length < 2 || name.length > 40) { fail++; console.log(`✗ "${name}" is ${name.length} characters`); }
    if (/[–—]/.test(name)) { fail++; console.log(`✗ "${name}" has a long dash`); }
    if (isBlockedText(name)) { fail++; console.log(`✗ "${name}" trips the word filter`); }
  }
}
console.log(fail ? `${fail} problems` : `all ${seen.size} names pass`);
process.exit(fail ? 1 : 0);
