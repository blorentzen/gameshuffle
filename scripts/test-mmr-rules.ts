/**
 * MMR card rules: divisions, tonight's run, streaks, squares, peaks, milestones,
 * the card's view, looks from untrusted input, and what's on the card (pieces,
 * presets, limits, Rank only, ready-made cards, old looks, the GS Pro split, top % and win %).
 *   npx tsx scripts/test-mmr-rules.ts
 */
import { medalSrc } from "../src/lib/mmr/medals";
import {
  DEMO_EVENTS, FALLBACK_RANKS, demoSource, formSquares, gameForSlug, milestoneTier, placeWord, seasonNumbers, setsPeak, signed,
  splitDivision, standing, stepsFrom, tonightRun, viewOf, winStreak, withEvent, timeOrderedIds, type MmrChange,
} from "../src/lib/mmr/rules";
import { DEFAULT_LOOK, cleanFontName, cleanLook, divisionLook, fontOf, fontStylesheet, freeLook, lookVars, proUsed } from "../src/lib/mmr/look";
import { flagUrl } from "../src/lib/lounge/flags";
import { cleanDraft, draftFor, isDraftPlan } from "../src/lib/mmr/draft";
import { COMPARE_GROUPS, cellFor } from "../src/data/plans-compare";
import {
  DEFAULT_INFO, FREE_PIECES, LAYOUT_SPOTS, PIECE_IDS, PRESETS, applyPreset, bigIsWorld, bigOf, cleanInfo, countryShort, detailSwitches, detailsFor, fitDetails,
  isDetail, nextText, pieceOrder, pieceText, presetOf, roomLeft, topPercent, topText, trimToRoom, underPieces, winPercent, type MmrInfo, type Shown,
} from "../src/lib/mmr/pieces";
import { STARTS, applyStart, startOf } from "../src/lib/mmr/starts";
import {
  DEFAULT_ROLLING, ROLL_PIECES, cleanRolling, freeRolling, jumpTarget, nextSlide, proRollingUsed, resumeAfter, rollRound, rollSlides, slideSecs, slideText,
  type MmrRolling,
} from "../src/lib/mmr/rolling";

let pass = 0, fail = 0;
const ok = (cond: unknown, label: string) => { if (cond) pass++; else { fail++; console.error("FAIL", label); } };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// Divisions
const mkw = stepsFrom({ Gold: 6000, Iron: 0, Platinum: 8000, Silver: 4000, Bronze: 2000 }, "mkworld12p");
eq(mkw.map((s) => s.name), ["Iron", "Bronze", "Silver", "Gold", "Platinum"], "steps sorted by start");
eq(stepsFrom(null, "mk8dx").length, Object.keys(FALLBACK_RANKS.mk8dx).length, "fallback steps used when none given");
const s1 = standing(7912, mkw);
eq([s1.division, s1.next?.name, s1.toNext], ["Gold", "Platinum", 88], "7,912 is Gold, 88 to Platinum");
ok(Math.abs(s1.pct - 0.956) < 0.001, "pct through Gold");
eq(standing(8000, mkw).division, "Platinum", "exactly on a start counts as the new division");
const top = standing(9999, mkw);
eq([top.division, top.next, top.toNext, top.pct], ["Platinum", null, null, 1], "top division has no next");
eq(standing(null, mkw).division, "Placement", "no number = placement");
eq(standing(5000, mkw, "Placement").division, "Placement", "the lounge's placement wins");
eq(splitDivision("Platinum 2"), { base: "Platinum", level: 2 }, "MK8DX level split");
eq(splitDivision("Grandmaster"), { base: "Grandmaster", level: null }, "no level");
const dx = stepsFrom(FALLBACK_RANKS.mk8dx, "mk8dx");
eq([standing(9500, dx).division, standing(9500, dx).next?.name], ["Platinum 2", "Sapphire 1"], "MK8DX numbered divisions");
eq(divisionLook("Platinum 2").kind, "gem", "Platinum is a gem");
eq(divisionLook("Grandmaster").laurel, true, "Grandmaster has the laurel");
eq(divisionLook("Placement").kind, "placement", "placement look");
eq(divisionLook("Ranked").kind, "placement", "an unknown division falls back");

// Events (newest first)
const ch = (id: number, mmr: number, delta: number, at: string, reason = "Table"): MmrChange => ({ id, mmr, delta, at, reason, place: null, score: null, tier: null });
const list = [
  ch(6, 8070, 44, "2026-10-20T05:00:00Z"),
  ch(5, 8026, 49, "2026-10-20T04:00:00Z"),
  ch(4, 7977, 58, "2026-10-20T03:00:00Z"),
  ch(3, 7919, -35, "2026-10-20T02:00:00Z"),
  ch(2, 7900, -20, "2026-10-20T01:30:00Z", "Penalty"),
  ch(1, 8000, 0, "2026-10-19T20:00:00Z", "Placement"),
];
eq(tonightRun(list, "2026-10-20T00:00:00Z"), { delta: 96, w: 3, l: 1, events: 4 }, "tonight counts penalties in the number, events in the record");
eq(tonightRun(list, "2026-10-20T03:30:00Z"), { delta: 93, w: 2, l: 0, events: 2 }, "tonight from a later start");
eq(tonightRun(list, null).events, 0, "no start = nothing tonight");
eq(winStreak(list), 3, "three wins in a row");
eq(winStreak(list.slice(3)), 0, "a loss on top = no streak");
eq(formSquares(list), ["l", "w", "p", "p"], "squares: loss, gain, gains to new peaks");
ok(setsPeak(list, 6) && setsPeak(list, 5) && !setsPeak(list, 4), "peaks: 8,070 and 8,026 set one, 7,977 didn't");
ok(!setsPeak(list, 3), "a loss never sets a peak");

