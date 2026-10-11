/**
 * Pure tests for Chat Brain on stream (src/lib/chatbrain/streamRules.ts).
 * Run: npx tsx scripts/test-chatbrain-stream.ts
 */
import assert from "node:assert/strict";
import { normalize, type BoardAnswer } from "../src/lib/chatbrain/rules";
import {
  advisorMoment, answerLine, boardOver, chatAnswer, cleanSides, faceoffWinner, lastStealOpen, leaning, onClock, outcomeFor,
  playAlongAwards, playerOutcome, resultLine, roundEndLine, roundMultiplier, sameAnswer, versusFinalLine, type StreamGuess,
} from "../src/lib/chatbrain/streamRules";
import {
  EMPTY_SURVEY_STATE, aiPassDue, boardBlocker, parseAsk, shownGroups, surveyGroups, surveyStateOf, withHidden, withMerge,
  SURVEY_LIVE_AI_PASSES, type SurveyAnswer,
} from "../src/lib/chatbrain/surveyRules";
import { buildBoard } from "../src/lib/chatbrain/rules";

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

// ─── 1v1 and Teams ───────────────────────────────────────────────────────────

test("a side's answer: typos and aliases hit, repeats and blanks don't", () => {
  assert.deepEqual(playerOutcome("chips", board, []), { result: "hit", rank: 1, points: 38, label: "Snacks" });
  assert.deepEqual(playerOutcome("bord games", board, []), { result: "hit", rank: 2, points: 25, label: "Board games" });
  const again = playerOutcome("snack", board, [1]);
  assert.equal(again.result === "miss" && again.reason, "already");
  assert.deepEqual(playerOutcome("  pizza  ", board, []), { result: "miss", reason: "not_on_board", label: "pizza" });
  assert.deepEqual(playerOutcome("?!", board, []), { result: "empty" });
});

test("face-off: the top answer wins outright, otherwise the higher answer wins", () => {
  const top = playerOutcome("snacks", board, []);
  const third = playerOutcome("drinks", board, []);
  const second = playerOutcome("board games", board, [3]);
  const miss = playerOutcome("pizza", board, []);
  assert.equal(faceoffWinner(top, null, 1), "first");
  assert.equal(faceoffWinner(third, null, 1), "wait");
  assert.equal(faceoffWinner(third, second, 1), "second");
  assert.equal(faceoffWinner(second, third, 1), "first");
  assert.equal(faceoffWinner(miss, third, 1), "second");
  assert.equal(faceoffWinner(third, miss, 1), "first");
  assert.equal(faceoffWinner(miss, miss, 1), "again");
  // Once #1 is gone, #2 is the top answer.
  assert.equal(faceoffWinner(playerOutcome("board games", board, [1]), null, 2), "first");
});

test("trust chat comes up on a final guess or a steal, and only when the answers differ", () => {
  assert.equal(advisorMoment("guess", 2), true);
  assert.equal(advisorMoment("guess", 1), false);
  assert.equal(advisorMoment("steal", 0), true);
  assert.equal(advisorMoment("faceoff", 2), false);
  const chat = chatAnswer([g("a", "chips"), g("b", "snacks")], board)!;
  assert.equal(sameAnswer("snack", chat, board), true);
  assert.equal(sameAnswer("drinks", chat, board), false);
  const offBoard = chatAnswer([g("a", "pizza"), g("b", "pizza")], board)!;
  assert.equal(sameAnswer("Pizzas", offBoard, board), true);
  assert.equal(sameAnswer("tacos", offBoard, board), false);
});

test("chat's last steal: only after a missed steal that didn't use chat's answer", () => {
  assert.equal(lastStealOpen({ enabled: true, stealHit: false, trusted: null }), true);
  assert.equal(lastStealOpen({ enabled: true, stealHit: false, trusted: "side" }), true);
  assert.equal(lastStealOpen({ enabled: true, stealHit: false, trusted: "chat" }), false);
  assert.equal(lastStealOpen({ enabled: true, stealHit: true, trusted: null }), false);
  assert.equal(lastStealOpen({ enabled: false, stealHit: false, trusted: null }), false);
});

