/**
 * Checks for the game key and the spaces registry (game spaces picks 2026-11-05).  npx tsx scripts/test-game-key.ts
 */
import { GAME_CATALOG } from "../src/data/game-catalog";
import { GAME_NAMES } from "../src/data/game-registry";
import { gameKey, familyKeys } from "../src/lib/games/key";
import { GAME_SPACES, spaceFor, spaceById, spaceOpen, spacePath } from "../src/lib/games/spaces";
import { MMR_GAMES } from "../src/lib/mmr/rules";
import { TT_GAMES } from "../src/lib/timeTrials/tracks";
import { LADDER_GAMES } from "../src/lib/ladders/types";

let pass = 0, fail = 0;
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log("FAIL", m, "got", JSON.stringify(a), "want", JSON.stringify(b)); } };
const ok = (c: boolean, m: string) => eq(c, true, m);

// Every catalog slug, name and alias resolves to its own entry.
for (const g of GAME_CATALOG) {
  eq(gameKey(g.slug), g.slug, `slug ${g.slug}`);
  eq(gameKey(g.name), g.slug, `name ${g.name}`);
  for (const a of g.aliases ?? []) eq(gameKey(a), g.slug, `alias ${a}`);
  if (g.appSlug) eq(gameKey(g.appSlug), g.slug, `app slug ${g.appSlug}`);
}
// Competitive codes and their own maps.
for (const [code, info] of Object.entries(MMR_GAMES)) eq(gameKey(code), info.family, `mmr ${code}`);
for (const [code, info] of Object.entries(TT_GAMES)) eq(gameKey(code), info.slug, `tt ${code}`);
for (const code of Object.keys(LADDER_GAMES)) ok(!!gameKey(code), `ladder ${code}`);
// Every name our own registry uses is a known game.
for (const slug of Object.keys(GAME_NAMES)) ok(!!gameKey(slug), `registry ${slug}`);
// Typed names, any case, odd spacing.
eq(gameKey("  mk8dx "), "mario-kart-8-deluxe", "padded code");
eq(gameKey("MARIO KART 8 DELUXE"), "mario-kart-8-deluxe", "upper name");
eq(gameKey("Pokemon TCG"), "pokemon-tcg", "no accent");
eq(gameKey("Some Game Nobody Has"), null, "unknown");
eq(gameKey(""), null, "empty");
eq(gameKey(null), null, "null");
// Families.
ok(familyKeys("pokemon").includes("pokemon-tcg") && familyKeys("pokemon").includes("pokemon-stadium"), "pokemon family");
ok(familyKeys("mario-party").includes("super-mario-party-jamboree"), "mario party family");
eq(familyKeys("zelda"), [], "family we have no games for");

// Spaces: ids unique, every game known, no game in two spaces, paths, staff-only until opened.
eq(new Set(GAME_SPACES.map((s) => s.id)).size, GAME_SPACES.length, "unique ids");
const seen = new Map<string, string>();
for (const s of GAME_SPACES) {
  ok(s.games.length > 0, `${s.id} has games`);
  for (const g of s.games) {
    eq(gameKey(g), g, `${s.id} game ${g} is a key`);
    ok(!seen.has(g), `${g} only in one space (also ${seen.get(g)})`);
    seen.set(g, s.id);
  }
  eq(spaceById(s.id)?.id, s.id, `by id ${s.id}`);
  eq(spacePath(s), `/games/${s.id}`, `path ${s.id}`);
  ok(s.tools.every((t) => t.href.startsWith("/")), `${s.id} tools are ours`);
  ok(s.games.includes(s.primary), `${s.id} primary is one of its games`);
  eq(s.tabs[0], "now", `${s.id} opens on Now`);
  eq(new Set(s.tabs).size, s.tabs.length, `${s.id} tabs unique`);
  eq(spaceOpen(s, "2026-11-05"), s.opens !== null && s.opens <= "2026-11-05", `${s.id} open rule`);
}
eq(spaceFor("mk8dx")?.id, "mario-kart-8-deluxe", "lounge code to space");
eq(spaceFor("mkworld24p")?.id, "mario-kart-world", "world code to space");
eq(spaceFor("Pokémon Stadium 2")?.id, "pokemon", "typed Pokémon game to space");
eq(spaceFor("mario-party")?.id, "mario-party", "live night slug to space");
eq(spaceFor("Jamboree")?.id, "mario-party", "alias to space");
eq(spaceFor("Splatoon 3"), null, "no space yet");
eq(spaceOpen({ ...GAME_SPACES[0], opens: "2026-11-10" }, "2026-11-09"), false, "before it opens");
eq(spaceOpen({ ...GAME_SPACES[0], opens: "2026-11-10" }, "2026-11-10"), true, "the day it opens");

console.log(`${pass}/${pass + fail}`);
if (fail) process.exit(1);