// Milestones and words
eq([milestoneTier(1), milestoneTier(87), milestoneTier(250), milestoneTier(999), milestoneTier(1001), milestoneTier(null)], [10, 100, 250, 1000, null, null], "milestone tiers");
eq([placeWord(1), placeWord(2), placeWord(3), placeWord(11), placeWord(12), placeWord(22), placeWord(103)], ["1st", "2nd", "3rd", "11th", "12th", "22nd", "103rd"], "place words");
eq([signed(42), signed(-35), signed(0)], ["+42", "−35", "+0"], "signed numbers use a real minus");
eq([gameForSlug("mario-kart-world"), gameForSlug("mario-kart-world", "mkworld24p"), gameForSlug("mario-kart-8-deluxe"), gameForSlug("super-smash-bros-ultimate")], ["mkworld12p", "mkworld24p", "mk8dx", null], "game on stream");

// The view
let demo = demoSource();
const v0 = viewOf(demo);
eq([v0.mmr, v0.division, v0.toNext, v0.peak, v0.tonight.events], [7912, "Gold", 88, 8040, 0], "demo starts at 7,912 Gold, peak 8,040, nothing tonight");
for (const ev of DEMO_EVENTS) demo = withEvent(demo, ev);
const v5 = viewOf(demo);
eq([v5.mmr, v5.division, v5.tonight.w, v5.tonight.l, v5.streak], [8070, "Platinum", 4, 1, 3], "after the demo night: Platinum, 4-1, three in a row");
ok(v5.last?.peak === true && v5.peak === 8070, "the last event set a new peak");
const mid = viewOf(demo, demo.changes[2].id);
eq([mid.mmr, mid.division, mid.last?.delta], [7977, "Gold", 58], "a view partway through the night");
eq(viewOf(demo, demo.changes[1].id).division, "Platinum", "8,026 crossed into Platinum");

// Looks
const bad = cleanLook({ layout: "banner", colors: "rainbow", font: "comic", custom: ["red", "#00ff00"], picture: "javascript:alert(1)", show: { world: false }, game: "mk64", id: "BAD ID" });
eq([bad.layout, bad.colors, bad.font, bad.custom, bad.picture, bad.info.on.world, bad.info.on.peak, bad.game, bad.id], ["deck", "gs", "rubik", DEFAULT_LOOK.custom, null, false, true, "mkworld12p", "main"], "junk input falls back");
const pro = cleanLook({ colors: "neon", fill: "dots", emblem: "picture", font: "bebas", border: "two", foil: true, brand: "off" });
eq(proUsed(pro).length, 7, "seven GS Pro choices counted");
const fl = freeLook(pro);
eq([fl.colors, fl.fill, fl.emblem, fl.font, fl.border, fl.foil, fl.brand], ["gs", "gradient", "tile", "rubik", "one", false, "inside"], "a free card keeps its look minus GS Pro");

// Feedback round (2026-10-29)
eq(cleanLook({ font: "gs" }).font, "rubik", "the old default font moves to Rubik");
eq(cleanLook({ font: "gabarito" }).font, "gabarito", "GameShuffle's font stays a choice");
eq(freeLook(cleanLook({ font: "gabarito" })).font, "gabarito", "GameShuffle's font is free");
eq(freeLook(cleanLook({ font: "kanit" })).font, "rubik", "a paid font falls back to the default");
eq(freeLook(cleanLook({ font: "google", fontName: "Orbitron", fontWeight: 900 })).font, "rubik", "any Google Font is paid");
ok(proUsed(cleanLook({ font: "google", fontName: "Orbitron" })).includes("Any Google Font"), "Any Google Font counted as paid");
eq(DEFAULT_LOOK.font, "rubik", "new looks start on Rubik");
eq(cleanLook({}).country, "code", "a saved look without the setting keeps the code");
eq(DEFAULT_LOOK.country, "flag", "new looks start on the flag");
eq(cleanLook({ country: "both" }).country, "both", "flag and code kept");
eq(cleanLook({ accent: "#12AB34" }).accent, "#12ab34", "any color for Your color");
eq(cleanLook({ accent: "url(x)" }).accent, DEFAULT_LOOK.accent, "a bad color falls back");
eq(lookVars(cleanLook({ colors: "accent", accent: "#12ab34" }), divisionLook("Gold"))["--mmr-hl"], "#12ab34", "a picked color is the accent");
eq(cleanLook({ edge: "custom", edgeColor: "nope" }).edgeColor, DEFAULT_LOOK.edgeColor, "a bad border color falls back");
eq(lookVars(cleanLook({ border: "one", edge: "white" }), divisionLook("Gold"))["--mmr-edge"], "#ffffff", "a white border");
eq(lookVars(cleanLook({ border: "one", edge: "division" }), divisionLook("Gold"))["--mmr-edge"], divisionLook("Gold").c, "a border in the division's color");
eq(lookVars(cleanLook({ colors: "accent", accent: "#12ab34", border: "one" }), divisionLook("Gold"))["--mmr-edge"], "#12ab34", "the border matches the accent by default");
const keptFree = freeLook(cleanLook({ country: "both", edge: "custom", edgeColor: "#ff0000", align: "center" }));
eq([keptFree.country, keptFree.edge, keptFree.edgeColor, keptFree.align], ["both", "custom", "#ff0000", "center"], "country, border color and line up are free");
eq(cleanLook({ align: "middle" }).align, "left", "line up falls back to left");
eq(cleanFontName("Exo 2<script>"), "Exo 2script", "font names keep letters, digits and spaces");
eq(fontStylesheet(DEFAULT_LOOK), null, "the default font is self-hosted");
eq(fontStylesheet(cleanLook({ font: "gabarito" })), null, "GameShuffle's font is self-hosted");
ok(fontStylesheet(cleanLook({ font: "kanit" }))?.includes("family=Kanit:ital,wght@1,900"), "a listed font's stylesheet");
eq(fontStylesheet(cleanLook({ font: "google", fontName: "Exo 2", fontWeight: 700 })), "https://fonts.googleapis.com/css2?family=Exo+2:wght@700&display=swap", "any Google Font's stylesheet");
eq(fontStylesheet(cleanLook({ font: "google", fontName: "" })), null, "no stylesheet before a name");
eq(fontOf(cleanLook({ font: "google", fontName: "" }))[2], "italic", "a nameless Google Font draws the default");
eq(lookVars(DEFAULT_LOOK, divisionLook("Gold"))["--mmr-fs"], "italic", "Rubik is italic");
eq(flagUrl("US"), "/images/flags/us.svg", "a flag by code");
eq(flagUrl("uk"), "/images/flags/gb.svg", "UK means the British flag");
eq(flagUrl("ZZ"), null, "no flag for an unknown code");
eq(proUsed(fl), [], "nothing GS Pro left after freeLook");
eq(proUsed(DEFAULT_LOOK), [], "the default look is free");
const vars = lookVars(cleanLook({ fill: "picture", picture: "https://gs-ugc.empac.co/mmr/x.gif" }), divisionLook("Gold"));
ok(vars["--mmr-picture"]?.includes("gs-ugc.empac.co"), "picture background var");
ok(lookVars(DEFAULT_LOOK, divisionLook("Gold"))["--mmr-dc"] === "#fcc46b", "division color var (the gold medal's light tone)");
// Medals (2026-10-30): the old tile, crest and coin frames all read as the medal.
eq(cleanLook({ emblem: "crest" }).emblem, "tile", "a crest card reads as the medal");
eq(cleanLook({ emblem: "coin" }).emblem, "tile", "a coin card reads as the medal");
eq(cleanLook({ emblem: "name" }).emblem, "name", "name only stays");
eq(medalSrc("Grandmaster"), "/images/comp-mario-kart/levels/grandmaster.png", "Grandmaster has its own crown (crimson)");
eq(medalSrc("Master"), "/images/comp-mario-kart/levels/master.png", "Master's crown (ice)");
eq(medalSrc("Silver"), "/images/comp-mario-kart/levels/silver.png", "the silver medal");
eq(medalSrc("Placement"), null, "Placement has no medal");


