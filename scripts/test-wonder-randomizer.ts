// Super Mario Bros. Wonder randomizer data and rolls (src/data/wonder/wonder.ts, src/lib/wonder/roll.ts), its chat roll
// and match setup, its saved setups, tier list and space.
//   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-wonder-randomizer.ts
import fs from "node:fs";
import path from "node:path";
import { WONDER as G } from "../src/data/wonder/wonder";
import { describeWonderSetup } from "../src/data/wonder";
import {
  DEFAULT_LEVEL_TYPES, LEVEL_GROUPS, badgePool, badgeWorn, characterPool, drawPlayers, drawSeat, levelPool, rerollRule,
  rollLevel, rollLevels, rollRules, ruleDetail, ruleLine, ruleOf, rulePool, worldLabel, worldsFor,
} from "../src/lib/wonder/roll";
import { getChatGame } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { TIER_TEMPLATES } from "../src/data/tier-templates";
import { GAME_SPACES, spaceFor, spaceOpen } from "../src/lib/games/spaces";
import { WONDER_PUBLIC, randomizerPublic } from "../src/lib/games-visibility";
import { gameKey } from "../src/lib/games/key";
import { RANDOMIZER_LANDINGS } from "../src/data/randomizer-landings";
import { resolveYouTubeGameFromTitle } from "../src/lib/youtube/games";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; console.error("✗", what); } };
const unique = (xs: string[]) => new Set(xs).size === xs.length;
const N = 400; // random runs per check

