/**
 * Trainer Road's path rules (src/lib/originals/duel/roadPath.ts): the paths' teams exist, badges come
 * in order, the League runs back to back and resets on a loss, the end-game opponent clears the region
 * and opens the next, XP, levels and card colors. Road encounters (roadEncounters.ts): every region's
 * villain teams exist where they say, the story battle stands before a Gym, grunts roll about 1 in 4.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-road-path.ts
 */

import { DUEL_DATA } from "../src/lib/originals/duel/data";
import { regionOf, regionSections, roadPeople, roadStars } from "../src/lib/originals/duel/road";
import { ROAD_VILLAINS, gruntAfter, markNames, setDue, villainTeamOf } from "../src/lib/originals/duel/roadEncounters";
import {
  CHAMPION_KEY, ROAD_LEVER_DEFAULTS, ROAD_PATHS, badgeKey, cardColor, hardKey, judgePath, leagueKey, levelOf, nextStep, outcomeRewards, pathSpot,
  markKey, progressFrom, regionKey, stepState, winKey, winXp, xpForLevel, type LedgerRow, type PathOutcome,
} from "../src/lib/originals/duel/roadPath";

let pass = 0;
let fail = 0;
function check(ok: unknown, what: string, detail?: unknown) {
  if (ok) { pass++; return; }
  fail++;
  console.log(`FAIL ${what}`, detail === undefined ? "" : JSON.stringify(detail));
}

const byId = new Map(DUEL_DATA.trainers.map((t) => [t.id, t]));

// ── The paths ────────────────────────────────────────────────────────────────
check(ROAD_PATHS.length === 9, "nine regions");
const seen = new Set<string>();
for (const p of ROAD_PATHS) {
  for (const id of [...p.gyms, ...p.league, p.endgame]) {
    const t = byId.get(id);
    check(!!t, `${p.region}: ${id} is in the roster`);
    check(!seen.has(id), `${id} is on one path only`);
    seen.add(id);
  }
  for (const id of p.gyms) check(byId.get(id)?.tier === "gym", `${p.region}: ${id} is a Gym team`, byId.get(id)?.tier);
  for (const id of p.gyms) check(regionOf(byId.get(id)!) === p.region, `${p.region}: ${id} belongs to the region`);
  check(p.gyms.length === (p.region === "alola" ? 4 : 8), `${p.region}: ${p.gyms.length} gyms`);
  check(p.league.length === (p.region === "galar" ? 3 : 5), `${p.region}: League of ${p.league.length}`);
  const champ = byId.get(p.league[p.league.length - 1]);
  check(champ?.tier === "champion", `${p.region}: the League ends on a Champion-tier team`, champ?.id);
  check(new Set(p.gyms.map((id) => byId.get(id)?.name)).size === p.gyms.length, `${p.region}: eight different Gym Leaders`);
}
check(pathSpot("brock-firered")?.kind === "gym" && pathSpot("brock-firered")?.index === 0, "Brock is Kanto's first gym");
check(pathSpot("blue-firered")?.kind === "league" && pathSpot("blue-firered")?.index === 4, "Blue is Kanto's Champion");
check(pathSpot("red-letsgo")?.kind === "endgame", "Red (Let's Go) is Kanto's end-game opponent");
check(pathSpot("brock-heartgold") === null, "Brock's HeartGold team is free play");

// ── A player's progress ──────────────────────────────────────────────────────
const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
let n = 0;
const row = (key: string, kind: LedgerRow["kind"], region: string | null, team: string | null, xp = 0, tokens = 0): LedgerRow => ({ key, kind, region, team_id: team, xp, tokens, at: at(n++) });

