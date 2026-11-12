/**
 * Checks the co-op games for players (src/lib/coop/rules.ts): whole games of
 * Boss Fight, Five Letters, Four in a Row and Shuffle Dice played through
 * coopOpen / coopClose, the way the Discord room and live nights run them.
 *
 *   npx tsx scripts/test-coop.ts
 *
 * What it checks: each round starts from what the last one left (the carry-
 * over), a new game starts empty, every game ends inside its round limit as a
 * shared win, loss or draw that matches the game's own state, no line a
 * player sees mentions chat, and the result and night scoring helpers.
 */
import {
  COOP_GAMES, COOP_GAME_IDS, coopAccept, coopClose, coopHeadline, coopOpen, coopOutcome, coopOverall, coopRecord,
  coopNightWon, coopRevealView, coopRoundView, forPlayers, isCoopGame, type CoopGameId, type CoopResult,
} from "../src/lib/coop/rules";
import { COOP_COUNTS, QUICKFIRE_SETS, coopLineup } from "../src/lib/activity/roomRules";
import type { BreakAnswer, RunMeta } from "../src/lib/break/games/common";
import { BREAK_GAMES, LINEUP_PRESETS, cleanLineup, type BreakRound } from "../src/lib/break/types";
import { FIVE_LETTER_ANSWERS } from "../src/data/originals/five-letters";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else { failed++; if (failed < 40) console.log(`FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300)); }
}
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const CHAT = /\bchat\b/i;

/** Something a player could send this round (sometimes nonsense, which accept must refuse). */
function playerAnswer(id: CoopGameId, round: BreakRound, rand: () => number): string {
  if (rand() < 0.08) return "hello there";
  if (id === "boss-fight") return rand() < 0.5 ? "hit" : "Hit!";
  if (id === "five-letters") return ["CRANE", "SLATE", "MARIO", "LINKS", "PEACH", "ROUND", "KARTS", "WORLD"][Math.floor(rand() * 8)];
  if (round.layout === "connect") return round.options[Math.floor(rand() * round.options.length)].key;
  return rand() < 0.6 ? "roll" : "bank";
}

/** Plays one whole game; returns every round seen, the texts players would read, and the result. */
function playGame(id: CoopGameId, players: number, rand: () => number, seenKeys = new Set<string>()) {
  let meta: RunMeta = {};
  let played = 0;
  const texts: string[] = [];
  const rounds: BreakRound[] = [];
  let outcome: CoopResult | null = null;
  for (let guard = 0; guard < 40 && !outcome; guard++) {
    const opened = coopOpen(id, meta, played, { rand, skip: (k) => seenKeys.has(k) });
    if (!opened) break;
    if (opened.draft.key) seenKeys.add(opened.draft.key);
    meta = opened.meta;
    played += 1;
    const view = coopRoundView(opened.draft.round);
    rounds.push(opened.draft.round);
    texts.push(view.prompt, view.hint, view.tag ?? "");
    const answers: BreakAnswer[] = [];
    for (let p = 0; p < players; p++) {
      const a = coopAccept(id, playerAnswer(id, opened.draft.round, rand), opened.draft.round);
      if (a) answers.push({ platform: "seat", viewer: String(p), name: `Player ${p + 1}`, answer: a });
    }
    const closed = coopClose(id, { round: opened.draft.round, secret: opened.draft.secret }, answers, meta, played);
    meta = closed.meta;
    texts.push(coopRevealView(closed.judged.reveal).text);
    outcome = closed.outcome;
  }
  return { meta, played, texts, rounds, outcome };
}

// ── The set and its lineups ──────────────────────────────────────────────────
check("Team up holds the four co-op games", JSON.stringify([...QUICKFIRE_SETS.coop.games].sort()) === JSON.stringify([...COOP_GAME_IDS].sort()), QUICKFIRE_SETS.coop.games);
for (const id of COOP_GAME_IDS) check(`${id}: is a co-op game`, isCoopGame(id));
check("other ids aren't co-op games", !isCoopGame("roster-rush") && !isCoopGame("") && !isCoopGame(undefined));
for (let seed = 1; seed <= 60; seed++) {
  for (const n of COOP_COUNTS) {
    const mix = coopLineup("mix", n, seeded(seed));
    check(`mix of ${n}: length`, mix.length === n, mix);
    check(`mix of ${n}: different games (four or fewer)`, new Set(mix).size === n, mix);
    check(`mix of ${n}: only co-op games`, mix.every(isCoopGame), mix);
    for (const id of COOP_GAME_IDS) {
      const one = coopLineup(id, n, seeded(seed));
      check(`${id} x${n}: the same game`, one.length === n && one.every((g) => g === id), one);
    }
  }
}

// ── Whole games ──────────────────────────────────────────────────────────────
const tally: Record<CoopGameId, Record<string, number>> = { "boss-fight": {}, "five-letters": {}, "four-in-a-row": {}, "shuffle-dice": {} };
for (const id of COOP_GAME_IDS) {
  for (let seed = 1; seed <= 400; seed++) {
    const rand = seeded(seed * 31 + id.length);
    const players = 1 + (seed % 6);
    const g = playGame(id, players, rand);
    check(`${id} #${seed}: ends with a result`, !!g.outcome, { played: g.played, meta: g.meta });
    if (!g.outcome) continue;
    tally[id][g.outcome.result] = (tally[id][g.outcome.result] ?? 0) + 1;
    check(`${id} #${seed}: inside its round limit`, g.played >= 1 && g.played <= COOP_GAMES[id].maxRounds, g.played);
    check(`${id} #${seed}: result is for this game`, g.outcome.game === id);
    for (const t of [...g.texts, g.outcome.line]) check(`${id} #${seed}: no chat wording`, !CHAT.test(t), t);
    // The result agrees with the game's own state.
    if (id === "boss-fight") {
      const b = g.meta.boss!;
      check(`${id} #${seed}: win means the boss is down`, (g.outcome.result === "won") === (b.won && b.hp === 0), b);
      check(`${id} #${seed}: never more than five rounds`, b.rounds === g.played, b);
      // Carry-over: health only goes down within a round's view, unless more fighters grew the boss.
      const hp = g.rounds.map((r) => (r.layout === "boss" ? r.boss : null));
      check(`${id} #${seed}: one boss for the whole fight`, hp.every((x) => x && x.name === hp[0]!.name), hp.map((x) => x?.name));
      check(`${id} #${seed}: the fight keeps its health`, hp.slice(1).every((x, i) => x!.hp <= hp[i]!.hp + (x!.maxHp - hp[i]!.maxHp)), hp);
    }
    if (id === "five-letters") {
      const w = g.meta.letters!;
      check(`${id} #${seed}: win means solved`, (g.outcome.result === "won") === w.solved, w);
      check(`${id} #${seed}: one word for the whole game`, g.rounds.every((r) => r.layout === "letters"), g.rounds.map((r) => r.layout));
      check(`${id} #${seed}: each round shows the guesses before it`, g.rounds.every((r, i) => r.layout === "letters" && r.rows.length === i), g.rounds.map((r) => (r.layout === "letters" ? r.rows.length : -1)));
      check(`${id} #${seed}: the word stays out of the rounds`, g.rounds.every((r) => !JSON.stringify(r).includes(`"${w.word}"`) || (r.layout === "letters" && r.rows.some((x) => x.word === w.word))));
    }
    if (id === "four-in-a-row") {
      const c = g.meta.c4!;
      check(`${id} #${seed}: result matches the board`, g.outcome.result === (c.result === "chat" ? "won" : c.result === "bot" ? "lost" : "draw"), c);
      check(`${id} #${seed}: moves counted`, c.moves === g.played, c);
      // Carry-over: every round's board has every piece the last one had.
      const boards = g.rounds.map((r) => (r.layout === "connect" ? r.board : ""));
      check(`${id} #${seed}: the board fills, never resets`, boards.every((b, i) => i === 0 || [...boards[i - 1]].every((cell, k) => cell === "." || b[k] === cell)), boards.slice(0, 3));
      check(`${id} #${seed}: first round is an empty board`, /^\.+$/.test(boards[0]), boards[0]);
    }
    if (id === "shuffle-dice") {
      const d = g.meta.dice!;
      const want = d.chat > d.house ? "won" : d.house > d.chat ? "lost" : "draw";
      check(`${id} #${seed}: result matches the score`, g.outcome.result === want, d);
      check(`${id} #${seed}: calls counted`, d.decisions === g.played, d);
      const tables = g.rounds.map((r) => (r.layout === "shuffle" ? r.table : null));
      check(`${id} #${seed}: the score never resets mid-match`, tables.every((t, i) => i === 0 || (t!.chat >= 0 && t!.house >= 0)), tables.slice(0, 3));
    }
  }
}
for (const id of COOP_GAME_IDS) console.log(`  ${id}: ${JSON.stringify(tally[id])}`);
check("Boss Fight can be won and lost", (tally["boss-fight"].won ?? 0) > 0 && (tally["boss-fight"].lost ?? 0) > 0, tally["boss-fight"]);
check("Shuffle Dice can be won and lost", (tally["shuffle-dice"].won ?? 0) > 0 && (tally["shuffle-dice"].lost ?? 0) > 0, tally["shuffle-dice"]);
check("Five Letters can be lost", (tally["five-letters"].lost ?? 0) > 0, tally["five-letters"]);
check("Four in a Row can be lost", (tally["four-in-a-row"].lost ?? 0) > 0, tally["four-in-a-row"]);

