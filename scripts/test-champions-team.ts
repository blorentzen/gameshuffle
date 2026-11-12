// Pokémon Champions teams: the season list, the type chart, legality, filling at random, links, the monthly reminder,
// tournament team lists and the chat roll (src/lib/pokemon/champions.ts, src/lib/tournaments/teamListStore.ts).
//   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-champions-team.ts
import {
  CHAMPIONS_ROSTER, CHAMPIONS_SEASON, TEAM_SIZE, TYPES, blockedBy, championById, championByName, coverScore, effectiveness, fillTeam,
  formOf, monId, problemText, randomTeam, readTeamParam, rerollSlot, seasonReminder, teamFromText, teamParam, teamProblems, typeLines,
  unanswered, weakSpots, type ChampMon,
} from "../src/lib/pokemon/champions";
import { checkTeam, publicScope, viewOf } from "../src/lib/tournaments/teamListStore";
import { deckListSettingsOf, deckListsOn, deckNeededToJoin, isDeckListGame, listKindOf, takesLists } from "../src/lib/tournaments/deckLists";
import { getChatGame } from "../src/lib/twitch/chatGames";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { spaceById, spaceFor, spaceTabs } from "../src/lib/games/spaces";
import { spaceRoller } from "../src/lib/rolls/spaceRoll";
import { gameKey } from "../src/lib/games/key";
import { catalogGame } from "../src/data/game-catalog";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; console.error("✗", what); } };
const eq = <T,>(a: T, b: T, what: string) => ok(a === b, `${what} (got ${String(a)}, want ${String(b)})`);
const mon = (name: string) => { const m = championByName(name); if (!m) throw new Error(`no ${name}`); return m; };

// Seeded randomness, so a failure repeats.
let seed = 42;
const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ── The season list ──────────────────────────────────────────────────────────
eq(CHAMPIONS_ROSTER.length, 252, "252 Pokémon in Regulation M-C");
eq(new Set(CHAMPIONS_ROSTER.map((m) => m.dex)).size, 231, "231 species (the official count)");
eq(new Set(CHAMPIONS_ROSTER.map((m) => m.id)).size, CHAMPIONS_ROSTER.length, "ids unique");
eq(new Set(CHAMPIONS_ROSTER.map((m) => m.name)).size, CHAMPIONS_ROSTER.length, "names unique");
ok(CHAMPIONS_ROSTER.every((m) => m.types.length >= 1 && m.types.length <= 2 && m.types.every((t) => (TYPES as readonly string[]).includes(t))), "every type is one of the 18");
ok(CHAMPIONS_ROSTER.every((m) => !m.legendary && !m.mythical), "no Legendary or Mythical in M-C");
ok(CHAMPIONS_ROSTER.every((m) => championById(m.id) === m && championByName(m.name) === m), "every Pokémon found by id and name");
eq(monId("Farfetch'd"), "farfetchd", "apostrophes drop out of ids");
eq(monId("Raichu (Alolan)"), "raichu-alolan", "forms in ids");
eq(formOf(mon("Rotom (Wash)")), "Wash", "form read from the name");
eq(formOf(mon("Garchomp")), null, "no form");
ok(CHAMPIONS_SEASON.starts < CHAMPIONS_SEASON.ends && CHAMPIONS_SEASON.checkedOn <= "2026-11-11", "season dates in order");
ok(CHAMPIONS_SEASON.sources.some((s) => s.official), "an official source");

// ── The type chart (since Generation 6) ─────────────────────────────────────
let se = 0, nve = 0, imm = 0;
for (const a of TYPES) for (const d of TYPES) {
  const x = effectiveness(a, [d]);
  if (x === 2) se++; else if (x === 0.5) nve++; else if (x === 0) imm++; else ok(x === 1, `${a} on ${d} is 0, ½, 1 or 2`);
}
eq(se, 51, "51 super-effective pairs");
eq(nve, 61, "61 not-very-effective pairs");
eq(imm, 8, "8 immunities");
eq(effectiveness("Ground", ["Flying"]), 0, "Ground can't hit Flying");
eq(effectiveness("Ice", ["Dragon", "Ground"]), 4, "Ice is ×4 on Garchomp");
eq(effectiveness("Electric", ["Water", "Flying"]), 4, "Electric is ×4 on Gyarados");
eq(effectiveness("Water", ["Water", "Dragon"]), 0.25, "Water is ×¼ on a Water/Dragon");
eq(effectiveness("Fighting", ["Normal", "Ghost"]), 0, "Fighting can't hit a Ghost");
eq(effectiveness("Dragon", ["Fairy"]), 0, "Dragon can't hit Fairy");
eq(effectiveness("Fire", ["Bug", "Steel"]), 4, "Fire is ×4 on Bug/Steel");
eq(effectiveness("Poison", ["Steel"]), 0, "Poison can't hit Steel");
eq(effectiveness("Nonsense", ["Fire"]), 1, "an unknown type is neutral");