const empty = progressFrom([], {});
check(empty.regions[0].open && !empty.regions[1].open, "a new player: Kanto open, Johto not");
check(nextStep(empty)?.team === "brock-firered", "a new player's next trainer is Brock");
check(nextStep(null)?.team === "brock-firered", "signed out: the path still starts with Brock");
check(stepState(null, "brock-firered")?.state === "next" && stepState(null, "red-letsgo")?.state === "later" && stepState(null, "falkner-heartgold")?.state === "locked", "signed out: Brock next, Red later, Falkner locked");
check(stepState(empty, "brock-firered")?.state === "next", "Brock is next");
check(stepState(empty, "misty-firered")?.state === "later", "Misty is later");
check(stepState(empty, "falkner-heartgold")?.state === "locked", "Falkner is locked until Kanto is cleared");
check(empty.color === "basic" && empty.startedAt === null, "a new player's card is basic");

// Badges in order only.
const kanto = ROAD_PATHS[0];
check(judgePath(empty, "misty-firered", true, false).length === 0, "beating Misty first earns nothing on the path");
const b1 = judgePath(empty, "brock-firered", true, false);
check(b1.length === 1 && b1[0].kind === "badge" && (b1[0] as Extract<PathOutcome, { kind: "badge" }>).of === 8, "beating Brock earns his badge", b1);
check(judgePath(empty, "brock-firered", false, false).length === 0, "losing to Brock does nothing");

const ledger: LedgerRow[] = [];
for (const t of kanto.gyms) ledger.push(row(badgeKey("kanto", t), "badge", "kanto", t, 150, 50));
const allBadges = progressFrom(ledger, {});
check(allBadges.regions[0].badges.length === 8 && allBadges.badges === 8, "eight Kanto badges");
check(nextStep(allBadges)?.team === "lorelei-firered", "after eight badges: Lorelei");
check(stepState(allBadges, "lorelei-firered")?.state === "next", "the League opens after eight badges");
check(stepState(progressFrom(ledger.slice(0, 7), {}), "lorelei-firered")?.state === "later", "the League waits for the eighth badge");

// The League back to back, a loss resets.
const step1 = judgePath(allBadges, "lorelei-firered", true, false);
check(step1[0]?.kind === "league_step" && (step1[0] as Extract<PathOutcome, { kind: "league_step" }>).step === 1, "beating Lorelei moves the League to Bruno", step1);
const atBruno = progressFrom(ledger, { kanto: 1 });
check(nextStep(atBruno)?.team === "bruno-firered", "at challenge 2: Bruno is next");
check(stepState(atBruno, "lorelei-firered")?.state === "done", "Lorelei counts as done for now");
const reset = judgePath(atBruno, "bruno-firered", false, false);
check(reset[0]?.kind === "league_reset" && (reset[0] as Extract<PathOutcome, { kind: "league_reset" }>).from === 1, "losing to Bruno sends you back to Lorelei", reset);
check(judgePath(allBadges, "lorelei-firered", false, false).length === 0, "losing the first challenge resets nothing");
check(judgePath(atBruno, "agatha-firered", true, false).length === 0, "beating Agatha out of turn does nothing");
const champ = judgePath(progressFrom(ledger, { kanto: 4 }), "blue-firered", true, false);
check(champ.length === 1 && champ[0].kind === "league", "beating Blue at challenge 5 wins the League", champ);