// A team that knows the word wins Five Letters, worded for players.
{
  const rand = seeded(7);
  let meta: RunMeta = {};
  const first = coopOpen("five-letters", meta, 0, { rand })!;
  meta = first.meta;
  const word = String(first.draft.secret.word);
  check("five letters: the word is one of ours", FIVE_LETTER_ANSWERS.some((a) => a.word === word), word);
  const closed = coopClose("five-letters", { round: first.draft.round, secret: first.draft.secret }, [
    { platform: "seat", viewer: "0", name: "Sam", answer: word },
    { platform: "seat", viewer: "1", name: "Ana", answer: word },
  ], meta, 1);
  check("five letters: solved in one is a win", closed.outcome?.result === "won" && closed.outcome.line === `You got ${word} in 1.`, closed.outcome);
}

// ── A new game starts empty, whatever the last one left ────────────────────────
{
  const rand = seeded(11);
  const old = playGame("boss-fight", 3, rand).meta;
  const fresh = coopOpen("boss-fight", old, 0, { rand })!;
  check("new boss fight: full health", fresh.draft.round.layout === "boss" && fresh.draft.round.boss.hp === fresh.draft.round.boss.maxHp, fresh.draft.round);
  check("new boss fight: nobody's hit it yet", fresh.meta.boss?.fighters.length === 0 && fresh.meta.boss.rounds === 0, fresh.meta.boss);
  const c4 = playGame("four-in-a-row", 2, rand).meta;
  const freshBoard = coopOpen("four-in-a-row", c4, 0, { rand })!;
  check("new four in a row: empty board", freshBoard.draft.round.layout === "connect" && /^\.+$/.test(freshBoard.draft.round.board));
  const dice = playGame("shuffle-dice", 2, rand).meta;
  const freshDice = coopOpen("shuffle-dice", dice, 0, { rand })!;
  check("new shuffle dice: 0 to 0", freshDice.meta.dice?.chat === 0 && freshDice.meta.dice.house === 0, freshDice.meta.dice);
  // Carrying a game on: round 2 picks up the same state.
  const r1 = coopOpen("four-in-a-row", {}, 0, { rand })!;
  const c1 = coopClose("four-in-a-row", { round: r1.draft.round, secret: r1.draft.secret }, [{ platform: "seat", viewer: "0", name: "Sam", answer: "4" }], r1.meta, 1);
  const r2 = coopOpen("four-in-a-row", c1.meta, 1, { rand })!;
  check("four in a row round 2: the board from round 1", r2.draft.round.layout === "connect" && r2.draft.round.board === c1.meta.c4!.board, r2.draft.round);
  check("four in a row round 2: two pieces down", r2.draft.round.layout === "connect" && [...r2.draft.round.board].filter((x) => x !== ".").length === 2);
}