// ── Lines and weak spots ─────────────────────────────────────────────────────
const chomp = mon("Garchomp"), gyara = mon("Gyarados");
const two = typeLines([chomp, gyara]);
eq(two.length, 18, "a line per type");
const ice = two.find((l) => l.type === "Ice")!;
ok(ice.weak.includes("Garchomp") && ice.double.includes("Garchomp"), "Ice: Garchomp ×4");
ok(!ice.weak.includes("Gyarados") && !ice.resist.includes("Gyarados"), "Gyarados takes Ice for normal damage (Water halves, Flying doubles)");
const ground = two.find((l) => l.type === "Ground")!;
ok(ground.immune.includes("Gyarados"), "Gyarados ignores Ground");
const grassTeam = ["Venusaur", "Victreebel", "Vileplume"].map(mon);
const spots = weakSpots(typeLines(grassTeam));
const spotTypes: string[] = spots.map((l) => l.type);
ok(["Fire", "Ice", "Flying", "Psychic"].every((t) => spotTypes.includes(t)), `three Grass/Poison: Fire, Ice, Flying, Psychic are weak spots (${spotTypes.join(", ")})`);
ok(spots.every((l) => unanswered(l)), "nobody on that team takes those");
ok(!spotTypes.includes("Water"), "Water isn't a weak spot for Grass types");
eq(weakSpots(typeLines([])).length, 0, "an empty team has no weak spots");
ok(coverScore(mon("Charizard"), grassTeam) > 0, "Charizard covers Grass/Poison's weak spots");
ok(coverScore(mon("Charizard"), grassTeam) > coverScore(mon("Victreebel"), grassTeam), "a fourth Grass covers less than Charizard");

// ── Legality ─────────────────────────────────────────────────────────────────
const raichus = [mon("Raichu"), mon("Raichu (Alolan)")];
const same = teamProblems(raichus);
eq(same.length, 1, "Raichu and Alolan Raichu: one problem");
eq(same[0]?.kind, "same_species", "the same species");
ok(problemText(same[0]).includes("Raichu and Raichu (Alolan)"), "the problem names both");
eq(teamProblems([chomp, { id: "tapu-koko", name: "Tapu Koko", offList: true }])[0]?.kind, "off_list", "off the list");
eq(teamProblems(CHAMPIONS_ROSTER.filter((m, i, a) => a.findIndex((x) => x.dex === m.dex) === i).slice(0, 7))[0]?.kind, "too_many", "seven is too many");
eq(teamProblems([chomp, gyara], 4)[0]?.kind, "too_few", "two is too few for an event");
eq(teamProblems([chomp, gyara]).length, 0, "two is fine in the builder");
eq(blockedBy(mon("Raichu (Alolan)"), [mon("Raichu"), null, null, null, null, null]), "Same species as Raichu", "a second Raichu is blocked, with why");
eq(blockedBy(chomp, [chomp, null, null, null, null, null]), "On your team", "already on the team");
const six = randomTeam(undefined, rng);
eq(blockedBy(gyara, six.some((m) => m.dex === gyara.dex) ? [...six.slice(0, 5), null] : six), six.some((m) => m.dex === gyara.dex) ? "Same species as Gyarados" : "Team is full", "a full team is full");
eq(blockedBy(chomp, [null, null, null, null, null, null]), null, "an empty team takes anyone");