// ── Data ─────────────────────────────────────────────────────────────────────
ok(G.characters.filter((c) => !c.switch2).length === 12, "12 characters in the original game");
ok(G.characters.filter((c) => c.switch2).map((c) => c.name).join() === "Rosalina", "Rosalina is the Switch 2 Edition's character");
ok(G.characters.filter((c) => c.noDamage).map((c) => c.name).sort().join() === "Light-Blue Yoshi,Nabbit,Red Yoshi,Yellow Yoshi,Yoshi", "the four Yoshis and Nabbit take no damage");
ok(unique(G.characters.map((c) => c.name)) && unique(G.characters.map((c) => c.slug)), "character names and slugs unique");
ok(G.badges.filter((b) => !b.switch2).length === 24, `24 badges in the original game (${G.badges.filter((b) => !b.switch2).length})`);
ok(G.badges.filter((b) => b.switch2).length === 18, "18 more in the Switch 2 Edition");
ok(G.badges.length === 42, "42 badges in all");
const count = (t: string) => G.badges.filter((b) => b.type === t && !b.switch2).length;
ok(count("action") === 9 && count("boost") === 11 && count("expert") === 4, "9 Action, 11 Boost and 4 Expert Badges in the original");
ok(G.badges.filter((b) => b.type === "dual").length === 17, "17 Dual Badges");
ok(G.badges.filter((b) => b.type === "dual").every((b) => b.parts && b.parts.every((p) => G.badges.some((x) => x.name === p && x.type !== "dual"))), "every Dual Badge is two real badges");
ok(G.badges.filter((b) => b.type === "dual").every((b) => b.name === `${b.parts![0]} + ${b.parts![1]}`), "Dual Badge names are their two parts");
ok(unique(G.badges.map((b) => b.name)) && unique(G.badges.map((b) => b.slug)), "badge names and slugs unique");
ok(G.badges.filter((b) => b.first).map((b) => b.name).sort().join() === "Auto Super Mushroom,Coin Reward,Jet Run,Parachute Cap,Wall-Climb Jump", "five badges from the first world");
ok(G.badges.filter((b) => b.cosmetic).map((b) => b.name).join() === "Sound Off?", "Sound Off? only changes voices");
ok(G.badges.filter((b) => b.late && b.type !== "dual").length === 6, "six late badges: All Elephant/Fire/Bubble/Drill/Flower Power and Sound Off?");
ok(G.badges.filter((b) => b.type === "dual" && b.late).every((b) => b.parts!.some((p) => G.badges.find((x) => x.name === p)?.late)), "a Dual Badge is late only through a late part");
ok(G.badges.every((b) => b.what.length > 10 && b.what.endsWith(".")), "every badge says what it does");
ok(G.levels.filter((l) => !l.switch2).length === 130, `130 levels in the original game (${G.levels.filter((l) => !l.switch2).length})`);
ok(G.levels.filter((l) => l.type === "showdown").length === 7 && G.levels.filter((l) => l.type === "showdown").every((l) => l.switch2), "7 Koopaling showdowns, all Switch 2 Edition");
ok(unique(G.levels.map((l) => l.name)), "level names unique");
ok(G.levels.every((l) => G.worlds.some((w) => w.id === l.world)), "every level's world exists");
ok(G.worlds.every((w) => G.levels.some((l) => l.world === w.id)), "every world has levels");
ok(G.levels.every((l) => l.stars === null || (Number.isInteger(l.stars) && l.stars >= 1 && l.stars <= 5)), "star ratings are 1 to 5");
ok(G.levels.filter((l) => ["break", "search", "ko"].includes(l.type)).every((l) => l.stars === null), "Break Time!, Search Parties and KO Arenas have no rating");
ok(G.levels.filter((l) => l.world === "special-world").every((l) => l.stars === 5), "Special World levels are 5 stars");
ok(G.levels.filter((l) => l.type === "palace").length === 4 && G.levels.filter((l) => l.type === "battleship").length === 3, "4 palaces and 3 Flying Battleships");
ok(G.levels.filter((l) => l.type === "boss").map((l) => l.name).join() === "The Final Battle! Bowser's Rage Stage", "one final battle");
ok(G.levels.filter((l) => /Badge Challenge/.test(l.name)).every((l) => l.type === "badge"), "every Badge Challenge is typed badge");
ok(G.levels.filter((l) => l.name.startsWith("Break Time!")).length === 19, "19 Break Time! levels");
ok(G.worlds.filter((w) => w.number).map((w) => w.number).join() === "1,2,3,4,5,6", "worlds 1 to 6");
ok(unique(G.rules.map((r) => r.id)) && unique(G.rules.map((r) => r.title)), "rule ids and titles unique");
ok(G.rules.length === 19, `19 rules (${G.rules.length})`);
ok((["lives", "badges", "power", "play", "team"] as const).every((k) => G.rules.some((r) => r.kind === k)), "every kind of rule has rules");
ok(G.rules.filter((r) => r.badge === "same").every((r) => r.detail.includes("{badge}")), "the same-badge rule names its badge");
ok(G.rules.filter((r) => r.badge === "none").length === 1 && G.rules.filter((r) => r.badge).every((r) => r.kind === "badges"), "badge-changing rules are of the badges kind");
const copy = [...G.rules.flatMap((r) => [r.title, r.detail]), ...G.badges.map((b) => b.what)];
ok(copy.every((t) => !/[–—]/.test(t)), "no dashes in rules or badge lines");
ok(G.rules.every((r) => r.detail.endsWith(".")), "every rule detail is a sentence");

// ── Art ──────────────────────────────────────────────────────────────────────
const pub = (p: string) => fs.existsSync(path.join(process.cwd(), "public", p));
ok(G.characters.every((c) => pub(`${G.assetBase}characters/${c.slug}.webp`)), "every character has its picture");
ok(G.badges.every((b) => pub(`${G.assetBase}badges/${b.slug}.webp`)), "every badge has its picture");
ok(pub(`${G.assetBase}super-mario-bros-wonder-keyart.webp`), "the key art is there");
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/data/wonder-art.json"), "utf8")) as { characters: { slug: string; source: string }[]; badges: { slug: string; source: string }[] };
ok(manifest.characters.every((c) => /nintendo\.com/.test(c.source)), "every character render comes from a Nintendo site");
ok(manifest.characters.length === G.characters.length && manifest.badges.length === G.badges.length, "the art manifest covers everything");