// ── What's on the card ────────────────────────────────────────────────────
const onIds = (info: MmrInfo) => PIECE_IDS.filter((id) => info.on[id]);

// Presets
eq(presetOf(DEFAULT_INFO), "standard", "a new look starts on Standard");
ok(DEFAULT_INFO.on.streak && DEFAULT_INFO.on.goal && !DEFAULT_INFO.on.line, "Standard adds the win streak; the goal shows once set; no line");
for (const p of PRESETS) eq(presetOf(applyPreset(DEFAULT_INFO, p.id)), p.id, `picking ${p.label} selects it`);
eq(onIds(applyPreset(DEFAULT_INFO, "number")), ["name", "mmr", "goal"], "Just the number: the name and MMR (and the goal piece, which keeps its own switch)");
eq(onIds(applyPreset(DEFAULT_INFO, "division")), ["name", "division", "mmr", "progress", "delta", "goal"], "Number and division");
ok(FREE_PIECES.every((id) => applyPreset(DEFAULT_INFO, "everything").on[id]), "Everything turns on every free piece");
const goalOff: MmrInfo = { ...DEFAULT_INFO, on: { ...DEFAULT_INFO.on, goal: false } };
eq(applyPreset(goalOff, "everything").on.goal, false, "Everything leaves the goal off unless it was chosen");
const withLine: MmrInfo = { ...DEFAULT_INFO, on: { ...DEFAULT_INFO.on, line: true }, line: "Road to Master" };
ok(applyPreset(withLine, "number").on.line && presetOf(applyPreset(withLine, "number")) === "number", "presets keep your own line and still match");
eq(presetOf({ ...DEFAULT_INFO, on: { ...DEFAULT_INFO.on, peak: false } }), null, "touching a switch after a preset is your own mix");

// Old looks keep exactly what their layout showed
const oldDeck = cleanLook({ layout: "deck", show: { progress: true, world: true, tonight: false, last10: true, peak: true } });
eq(onIds(oldDeck.info), ["name", "cc", "game", "mmr", "world", "peak", "progress", "delta", "goal", "last10"], "old deck: no division name, no streak, tonight off as saved");
const oldPanel = cleanLook({ layout: "panel", show: { progress: true, world: true, tonight: true, last10: true, peak: true } });
eq(onIds(oldPanel.info), ["name", "game", "division", "mmr", "world", "peak", "progress", "delta", "tonight", "goal", "last10"], "old panel: no flag, as before");
const oldStrip = cleanLook({ layout: "strip", show: { progress: true, world: true, tonight: true, last10: false, peak: true } });
eq(onIds(oldStrip.info), ["name", "division", "mmr", "progress", "delta", "goal"], "old strip: world, tonight and peak never showed there");
const oldSticker = cleanLook({ layout: "sticker", show: { progress: true, world: true, tonight: true, last10: true, peak: true } });
eq(onIds(oldSticker.info), ["name", "division", "mmr", "delta", "goal"], "old sticker: name, division, change, goal");
ok(Object.values(oldDeck.info.moments).every(Boolean) && oldDeck.info.big === "mmr" && oldDeck.info.order === null, "old looks keep every moment and MMR as the big number");
eq(cleanLook(JSON.parse(JSON.stringify(oldStrip))).info, oldStrip.info, "a saved look round-trips (info replaces show)");
eq(presetOf(cleanLook({ id: "main", name: "My card", game: "mkworld12p" }).info), "standard", "a look with neither show nor info is new: Standard");