// ── Filling at random ────────────────────────────────────────────────────────
for (let i = 0; i < 1500; i++) {
  const cover = i % 2 === 0, noRepeatTypes = i % 3 === 0;
  const start: (ChampMon | null)[] = [null, i % 4 === 0 ? chomp : null, null, i % 5 === 0 ? gyara : null, null, null];
  const out = fillTeam(start, { cover, noRepeatTypes }, rng);
  const team = out.filter((m): m is ChampMon => !!m);
  if (start[1] && out[1] !== chomp) { ok(false, "a picked slot stays put"); break; }
  if (start[3] && out[3] !== gyara) { ok(false, "a picked slot stays put (4)"); break; }
  if (new Set(team.map((m) => m.dex)).size !== team.length) { ok(false, `fill repeated a species (${team.map((m) => m.name)})`); break; }
  if (!noRepeatTypes && team.length !== TEAM_SIZE) { ok(false, "fill makes six"); break; }
  if (noRepeatTypes && !start[1] && !start[3]) {
    const types = team.flatMap((m) => m.types);
    if (new Set(types).size !== types.length) { ok(false, "no repeated types held"); break; }
  }
  if (i === 1499) ok(true, "1,500 fills: six different species, picks kept, types apart when asked");
}
// Covering weak spots leaves fewer of them than filling blind.
let withCover = 0, without = 0;
for (let i = 0; i < 400; i++) {
  withCover += weakSpots(typeLines(fillTeam([grassTeam[0], null, null, null, null, null], { cover: true, noRepeatTypes: false }, rng).filter((m): m is ChampMon => !!m))).length;
  without += weakSpots(typeLines(fillTeam([grassTeam[0], null, null, null, null, null], { cover: false, noRepeatTypes: false }, rng).filter((m): m is ChampMon => !!m))).length;
}
ok(withCover < without, `cover leaves fewer weak spots (${withCover} vs ${without} over 400 teams)`);
for (let i = 0; i < 300; i++) {
  const team = fillTeam([], { cover: true, noRepeatTypes: false }, rng);
  const next = rerollSlot(team, 2, { cover: i % 2 === 0, noRepeatTypes: false }, rng);
  if (!next || next.id === team[2]!.id || team.some((m, j) => j !== 2 && m!.dex === next.dex)) { ok(false, "reroll gives a new, different species"); break; }
  if (i === 299) ok(true, "300 rerolls: a new species each time");
}

// ── Links ────────────────────────────────────────────────────────────────────
const linkTeam = [chomp, mon("Incineroar"), mon("Raichu (Alolan)"), null, mon("Farfetch'd")];
const param = teamParam(linkTeam);
eq(param, "garchomp.incineroar.raichu-alolan.farfetchd", "link param in order, empties skipped");
const back = readTeamParam(param);
eq(back.team.map((m) => m.name).join(","), "Garchomp,Incineroar,Raichu (Alolan),Farfetch'd", "the link rebuilds the team");
const odd = readTeamParam("garchomp.tapu-koko.garchomp.GYARADOS");
eq(odd.team.length, 2, "unknown ids and repeats left out, case ignored");
eq(odd.unknown.join(","), "tapu-koko", "unknown ids said");
eq(readTeamParam(CHAMPIONS_ROSTER.slice(0, 9).map((m) => m.id).join(".")).team.length, 6, "a link holds six at most");
eq(teamFromText("https://www.gameshuffle.co/pokemon-champions-team-builder?team=garchomp.gyarados&x=1").team.length, 2, "a pasted builder link");
eq(teamFromText("garchomp, gyarados").team.length, 2, "pasted ids");
eq(teamFromText("https://example.com/").team.length, 0, "a link with no team");

// ── The monthly reminder ─────────────────────────────────────────────────────
const before = seasonReminder("2026-11-11");
ok(!before.ended && before.title.includes("in 20 days"), `before the end: ${before.title}`);
ok(before.text.includes("src/data/pokemon/champions.json") && before.text.includes("pokemon.com"), "the reminder says what to check and what to change");
ok(seasonReminder("2026-12-01").title.includes("ends today"), "the last day");
const after = seasonReminder("2026-12-05");
ok(after.ended && after.title.includes("has ended"), "after the end");

// ── Tournament team lists ────────────────────────────────────────────────────
const teamIds = randomTeam(undefined, rng).map((m) => m.id);
const good = checkTeam(teamIds);
ok(good.ok && good.value.length === 6, "a six from the builder is accepted");
const short = checkTeam(teamIds.slice(0, 3));
ok(!short.ok && /four to six/.test(short.message ?? ""), "three is refused: four to six");
ok(checkTeam(teamIds.slice(0, 4)).ok, "four is accepted");
const unknown = checkTeam(["garchomp", "gyarados", "incineroar", "tapu-koko"]);
ok(!unknown.ok && /Tapu Koko isn't on this season's list/.test(unknown.message ?? ""), "an id off the list is refused by name");
const dupe = checkTeam(["raichu", "raichu-alolan", "garchomp", "gyarados"]);
ok(!dupe.ok && /same species/.test(dupe.message ?? ""), "two Raichus are refused");
ok(!checkTeam("garchomp").ok, "not a list");
const lines = [chomp, gyara, mon("Incineroar"), mon("Rotom (Wash)")].map((m) => ({ count: 1, name: m.name, set: null, number: String(m.dex), section: "pokemon" as const, cardId: null }));
const v = viewOf({ id: "x", name: "Rain", cards: lines, updated_at: "2026-11-11T00:00:00Z", checked_at: null });
ok(v.legal && v.members.length === 4 && v.members.every((m) => m.onList), "a stored team reads back legal");
const v2 = viewOf({ id: "y", name: "Old", cards: [...lines, { count: 1, name: "Tapu Koko", set: null, number: "785", section: "pokemon", cardId: null }], updated_at: "2026-11-11T00:00:00Z", checked_at: null });
ok(!v2.legal && v2.members[4].onList === false && v2.members[4].dex === 785 && /Tapu Koko/.test(v2.problems[0]), "a Pokémon a new regulation drops shows as a problem");