// ── Pools ────────────────────────────────────────────────────────────────────
ok(characterPool(G).length === 12, "default characters: the original 12");
ok(characterPool(G, { switch2: true }).length === 13, "Switch 2 Edition: 13");
ok(characterPool(G, { noDamage: false }).length === 7 && characterPool(G, { noDamage: false }).every((c) => !c.noDamage), "without the Yoshis and Nabbit: 7, all of them take damage");
ok(characterPool(G, { switch2: true, noDamage: false }).length === 8, "Switch 2 without the Yoshis and Nabbit: 8");
ok(badgePool(G).length === 24, "default badges: the original 24");
ok(badgePool(G, { switch2: true }).length === 42, "Switch 2 Edition: all 42");
ok(badgePool(G, { types: ["action"] }).length === 9 && badgePool(G, { types: ["action"] }).every((b) => b.type === "action"), "Action only");
ok(badgePool(G, { types: ["boost", "expert"] }).length === 15, "Boost and Expert");
ok(badgePool(G, { types: ["dual"] }).length === 0, "Dual Badges need the Switch 2 Edition");
ok(badgePool(G, { switch2: true, types: ["dual"] }).length === 17, "Dual Badges with the Switch 2 Edition");
ok(badgePool(G, { set: "first-world" }).length === 5, "first world only: 5");
ok(badgePool(G, { set: "first-world", switch2: true }).length === 5, "first world only stays 5 with the Switch 2 Edition");
ok(badgePool(G, { set: "before-ending" }).length === 19 && badgePool(G, { set: "before-ending" }).every((b) => !b.late), "before the ending: 19, none late");
ok(badgePool(G, { soundOff: false }).length === 23 && !badgePool(G, { soundOff: false }).some((b) => b.cosmetic), "without Sound Off?: 23");
ok(badgePool(G, { set: "first-world", types: ["expert"] }).map((b) => b.name).join() === "Jet Run", "first-world Expert Badge: Jet Run");
const courseLevels = levelPool(G);
ok(courseLevels.every((l) => DEFAULT_LEVEL_TYPES.includes(l.type) && !l.switch2), "default levels: courses, palaces, battleships and Bowser from the original");
ok(courseLevels.length === 130 - 19 - 4 - 6 - 3 - 20, `default pool size (${courseLevels.length})`);
ok(!courseLevels.some((l) => ["badge", "break", "search", "ko", "wiggler"].includes(l.type)), "default leaves out the bonus levels");
ok(levelPool(G, { switch2: true }).length === courseLevels.length + 7, "Switch 2 adds the 7 showdowns");
for (const w of G.worlds) {
  const pool = levelPool(G, { world: w.id, switch2: true, types: [...DEFAULT_LEVEL_TYPES, "badge", "break", "search", "ko", "wiggler"] });
  ok(pool.length === G.levels.filter((l) => l.world === w.id).length && pool.every((l) => l.world === w.id), `every level of ${w.name}`);
  if (!w.switch2) ok(levelPool(G, { world: w.id }).length > 0, `${w.name} has default levels`);
}
ok(levelPool(G, { world: "bellabel-park" }).length === 0, "Bellabel Park is empty without the Switch 2 Edition");
ok(levelPool(G, { stars: [1] }).every((l) => l.stars === 1 || l.stars === null), "1-star filter");
ok(levelPool(G, { stars: [5] }).every((l) => l.stars === 5 || l.stars === null) && levelPool(G, { stars: [5] }).some((l) => l.world === "special-world"), "5-star filter reaches the Special World");
ok(levelPool(G, { types: ["badge"] }).every((l) => l.type === "badge"), "Badge Challenges only");
ok(LEVEL_GROUPS.flatMap((g) => g.types).length === new Set(LEVEL_GROUPS.flatMap((g) => g.types)).size && new Set(LEVEL_GROUPS.flatMap((g) => g.types)).size === 10, "the level groups cover each type once");
ok(worldsFor(G, false).length === 8 && worldsFor(G, true).length === 9, "8 worlds, 9 with Bellabel Park");
ok(worldLabel(G.worlds[0]) === "World 1: Pipe-Rock Plateau" && worldLabel(G.worlds.find((w) => w.id === "petal-isles")!) === "Petal Isles", "world labels");
ok(rulePool(G).length === 19 && rulePool(G, ["lives"]).every((r) => r.kind === "lives"), "rule pools");

