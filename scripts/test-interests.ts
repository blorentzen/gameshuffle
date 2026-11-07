/**
 * Interests: the pure rules (src/lib/interests/rules.ts).
 * npx tsx scripts/test-interests.ts
 */
import { cleanInterests, interestFromPath, interestList, stepsFor, DEFAULT_STEPS, INTERESTS, STEPS } from "../src/lib/interests/rules";

let pass = 0, fail = 0;
const check = (ok: boolean, what: string, extra?: unknown) => { if (ok) pass++; else { fail++; console.log(`FAIL ${what}${extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`); } };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

check(eq(cleanInterests(["pokemon", "nope", "daily", "pokemon", 4]), ["daily", "pokemon"]), "clean: known ones, once, in tile order");
check(eq(cleanInterests("daily"), []), "clean: not a list is none");
check(interestList(["competitive", "pokemon"]) === "Competitive Mario Kart and Pokémon", "list of two");
check(interestList(["daily", "home", "events"]) === "Daily games, Game night at home and Running events", "list of three");

const paths: [string, string | null][] = [
  ["/lounge/Kevo", "competitive"], ["/time-trials/import", "competitive"], ["/mmr-card", "competitive"], ["/discord/add?app=comp", "competitive"],
  ["/daily-dex", "pokemon"], ["/pokemon-trainers/kanto/brock", "pokemon"], ["/account/stuff?tab=my-cards", "pokemon"], ["/tcg-companion", "pokemon"],
  ["/daily", "daily"], ["/daily-trivia", "daily"], ["/randomizers/smash", "daily"],
  ["/hub", "stream"], ["/discord/add", "stream"], ["/account/streaming?tab=discord", "stream"],
  ["/tournament/create", "events"], ["/trivia/leagues/new", "events"], ["/bracket-generator", "events"],
  ["/game-nights/create", "home"], ["/trivia", "home"], ["/u/someone", null], [null as unknown as string, null],
  ["/account/competitive", "competitive"], ["/account/pokemon?tab=my-cards", "pokemon"], ["/account/events?tab=trivia", "events"],
  ["/account/discord?tab=discord&app=comp", "competitive"], ["/account/discord", "stream"],
];
for (const [p, want] of paths) check(interestFromPath(p) === want, `from ${p}`, interestFromPath(p));

check(eq(stepsFor([]).map((s) => s.id), DEFAULT_STEPS.map((s) => s.id)), "no interests: the usual three steps");
check(eq(stepsFor(["competitive"]).map((s) => s.id), ["lounge", "times", "mmr"]), "one interest: its three steps");
check(eq(stepsFor(["competitive", "pokemon"]).map((s) => s.id), ["lounge", "dex", "times"]), "two interests: first steps in turn");
check(eq(stepsFor(["daily", "pokemon"]).map((s) => s.id), ["daily", "dex", "games"]), "the Daily Dex shows once when two interests share it");
for (const i of INTERESTS) {
  check(STEPS[i.id].length === 3, `${i.id} has three steps`);
  check(STEPS[i.id].every((s) => s.href.startsWith("/")), `${i.id} steps link inside the site`);
}
check(stepsFor(["daily", "home", "competitive", "pokemon", "stream", "events"]).length === 3, "never more than three");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