// Cleaning pieces
const ci = cleanInfo({ on: { world: false, bogus: true }, big: "world", recent: 5, order: ["peak", "nope", "world", "peak"], line: "  Road\n to <b>Master</b>  and then some more words here  ", moments: { pop: false } }, null, "deck");
eq([ci.on.world, ci.on.name, ci.big, ci.recent, ci.moments.pop, ci.moments.roll], [false, true, "world", 5, false, true], "pieces from untrusted input");
eq(ci.order?.slice(0, 3), ["peak", "world", "name"], "order: junk dropped, duplicates once, the rest in list order");
ok(ci.line.length <= 40 && !/[<>\n]/.test(ci.line) && ci.line.startsWith("Road to bMaster/b"), "line: no markup, one line, 40 characters");
eq(cleanInfo({ order: PIECE_IDS }, null, "deck").order, null, "an order that matches the list is no order");
eq(cleanInfo({ recent: 4, big: "rank" }, null, "deck").recent, 3, "recent is 3 or 5");

// Limits (studio round 2): the first details that fit show; nothing takes turns
eq(fitDetails(["a", "b"], 3), ["a", "b"], "fits");
eq(fitDetails(["a", "b", "c", "d", "e"], 3), ["a", "b", "c"], "five on a card of three: the first three");
eq(fitDetails(["a", "b"], 0), [], "no room");
eq([LAYOUT_SPOTS.deck.slots, LAYOUT_SPOTS.panel.slots, LAYOUT_SPOTS.strip.slots, LAYOUT_SPOTS.sticker.slots], [3, 4, 1, 1], "room per layout: deck 3, panel 4, strip 1, sticker 1");

let night = demoSource();
const n0 = viewOf(night);
for (const ev of DEMO_EVENTS) night = withEvent(night, ev);
const n5 = viewOf(night);
const hasIn = (v: typeof n0, info: MmrInfo) => (p: Shown) => pieceText(p, v, info, null) != null;
eq(detailsFor("deck", DEFAULT_INFO, hasIn(n0, DEFAULT_INFO)), ["peak", "tonight"], "Standard deck before the night: peak and tonight (no streak yet, no goal set)");
eq(detailsFor("deck", DEFAULT_INFO, hasIn(n5, DEFAULT_INFO)), ["peak", "tonight", "streak"], "Standard deck after three wins: the streak joins, still three");
const every = applyPreset(DEFAULT_INFO, "everything");
eq(detailsFor("deck", every, hasIn(n5, every)), ["country", "top", "peak", "tonight", "streak", "events", "avg"], "Everything on the deck, in list order");
eq(fitDetails(detailsFor("deck", every, hasIn(n5, every)), 3), ["country", "top", "peak"], "a deck saved with everything on shows its first three");
eq(detailsFor("panel", every, hasIn(n5, every)), ["country", "top", "peak", "progress", "tonight", "last10", "events", "avg"], "Everything on the panel: tiles");
eq(detailsFor("strip", every, hasIn(n5, every)), ["game", "world", "country", "top", "peak", "tonight", "streak", "recent", "events", "avg"], "Everything on the strip: one slot");
const own: MmrInfo = { ...every, order: pieceOrder({ order: ["avg", "events"] }) };
eq(detailsFor("deck", own, hasIn(n5, own)).slice(0, 3), ["avg", "events", "country"], "GS Pro's own order fills the slots first");
const worldBig: MmrInfo = { ...DEFAULT_INFO, big: "world", on: { ...DEFAULT_INFO.on, world: false } };
ok(bigIsWorld(worldBig, n0) && !bigIsWorld(worldBig, { worldRank: null }), "world rank is the big number only while there is one");
eq(detailsFor("sticker", worldBig, hasIn(n0, worldBig), "world"), ["game", "mmr", "peak", "progress", "tonight", "last10"], "world rank big on the sticker: MMR takes world rank's place in the details");
eq(detailsFor("deck", worldBig, hasIn(n0, worldBig), "world"), ["peak", "tonight"], "world rank big on the deck: MMR goes to world rank's own spot, not the chips");
eq(pieceText("mmr", n0, worldBig)?.chip, "7,912 MMR", "MMR as a detail");

// Each piece as a short value
eq(pieceText("country", n0, DEFAULT_INFO)?.chip, "#118 in the US", "country rank");
eq(pieceText("top", n0, DEFAULT_INFO)?.chip, "Top 21%", "top % from world rank and the season's players");
eq(pieceText("streak", n0, DEFAULT_INFO), null, "no streak chip under two wins");
eq(pieceText("streak", n5, DEFAULT_INFO)?.chip, "3 wins in a row", "streak chip");
eq(pieceText("events", n0, DEFAULT_INFO)?.chip, "34 events · 59% won", "events and win %");
ok(/^Avg score \d+\.\d$/.test(pieceText("avg", n0, DEFAULT_INFO)?.chip ?? ""), "average score to one decimal");
eq(pieceText("recent", n5, DEFAULT_INFO)?.chip, "3rd · 1st · 2nd", "recent: the latest three places");
eq(pieceText("recent", n5, { ...DEFAULT_INFO, recent: 5 })?.value, "3rd, 1st, 2nd, 9th, 1st", "recent: five when picked");
eq(pieceText("line", n0, withLine)?.chip, "Road to Master", "your own line");
eq(pieceText("line", n0, DEFAULT_INFO), null, "no line, no piece");
eq(pieceText("world", { ...n0, worldRank: null }, DEFAULT_INFO), null, "no world rank, nothing to show");
eq(pieceText("country", { ...n0, countryRank: null }, DEFAULT_INFO), null, "no country rank read, nothing to show");
eq([n0.season.events, n0.recent.length, n0.countryRank, n0.totalPlayers], [34, 5, 118, 6000], "the demo night has every new number");
eq(n5.season.events, 39, "a moment counts its event");