// The end-game opponent clears the region and opens the next.
ledger.push(row(leagueKey("kanto"), "league", "kanto", "blue-firered", 500, 250));
const leagueWon = progressFrom(ledger, { kanto: 4 });
check(leagueWon.regions[0].leagueDone && leagueWon.regions[0].leagueStep === 5, "the League won");
check(nextStep(leagueWon)?.team === "red-letsgo", "then Red");
const clear = judgePath(leagueWon, "red-letsgo", true, false);
check(clear.length === 1 && clear[0].kind === "region" && (clear[0] as Extract<PathOutcome, { kind: "region" }>).next === "johto", "beating Red clears Kanto and opens Johto", clear);
const clearHard = judgePath(leagueWon, "red-letsgo", true, true);
check(clearHard.some((o) => o.kind === "endgame_hard") && clearHard.some((o) => o.kind === "region"), "beating Red in Hard also counts for the holo card", clearHard);
ledger.push(row(regionKey("kanto"), "region", "kanto", "red-letsgo", 1000, 500));
const cleared = progressFrom(ledger, {});
check(cleared.regions[0].cleared && cleared.regions[1].open && cleared.regionsCleared === 1, "Kanto cleared, Johto open");
check(cleared.color === "bronze", "the first region turns the card bronze");
check(nextStep(cleared)?.team === "falkner-heartgold", "then Falkner");
check(stepState(cleared, "falkner-heartgold")?.state === "next", "Falkner is next");
const lateHard = judgePath(cleared, "red-letsgo", true, true);
check(lateHard.length === 1 && lateHard[0].kind === "endgame_hard", "a Hard win against Red after clearing still counts once", lateHard);
check(judgePath(progressFrom([...ledger, row(hardKey("kanto"), "endgame_hard", "kanto", "red-letsgo")], {}), "red-letsgo", true, true).length === 0, "and only once");

// Wins (any team) count trainers beaten; the first win each month is its own key.
ledger.push(row(winKey("brock-firered", "2026-10-01"), "win", "kanto", "brock-firered", 150));
ledger.push(row(winKey("brock-firered", "2026-11-01"), "win", "kanto", "brock-firered", 150));
ledger.push(row(winKey("brock-heartgold", "2026-10-01"), "win", "johto", "brock-heartgold", 150));
const withWins = progressFrom(ledger, {});
check(withWins.trainersBeaten === 2, "two different teams beaten", withWins.trainersBeaten);
check(withWins.startedAt === ledger[0].at, "started at the first thing earned");
check(withWins.xp === ledger.reduce((s, r) => s + r.xp, 0), "XP adds up the ledger");

// Clearing all nine: the champion outcome and colors.
const nine: LedgerRow[] = [];
for (const p of ROAD_PATHS) {
  for (const t of p.gyms) nine.push(row(badgeKey(p.region, t), "badge", p.region, t));
  nine.push(row(leagueKey(p.region), "league", p.region, null));
  if (p.region !== "paldea") nine.push(row(regionKey(p.region), "region", p.region, p.endgame));
}
const eight = progressFrom(nine, {});
check(eight.regionsCleared === 8 && eight.color === "silver", "eight regions: silver", eight.color);
const last = judgePath(eight, "kieran-indigo", true, false);
check(last.some((o) => o.kind === "region") && last.some((o) => o.kind === "champion"), "clearing Paldea makes you Trainer Road Champion", last);
nine.push(row(regionKey("paldea"), "region", "paldea", "kieran-indigo"), row(CHAMPION_KEY, "champion", null, null));
const all = progressFrom(nine, {});
check(all.champion && all.color === "gold" && nextStep(all) === null, "all nine: gold, nothing next");
check(cardColor(9, 9) === "holo" && cardColor(9, 8) === "gold" && cardColor(5, 0) === "silver" && cardColor(4, 0) === "bronze" && cardColor(0, 0) === "basic", "card colors");