// ── Players ──────────────────────────────────────────────────────────────────
let distinctChars = true, distinctBadges = true, repeatsSeen = false, fairOk = true, firstOk = true, seatOk = true;
for (let i = 0; i < N; i++) {
  const n = 1 + (i % 4);
  const chars = characterPool(G, { switch2: i % 2 === 0, noDamage: i % 3 !== 0 });
  const badges = badgePool(G, { switch2: i % 2 === 0, set: i % 5 === 0 ? "first-world" : "all" });
  const ps = drawPlayers(chars, badges, n);
  if (ps.length !== n || !unique(ps.map((p) => p.character))) distinctChars = false;
  if (!unique(ps.map((p) => p.badge ?? ""))) distinctBadges = false;
  if (i % 3 === 0 && ps.some((p) => G.characters.find((c) => c.name === p.character)?.noDamage)) fairOk = false;
  if (i % 5 === 0 && ps.some((p) => !G.badges.find((b) => b.name === p.badge)?.first)) firstOk = false;
  const rep = drawPlayers(characterPool(G), badgePool(G, { set: "first-world", types: ["expert"] }), 4, { badgeRepeats: true });
  if (rep.every((p) => p.badge === "Jet Run")) repeatsSeen = true;
  const seat = drawSeat(chars, badges, ps.slice(1));
  if (ps.slice(1).some((p) => p.character === seat.character || p.badge === seat.badge)) seatOk = false;
}
ok(distinctChars, "nobody shares a character");
ok(distinctBadges, "nobody shares a badge without repeats");
ok(fairOk, "the no-damage filter keeps the Yoshis and Nabbit out");
ok(firstOk, "first-world badges only");
ok(repeatsSeen, "repeats let a one-badge pool cover everyone");
ok(seatOk, "a card's refresh keeps clear of the other seats");
const tiny = drawPlayers(characterPool(G), badgePool(G, { set: "first-world", types: ["expert"] }), 4);
ok(tiny.length === 4 && tiny.every((p) => p.badge === "Jet Run"), "a pool smaller than the group repeats once it runs out");
ok(drawPlayers(characterPool(G), [], 2).every((p) => p.badge === null), "no badge fits: null");

// ── Levels ───────────────────────────────────────────────────────────────────
const desert = levelPool(G, { world: "sunbaked-desert" });
let levelOk = true, avoidOk = true, runOk = true;
for (let i = 0; i < N; i++) {
  const l = rollLevel(desert);
  if (!l || l.world !== "sunbaked-desert") levelOk = false;
  if (l && rollLevel(desert, l.name)?.name === l.name) avoidOk = false;
  const run = rollLevels(desert, 5);
  if (run.length !== 5 || !unique(run.map((x) => x.name)) || run.some((x) => x.world !== "sunbaked-desert")) runOk = false;
}
ok(levelOk, "a level from the world asked for");
ok(avoidOk, "a new level is a different one");
ok(runOk, "a run of levels has no repeats");
const allDesert = rollLevels(desert, desert.length);
ok(unique(allDesert.map((x) => x.name)) && allDesert.length === desert.length, "a run as long as the pool uses every level once");
ok(rollLevels(desert, desert.length + 3).length === desert.length + 3, "a longer run repeats only after every level");
ok(rollLevel([]) === null && rollLevels([], 3).length === 0, "an empty pool rolls nothing");

