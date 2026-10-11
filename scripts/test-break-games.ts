/**
 * Break mode game checks: every game makes sound rounds, reads chat answers
 * correctly, and scores them. Pure (no database).
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-break-games.ts
 */

import { PUZZLES } from "@/lib/originals/daily";
import { GAMES, puzzleOrder, type BreakAnswer, type MakeContext } from "@/lib/break/games";
import { BREAK_GAMES, BREAK_GAME_IDS, DEFAULT_LINEUP, cleanLineup } from "@/lib/break/types";
import { roomTier } from "@/lib/break/games/tierLive";
import { nameMatcher, typedAnswer } from "@/lib/break/games/names";
import { stepAt, zoomRosters, ZOOM_STEPS } from "@/lib/break/games/zoom";
import { drawRoyale, ITEM_LINES } from "@/lib/break/games/royale";
import { botMove, drop, emptyBoard, openColumns, winLine } from "@/lib/break/games/connect";
import { EMOJI_PUZZLES } from "@/data/originals/emoji-puzzles";
import { READ_THE_ROOM } from "@/data/originals/read-the-room";
import { TRIVIA_PACK } from "@/data/originals/trivia-pack";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`✗ ${name}`, detail ?? "");
  }
}

function ctx(gameOnStream: string | null, seen = new Set<string>()): MakeContext {
  return { skip: (k) => seen.has(k), puzzles: puzzleOrder(gameOnStream), streamer: "Nova", gameOnStream, rand: Math.random, meta: {}, fresh: true, roundOfGame: 1 };
}
const ans = (viewer: string, answer: string): BreakAnswer => ({ platform: "twitch", viewer, name: viewer, answer });

// Every game in the catalog has an engine and vice versa.
check("catalog and engines match", BREAK_GAME_IDS.every((id) => GAMES[id]) && Object.keys(GAMES).every((id) => id in BREAK_GAMES));
check("cleanLineup drops unknowns and repeats", JSON.stringify(cleanLineup(["scramble", "nope", "scramble", "over-under"])) === JSON.stringify(["scramble", "over-under"]));
check("cleanLineup never empty (falls back to the default lineup)", cleanLineup([]).length === DEFAULT_LINEUP.length);
check("the default lineup leaves out Stream Bingo and Four in a Row (the long ones)", !DEFAULT_LINEUP.includes("stream-bingo") && !DEFAULT_LINEUP.includes("four-in-a-row"));