// Top % and win %
eq([topText(538, 6000), topText(3, 5988), topText(1240, 6000), topText(6000, 6000)], ["Top 9%", "Top 0.1%", "Top 21%", "Top 100%"], "top % rounds up, never better than true");
eq([topText(null, 6000), topText(10, null), topText(7000, 6000), topText(0, 6000)], [null, null, null, null], "top % needs a rank inside the season's players");
ok(Math.abs((topPercent(538, 6000) ?? 0) - 8.9667) < 0.001, "top percent as a number");
eq([winPercent(198, 147), winPercent(54, 27), winPercent(3, 2), winPercent(0, 0)], [74, 50, 67, null], "win % rounds to a whole percent");
const sn = seasonNumbers([ch(3, 10, 5, "2026-10-20T03:00:00Z"), ch(2, 5, -5, "2026-10-20T02:00:00Z"), ch(1, 10, 0, "2026-10-20T01:00:00Z", "Placement")].map((c, i) => ({ ...c, score: [90, 70, null][i] })));
eq(sn, { events: 2, wins: 1, avgScore: 80 }, "season numbers count events only");
eq([countryShort("US"), countryShort("FR"), countryShort("gb"), countryShort("BA")], ["the US", "France", "the UK", "BA"], "country short names (a long name falls back to the code)");

// The GS Pro split: your own order and a line of your own
const proInfo: MmrInfo = { ...withLine, order: pieceOrder({ order: ["avg"] }) };
const proLook = cleanLook({ ...DEFAULT_LOOK, info: proInfo });
eq(proUsed(proLook), ["Your own order", "A line of your own"], "own order and own line are GS Pro");
const freed = freeLook(proLook);
eq([freed.info.order, freed.info.on.line, freed.info.line], [null, false, "Road to Master"], "a free card uses list order and no line, and keeps the text");
eq(proUsed(freed), [], "nothing GS Pro left after freeLook");
eq(proUsed(cleanLook({ ...DEFAULT_LOOK, info: { ...DEFAULT_INFO, on: { ...DEFAULT_INFO.on, line: true }, line: "" } })), [], "an empty line isn't a GS Pro choice");
eq(proUsed(cleanLook({ ...DEFAULT_LOOK, info: { ...DEFAULT_INFO, order: PIECE_IDS } })), [], "the usual order isn't a GS Pro choice");

// ── Fixes: no text cut to a stub, no number said twice ────────────────────
const topView = { ...n5, next: null, toNext: null, division: "Grandmaster", pct: 1 };
eq(pieceText("progress", topView, DEFAULT_INFO), { label: "Division", value: "Top division", chip: "Top division", short: "Top division" }, "top division: the tile says so instead of repeating the MMR");
eq(pieceText("progress", { ...topView, division: "Placement" }, DEFAULT_INFO)?.value, "In placement", "placement: says so");
eq(pieceText("progress", n0, DEFAULT_INFO)?.value, "88", "with a next division the tile still shows how far");
// Every piece's short value (the strip's narrow slot) stays short enough to show whole.
const longView = { ...n5, mmr: 15672, worldRank: 12345, countryRank: 1234, country: "NL", season: { events: 1234, wins: 999, avgScore: 111.36 }, streak: 12, tonight: { delta: -1240, w: 12, l: 13, events: 25 }, peak: 15792, next: { name: "Grandmaster", at: 16000 }, toNext: 999, division: "Master" };
const worst: MmrInfo = { ...applyPreset(DEFAULT_INFO, "everything"), recent: 5 };
for (const p of PIECE_IDS) {
  if (p === "line") continue;
  const t = pieceText(p, longView, worst, { goal: 15500, toGo: 0, reached: true, pct: 1 });
  if (t) ok(t.short.length <= 20, `short ${p} fits the strip's slot: "${t.short}" (${t.short.length})`);
}
eq(pieceText("game", n0, DEFAULT_INFO)?.short, "MKW 12P", "the game at its shortest");
eq(pieceText("recent", n5, { ...DEFAULT_INFO, recent: 5 })?.short, "3rd · 1st · 2nd", "recent at its shortest: three places");
eq(pieceText("country", longView, DEFAULT_INFO)?.short, "#1,234 in NL", "a long country name uses its code when short");
eq(pieceText("events", n0, DEFAULT_INFO)?.short, "34 · 59% won", "events at its shortest");
eq(detailsFor("strip", every, hasIn(n5, every), "mmr", ["progress"]).includes("progress"), true, "the strip's progress joins the details when it doesn't fit");
eq(detailsFor("strip", every, hasIn(n5, every)).includes("progress"), false, "and keeps its own spot when it does");

// ── Rolling ──────────────────────────────────────────────────────────────
const rc = cleanRolling({ shape: "tall", pin: false, motion: "deal", secs: 8, progress: "line", perSlide: { world: 4, peak: 8, bogus: 6, recent: 5, id: 12 } });
eq([rc.shape, rc.pin, rc.motion, rc.secs, rc.progress], ["tall", false, "deal", 8, "line"], "rolling settings clean");
eq(rc.perSlide, { world: 4, id: 12 }, "per-slide times: unknown slides and odd times dropped, a time that matches the usual is no time of its own");
eq(cleanRolling(null), DEFAULT_ROLLING, "nothing saved: the defaults");
eq([DEFAULT_ROLLING.shape, DEFAULT_ROLLING.motion, DEFAULT_ROLLING.secs, DEFAULT_ROLLING.pin, DEFAULT_ROLLING.progress], ["bar", "up", 6, true, "dots"], "a new rolling look: bar, slide up, 6 seconds, name pinned, dots");
eq(cleanRolling({ shape: "circle", motion: "spin", secs: 7, progress: "bar" }), DEFAULT_ROLLING, "junk falls back");
eq(cleanRolling({ perSlide: { world: 6 } }).perSlide, null, "per-slide time equal to the usual time is dropped");
eq(proRollingUsed(rc), ["A time per slide"], "a time per slide is GS Pro");
eq(freeRolling(rc).perSlide, null, "a free card uses one time for every slide");
eq(proRollingUsed(freeRolling(rc)), [], "nothing GS Pro left");
const rlook = cleanLook({ ...DEFAULT_LOOK, layout: "rolling", rolling: rc });
eq([rlook.layout, rlook.rolling.shape], ["rolling", "tall"], "a rolling look round-trips through cleanLook");
ok(proUsed(rlook).includes("A time per slide") && freeLook(rlook).rolling.perSlide === null, "freeLook drops per-slide times");
eq(cleanLook({ ...DEFAULT_LOOK, layout: "deck" }).rolling, DEFAULT_ROLLING, "every look carries rolling settings with safe defaults");

