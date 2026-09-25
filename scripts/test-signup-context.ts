/**
 * The signup page reads `?redirect=` to say what the account is FOR. That
 * makes an attacker-supplied value part of the page's copy, so the resolver
 * has to refuse anything that is not a same-origin path, and fall back to the
 * generic pitch rather than rendering something steered from outside.
 *
 *   npx tsx scripts/test-signup-context.ts
 */

import { signupContextFor } from "../src/lib/auth/signup-context";

const GENERIC = signupContextFor(null).title;
let failures = 0;

function check(label: string, redirect: string | null, expectTitleContains: string) {
  const got = signupContextFor(redirect).title;
  const ok = got.includes(expectTitleContains);
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label.padEnd(44)} -> ${got}`);
}

console.log("\nIntent is read from the redirect:");
check("tournament join", "/tournament/abc-123", "join the tournament");
check("tournament create beats the prefix", "/tournament/create", "run a tournament");
check("game night RSVP", "/game-nights/abc", "RSVP");
check("game night create beats the prefix", "/game-nights/create", "host a game night");
check("companion", "/tcg-companion/collection", "collection");
check("hub", "/hub/sessions/new", "run your stream");
check("community", "/c/friday-kart-club", "join the community");

console.log("\nFalls back to generic:");
check("no redirect", null, GENERIC);
check("empty", "", GENERIC);
check("unknown path", "/some/other/page", GENERIC);

console.log("\nRefuses anything not a same-origin path:");
check("absolute url", "https://evil.example/tournament/x", GENERIC);
check("protocol-relative", "//evil.example/tournament/x", GENERIC);
check("scheme-less host", "evil.example/tournament", GENERIC);
check("javascript:", "javascript:alert(1)", GENERIC);

// Copy quality: four points is the cap, and an empty list would render a bare
// heading with nothing under it.
console.log("\nEvery context carries usable copy:");
for (const r of [null, "/tournament/x", "/game-nights/x", "/tcg-companion", "/hub", "/c/x"]) {
  const c = signupContextFor(r);
  const ok = c.points.length > 0 && c.points.length <= 4 && c.lede.length > 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${String(r).padEnd(44)} ${c.points.length} points`);
}

console.log(failures === 0 ? "\nAll signup contexts resolve safely.\n" : `\n${failures} FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