// ── Seen content: a group gets a different boss and word while there are any left ─
{
  const rand = seeded(5);
  const seen = new Set<string>();
  const bosses = new Set<string>();
  for (let i = 0; i < 8; i++) bosses.add(playGame("boss-fight", 2, rand, seen).meta.boss!.name);
  check("eight fights, eight different bosses", bosses.size === 8, [...bosses]);
  const ninth = playGame("boss-fight", 2, rand, seen);
  check("a ninth fight still finds a boss", !!ninth.outcome);
}

// ── Wording ──────────────────────────────────────────────────────────────────
const samples: [string, string][] = [
  ["Chat played column 3 and wins!", "You played column 3 and win!"],
  ["Chat played 3. GameShuffle played 4 and wins.", "You played 3. GameShuffle played 4 and wins."],
  ["Nobody voted, so chat played column 4.", "Nobody voted, so you played column 4."],
  ["Chat goes first. Pick a column", "You go first. Pick a column"],
  ["Chat's move", "Your move"],
  ["Chat vs GameShuffle", "You vs GameShuffle"],
  ["Chat vs the House", "You vs the House"],
  ["Chat wins, 26 to 19!", "You win, 26 to 19!"],
  ["Chat's roll came up three Bombs straight away.", "Your roll came up three Bombs straight away."],
  ["Nobody voted, so chat banked 3.", "Nobody voted, so you banked 3."],
  ["Chat hit for 34. 26 health left. More of chat joined in, so King Kablooey grew stronger.", "You hit for 34. 26 health left. More of you joined in, so King Kablooey grew stronger."],
  ["King Kablooey is down! Sam landed the final blow. Everyone who hit it scores.", "King Kablooey is down! Sam landed the final blow."],
  ["Chat played CRANE (3 votes).", "You played CRANE (3 votes)."],
];
for (const [from, to] of samples) check(`reword: ${from}`, forPlayers(from) === to, forPlayers(from));

