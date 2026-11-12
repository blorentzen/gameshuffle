/**
 * Pure tests for Chat Brain at the table (src/lib/chatbrain/tableRules.ts) and
 * the co-stream together lines (streamRules.ts, "Co-stream together").
 * Run: npx tsx scripts/test-chatbrain-table.ts
 */
import assert from "node:assert/strict";
import type { BoardAnswer } from "../src/lib/chatbrain/rules";
import {
  TABLE_STRIKES, boardCleared, freshTableBoard, nextPassBoard, passAnswer, passResult, resolveTableTurn, startPass, tableGuess,
  tableSlots, tableTarget, tableWon, turnLine, type PassJudgement,
} from "../src/lib/chatbrain/tableRules";
import { togetherBoardEndLine, togetherFinalLine, togetherQuestionLine, togetherResultLine } from "../src/lib/chatbrain/streamRules";

const board: BoardAnswer[] = [
  { rank: 1, label: "Snacks", points: 38, aliases: ["snacks", "snack", "chips"] },
  { rank: 2, label: "Board games", points: 25, aliases: ["board games", "board game"] },
  { rank: 3, label: "Drinks", points: 17, aliases: ["drinks", "drink", "soda"] },
  { rank: 4, label: "Friends", points: 12, aliases: ["friends", "friend"] },
  { rank: 5, label: "Dice", points: 8, aliases: ["dice"] },
];

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };
let at = 0;
const say = (seat: number, raw: string) => tableGuess(seat, raw, ++at);

test("the room's answer is the biggest group, and a hidden answer banks its points", () => {
  const b = freshTableBoard("b1", "Name something at a game night", board);
  const next = resolveTableTurn(b, [say(0, "chips"), say(1, "Snacks"), say(2, "soda")]);
  assert.deepEqual(next.revealed, [1]);
  assert.equal(next.score, 38);
  assert.equal(next.strikes, 0);
  assert.equal(next.turn, 2);
  assert.equal(next.phase, "playing");
  assert.equal(next.last?.outcome.result, "hit");
  assert.equal(next.last?.room?.count, 2);
  assert.match(turnLine(next.last!), /The room said Snacks \(2 of 3 said it\): number 1, 38 points\./);
});

test("an answer that isn't on the board, or is already up, is a strike", () => {
  let b = freshTableBoard("b1", "Q", board);
  b = resolveTableTurn(b, [say(0, "snacks")]);
  b = resolveTableTurn(b, [say(0, "pizza"), say(1, "pizza")]);
  assert.equal(b.strikes, 1);
  assert.equal(b.last?.outcome.result, "miss");
  assert.match(turnLine(b.last!), /not on the board/);
  b = resolveTableTurn(b, [say(0, "chips")]);
  assert.equal(b.strikes, 2);
  assert.match(turnLine(b.last!), /already up/);
  assert.equal(b.score, 38);
});

test("nobody answering is a strike (the host locked an empty turn)", () => {
  const b = resolveTableTurn(freshTableBoard("b1", "Q", board), []);
  assert.equal(b.strikes, 1);
  assert.equal(b.last?.outcome.result, "empty");
  assert.match(turnLine(b.last!), /Nobody answered/);
});

test("three strikes ends the board and shows every answer", () => {
  let b = freshTableBoard("b1", "Q", board);
  for (let i = 0; i < TABLE_STRIKES; i++) b = resolveTableTurn(b, [say(0, `nope ${i}`)]);
  assert.equal(b.phase, "done");
  assert.equal(b.turn, 3); // the turn number stays on the last turn played
  assert.ok(tableSlots(b).every((s) => s.label !== null));
  assert.ok(tableSlots(b).every((s) => !s.found));
  // A done board ignores more turns.
  assert.equal(resolveTableTurn(b, [say(0, "snacks")]), b);
});

test("clearing the board ends it; labels stay hidden until found while playing", () => {
  let b = freshTableBoard("b1", "Q", board);
  assert.ok(tableSlots(b).every((s) => s.label === null));
  for (const word of ["snacks", "board games", "drinks", "friends"]) b = resolveTableTurn(b, [say(0, word)]);
  assert.equal(b.phase, "playing");
  assert.deepEqual(tableSlots(b).map((s) => s.label), ["Snacks", "Board games", "Drinks", "Friends", null]);
  b = resolveTableTurn(b, [say(0, "dice")]);
  assert.equal(b.phase, "done");
  assert.ok(boardCleared(b));
  assert.equal(b.score, 100);
});

test("ties go to the group whose latest answer came in first", () => {
  at = 0;
  const b = resolveTableTurn(freshTableBoard("b1", "Q", board), [say(0, "dice"), say(1, "friends"), say(2, "dice"), say(3, "friends")]);
  assert.equal(b.last?.outcome.result === "hit" ? b.last.outcome.rank : null, 5);
});

test("the table wins by banking half the points on offer", () => {
  assert.equal(tableTarget(3), 150);
  assert.equal(tableTarget(0), 50);
  assert.ok(tableWon(150, 3));
  assert.ok(!tableWon(149, 3));
});

const hit = (rank: number): PassJudgement => ({ hit: { rank, label: board[rank - 1].label, points: board[rank - 1].points }, already: false });
const miss: PassJudgement = { hit: null, already: false };