// ── XP and levels ────────────────────────────────────────────────────────────
const L = ROAD_LEVER_DEFAULTS;
check(winXp(L, "gym", false, 0, false) === 100, "a gym win: 100");
check(winXp(L, "gym", false, 3, false) === 175, "a 3-star gym win: 175");
check(winXp(L, "elite", false, 2, true) === 300, "a 2-star Elite Four win in Hard: (150+50) x 1.5 = 300");
check(winXp(L, "champion", true, 3, false) === 375, "the end-game opponent: 300 + 75");
check(outcomeRewards(L, { kind: "badge", region: "kanto", team: "brock-firered", index: 0, of: 8 }).tokens === 50, "a badge pays 50 tokens");
check(outcomeRewards(L, { kind: "champion" }).tokens === 1000, "Trainer Road Champion pays 1,000 tokens");
check(xpForLevel(1) === 0 && xpForLevel(2) === 100, "level 2 at 100 XP");
check(levelOf(0).level === 1 && levelOf(99).level === 1 && levelOf(100).level === 2, "levels by XP");
check(levelOf(250).into === 250 - xpForLevel(levelOf(250).level), "XP into the level");
for (let lv = 2; lv < 100; lv++) check(xpForLevel(lv + 1) > xpForLevel(lv), `level ${lv + 1} needs more than ${lv}`);
check(levelOf(xpForLevel(100) + 10).level === 100 && levelOf(10 ** 9).level === 100, "level 100 is the top");
// Clearing every region (every win at 2 stars, plus milestones) lands around level 60.
let clearXp = 0;
for (const p of ROAD_PATHS) {
  clearXp += p.gyms.reduce((s, id) => s + winXp(L, byId.get(id)!.tier, false, 2, false) + L.xpBadge, 0);
  clearXp += p.league.reduce((s, id) => s + winXp(L, byId.get(id)!.tier, false, 2, false), 0) + L.xpLeague;
  clearXp += winXp(L, "champion", true, 2, false) + L.xpRegion;
}
const lv = levelOf(clearXp).level;
check(lv >= 50 && lv <= 65, `clearing the whole road at 2 stars lands near level 60 (${lv}, ${clearXp} XP)`);