const hasRoll = (v: typeof n0, info: MmrInfo) => (p: Parameters<typeof slideText>[0]) => slideText(p, v, info, null) != null;
eq(rollSlides(DEFAULT_INFO, DEFAULT_ROLLING, hasRoll(n0, DEFAULT_INFO)), ["mmr", "world", "peak", "progress", "tonight", "last10"], "Standard slides before the night (no streak yet), name pinned");
eq(rollSlides(DEFAULT_INFO, { pin: false }, hasRoll(n5, DEFAULT_INFO)), ["id", "mmr", "world", "peak", "progress", "tonight", "streak", "last10"], "rolling the name: it's the first slide; the streak joins after three wins");
eq(rollSlides(DEFAULT_INFO, { pin: false }, hasRoll(n0, DEFAULT_INFO), false)[0], "mmr", "no name, emblem or division to show: no id slide");
const rollOwn: MmrInfo = { ...withLine, order: pieceOrder({ order: ["peak", "line", "mmr"] }) };
eq(rollSlides(rollOwn, DEFAULT_ROLLING, hasRoll(n0, rollOwn)).slice(0, 3), ["peak", "line", "mmr"], "GS Pro's own order and own line are slides too");
eq(rollSlides({ ...DEFAULT_INFO, on: Object.fromEntries(PIECE_IDS.map((p) => [p, false])) as MmrInfo["on"] }, DEFAULT_ROLLING, () => true), ["mmr"], "everything off: the MMR slide stands in");
ok(!rollSlides(applyPreset(DEFAULT_INFO, "everything"), DEFAULT_ROLLING, () => true).some((s) => ["name", "cc", "game", "division", "delta"].includes(s)), "name, flag, game, division and the last change are never slides of their own");
ok(ROLL_PIECES.every((p) => PIECE_IDS.includes(p)), "every rolling slide is a piece");
const rr: MmrRolling = { ...DEFAULT_ROLLING, secs: 6, perSlide: { world: 12, peak: 4 } };
eq([slideSecs(rr, "mmr"), slideSecs(rr, "world"), slideSecs(rr, "peak")], [6, 12, 4], "each slide's time");
eq(rollRound(rr, ["mmr", "world", "peak"]), 22, "one turn through the slides");
const sl = ["world", "peak", "mmr", "tonight"] as const;
eq([nextSlide([...sl], 3), nextSlide([...sl], 1), nextSlide([], 0)], [0, 2, 0], "the next slide wraps round");
eq(jumpTarget([...sl]), 2, "a change jumps to the MMR slide");
eq(jumpTarget(["world", "peak"]), -1, "no MMR slide: a temporary one");
eq(resumeAfter([...sl], 0), 0, "after the change, back to the slide it left");
eq(resumeAfter([...sl], 2), 3, "already on the MMR slide: carry on to the next");
eq(resumeAfter([...sl], 9), 3, "a slide that's gone: the last one, carrying on");
eq(resumeAfter(["mmr"], 0), 0, "only the MMR slide: stays");
eq(slideText("world", n0, DEFAULT_INFO, null)?.sub, "Top 21% of the lounge", "world slide adds Top % when Top % isn't its own slide");
eq(slideText("world", n0, applyPreset(DEFAULT_INFO, "everything"), null)?.sub, null, "and leaves it to Top %'s slide when that's on");
eq(slideText("progress", topView, DEFAULT_INFO, null), { label: "Division", value: "Top division", sub: null }, "top division slide doesn't repeat the number");
eq(slideText("country", n0, DEFAULT_INFO, null), { label: "Country rank", value: "#118", sub: "in United States" }, "country slide");
ok(/^Set on [A-Z][a-z]{2} \d{1,2}$/.test(slideText("peak", n5, DEFAULT_INFO, null)?.sub ?? ""), "peak slide says when it was set");
eq(slideText("tonight", n0, DEFAULT_INFO, null)?.sub, "No events yet", "tonight before any event");
eq(slideText("tonight", n5, DEFAULT_INFO, null)?.sub, "4 wins, 1 loss", "tonight after the night");