test("the last round of a longer game is worth double", () => {
  assert.equal(roundMultiplier(3, 4), 2);
  assert.equal(roundMultiplier(2, 4), 1);
  assert.equal(roundMultiplier(0, 1), 1);
});

test("players take turns", () => {
  assert.equal(onClock(["Sam", "Riley", "Kai"], 0), "Sam");
  assert.equal(onClock(["Sam", "Riley", "Kai"], 4), "Riley");
  assert.equal(onClock([], 2), null);
});

test("sides: 1v1 names a side after its player, Teams need 2 to 5 players", () => {
  const v = cleanSides("versus", [{ name: "", members: ["  Nova "] }, { name: "", members: ["Marco"] }]);
  assert.ok(v.ok && v.sides[0].name === "Nova" && v.sides[1].members.join() === "Marco");
  const t = cleanSides("teams", [{ name: "Blue", members: ["A", "B", "a"] }, { name: "", members: ["C", "D"] }]);
  assert.ok(t.ok && t.sides[1].name === "Team 2" && t.sides[0].members.length === 3);
  assert.deepEqual(cleanSides("teams", [{ name: "Blue", members: ["A"] }, { name: "Red", members: ["C", "D"] }]), { ok: false, error: "team_size" });
  assert.deepEqual(cleanSides("versus", [{ name: "Nova", members: [] }, { name: "nova", members: [] }]), { ok: false, error: "same_names" });
  assert.deepEqual(cleanSides("versus", [{ name: "", members: [] }, { name: "Marco", members: [] }]), { ok: false, error: "bad_sides" });
});