// ── Road encounters ──────────────────────────────────────────────────────────
check(ROAD_VILLAINS.length === ROAD_PATHS.length, "every region has its villain teams");
const onPath = new Set(ROAD_PATHS.flatMap((p) => [...p.gyms, ...p.league, p.endgame]));
for (const v of ROAD_VILLAINS) {
  const p = ROAD_PATHS.find((x) => x.region === v.region);
  check(!!p, `${v.region}: villains on a path region`);
  if (!p) continue;
  const set = byId.get(v.set.team);
  check(set?.tier === "admin", `${v.region}: story battle ${v.set.team} is an admin-tier team`, set?.tier);
  check(set && regionOf(set) === v.region, `${v.region}: story battle belongs to the region`, set && regionOf(set));
  check(Number.isInteger(v.set.before) && v.set.before > 0 && v.set.before < p.gyms.length, `${v.region}: story battle stands before a Gym past the first (${v.set.before})`);
  check(set && set.game.includes(p.game.split(" and ")[0]), `${v.region}: story battle is from the path's game (${set?.game} / ${p.game})`);
  check(!onPath.has(v.set.team), `${v.region}: story battle isn't a path step`);
  check(v.grunts.length >= 2, `${v.region}: at least two grunt teams`);
  for (const g of v.grunts) {
    const t = byId.get(g);
    check(t?.tier === "grunt", `${v.region}: ${g} is a grunt team`, t?.tier);
    check(t && regionOf(t) === v.region, `${v.region}: ${g} belongs to the region`);
    check(v.teams.some((x) => g.startsWith(x.person) && t?.person === x.person), `${v.region}: ${g} is one of the region's villain teams' people`, t?.person);
    check(t && t.team.length >= 2 && t.team.length <= 3, `${v.region}: ${g} brings 2 or 3`, t?.team.length);
    check(!!t?.place, `${v.region}: ${g} says where in the game it's from`);
    check(villainTeamOf(g)?.kind === "grunt" && villainTeamOf(g)?.region === v.region, `${v.region}: ${g} reads as a grunt`);
  }
  check(villainTeamOf(v.set.team)?.kind === "set" && villainTeamOf(v.set.team)?.name === v.teams[0].name, `${v.region}: story battle reads as the first team's`);
  // Due exactly when its Gym is next.
  check(setDue({ region: v.region, kind: "gym", index: v.set.before })?.team === v.set.team, `${v.region}: story battle due before Gym ${v.set.before}`);
  check(setDue({ region: v.region, kind: "gym", index: v.set.before - 1 }) === null, `${v.region}: not due a Gym earlier`);
  check(setDue({ region: v.region, kind: "league", index: v.set.before }) === null, `${v.region}: not due in the League`);
}
check(villainTeamOf("team-aqua-emerald-mt-pyre")?.name === "Team Aqua" && villainTeamOf("team-magma-emerald-hideout")?.name === "Team Magma", "Hoenn grunts name their own team");
check(villainTeamOf("brock-firered") === null, "a Gym team isn't a villain team");
// Region pages: villain teams in their own section, a boss with a story battle (Giovanni, Maxie) stays with the bosses.
const people = roadPeople(DUEL_DATA.trainers);
for (const v of ROAD_VILLAINS) {
  const secs = regionSections(people.get(v.region) ?? []);
  const villains = secs.find((x) => x.tier === "admin");
  check(!!villains, `${v.region}: a villain teams section`);
  for (const t of v.teams) check(villains?.people.some((p) => p.slug === t.person), `${v.region}: ${t.name} has a tile`);
  check(!villains?.people.some((p) => p.tiers.includes("boss")), `${v.region}: bosses stay out of the villain section`);
  check(secs.filter((x) => x.tier === "admin").length === 1 && !secs.some((x) => x.tier === "grunt"), `${v.region}: one villain section`);
}
// Grunts: seeded by player and badge (a replay can't roll again), about the lever's chance, only before a Gym.
const kantoNext = { region: "kanto", kind: "gym", index: 1 };
check(gruntAfter("u1", "badge:kanto:brock-firered", kantoNext, 25) === gruntAfter("u1", "badge:kanto:brock-firered", kantoNext, 25), "same player and badge, same roll");
let hits = 0;
const kinds = new Set<string>();
for (let i = 0; i < 4000; i++) {
  const g = gruntAfter(`user-${i}`, "badge:kanto:brock-firered", kantoNext, 25);
  if (g) { hits++; kinds.add(g); }
}
check(hits > 4000 * 0.21 && hits < 4000 * 0.29, `grunts about 1 in 4 (${hits} of 4000)`);
check(kinds.size === ROAD_VILLAINS[0].grunts.length, "every Kanto grunt team comes up");
check(gruntAfter("u1", "x", { region: "kanto", kind: "league", index: 0 }, 100) === null, "no grunt in the League");
check(gruntAfter("u1", "x", { region: "kanto", kind: "gym", index: 4 }, 100) === null, "no grunt where the story battle is due");
check(gruntAfter("u1", "x", kantoNext, 0) === null && !!gruntAfter("u1", "x", kantoNext, 100), "chance 0 never, 100 always");
check(gruntAfter("u1", "x", null, 100) === null, "no grunt once the road is done");
// Marks: a story battle won puts that region's first villain team on the card.
const marked = progressFrom([{ key: markKey("hoenn"), kind: "mark", region: "hoenn", team_id: "maxie-emerald", xp: 0, tokens: 0, at: "2026-10-24T00:00:00Z" }], {});
check(marked.marks.length === 1 && marked.marks[0] === "hoenn", "a mark lands on the progress");
check(markNames(marked)[0]?.name === "Team Magma", "Hoenn's mark is Team Magma's (Mt. Chimney)");
check(progressFrom([], {}).marks.length === 0, "no marks to start");
check(marked.xp === 0 && marked.badges === 0, "a mark carries no XP or badge of its own");

// Stars by mode (Britton, 2026-10-24): Easy wins earn two at most; the third needs Normal or Hard.
check(roadStars(true, 8, 9, "easy") === 2 && roadStars(true, 11, 9, "easy") === 2 && roadStars(true, 12, 9, "easy") === 1, "stars: Easy tops out at two");
check(roadStars(true, 9, 9, "normal") === 3 && roadStars(true, 9, 9, "hard") === 3 && roadStars(true, 9, 9) === 3 && roadStars(false, 5, 9, "easy") === 0, "stars: Normal and Hard reach three, a loss none");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