// Feedback round: MMR beside world rank, under the number, the chat line
{
  const v = viewOf(night);
  const has = (p: Shown) => pieceText(p, v, DEFAULT_INFO, null) != null;
  const worldNoMmr: MmrInfo = { ...DEFAULT_INFO, big: "world", on: { ...DEFAULT_INFO.on, mmr: false } };
  ok(!detailsFor("strip", worldNoMmr, has, "world").includes("mmr"), "world rank big with MMR off: no MMR detail");
  ok(detailsFor("strip", { ...worldNoMmr, on: { ...worldNoMmr.on, mmr: true } }, has, "world").includes("mmr"), "world rank big with MMR on: MMR is a detail");
  const both: MmrInfo = { ...DEFAULT_INFO, under: "both", on: { ...DEFAULT_INFO.on, tonight: true, last10: true } };
  eq(underPieces(both, "strip"), ["tonight", "last10"], "both under the number on the strip");
  eq(underPieces(both, "deck"), [], "the deck has no line under the number");
  eq(underPieces({ ...both, on: { ...both.on, mmr: false } }, "rolling"), [], "Rolling with the MMR slide off keeps its slides");
  eq(underPieces({ ...both, on: { ...both.on, tonight: false } }, "sticker"), ["last10"], "a piece switched off stays off");
  ok(!detailsFor("sticker", both, has).includes("tonight"), "tonight under the number leaves the details");
  ok(!rollSlides(both, DEFAULT_ROLLING, () => true).includes("tonight"), "tonight under the MMR leaves its slide");
  ok(rollSlides({ ...both, under: "none" }, DEFAULT_ROLLING, () => true).includes("tonight"), "tonight keeps its slide otherwise");
  eq([cleanInfo({}, null, "deck").under, cleanInfo({}, null, "deck").chat], ["none", true], "under and the chat line default");
  eq([cleanInfo({ under: "both", chat: false }, null, "strip").under, cleanInfo({ under: "both", chat: false }, null, "strip").chat], ["both", false], "under and the chat line kept");
  eq(cleanInfo({ under: "everything" }, null, "strip").under, "none", "a bad under falls back");
}

// Try before paying: the draft kept in the browser, and What's included
{
  const now = Date.UTC(2026, 9, 29, 20);
  const d = cleanDraft({ v: 1, owner: null, savedAt: now - 1000, loungeName: "  Kevo ", looks: [{ id: "main", font: "kanit" }, { id: "BAD ID" }], activeLook: "nope", picture: true }, now);
  eq([d?.loungeName, d?.looks.length, d?.looks[0].font, d?.looks[1].id, d?.activeLook, d?.picture, d?.owner], ["Kevo", 2, "kanit", "look-2", "main", true, null], "a draft cleaned");
  eq(cleanDraft({ v: 1, savedAt: now - 8 * 86_400_000, looks: [{}] }, now), null, "a draft older than a week is gone");
  eq(cleanDraft({ v: 1, savedAt: now, looks: [] }, now), null, "a draft with no looks is nothing");
  eq(cleanDraft({ v: 2, savedAt: now, looks: [{}] }, now), null, "an unknown draft version is ignored");
  eq(cleanDraft("junk", now), null, "junk is no draft");
  ok(cleanDraft({ v: 1, savedAt: now, looks: [{ picture: "blob:http://x/1" }] }, now)?.looks[0].picture === null, "a draft never keeps a device picture's address");
  const mine = cleanDraft({ v: 1, owner: "u1", savedAt: now, looks: [{}] }, now);
  eq([draftFor(d, "u1") === d, draftFor(mine, "u1") === mine, draftFor(mine, "u2"), draftFor(mine, null)], [true, true, null, null], "a visitor's draft counts for anyone, an account's only for it");
  eq([isDraftPlan("pro"), isDraftPlan("backer"), isDraftPlan("champion")], [true, true, false], "the panel's plans");
  const rows = COMPARE_GROUPS.flatMap((g) => g.rows);
  const skins = rows.find((r) => r.label.startsWith("Profile and community skins"))!;
  eq([cellFor(skins, "supporter", false), cellFor(skins, "supporter", true), cellFor(skins, "pro", false)], [false, true, true], "the Supporter column follows the switch");
  ok(rows.every((r) => cellFor(r, "supporter", false) !== undefined && cellFor(r, "backer", true) !== undefined), "every row has a cell for every plan");
  ok(rows.filter((r) => r.label.includes("Twitch")).every((r) => cellFor(r, "supporter", true) === false), "Supporter never includes the Twitch tools");
}