// ── Rules ────────────────────────────────────────────────────────────────────
let kindsOk = true, countOk = true, sameOk = true, rerollOk = true;
const allBadges = badgePool(G);
for (let i = 0; i < N; i++) {
  const c = i % 4;
  const rs = rollRules(rulePool(G), c, allBadges);
  const kinds = rs.map((r) => ruleOf(G, r)!.kind);
  if (!unique(kinds)) kindsOk = false;
  if (rs.length !== c) countOk = false;
  for (const r of rs) if (ruleOf(G, r)!.badge === "same" && (!r.badge || !allBadges.some((b) => b.name === r.badge) || r.badge === "Sound Off?")) sameOk = false;
  if (rs.length >= 2) {
    const one = rerollRule(rulePool(G), rs, 0, allBadges);
    const next = rs.map((r, j) => (j === 0 ? one! : r));
    if (!one || one.id === rs[0].id || !unique(next.map((r) => ruleOf(G, r)!.kind))) rerollOk = false;
  }
}
ok(kindsOk, "never two rules of a kind");
ok(countOk, "as many rules as asked");
ok(sameOk, "the same-badge rule lands on a real badge (not Sound Off?)");
ok(rerollOk, "one rule's refresh changes only it and keeps the kinds apart");
ok(rollRules(rulePool(G), 9, allBadges).length === 5, "at most one rule per kind (5 kinds)");
ok(rollRules(rulePool(G, ["badges"]), 3, []).every((r) => ruleOf(G, r)!.badge !== "same"), "no badges to share: the same-badge rule stays out");
const noBadges = { id: "no-badges" }, same = { id: "same-badge", badge: "Grappling Vine" }, life = { id: "one-life" };
ok(badgeWorn(G, "Parachute Cap", [life]).badge === "Parachute Cap", "a player keeps their badge");
ok(badgeWorn(G, "Parachute Cap", [noBadges]).badge === null && badgeWorn(G, "Parachute Cap", [noBadges]).rule === "none", "No badges takes it off");
ok(badgeWorn(G, "Parachute Cap", [life, same]).badge === "Grappling Vine", "Same badge for everyone");
ok(ruleDetail(ruleOf(G, same)!, same) === "Everyone wears Grappling Vine.", "the shared badge is named");
ok(ruleLine(ruleOf(G, life)!, life).endsWith("(All night)"), "a rule line says how long it lasts");

// ── Saved setups ─────────────────────────────────────────────────────────────
const rows = describeWonderSetup({ type: "wonder-setup", gameSlug: G.slug, world: "fungi-mines", switch2: false,
  players: [{ name: "Sam", character: "Peach", badge: "Parachute Cap" }, { name: "Riley", character: "Luigi", badge: "Grappling Vine" }],
  level: "Upshroom Downshroom", levels: ["Taily's Toxic Pond"], rules: [life, { id: "no-running" }] });
ok(rows.find((r) => r.label === "Players")?.value === "Sam (Peach, Parachute Cap), Riley (Luigi, Grappling Vine)", "saved players");
ok(rows.find((r) => r.label === "World")?.value === "World 5: Fungi Mines", "saved world");
ok(rows.filter((r) => r.label.startsWith("Rule")).length === 2, "saved rules");
ok(describeWonderSetup({ gameSlug: "other" }).length === 0, "other games describe nothing");
const off = describeWonderSetup({ gameSlug: G.slug, players: [{ name: "Sam", character: "Peach", badge: "Parachute Cap" }], rules: [noBadges] });
ok(off[0].value === "Sam (Peach, no badge)", "a saved No badges rule shows on the players");