const BAD_TEXT = /undefined|null|NaN|\[object|—|–/;
const streams = [null, "mario-kart-8-deluxe", "mario-kart-world", "super-smash-bros-ultimate", "super-mario-party-jamboree", "overwatch", "marvel-rivals", "splatoon-3"];

// Games that load from the database get what their load would return.
const PACK_ROWS = TRIVIA_PACK.filter((q) => q.kind !== "picture").map((q, i) => ({
  id: `q${i}`, prompt: q.prompt, answer: q.answer, accept: q.accept ?? [], ask_about: q.askAbout ?? [], reject: q.reject ?? [], kind: q.kind, options: q.options ?? null, category: q.category,
}));
const LOADED: Partial<Record<string, unknown>> = {
  "trivia-rounds": PACK_ROWS,
  "chat-brain": { id: "p1", text: "What's the best snack for a long stream?", category: null },
  "know-the-channel": [
    { id: "k1", prompt: "What does Nova call her chat?", answer: "Nova Crew", accept: ["the crew", "crew"] },
    { id: "k2", prompt: "What's Nova's main in Smash?", answer: "Kirby", accept: [] },
    { id: "k3", prompt: "What year did the channel start?", answer: "2021", accept: [] },
  ],
  "chat-bounty": { tokens: 100 },
};

// Hosted games (Stream Bingo) run on another engine and need the database.
for (const id of BREAK_GAME_IDS.filter((g) => !GAMES[g].hosted)) {
  const game = GAMES[id];
  let made = 0;
  for (const s of streams) {
    for (let n = 0; n < 60; n += 1) {
      const d = game.make({ ...ctx(s), data: LOADED[id] });
      if (!d) continue;
      made += 1;
      const r = d.round;
      // The words only (a missing picture is a null, not a blank word).
      const words = JSON.stringify(r, (_k, v) => (v === null ? undefined : v));
      check(`${id}: no blank words`, !BAD_TEXT.test(words), words.slice(0, 200));
      check(`${id}: prompt is short`, r.prompt.length <= 160, r.prompt);
      if (r.layout === "choice") {
        const keys = r.options.map((o) => o.key);
        check(`${id}: option keys unique`, new Set(keys).size === keys.length, keys);
        check(`${id}: correct key is an option`, !d.secret.correct || keys.includes(String(d.secret.correct)), d.secret);
        const labels = r.options.map((o) => o.label);
        check(`${id}: option labels unique`, new Set(labels).size === labels.length || id === "fact-or-fiction", labels);
      }
      if (r.layout === "word") check(`${id}: tiles aren't the answer`, r.tiles.join("").toLowerCase() !== String(d.secret.word).toLowerCase(), r.tiles);
    }
  }
  check(`${id}: makes rounds`, made > 50, made);
}

// Higher or Lower: the right answer really is higher/earlier.
for (let n = 0; n < 200; n += 1) {
  const d = GAMES["higher-lower"].make(ctx(null));
  if (!d) continue;
  const [a, b] = d.secret.values as string[];
  check("higher-lower: two different values", a !== b, d.secret);
}

// Odd One Out: exactly one option differs on the asked fact.
for (let n = 0; n < 200; n += 1) {
  const d = GAMES["odd-one-out"].make(ctx(null));
  if (!d || d.round.layout !== "choice") continue;
  const label = String(d.secret.label);
  const puzzle = Object.values(PUZZLES).find((p) => p.game === d.round.tag);
  if (!puzzle) continue;
  const ti = puzzle.traits.findIndex((t) => t.label === label);
  const values = d.round.options.map((o) => String(puzzle.characters.find((c) => c.name === o.label)?.traits[ti]));
  const tallyV: Record<string, number> = {};
  for (const v of values) tallyV[v] = (tallyV[v] ?? 0) + 1;
  const counts = Object.values(tallyV).sort();
  check("odd-one-out: three match, one differs", JSON.stringify(counts) === "[1,3]", { label, values, prompt: d.round.prompt });
  const oddIdx = Number(d.secret.correct) - 1;
  check("odd-one-out: the odd one is the different one", tallyV[values[oddIdx]] === 1, { values, oddIdx });
}

// Fact or Fiction: a true statement uses the character's real value.
for (let n = 0; n < 300; n += 1) {
  const d = GAMES["fact-or-fiction"].make(ctx(null));
  if (!d) continue;
  if (d.secret.correct === "T") check("fact-or-fiction: a fact reads the same as the truth", d.secret.trueText === d.round.prompt, d.secret);
  else check("fact-or-fiction: a fiction differs from the truth", d.secret.trueText !== d.round.prompt, { prompt: d.round.prompt, truth: d.secret.trueText });
}

// Answers from chat.
const hol = GAMES["higher-lower"];
const holRound = { layout: "choice" as const, prompt: "x", options: [{ key: "1", label: "a" }, { key: "2", label: "b" }], hint: "" };
check("accept: 1", hol.accept("1", holRound) === "1");
check("accept: ' 2 '", hol.accept(" 2 ", holRound) === "2");
check("accept: 3 isn't an option", hol.accept("3", holRound) === null);
check("accept: chatter isn't an answer", hol.accept("lol 1", holRound) === null);
check("fof accepts fiction", GAMES["fact-or-fiction"].accept("Fiction", holRound) === "F");
check("fof accepts t", GAMES["fact-or-fiction"].accept("t", holRound) === "T");
check("over-under accepts seven", GAMES["over-under"].accept("seven", holRound) === "7");
check("over-under accepts U", GAMES["over-under"].accept("U", holRound) === "under");
check("high-roller accepts !roll", GAMES["high-roller"].accept("!roll", holRound) === "roll");
const numRound = { layout: "number" as const, prompt: "x", hint: "", min: 1900, max: 2100 };
check("closest-guess accepts a year", GAMES["closest-guess"].accept("1985", numRound) === "1985");
check("closest-guess refuses 85", GAMES["closest-guess"].accept("85", numRound) === null);
check("lucky-number refuses 0", GAMES["lucky-number"].accept("0", numRound) === null);
check("lucky-number accepts 100", GAMES["lucky-number"].accept("100", numRound) === "100");
check("scramble accepts a word", GAMES.scramble.accept("Peach", holRound) === "peach");
check("scramble refuses two words", GAMES.scramble.accept("princess peach", holRound) === null);

// Scoring.
{
  const j = hol.judge({ round: holRound, secret: { correct: "2", values: ["1992", "1990"], names: ["Wario", "Yoshi"] } }, [ans("a", "2"), ans("b", "2"), ans("c", "1")], { chatStreak: 2 });
  check("hol: right answers get 2", j.awards.length === 2 && j.awards.every((x) => x.points === 2));
  check("hol: chat streak grows when the room is right", j.meta?.chatStreak === 3);
  check("hol: reveal names the winner", j.reveal.text.startsWith("Yoshi: 1990"), j.reveal.text);
}
{
  const j = GAMES["closest-guess"].judge({ round: numRound, secret: { answer: 1985 } }, [ans("a", "1985"), ans("b", "1984"), ans("c", "1990"), ans("d", "1970"), ans("e", "1986")], {});
  const pts = Object.fromEntries(j.awards.map((x) => [x.viewer, x.points]));
  check("closest: exact gets 3 + 1", pts.a === 4, pts);
  check("closest: next closest share 2", pts.b === 2 && pts.e === 2, pts);
  check("closest: third closest gets 1", pts.c === 1 && pts.d === undefined, pts);
}
{
  const j = GAMES["handicap-vote"].judge({ round: holRound, secret: { cards: [{ label: "A", text: "Nova does A." }, { label: "B", text: "Nova does B." }, { label: "C", text: "Nova does C." }] } }, [ans("a", "2"), ans("b", "2"), ans("c", "1")], {});
  check("handicap: most votes wins", j.meta?.handicap === "Nova does B.", j.meta);
  check("handicap: its voters score", j.awards.length === 2);
}
{
  const j = GAMES["handicap-vote"].judge({ round: holRound, secret: { cards: [] } }, [], {});
  check("handicap: no votes, no handicap", !j.meta?.handicap && j.line === null);
}
{
  const j = GAMES["high-roller"].judge({ round: holRound, secret: {} }, Array.from({ length: 20 }, (_, i) => ans(`v${i}`, "roll")), {});
  check("high roller: everyone rolled two dice", j.reveal.rolls!.every((r) => r.dice.length === 2 && r.dice.every((d) => d >= 1 && d <= 6)));
  check("high roller: shows top ten", j.reveal.rolls!.length === 10);
  check("high roller: top total scores 3", j.awards.some((x) => x.points === 3));
}
{
  const j = GAMES["over-under"].judge({ round: holRound, secret: {} }, [ans("a", "over"), ans("b", "under"), ans("c", "7")], {});
  const sum = j.reveal.dice![0] + j.reveal.dice![1];
  const expect = sum > 7 ? "a" : sum < 7 ? "b" : "c";
  check("over-under: the right call scores", j.awards.length === 1 && j.awards[0].viewer === expect, { sum, awards: j.awards });
  check("over-under: exactly 7 pays 4", sum !== 7 || j.awards[0].points === 4);
}
{
  const seen = new Set<string>();
  let repeats = 0;
  for (let n = 0; n < 40; n += 1) {
    const d = GAMES["higher-lower"].make(ctx("mario-kart-8-deluxe", seen));
    if (!d?.key) continue;
    if (seen.has(d.key)) repeats += 1;
    seen.add(d.key);
  }
  check("seen list prevents repeats", repeats === 0, repeats);
}

// ─── Multi-round games, played whole with the break's memory carried between rounds (as the runner does) ───

import type { RunMeta } from "@/lib/break/games";
function playTurn(id: "tier-war-live" | "next-build" | "roll-call" | "shuffle-dice", stream: string | null, answerer: (keys: string[]) => string | null) {
  const game = GAMES[id];
  let meta: RunMeta = {};
  const reveals = [];
  let rounds = BREAK_GAMES[id].rounds;
  for (let r = 1; r <= rounds; r += 1) {
    const d = game.make({ ...ctx(stream), meta, fresh: r === 1, roundOfGame: r });
    if (!d) return { made: r - 1, meta, reveals };
    if (d.meta) meta = { ...meta, ...d.meta };
    const keys = "options" in d.round && d.round.options ? d.round.options.map((o) => o.key) : [];
    const answers = Array.from({ length: 7 }, () => answerer(keys)).map((k, i) => (k ? ans(`v${i}`, k) : null)).filter((x): x is BreakAnswer => !!x);
    for (const a of answers) check(`${id}: chat answer accepted`, game.accept(a.answer, d.round) === a.answer, a.answer);
    const j = game.judge(d, answers, meta);
    if (j.meta) meta = { ...meta, ...j.meta };
    reveals.push(j.reveal);
    check(`${id}: reveal says something`, j.reveal.text.length > 0 && !BAD_TEXT.test(j.reveal.text), j.reveal.text);
    rounds = game.rounds?.(meta) ?? BREAK_GAMES[id].rounds;
  }
  return { made: rounds, meta, reveals };
}
const anyKey = (keys: string[]) => keys[Math.floor(Math.random() * keys.length)] ?? null;

for (let n = 0; n < 40; n += 1) {
  const t = playTurn("tier-war-live", null, anyKey);
  check("tier war: six rounds", t.made === 6, t.made);
  const last = t.reveals[t.reveals.length - 1];
  const placed = (last?.tiers ?? []).reduce((a, r) => a + r.items.length, 0);
  check("tier war: the last reveal has the whole list", placed === 6, last?.tiers);
}
check("tier war: room tier is the most votes", roomTier(["S", "A", "A", "B"]) === "A");
check("tier war: a tie goes to the tier nearest the average", roomTier(["S", "S", "C", "C", "B"]) === "B" || roomTier(["S", "S", "C", "C", "B"]) === "C", roomTier(["S", "S", "C", "C", "B"]));
check("tier war: S and D tied, average B, takes S (higher)", roomTier(["S", "D"]) === "S", roomTier(["S", "D"]));
check("tier war: accepts 's tier'", GAMES["tier-war-live"].accept("s tier", holRound) === "S");

for (const [stream, parts] of [["mario-kart-8-deluxe", 4], ["mario-kart-world", 2], ["super-smash-bros-ultimate", 1]] as const) {
  for (let n = 0; n < 10; n += 1) {
    const t = playTurn("next-build", stream, anyKey);
    check(`next build ${stream}: one round per part`, t.made === parts, t.made);
    check(`next build ${stream}: the build is saved`, typeof t.meta.nextPick === "string" && t.meta.nextPick.split(" · ").length === parts, t.meta.nextPick);
  }
}
check("next build: no pool for the game, no rounds", GAMES["next-build"].make({ ...ctx("overwatch"), meta: {}, fresh: true, roundOfGame: 1 }) === null);
{
  const t = playTurn("next-build", "mario-kart-8-deluxe", () => null);
  check("next build: nobody votes, it still builds", typeof t.meta.nextPick === "string", t.meta.nextPick);
}

for (const stream of ["mario-kart-8-deluxe", "super-smash-bros-ultimate", "overwatch", "marvel-rivals", "splatoon-3", "kirby-air-riders", "super-mario-party-jamboree"]) {
  for (let n = 0; n < 8; n += 1) {
    const t = playTurn("roll-call", stream, anyKey);
    check(`roll call ${stream}: plays`, t.made === 1, t.made);
    check(`roll call ${stream}: saves the pick`, typeof t.meta.nextPick === "string" && t.meta.nextPick.length > 0, t.meta.nextPick);
  }
}
check("roll call: nothing to roll without a game", GAMES["roll-call"].make({ ...ctx(null), meta: {}, fresh: true, roundOfGame: 1 }) === null);

let houseWins = 0, chatWins = 0;
for (let n = 0; n < 300; n += 1) {
  const greedy = n % 3;
  const t = playTurn("shuffle-dice", null, () => (greedy === 0 ? "roll" : greedy === 1 ? "bank" : Math.random() < 0.5 ? "roll" : "bank"));
  const d = t.meta.dice!;
  check("shuffle dice: the match ends", d.over, d);
  check("shuffle dice: within 12 calls", d.decisions <= 12, d.decisions);
  check("shuffle dice: scores never go negative", d.chat >= 0 && d.house >= 0, d);
  for (const rv of t.reveals) {
    const tb = rv.table!;
    check("shuffle dice: no Bombs left in the roll", !tb.roll.includes("bomb"), tb);
    check("shuffle dice: a live turn has under three Bombs", tb.bombs < 3 || d.over, tb);
  }
  if (d.chat > d.house) chatWins += 1; else if (d.house > d.chat) houseWins += 1;
}
check("shuffle dice: chat can win and lose", chatWins > 10 && houseWins > 10, { chatWins, houseWins });
check("shuffle dice: accepts r", GAMES["shuffle-dice"].accept("r", holRound) === "roll");

// ─── Wave 2 ───

// Reading typed names.
{
  const smash = nameMatcher(["Mario", "Wario", "Pac-Man", "Zero Suit Samus", "Rosalina & Luma", "Pyra/Mythra", "Donkey Kong", "Mr. Game & Watch", "King K. Rool", "Bowser Jr."]);
  const cases: [string, string | null][] = [
    ["pac man", "Pac-Man"], ["PACMAN", "Pac-Man"], ["zss", "Zero Suit Samus"], ["rosalina", "Rosalina & Luma"], ["mythra", "Pyra/Mythra"],
    ["dk", "Donkey Kong"], ["game and watch", "Mr. Game & Watch"], ["mr game & watch", "Mr. Game & Watch"], ["k rool", "King K. Rool"],
    ["bowser jr", "Bowser Jr."], ["marioo", "Mario"], ["zario", null], ["hello", null], ["", null],
  ];
  for (const [typed, want] of cases) check(`names: "${typed}" → ${want}`, smash.match(typed) === want, smash.match(typed));
  const heroes = nameMatcher(["Soldier: 76", "Torbjörn", "Luna Snow", "Spider-Man", "D.Va", "Lúcio"]);
  for (const [typed, want] of [["soldier 76", "Soldier: 76"], ["torbjorn", "Torbjörn"], ["luna", "Luna Snow"], ["spiderman", "Spider-Man"], ["dva", "D.Va"], ["lucio", "Lúcio"]] as const) {
    check(`names: "${typed}" → ${want}`, heroes.match(typed) === want, heroes.match(typed));
  }
  check("names: a title doesn't count from one word when words are off", nameMatcher(["Plants vs. Zombies"], { words: false }).match("zombies") === null);
  check("chatter isn't an answer", typedAnswer("lol") === null && typedAnswer("GG") === null && typedAnswer("!join") === null && typedAnswer("7") === null);
  check("a title is an answer", typedAnswer("Minecraft") === "Minecraft");
}

// Read the Room.
{
  const g = GAMES["read-the-room"];
  check("read the room: ids unique", new Set(READ_THE_ROOM.map((p) => p.id)).size === READ_THE_ROOM.length);
  check("read the room: two different sides", READ_THE_ROOM.every((p) => p.a !== p.b && p.q.length <= 120));
  const d = g.make(ctx(null))!;
  const j = g.judge(d, [ans("a", "1"), ans("b", "1"), ans("c", "2")], {});
  check("read the room: the majority scores", j.awards.length === 2 && j.awards.every((x) => x.viewer !== "c"), j.awards);
  const tie = g.judge(d, [ans("a", "1"), ans("b", "2")], {});
  check("read the room: a dead heat scores everyone", tie.awards.length === 2, tie.awards);
  check("read the room: no answers, nobody scores", g.judge(d, [], {}).awards.length === 0);
}

// Zoomed In.
{
  const g = GAMES["zoomed-in"];
  check("zoomed in: one guess each", g.oneGuess === true);
  check("zoomed in: has rosters with art", zoomRosters().length >= 5, zoomRosters().map((r) => r.slug));
  check("zoomed in: step timing", stepAt(1000, 0) === 0 && stepAt(12_000, 0) === 1 && stepAt(40_000, 0) === ZOOM_STEPS.length - 1 && stepAt(undefined, 0) === ZOOM_STEPS.length - 1);
  for (let n = 0; n < 200; n += 1) {
    const d = g.make(ctx(streams[n % streams.length]))!;
    if (d.round.layout !== "zoom") { check("zoomed in: zoom layout", false, d.round.layout); continue; }
    const name = String(d.secret.name);
    check("zoomed in: the answer is accepted", g.accept(name, d.round) === name, name);
    check("zoomed in: chatter is ignored", g.accept("lol", d.round) === null);
    const opened = Date.now() - 40_000;
    const draft = { ...d, round: { ...d.round, openedAt: new Date(opened).toISOString() } };
    const j = g.judge(draft, [{ ...ans("early", name), at: opened + 2000 }, { ...ans("late", name), at: opened + 30_000 }, { ...ans("wrong", "Nobody"), at: opened + 1000 }], {});
    const pts = Object.fromEntries(j.awards.map((x) => [x.viewer, x.points]));
    check("zoomed in: sooner scores more", pts.early === 4 && pts.late === 1 && pts.wrong === undefined, pts);
  }
}

// Emoji Puzzle.
{
  const g = GAMES["emoji-puzzle"];
  check("emoji: ids unique", new Set(EMOJI_PUZZLES.map((p) => p.id)).size === EMOJI_PUZZLES.length);
  for (const p of EMOJI_PUZZLES) {
    const draft = { round: { layout: "text" as const, prompt: "x", hint: "" }, secret: { answer: p.answer, accept: p.accept } };
    for (const typed of [p.answer, p.answer.toLowerCase(), ...p.accept]) {
      const j = g.judge(draft, [ans("v", typed)], {});
      check(`emoji ${p.id}: "${typed}" is right`, j.awards.length === 1, typed);
    }
    check(`emoji ${p.id}: a wrong game isn't`, g.judge(draft, [ans("v", "Bananas Forever")], {}).awards.length === 0);
  }
}

// Trivia (the pack's own answers judge right).
{
  const g = GAMES["trivia-rounds"];
  let tested = 0;
  for (let n = 0; n < 400; n += 1) {
    const d = g.make({ ...ctx(null), data: PACK_ROWS });
    if (!d) continue;
    const q = d.secret.q as { answer: string; options?: string[] | null; kind: string };
    const typed = d.round.layout === "choice" ? ["A", "B", "C", "D"][q.options!.indexOf(q.answer)] : q.answer;
    check("trivia: the chat answer is accepted", g.accept(typed, d.round) !== null, typed);
    const j = g.judge(d, [ans("v", g.accept(typed, d.round)!), ans("w", "zzzz")], {});
    check(`trivia: the answer is right (${q.answer})`, j.awards.length === 1 && j.awards[0].viewer === "v", { typed, q: q.answer });
    tested += 1;
  }
  check("trivia: plays from the pack", tested > 300, tested);
  check("trivia: nothing approved, no rounds", g.make({ ...ctx(null), data: [] }) === null);
}

// Chat Brain on a break.
{
  const g = GAMES["chat-brain"];
  const d = g.make({ ...ctx(null), data: { id: "p1", text: "Best snack?", category: null } })!;
  check("chat brain: a typed answer is accepted", g.accept("Popcorn", d.round) === "Popcorn");
  check("chat brain: chatter isn't", g.accept("lol", d.round) === null);
  const j = g.judge(d, [ans("a", "popcorn"), ans("b", "chips")], {});
  check("chat brain: everyone who answers scores", j.awards.length === 2);
  check("chat brain: answers never shown", !JSON.stringify(j.reveal).includes("popcorn"));
  check("chat brain: no question, no round", g.make(ctx(null)) === null);
}

// Roster Rush.
{
  const g = GAMES["roster-rush"];
  check("roster rush: every answer counts", g.multiAnswer === true && g.liveAnswers === true);
  for (const stream of streams) {
    const d = g.make(ctx(stream))!;
    if (d.round.layout !== "rush") { check("roster rush: rush layout", false); continue; }
    const names = d.secret.names as string[];
    check("roster rush: total matches the roster", d.round.total === names.length);
    check("roster rush: a name is accepted", g.accept(names[0], d.round) === names[0], names[0]);
    const answers = names.slice(0, 14).map((nm, i) => ans(i < 12 ? "busy" : "light", nm));
    const j = g.judge(d, answers, {});
    const pts = Object.fromEntries(j.awards.map((x) => [x.viewer, x.points]));
    check("roster rush: points capped at 10", pts.busy === 10 && pts.light === 2, pts);
    check("roster rush: found and missed add up", (j.reveal.found?.length ?? 0) === 14 && (j.reveal.missed?.length ?? 0) > 0);
    const all = g.judge(d, names.map((nm) => ans("everyone", nm)), {});
    check("roster rush: clearing it gives the bonus", all.awards[0].points === 15 && all.reveal.text.includes("all"), all.awards);
  }
}

// Item Box Royale.
{
  check("royale: lines have a name", ITEM_LINES.every((l) => l.includes("{name}")));
  for (const n of [0, 1, 2, 3, 5, 12, 50, 300]) {
    const players = Array.from({ length: n }, (_, i) => ({ platform: "twitch", viewer: `v${i}`, name: `P${i}` }));
    const r = drawRoyale(players, Math.random);
    const outs = r.waves.flatMap((w) => w.out);
    check(`royale ${n}: up to six waves`, r.waves.length <= 6 && r.waves.length === Math.max(0, Math.min(6, n - 1)), r.waves.length);
    check(`royale ${n}: everyone but the winner goes out once`, outs.length === Math.max(0, n - 1) && new Set(outs).size === outs.length && (r.winner === null || !outs.includes(r.winner)));
    // Played whole, as the runner does.
    const g = GAMES["item-box-royale"];
    let meta: RunMeta = {};
    const join = g.make({ ...ctx(null), meta, fresh: true, roundOfGame: 1 })!;
    if (join.meta) meta = { ...meta, ...join.meta };
    check(`royale ${n}: "join" is accepted`, g.accept("join", join.round) === "join" && g.accept("!join", join.round) === "join" && g.accept("hello", join.round) === null);
    const j1 = g.judge(join, players.map((p) => ans(p.viewer, "join")), meta);
    meta = { ...meta, ...j1.meta };
    const rounds = g.rounds!(meta);
    check(`royale ${n}: one round per wave after joining`, rounds === 1 + meta.royale!.waves.length, rounds);
    let winnerPoints = 0;
    for (let k = 2; k <= rounds; k += 1) {
      const d = g.make({ ...ctx(null), meta, fresh: false, roundOfGame: k })!;
      check(`royale ${n}: waves are quiet`, d.quiet === true && g.accept("join", d.round) === null);
      const j = g.judge(d, [], meta);
      meta = { ...meta, ...j.meta };
      check(`royale ${n}: knockout lines name the player`, (j.reveal.out ?? []).every((o) => o.line.includes(o.name) && !o.line.includes("{name}")));
      if (k === rounds) winnerPoints = j.awards.filter((x) => x.points === 5).length;
    }
    if (n >= 2) check(`royale ${n}: the winner gets 5`, winnerPoints === 1, winnerPoints);
  }
}

// Four in a Row.
{
  let b = emptyBoard();
  for (const c of [0, 1, 2]) b = drop(b, c, "c")!.board;
  check("four in a row: GameShuffle blocks a win", botMove(b, Math.random) === 3);
  let w = emptyBoard();
  for (const c of [0, 1, 2]) w = drop(w, c, "b")!.board;
  check("four in a row: GameShuffle takes a win", botMove(w, Math.random) === 3);
  let v = emptyBoard();
  for (let k = 0; k < 4; k += 1) v = drop(v, 5, "c")!.board;
  check("four in a row: a column win is found", winLine(v, "c")?.length === 4);
  let full = emptyBoard();
  for (let k = 0; k < 6; k += 1) full = drop(full, 2, k % 2 ? "b" : "c")!.board;
  check("four in a row: a full column closes", !openColumns(full).includes(2) && drop(full, 2, "c") === null);
  const g = GAMES["four-in-a-row"];
  const results: Record<string, number> = {};
  for (let n = 0; n < 150; n += 1) {
    let meta: RunMeta = {};
    let rounds = g.rounds!(meta);
    let played = 0;
    for (let k = 1; k <= rounds; k += 1) {
      const d = g.make({ ...ctx(null), meta, fresh: k === 1, roundOfGame: k });
      if (!d) break;
      if (d.meta) meta = { ...meta, ...d.meta };
      const keys = d.round.layout === "connect" ? d.round.options.map((o) => o.key) : [];
      const answers = n % 2 ? [ans("a", keys[Math.floor(Math.random() * keys.length)])] : [];
      for (const a of answers) check("four in a row: a vote is accepted", g.accept(a.answer, d.round) === a.answer);
      const j = g.judge(d, answers, meta);
      meta = { ...meta, ...j.meta };
      played = k;
      rounds = g.rounds!(meta);
    }
    const c4 = meta.c4!;
    check("four in a row: the game ends", c4.over, c4);
    check("four in a row: pieces add up", [...c4.board].filter((x) => x === "c").length === c4.moves, c4);
    check("four in a row: one round per chat move", played === c4.moves, { played, moves: c4.moves });
    results[c4.result ?? "none"] = (results[c4.result ?? "none"] ?? 0) + 1;
  }
  check("four in a row: GameShuffle beats a random chat most of the time", (results.bot ?? 0) > 100, results);
}

// ─── Chat Sets the Bounty ───────────────────────────────────────────────────
{
  const g = GAMES["chat-bounty"];
  check("bounty: skips itself with no amount set", g.make({ ...ctx(null), data: { tokens: 0 } }) === null);
  check("bounty: skips while another bounty is open", g.make({ ...ctx(null), data: { tokens: 100 }, meta: { bounty: { label: "x", text: "y", tokens: 100, voters: [], status: "open", setAt: "" } } }) === null);
  const d = g.make({ ...ctx("mario-kart-8-deluxe"), data: { tokens: 100 } })!;
  check("bounty: three cards with the streamer's name", d.round.layout === "choice" && d.round.options.length === 3 && d.round.options.every((o) => (o.sub ?? "").includes("Nova")), d.round);
  const j = g.judge({ round: d.round, secret: d.secret }, [ans("a", "2"), ans("b", "2"), ans("c", "1")], {});
  const b = j.meta?.bounty;
  check("bounty: the most-voted card wins", !!b && b.text === (d.secret.cards as { text: string }[])[1].text, b);
  check("bounty: only its voters split the pot", !!b && b.voters.length === 2 && b.voters.every((v) => v.viewer !== "c") && b.tokens === 100 && b.status === "open", b);
  check("bounty: voters for it score a point", j.awards.length === 2 && j.awards.every((a) => a.points === 1), j.awards);
  check("bounty: nobody voted, no bounty", !g.judge({ round: d.round, secret: d.secret }, [], {}).meta?.bounty);
}

// ─── Know the Channel ───────────────────────────────────────────────────────
{
  const g = GAMES["know-the-channel"];
  const rows = LOADED["know-the-channel"] as { id: string; prompt: string; answer: string; accept: string[] }[];
  check("channel: skips itself with no questions", g.make({ ...ctx(null), data: [] }) === null);
  check("channel: skips questions seen in the last 30 days", g.make({ ...ctx(null, new Set(rows.map((r) => `channel:${r.id}`))), data: rows }) === null);
  const d = g.make({ ...ctx(null, new Set(["channel:k2", "channel:k3"])), data: rows })!;
  check("channel: asks the one not seen", d.key === "channel:k1" && d.round.prompt === rows[0].prompt, d);
  const right = ["Nova Crew", "nova crw", "the crew", "Crew"].map((t, i) => ans(`v${i}`, g.accept(t, d.round) ?? ""));
  const j = g.judge({ round: d.round, secret: d.secret }, [...right, ans("x", g.accept("chat", d.round) ?? "")], {});
  check("channel: the answer, a typo and the other ways all count", j.awards.length === 4 && j.awards.every((a) => a.points === 2), j.awards.map((a) => a.viewer));
  check("channel: chatter doesn't count", g.accept("lol", d.round) === null || j.awards.every((a) => a.viewer !== "x"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
