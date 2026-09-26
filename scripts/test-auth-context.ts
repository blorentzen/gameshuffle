/**
 * The signup page reads `?redirect=` to say what the account is FOR. That
 * makes an attacker-supplied value part of the page's copy, so the resolver
 * has to refuse anything that is not a same-origin path, and fall back to the
 * generic pitch rather than rendering something steered from outside.
 *
 *   npx tsx scripts/test-auth-context.ts
 */

import { authContextFor } from "../src/lib/auth/auth-context";

const GENERIC = authContextFor(null, "signup").title;
let failures = 0;

function check(label: string, redirect: string | null, expectTitleContains: string) {
  const got = authContextFor(redirect, "signup").title;
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
  const c = authContextFor(r, "signup");
  const ok = c.points.length > 0 && c.points.length <= 4 && c.lede.length > 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${String(r).padEnd(44)} ${c.points.length} points`);
}

// Login is the higher-traffic side: more surfaces send people there with a
// redirect than to signup, and every one of those used to say nothing.
console.log("\nLogin says why, and never repeats the signup pitch:");
for (const [label, r, expect] of [
  ["tournament", "/tournament/abc", "Log in to join the tournament"],
  ["check-in beats join", "/tournament/abc/manage/check-in", "Log in to check players in"],
  ["manage", "/tournament/abc/manage", "Log in to manage your tournament"],
  ["night manage", "/game-nights/abc/manage", "Log in to manage your game night"],
  ["mod invite", "/mod/kartqueen", "Log in to moderate for this streamer"],
  ["data request", "/account/privacy/data-request", "Log in to make a data request"],
  ["communities", "/communities", "Log in to join the conversation"],
  ["unknown", "/nope", "Log in to GameShuffle"],
  ["none", null, "Log in to GameShuffle"],
] as const) {
  const c = authContextFor(r, "login");
  const ok = c.title === expect && c.points.length === 0 && c.lede.length > 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label.padEnd(16)} -> ${c.title}${c.points.length ? "  (LEAKED POINTS)" : ""}`);
}

// Every prefix in the table must be a redirect the app actually produces.
console.log("\nSignup and login agree on which paths carry an intent:");
for (const r of ["/tournament/x", "/game-nights/x", "/mod/x", "/communities", "/beta", "/players", "/ideas"]) {
  const su = authContextFor(r, "signup").title;
  const li = authContextFor(r, "login").title;
  const ok = su !== "Create your account" && li !== "Log in to GameShuffle";
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${r.padEnd(16)} signup=${su !== "Create your account"} login=${li !== "Log in to GameShuffle"}`);
}

console.log(failures === 0 ? "\nAll auth contexts resolve safely.\n" : `\n${failures} FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