// ── Chat, the space and the rest ─────────────────────────────────────────────
const chat = getChatGame(G.slug);
ok(!!chat, "chat roll registered (outside production)");
if (chat) {
  let uniqueOk = true, typedOk = true, baseOk = true;
  for (let i = 0; i < N; i++) {
    const roll = chat.roll({ owned: null, arg: "", taken: ["Mario", "Luigi", "Peach"] });
    if (["Mario", "Luigi", "Peach"].includes(roll.slots[0].name)) uniqueOk = false;
    if (roll.slots.some((s) => s.name === "Rosalina" || G.badges.find((b) => b.name === s.name)?.switch2)) baseOk = false;
    const expert = chat.roll({ owned: null, arg: "expert", taken: [] });
    if (G.badges.find((b) => b.name === expert.slots[1]?.name)?.type !== "expert") typedOk = false;
    const boost = chat.roll({ owned: null, arg: "boost", taken: [] });
    if (G.badges.find((b) => b.name === boost.slots[1]?.name)?.type !== "boost") typedOk = false;
  }
  ok(uniqueOk, "chat: characters stay different across the lobby");
  ok(typedOk, "chat: !gs-shuffle expert / boost keep the badge group");
  ok(baseOk, "chat: the original game unless switch2");
  const r = chat.roll({ owned: null, arg: "", taken: [] });
  ok(r.slots.length === 2 && r.slots[0].kind === "portrait" && r.slots[1].kind === "art" && /^🍄 .+ · 🏅 .+$/.test(r.text), "chat roll: character and badge");
  ok(r.slots.every((s) => !s.img || pub(s.img)), "chat roll pictures exist");
  ok(chat.lobbyCap === 4 && chat.unique === true, "a lobby of 4, different characters");
}
const set = CHAT_SETUPS[G.slug];
ok(!!set, "match setup registered");
if (set) {
  const one = set.roll({ arg: "", players: 4 });
  ok(one.slots.length === 1 && G.levels.some((l) => l.name === one.slots[0].name), "setup: the next level");
  const three = set.roll({ arg: "3", players: 4 });
  ok(three.slots.length === 3 && unique(three.slots.map((s) => s.name)), "setup: 3 different levels");
  const desertRoll = set.roll({ arg: "desert", players: 4 });
  ok(G.levels.find((l) => l.name === desertRoll.slots[0].name)?.world === "sunbaked-desert" && desertRoll.title === "Level to play in Sunbaked Desert", "setup: a world's name keeps it there");
  const magma = set.roll({ arg: "2 magma", players: 4 });
  ok(magma.slots.length === 2 && magma.slots.every((s) => G.levels.find((l) => l.name === s.name)?.world === "deep-magma-bog"), "setup: a number and a world");
  const world = set.roll({ arg: "world", players: 4 });
  ok(world.title === "Next world" && worldsFor(G, false).some((w) => worldLabel(w) === world.slots[0].name), "setup: a world");
  const rule = set.roll({ arg: "rule", players: 4 });
  ok(rule.title === "Challenge rule" && G.rules.some((r) => r.title === rule.slots[0].name), "setup: a challenge rule");
  ok([one, three, desertRoll, world, rule].every((x) => !x.title!.includes(": ")), "setup titles have no colon");
  ok((set.choices ?? []).every((c) => set.roll({ arg: c.arg, players: 4 }).slots.length > 0), "every setup choice rolls");
}
ok(chatGameSlugForCategory("463447553", null) === G.slug && chatGameSlugForCategory(null, "Super Mario Bros. Wonder") === G.slug, "Twitch category maps to the game");
ok(resolveYouTubeGameFromTitle("Super Mario Bros. Wonder co-op with chat!") === G.slug && resolveYouTubeGameFromTitle("SMBW all badges") === G.slug, "YouTube titles");
ok(gameKey("Mario Wonder") === G.slug && gameKey("SMBW") === G.slug && gameKey("super-mario-bros-wonder") === G.slug, "game key and aliases");
const space = GAME_SPACES.find((s) => s.id === "super-mario-bros-wonder");
ok(!!space && spaceFor("Super Mario Bros. Wonder")?.id === space.id, "the space");
ok(!!space && space.opens === null && !spaceOpen(space, "2030-01-01"), "staff only until an opening day");
ok(!!space && space.tabs.join() === "now,rolls,events,people,posts,ideas" && space.main.label === "Roll a challenge", "space tabs and main button");
ok(!!space && pub(space.hero!) && pub(space.box!), "space header and box art exist");
ok(WONDER_PUBLIC || !randomizerPublic(G.slug), "hidden from lists while the flag is off");
const landing = RANDOMIZER_LANDINGS[G.slug];
ok(!!landing && landing.metaTitle.length <= 60 && landing.metaDescription.length <= 160, "landing meta lengths");
ok(!!landing && [landing.lead, landing.overview, ...landing.features.map((f) => f.description), ...landing.faq.flatMap((f) => [f.q, f.a])].every((t) => !/[–—]/.test(t)), "no dashes in the landing");
const tier = TIER_TEMPLATES.find((t) => t.slug === "super-mario-bros-wonder-badges");
ok(!!tier && tier.items.length === 25 && unique(tier.items.map((i) => i.label)) && tier.items.every((i) => i.image && pub(i.image)), "tier list: 25 badges with pictures (outside production)");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