test("chat lines stay short and say what happened", () => {
  assert.match(answerLine("Blue", playerOutcome("chips", board, []), "Red, can you beat it?"), /Blue says SNACKS: #1 on the board! Red, can you beat it\?/);
  const end = roundEndLine({
    winner: "Red", reason: "stole", points: 76, double: true, rest: [board[4]], last: false,
    scores: [{ name: "Blue", score: 0 }, { name: "Red", score: 76 }],
    advice: [{ side: "Red", trusted: "chat", chatLabel: "Drinks", chatHit: true, chatRank: 3 }],
  });
  assert.match(end, /Red steals it for 76 points \(doubled\)!/);
  assert.match(end, /chat said DRINKS \(#3\)/);
  assert.match(end, /The rest: #5 Dice/);
  assert.ok(end.length <= 480);
  assert.match(versusFinalLine({ sides: [{ name: "Blue", score: 90 }, { name: "Red", score: 120 }], chatScore: 0, chatRight: { right: 1, asked: 2 }, top: [] }), /Red wins, 120 to 90! Chat was right 1 of 2 times/);
  assert.match(versusFinalLine({ sides: [{ name: "Blue", score: 50 }, { name: "Red", score: 50 }], chatScore: 30, chatRight: { right: 0, asked: 0 }, top: [] }), /tie at 50! Chat stole 30 points/);
});

// ─── survey rounds ───────────────────────────────────────────────────────────

const ans = (...raws: string[]): SurveyAnswer[] => raws.map((raw) => ({ raw, normalized: normalize(raw) }));
const snackRound = ans("pizza", "Pizza", "pizzas", "piza", "chips", "chips", "Doritos", "snacks", "snacks", "snacks", "soda", "soda", "pop", "candy");

test("survey groups: spelling first, biggest first", () => {
  const groups = surveyGroups(snackRound, EMPTY_SURVEY_STATE);
  assert.equal(groups[0].label.toLowerCase(), "pizza");
  assert.equal(groups[0].count, 4);
  assert.ok(groups[0].keys.includes("piza"));
});

test("survey groups: the AI pass folds meanings and names the group", () => {
  const state = { ...EMPTY_SURVEY_STATE, ai: { groups: [{ label: "Snacks", keys: ["snack", "chip", "dorito"] }, { label: "Soda", keys: ["soda", "pop"] }], passes: 1, at: new Date().toISOString(), distinct: 8 } };
  const groups = surveyGroups(snackRound, state);
  const snacks = groups.find((g) => g.label === "Snacks")!;
  assert.equal(snacks.count, 6);
  assert.equal(groups.find((g) => g.label === "Soda")!.count, 3);
  assert.equal(groups[0].label, "Snacks");
});

test("survey groups: hides stick to new spellings, merges fold groups", () => {
  let state = EMPTY_SURVEY_STATE;
  const first = surveyGroups(snackRound, state);
  state = withHidden(state, first.find((g) => g.label.toLowerCase() === "pizza")!, true);
  const later = surveyGroups([...snackRound, ...ans("pizzza", "Pizza!")], state);
  const pizza = later.find((g) => g.keys.includes("pizza"))!;
  assert.equal(pizza.hidden, true);
  assert.equal(pizza.count, 6);
  const soda = later.find((g) => g.keys.includes("soda"))!;
  const pop = later.find((g) => g.keys.includes("pop"))!;
  state = withMerge(state, soda, [pop]);
  assert.equal(surveyGroups(snackRound, state).find((g) => g.keys.includes("soda"))!.count, 3);
  state = withHidden(state, pizza, false);
  assert.equal(surveyGroups(snackRound, state).find((g) => g.keys.includes("pizza"))!.hidden, false);
});

test("survey groups on stream: 2+ people, not hidden, numbered from 1", () => {
  const groups = surveyGroups(snackRound, EMPTY_SURVEY_STATE);
  const shown = shownGroups(groups, snackRound.length);
  assert.deepEqual(shown.map((g) => g.n), shown.map((_, i) => i + 1));
  assert.ok(shown.every((g) => g.count >= 2));
  assert.ok(!shown.some((g) => g.keys.includes("candy")));
  const hidden = withHidden(EMPTY_SURVEY_STATE, groups[0], true);
  assert.ok(!shownGroups(surveyGroups(snackRound, hidden), snackRound.length).some((g) => g.key === groups[0].key));
});

test("survey AI passes: live rounds only, every 10s with new answers, up to the cap", () => {
  const now = Date.now();
  assert.equal(aiPassDue(EMPTY_SURVEY_STATE, 5, now), true);
  assert.equal(aiPassDue({ ...EMPTY_SURVEY_STATE, style: "hidden" }, 5, now), false);
  assert.equal(aiPassDue(EMPTY_SURVEY_STATE, 2, now), false);
  const recent = { ...EMPTY_SURVEY_STATE, ai: { groups: [], passes: 1, at: new Date(now - 4000).toISOString(), distinct: 5 } };
  assert.equal(aiPassDue(recent, 9, now), false);
  const older = { ...recent, ai: { ...recent.ai, at: new Date(now - 11000).toISOString() } };
  assert.equal(aiPassDue(older, 9, now), true);
  assert.equal(aiPassDue(older, 5, now), false);
  assert.equal(aiPassDue({ ...older, ai: { ...older.ai, passes: SURVEY_LIVE_AI_PASSES } }, 9, now), false);
});

test("a survey makes a board with 10+ answers and 3 groups", () => {
  const groups = surveyGroups(snackRound, EMPTY_SURVEY_STATE);
  const b = buildBoard(groups.map((g) => ({ label: g.label, count: g.count, aliases: g.keys, hidden: g.hidden })), snackRound.length);
  assert.equal(boardBlocker(snackRound.length, b), null);
  assert.equal(boardBlocker(8, b), "few_answers");
  assert.equal(boardBlocker(30, []), "few_groups");
});

test("!cb ask reads seconds and hidden in either order", () => {
  assert.deepEqual(parseAsk("90 hidden What do you eat while gaming?"), { seconds: 90, style: "hidden", rest: "What do you eat while gaming?" });
  assert.deepEqual(parseAsk("secret 45 food"), { seconds: 45, style: "hidden", rest: "food" });
  assert.deepEqual(parseAsk("What is the best Mario Kart track?"), { seconds: null, style: null, rest: "What is the best Mario Kart track?" });
  assert.equal(surveyStateOf({ style: "hidden", hidden: ["x"], merges: "bad" }).merges.length, 0);
});

console.log(`\n${passed} passed`);