// ── Results and the night's scoring ──────────────────────────────────────────
const won = (game: CoopGameId): CoopResult => ({ game, result: "won", line: "" });
const lost = (game: CoopGameId): CoopResult => ({ game, result: "lost", line: "" });
const draw = (game: CoopGameId): CoopResult => ({ game, result: "draw", line: "" });
check("record counts", JSON.stringify(coopRecord([won("boss-fight"), lost("five-letters"), won("shuffle-dice"), draw("four-in-a-row")])) === JSON.stringify({ won: 2, lost: 1, draw: 1 }));
check("overall: more won is a win", coopOverall([won("boss-fight"), lost("five-letters"), won("shuffle-dice")]) === "won");
check("overall: more lost is a loss", coopOverall([lost("boss-fight"), lost("five-letters"), won("shuffle-dice")]) === "lost");
check("overall: level is a draw", coopOverall([won("boss-fight"), lost("five-letters")]) === "draw");
check("overall: only draws is a draw", coopOverall([draw("four-in-a-row")]) === "draw");
check("headline: one win", coopHeadline([won("boss-fight")]) === "You won!");
check("headline: one loss", coopHeadline([lost("boss-fight")]) === "Not this time");
check("headline: all won", coopHeadline([won("boss-fight"), won("five-letters")]) === "You won all 2!");
check("headline: some won", coopHeadline([won("boss-fight"), lost("five-letters"), lost("shuffle-dice")]) === "You won 1 of 3");
check("headline: nothing finished", coopHeadline([]) === "That's the game");
check("night: more won than lost wins the slot", coopNightWon([won("boss-fight"), won("five-letters"), lost("shuffle-dice")]));
check("night: level isn't a win", !coopNightWon([won("boss-fight"), lost("five-letters")]));
check("night: a draw alone isn't a win", !coopNightWon([draw("four-in-a-row")]));
check("night: a win and a draw wins", coopNightWon([won("boss-fight"), draw("four-in-a-row")]));
check("outcome waits for the end", coopOutcome("boss-fight", {}) === null && coopOutcome("five-letters", { letters: { word: "MARIO", category: "x", rows: [], over: false, solved: false } }) === null);

// ── The "All together" break lineup (GS Pro, on stream) ─────────────────────────
{
  const together = LINEUP_PRESETS.find((p) => p.id === "together")!;
  check("all together: the six games", JSON.stringify(together.games) === JSON.stringify(["boss-fight", "five-letters", "four-in-a-row", "shuffle-dice", "roster-rush", "chat-bounty"]), together.games);
  check("all together: a clean lineup", JSON.stringify(cleanLineup(together.games)) === JSON.stringify(together.games));
  check("all together: every co-op game", COOP_GAME_IDS.every((g) => together.games.includes(g)));
  check("all together: the bounty plays last", together.games[together.games.length - 1] === "chat-bounty");
  check("presets: real games only", LINEUP_PRESETS.every((p) => p.games.every((g) => g in BREAK_GAMES)));
  check("presets: blurbs written, no dashes", LINEUP_PRESETS.every((p) => p.blurb.length > 20 && !/—|–/.test(p.blurb)));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