test("one phone, the whole table: answers bank as they're found; three strikes ends a board", () => {
  let s = startPass("table", 3, []);
  assert.equal(s.teams[0].name, "The table");
  s = passAnswer(s, hit(1), board.length);
  assert.equal(s.teams[0].score, 38);
  s = passAnswer(s, miss, board.length);
  s = passAnswer(s, { hit: hit(1).hit, already: true }, board.length);
  assert.equal(s.last?.kind, "already");
  assert.equal(s.strikes, 2);
  s = passAnswer(s, miss, board.length);
  assert.equal(s.phase, "board_done");
  assert.equal(s.last?.kind, "strikes");
  assert.equal(passAnswer(s, hit(2), board.length), s); // nothing more on a finished board
  s = nextPassBoard(s);
  assert.equal(s.boardNo, 1);
  assert.equal(s.strikes, 0);
  assert.deepEqual(s.found, []);
});

test("one phone, the whole table: a cleared board, then the result", () => {
  let s = startPass("table", 1, ["Couch"]);
  for (const r of [1, 2, 3, 4, 5]) s = passAnswer(s, hit(r), board.length);
  assert.equal(s.phase, "board_done");
  assert.equal(s.last?.kind, "cleared");
  assert.equal(s.teams[0].score, 100);
  s = nextPassBoard(s);
  assert.equal(s.phase, "done");
  assert.deepEqual(passResult(s), { kind: "table", won: true, total: 100, target: 50 });
});

test("one phone, teams: the team in control builds a pot; three strikes and the other team can steal it", () => {
  let s = startPass("teams", 2, ["Reds", "Blues"]);
  assert.equal(s.control, 0);
  s = passAnswer(s, hit(1), board.length);
  s = passAnswer(s, hit(3), board.length);
  assert.equal(s.pot, 55);
  assert.equal(s.teams[0].score, 0); // not banked yet
  for (let i = 0; i < 3; i++) s = passAnswer(s, miss, board.length);
  assert.equal(s.phase, "steal");
  s = passAnswer(s, hit(2), board.length);
  assert.equal(s.phase, "board_done");
  assert.equal(s.last?.kind, "stole");
  assert.equal(s.teams[1].score, 80); // 55 + 25
  assert.equal(s.teams[0].score, 0);
  s = nextPassBoard(s);
  assert.equal(s.control, 1); // teams take turns leading
  assert.equal(s.pot, 0);
});

test("one phone, teams: a missed steal banks the pot for the team in control", () => {
  let s = startPass("teams", 2, []);
  assert.deepEqual(s.teams.map((t) => t.name), ["Team 1", "Team 2"]);
  s = passAnswer(s, hit(2), board.length);
  for (let i = 0; i < 3; i++) s = passAnswer(s, miss, board.length);
  s = passAnswer(s, { hit: hit(2).hit, already: true }, board.length); // already up: the steal misses
  assert.equal(s.last?.kind, "held");
  assert.equal(s.teams[0].score, 25);
  assert.equal(s.teams[1].score, 0);
});

test("one phone, teams: clearing banks the pot; the winner, or a tie", () => {
  let s = startPass("teams", 2, ["A", "B"]);
  for (const r of [1, 2, 3, 4, 5]) s = passAnswer(s, hit(r), board.length);
  assert.equal(s.last?.kind, "cleared");
  assert.equal(s.teams[0].score, 100);
  s = nextPassBoard(s);
  for (const r of [1, 2, 3, 4, 5]) s = passAnswer(s, hit(r), board.length);
  s = nextPassBoard(s);
  assert.equal(s.phase, "done");
  assert.deepEqual(passResult(s), { kind: "teams", winner: null });
});

test("one phone: board counts fall back to the allowed choices", () => {
  assert.equal(startPass("table", 4, []).boards, 3);
  assert.equal(startPass("teams", 3, []).boards, 2);
  assert.equal(startPass("teams", 4, []).boards, 4);
});

test("co-stream together: both chats named, one team", () => {
  const q = togetherQuestionLine({ index: 0, count: 3, question: "Name a snack", sides: ["Nova", "Marco"], seconds: 30 });
  assert.match(q, /Board 1 of 3: Name a snack/);
  assert.match(q, /Nova's chat and Marco's chat are one team/);
  const hitLine = togetherResultLine({ result: "hit", rank: 2, points: 25, label: "Chips" }, { strikes: 0, score: 25 });
  assert.match(hitLine, /^🧠 Both chats said CHIPS: #2 on the board, 25 points!/);
  assert.match(togetherResultLine({ result: "empty" }, { strikes: 1, score: 0 }), /^🧠 Neither chat answered\. ✖ Strike 1\./);
  const end = togetherBoardEndLine({ cleared: true, strikes: 0, boardPoints: 100, rest: [], last: false });
  assert.match(end, /Both chats found them all/);
  assert.doesNotMatch(end, /!cb next/);
  assert.match(end, /The host moves on to the next board\./);
  assert.doesNotMatch(togetherBoardEndLine({ cleared: false, strikes: 3, boardPoints: 40, rest: [], last: true }), /host moves on/);
  assert.match(togetherFinalLine({ score: 180, boards: 3, sides: ["Nova", "Marco"], top: [{ name: "sam", points: 60, tokens: 50 }] }), /scored 180 points together over 3 boards\. Top brains: sam 60 \(\+50 tokens\)\./);
});

console.log(`\n${passed} passed`);