// Studio round 2: limits, Rank only (the division as the big number, MMR kept off), ready-made cards
{
  const v = viewOf(night);
  // Limits by switch, whatever the numbers are right now.
  eq(detailSwitches("deck", DEFAULT_INFO), ["peak", "tonight", "streak"], "Standard on the deck: three detail switches (goal has its own spot there now)");
  eq(roomLeft("deck", DEFAULT_INFO), 0, "and the deck is full");
  eq(roomLeft("rolling", DEFAULT_INFO), Infinity, "Rolling has no limit");
  ok(isDetail("deck", DEFAULT_INFO, "country") && !isDetail("deck", DEFAULT_INFO, "world") && !isDetail("deck", DEFAULT_INFO, "goal"), "country counts on the deck; world rank and the goal have spots of their own");
  ok(isDetail("sticker", DEFAULT_INFO, "goal"), "the goal is a detail on the sticker");
  eq(detailSwitches("panel", DEFAULT_INFO), ["peak", "progress", "tonight", "last10"], "Standard on the panel: four tiles, exactly full");
  const big = trimToRoom(applyPreset(DEFAULT_INFO, "everything"), "panel");
  eq([detailSwitches("panel", big.info), big.off], [["country", "top", "peak", "progress"], ["tonight", "last10", "events", "avg"]], "Everything trimmed for the panel: the first four stay, the rest switch off");
  eq(trimToRoom(DEFAULT_INFO, "rolling").off, [], "nothing is trimmed for Rolling");
  const toSticker = trimToRoom(DEFAULT_INFO, "sticker");
  eq([detailSwitches("sticker", toSticker.info), toSticker.off], [["game"], ["world", "peak", "progress", "tonight", "streak", "goal", "last10"]], "Standard to the sticker: the first detail stays");
  ok(toSticker.info.on.name && toSticker.info.on.mmr && toSticker.info.on.division, "pieces with a spot of their own stay on");
  // The big number.
  const div: MmrInfo = { ...DEFAULT_INFO, big: "division" };
  eq([bigOf(div, v), bigOf({ ...DEFAULT_INFO, big: "world" }, { worldRank: null }), bigOf({ ...DEFAULT_INFO, big: "world", hideMmr: true }, { worldRank: null }), bigOf({ ...DEFAULT_INFO, hideMmr: true }, v)],
    ["division", "mmr", "division", "division"], "the big number: division; world rank falls back to MMR, or to the division with MMR kept off; MMR kept off can't be the number");
  ok(detailsFor("sticker", { ...div, on: { ...div.on, game: false } }, hasIn(v, div), "division").includes("mmr"), "division as the number: MMR becomes a detail");
  ok(!detailsFor("deck", div, hasIn(v, div), "division").includes("world"), "and world rank keeps its own spot on the deck");
  eq(cleanInfo({ big: "division", hideMmr: true }, null, "deck").big, "division", "a division big number is kept");
  eq([cleanInfo({ hideMmr: true }, null, "deck").hideMmr, cleanInfo({ hideMmr: "yes" }, null, "deck").hideMmr], [true, false], "hideMmr is true or false");
  // MMR kept off the card.
  const off: MmrInfo = { ...div, hideMmr: true };
  eq([pieceText("mmr", v, off), pieceText("peak", v, off), pieceText("goal", v, off, { goal: 9000, toGo: 100, pct: 0.5, reached: false } as never)], [null, null, null], "no MMR, peak or goal");
  eq(pieceText("delta", v, off)?.chip, placeWord(v.last!.place!), "the change is the place only");
  eq(pieceText("tonight", v, off)?.chip, `Tonight ${v.tonight.w}-${v.tonight.l}`, "tonight is the record");
  eq(pieceText("progress", n0, off)?.chip, "Next: Platinum", "progress names the next division");
  eq(nextText(n0, off), "Next: Platinum", "and so does the bar");
  ok(!(pieceText("recent", v, off)?.chip ?? "").match(/[+−-]\d/), "recent events without changes");
  ok(!detailsFor("sticker", off, hasIn(v, off), "division").includes("mmr"), "no MMR detail with MMR kept off");
  ok(!detailSwitches("deck", { ...off, on: { ...off.on, peak: true } }).includes("peak"), "season peak doesn't count toward the limit while it's kept off");
  eq(slideText("mmr", v, off, null), null, "no MMR slide on Rolling");
  ok(!rollSlides(off, DEFAULT_ROLLING, (p) => slideText(p, v, off, null) != null).includes("mmr"), "Rolling leaves the MMR slide out");
  eq(rollSlides({ ...off, on: Object.fromEntries(PIECE_IDS.map((p) => [p, false])) as MmrInfo["on"] }, DEFAULT_ROLLING, () => false), ["id"], "an empty Rolling card with MMR kept off shows the name");
  eq(slideText("tonight", v, off, null)?.value, `${v.tonight.w}-${v.tonight.l}`, "tonight's slide is the record");
  // Ready-made cards.
  eq(STARTS.map((s) => s.layout), ["deck", "sticker", "sticker", "panel", "strip", "rolling"], "six ready-made cards");
  for (const s of STARTS) {
    const l = applyStart(DEFAULT_LOOK, s.id);
    eq(startOf(l), s.id, `${s.label} is selected after picking it`);
    ok(detailSwitches(l.layout, l.info).length <= (l.layout === "rolling" ? 99 : LAYOUT_SPOTS[l.layout].slots), `${s.label} fits its layout`);
    eq([l.colors, l.font, l.emblem], [DEFAULT_LOOK.colors, DEFAULT_LOOK.font, DEFAULT_LOOK.emblem], `${s.label} keeps colors, font and emblem`);
  }
  eq(startOf(DEFAULT_LOOK), "usual", "a new look is The usual");
  const rank = applyStart(DEFAULT_LOOK, "rank");
  eq([rank.layout, rank.info.big, rank.info.hideMmr], ["sticker", "division", true], "Rank only: the sticker, the division as the number, MMR kept off");
  eq(applyStart(DEFAULT_LOOK, "rolling").rolling.shape, "bar", "Everything, in turn is the rolling bar");
  eq(startOf({ ...DEFAULT_LOOK, info: { ...DEFAULT_LOOK.info, on: { ...DEFAULT_LOOK.info.on, peak: false } } }), null, "a switch changed after picking is your own mix");
  const withLine = applyStart({ ...DEFAULT_LOOK, info: { ...DEFAULT_LOOK.info, line: "Road to Master", on: { ...DEFAULT_LOOK.info.on, line: true } } }, "number");
  ok(withLine.info.on.line && detailSwitches("sticker", withLine.info).length === 1, "your own line stays on and the sticker still fits");
}

// Ids in time order (2026-10-30: a strike numbered apart from tables made a live card replay its last five events)
{
  const row = (id: number, reason: string, mmr: number, at: string): MmrChange => ({ id, mmr, delta: 0, at, reason, place: null, score: null, tier: null });
  const raw = [row(126817, "Strike", 6589, "2026-10-30T23:18:00Z"), row(1153259, "Table", 6639, "2026-10-30T23:13:00Z"), row(1153250, "Table", 6629, "2026-10-30T22:36:00Z"), row(0, "Placement", 6000, "2026-10-01T00:00:00Z")];
  const fixed = timeOrderedIds(raw);
  eq(fixed.map((c) => c.id), [1153259.01, 1153259, 1153250, 0], "a strike after the newest table gets an id just above it");
  ok(fixed.every((c, i) => c.mmr === raw[i].mmr && c.reason === raw[i].reason), "only the ids change");
  eq(raw[0].id, 126817, "the list given isn't changed");
  eq(timeOrderedIds([row(1153250, "TableDelete", 6616, "2026-10-30T23:30:00Z"), row(126817, "Strike", 6589, "2026-10-30T23:18:00Z"), ...raw.slice(1)]).map((c) => c.id), [1153259.02, 1153259.01, 1153259, 1153250, 0], "two in a row: two hundredths");
  eq(timeOrderedIds(raw.slice(1)).map((c) => c.id), [1153259, 1153250, 0], "ids already in order stay as they are");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