const ts = (status: string, after: string, swiss: unknown = null) => publicScope({ status, settings: { deckLists: { when: "start", after } }, swiss });
eq(ts("open", "open"), null, "open lists: nothing before round 1");
eq(ts("in_progress", "open")?.scope, "open", "open lists from round 1");
eq(ts("in_progress", "all"), null, "everyone's: not while it runs");
eq(ts("complete", "all")?.scope, "all", "everyone's after");
eq(ts("complete", "private"), null, "private stays private");
eq(ts("in_progress", "top_cut"), null, "top cut: not before the cut");
const cutState = { v: 1, list: [], topCut: 4, cut: { seeds: ["a", "b", "c", "d"], results: {} } };
const cut = ts("in_progress", "top_cut", cutState);
ok(cut?.scope === "top_cut" && !!cut.only?.has("a") && cut.only?.size === 4, "top cut: its four once the cut is set");
eq(ts("complete", "top_cut")?.cut, 4, "a bracket's top cut is the top 4");
eq(publicScope({ status: "in_progress", settings: { deckLists: { when: "off", after: "open" } }, swiss: null }), null, "lists off: nothing");

eq(listKindOf("pokemon-champions"), "team", "Champions takes team lists");
eq(listKindOf("pokemon-tcg"), "deck", "the TCG takes deck lists");
eq(listKindOf("mario-kart-8-deluxe"), null, "Mario Kart takes none");
ok(takesLists("pokemon-champions") && !isDeckListGame("pokemon-champions"), "team lists aren't deck lists (no 50-minute card game clock)");
ok(deckListsOn({ game_slug: "pokemon-champions", settings: { deckLists: { when: "start" } } }), "team lists on");
ok(!deckNeededToJoin({ game_slug: "pokemon-champions", settings: { deckLists: { when: "join" } } }), "a team is never needed to join");
eq(deckListSettingsOf({ deckLists: { when: "start", after: "open" } }).after, "open", "open is read back");

// ── Chat roll, Twitch category, the space ────────────────────────────────────
const chat = getChatGame("pokemon-champions");
ok(!!chat && !!chat.streamerOnly && chat.noun === "team", "chat roll: the streamer's team");
for (let i = 0; i < 50; i++) {
  const r = chat!.roll({ owned: null, arg: "", taken: [] });
  const names = r.slots.map((x) => x.name);
  if (r.slots.length !== 6 || new Set(names.map((n) => championByName(n)!.dex)).size !== 6 || !r.text.startsWith("Regulation M-C team:") || r.slots.some((x) => !x.color)) {
    ok(false, `chat roll makes six different species with colors (${r.text})`); break;
  }
  if (i === 49) ok(true, "50 chat rolls: six different species, each with a type color");
}
eq(chatGameSlugForCategory("1931693784", null), "pokemon-champions", "Twitch category id");
eq(chatGameSlugForCategory(null, "Pokémon Champions"), "pokemon-champions", "Twitch category name");

for (const name of ["Pokémon Champions", "Pokemon Champions", "pokemon champions", "POKÉMON CHAMPIONS", "pokemon-champions", "Pokémon: Champions", "Pokemon Champs"]) {
  eq(gameKey(name), "pokemon-champions", `gameKey("${name}")`);
}
eq(catalogGame("Pokémon Champions")?.slug, "pokemon-champions", "catalog name");
const space = spaceById("pokemon-champions");
ok(!!space, "the space exists");
eq(spaceFor("Pokémon Champions")?.id, "pokemon-champions", "the game goes to its own space");
eq(spaceFor("Pokémon Stadium 2")?.id, "pokemon", "other Pokémon games stay in Pokémon");
ok(!spaceById("pokemon")!.games.includes("pokemon-champions"), "Pokémon's space leaves Champions out");
eq(space!.main.label, "Build a team", "main button");
eq(space!.tools[0].href, "/pokemon-champions-team-builder", "the builder is the first tool");
eq(spaceTabs(space!).join(","), "now,events,people,posts,ideas", "tabs: Now, Events, People, Posts, Ideas");
eq(space!.opens, "2026-11-11", "opens with the 2026-11-11 release");
eq(spaceRoller(space!), null, "no space roll (the chat roll is the streamer's)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
