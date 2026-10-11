/**
 * Pure tests for Chat Brain on stream (src/lib/chatbrain/streamRules.ts).
 * Run: npx tsx scripts/test-chatbrain-stream.ts
 */
import assert from "node:assert/strict";
import { normalize, type BoardAnswer } from "../src/lib/chatbrain/rules";
import { boardOver, chatAnswer, leaning, outcomeFor, playAlongAwards, resultLine, type StreamGuess } from "../src/lib/chatbrain/streamRules";

const board: BoardAnswer[] = [
  { rank: 1, label: "Snacks", points: 38, aliases: ["snacks", "snack", "chips"] },
  { rank: 2, label: "Board games", points: 25, aliases: ["board games", "board game"] },
  { rank: 3, label: "Drinks", points: 17, aliases: ["drinks", "drink", "soda"] },
  { rank: 4, label: "Friends", points: 12, aliases: ["friends", "friend"] },
  { rank: 5, label: "Dice", points: 8, aliases: ["dice"] },
];

let t = 0;
const g = (viewer: string, raw: string): StreamGuess => ({ viewer: `twitch:${viewer}`, name: viewer, raw, normalized: normalize(raw), at: ++t });

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };

test("chat's answer is the biggest group, aliases and typos folded into the board answer", () => {
  const a = chatAnswer([g("a", "chips"), g("b", "Snacks"), g("c", "snaks"), g("d", "drinks"), g("e", "soda")], board);
  assert.equal(a?.rank, 1);
  assert.equal(a?.label, "Snacks");
  assert.equal(a?.count, 3);
  assert.equal(a?.total, 5);
});

test("ties go to the group whose latest guess came in first", () => {
  t = 0;
  const a = chatAnswer([g("a", "dice"), g("b", "friends"), g("c", "dice"), g("d", "friends")], board);
  assert.equal(a?.rank, 5); // dice's last guess (t=3) beat friends' (t=4)
});

test("off-board answers group by spelling and count as a miss", () => {
  const a = chatAnswer([g("a", "pizza"), g("b", "Pizza"), g("c", "pizzza"), g("d", "drinks")], board);
  assert.equal(a?.rank, null);
  assert.equal(a?.label.toLowerCase(), "pizza");
  assert.deepEqual(outcomeFor(a, board, []), { result: "miss", reason: "not_on_board", label: a!.label });
});

test("an answer that's already up is a strike", () => {
  const a = chatAnswer([g("a", "snacks")], board);
  const o = outcomeFor(a, board, [1]);
  assert.equal(o.result, "miss");
  assert.equal(o.result === "miss" && o.reason, "already");
});

test("an empty window is a strike", () => {
  assert.equal(chatAnswer([], board), null);
  assert.deepEqual(outcomeFor(null, board, []), { result: "empty" });
});

test("a hit banks the answer's points", () => {
  const o = outcomeFor(chatAnswer([g("a", "board game")], board), board, []);
  assert.deepEqual(o, { result: "hit", rank: 2, points: 25, label: "Board games" });
  assert.match(resultLine(o, { strikes: 0, score: 25 }), /BOARD GAMES: #2 on the board, 25 points/);
});

test("the board ends on three strikes or when everything is found", () => {
  assert.equal(boardOver(board, [1, 2], 2), false);
  assert.equal(boardOver(board, [1, 2], 3), true);
  assert.equal(boardOver(board, [1, 2, 3, 4, 5], 0), true);
});

test("leaning only shows groups of two or more", () => {
  const l = leaning([g("a", "snacks"), g("b", "chips"), g("c", "dice"), g("d", "pizza"), g("e", "pizza")], board);
  assert.equal(l.length, 2);
  assert.equal(l[0].label, "Snacks");
  assert.equal(l[1].label.toLowerCase(), "pizza");
  assert.ok(l.every((x) => x.count >= 2));
});

test("play along: each viewer scores hidden answers, once per answer per board", () => {
  const guesses = [g("a", "dice"), g("b", "snacks"), g("c", "pizza"), g("d", "friends")];
  // Snacks was already revealed when the window opened; d already earned friends earlier.
  const earned = new Map([["twitch:d", new Set([4])]]);
  const awards = playAlongAwards(guesses, board, [2, 3, 4, 5], earned);
  assert.deepEqual([...awards.keys()].sort(), ["twitch:a"]);
  assert.equal(awards.get("twitch:a")?.points, 8);
});

console.log(`\n${passed} passed`);
