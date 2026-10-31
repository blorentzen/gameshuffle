/**
 * Pure tests for Trivia Nights (src/lib/trivia/rules.ts).
 * Run: npx tsx scripts/test-trivia-rules.ts
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { confidenceLeft, distanceFrom, groupAnswers, judgeAnswer, pickForRound, pointsFor, roundCategories, wagerCap, type PoolQuestion, type TriviaQuestion } from "../src/lib/trivia/rules";
import { TRIVIA_PACK } from "../src/data/originals/trivia-pack";

const sm64: TriviaQuestion = {
  prompt: "Which 1996 Nintendo 64 launch game was the first 3D Mario platformer?",
  answer: "Super Mario 64", accept: ["Mario 64", "SM64"], askAbout: ["Mario"], reject: ["Super Mario Sunshine"], kind: "text",
};
const year: TriviaQuestion = { prompt: "In what year did Super Mario Kart first come out in Japan?", answer: "1992", accept: [], askAbout: ["the early 90s"], reject: [], kind: "number" };
const choice: TriviaQuestion = { prompt: "Which of these is a Mario Kart item?", answer: "Blue shell", accept: [], askAbout: [], reject: [], kind: "choice", options: ["Red mushroom", "Blue shell", "Gold flower"] };

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };

test("the answer and its accepted forms are right, typos included", () => {
  for (const raw of ["Super Mario 64", "super mario 64!", "Mario 64", "sm64", "Super Mario 46"]) assert.equal(judgeAnswer(raw, sm64), raw === "Super Mario 46" ? "ask" : "correct", raw);
});

test("reject beats a near miss; ask-about goes to the host; unrelated is wrong", () => {
  assert.equal(judgeAnswer("Super Mario Sunshine", sm64), "wrong");
  assert.equal(judgeAnswer("Mario", sm64), "ask");
  assert.equal(judgeAnswer("Banjo-Kazooie", sm64), "wrong");
  assert.equal(judgeAnswer("", sm64), "wrong");
});

test("numbers match exactly", () => {
  assert.equal(judgeAnswer("1992", year), "correct");
  assert.equal(judgeAnswer("It was 1992", year), "correct");
  assert.equal(judgeAnswer("1993", year), "wrong");
  assert.equal(distanceFrom("1,990", "1992"), 2);
});

test("multiple choice takes the letter or the text", () => {
  assert.equal(judgeAnswer("b", choice), "correct");
  assert.equal(judgeAnswer("Blue shell", choice), "correct");
  assert.equal(judgeAnswer("a", choice), "wrong");
});

test("answers group by spelling, host questions first", () => {
  const groups = groupAnswers([
    { teamId: "1", raw: "Bowser Jr" }, { teamId: "2", raw: "bowser jr." }, { teamId: "3", raw: "Bowser Junior" }, { teamId: "4", raw: "Bowser" },
  ], { prompt: "Who is Bowser's son?", answer: "Bowser Jr.", accept: ["Bowser Junior"], askAbout: [], reject: ["Bowser"], kind: "text" });
  const jr = groups.find((g) => g.teamIds.includes("1"))!;
  assert.deepEqual(jr.teamIds.sort(), ["1", "2"]);
  assert.equal(jr.suggested, "correct");
  assert.equal(groups.find((g) => g.teamIds.includes("4"))!.suggested, "wrong");
});

test("scoring: classic, partial, confidence, joker, final wager", () => {
  assert.equal(pointsFor({ verdict: "correct", style: "classic", points: 1, joker: false }), 1);
  assert.equal(pointsFor({ verdict: "correct", style: "classic", points: 2, joker: true }), 4);
  assert.equal(pointsFor({ verdict: "partial", style: "classic", points: 2, joker: false }), 1);
  assert.equal(pointsFor({ verdict: "correct", style: "confidence", points: 1, confidence: 4, joker: false }), 4);
  assert.equal(pointsFor({ verdict: "wrong", style: "confidence", points: 1, confidence: 4, joker: false }), 0);
  assert.equal(pointsFor({ verdict: "wrong", style: "final", points: 0, wager: 12, joker: false }), -12);
  assert.equal(pointsFor({ verdict: "correct", style: "final", points: 0, wager: 12, joker: true }), 12);
});

test("confidence numbers and the wager cap", () => {
  assert.deepEqual(confidenceLeft(5, [5, 2]), [4, 3, 1]);
  assert.equal(wagerCap(7), 7);
  assert.equal(wagerCap(45), 20);
  assert.equal(wagerCap(-3), 0);
});

test("Roman numerals are never a typo, and an exact answer beats a near reject", () => {
  const ff: TriviaQuestion = { prompt: "Which Final Fantasy introduced Cloud Strife?", answer: "Final Fantasy VII", accept: ["FF7", "FFVII"], askAbout: [], reject: ["Final Fantasy VI"], kind: "text" };
  assert.equal(judgeAnswer("Final Fantasy VII", ff), "correct");
  assert.equal(judgeAnswer("final fantasy vii", ff), "correct");
  assert.notEqual(judgeAnswer("Final Fantasy VIII", ff), "correct");
  assert.equal(judgeAnswer("Final Fantasy VI", ff), "wrong");
  assert.equal(judgeAnswer("Final Fantasy VIl", ff), "ask", "a garbled numeral goes to the host");
});

test("every pack question judges its own answer line correctly", () => {
  const seen = new Set<string>();
  for (const p of TRIVIA_PACK) {
    const q: TriviaQuestion = { prompt: p.prompt, answer: p.answer, accept: p.accept ?? [], askAbout: p.askAbout ?? [], reject: p.reject ?? [], kind: p.kind, options: p.options ?? null };
    const key = `${p.prompt}|${p.imageUrl ?? ""}`;
    assert.ok(!seen.has(key), `duplicate: ${key}`);
    seen.add(key);
    assert.ok(p.prompt.length >= 8 && p.prompt.length <= 300, `prompt length: ${p.prompt}`);
    assert.ok(p.answer.length <= 120 && p.sources.length > 0, `answer/source: ${p.prompt}`);
    if (p.changeable) assert.ok(p.asOf, `changeable needs asOf: ${p.prompt}`);
    assert.equal(judgeAnswer(p.answer, q), "correct", `answer: ${p.prompt}`);
    for (const a of p.accept ?? []) assert.equal(judgeAnswer(a, q), "correct", `accept "${a}": ${p.prompt}`);
    for (const r of p.reject ?? []) assert.equal(judgeAnswer(r, q), "wrong", `reject "${r}": ${p.prompt}`);
    for (const a of p.askAbout ?? []) assert.notEqual(judgeAnswer(a, q), "correct", `askAbout "${a}": ${p.prompt}`);
    if (p.kind === "picture") assert.ok(p.imageUrl && existsSync(`public${p.imageUrl}`), `missing picture: ${p.imageUrl}`);
  }
});

test("filling a round: pictures, categories, finals, no repeats", () => {
  const pool: (PoolQuestion & { prompt: string })[] = TRIVIA_PACK.map((p, i) => ({ id: `q${i}`, category: p.category, difficulty: p.difficulty, kind: p.kind, prompt: p.prompt }));
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const taken = new Set<string>();
  const pics = pickForRound(pool, { title: "Picture round", style: "picture" }, 8, { taken, random });
  assert.equal(pics.length, 8);
  assert.ok(pics.every((q) => q.kind === "picture"));
  assert.equal(new Set(pics.map((q) => q.category)).size, 1, "a picture round sticks to one theme");
  const world = pickForRound(pool, { title: "Around the world", style: "classic" }, 6, { taken, random });
  assert.ok(world.every((q) => q.category === "Geography"), "geography round");
  const general = pickForRound(pool, { title: "Round one", style: "classic" }, 8, { taken, random });
  assert.equal(new Set(general.map((q) => q.category)).size, 8, "a general round takes turns across categories");
  assert.ok(general.every((q) => q.kind !== "picture"));
  const diffs = general.map((q) => q.difficulty);
  assert.ok(diffs.filter((d) => d === "easy").length >= 2 && diffs.filter((d) => d === "medium").length >= 2 && diffs.includes("hard"), `a regular round mixes difficulty: ${diffs.join(",")}`);
  for (const q of general) taken.add(q.id);
  const again = pickForRound(pool, { title: "Round two", style: "classic" }, 8, { taken, random });
  assert.ok(again.every((q) => !taken.has(q.id)), "never repeats a question in the night");
  const final = pickForRound(pool, { title: "Final question", style: "final" }, 1, { taken, random });
  assert.equal(final[0].difficulty, "hard");
  assert.equal(final[0].kind, "number");
  assert.equal(roundCategories({ title: "Pop culture", style: "classic" })?.length, 3);
  const avoid = new Set(pool.filter((q) => q.category === "Geography").slice(0, 10).map((q) => q.id));
  const fresh = pickForRound(pool, { title: "Around the world", style: "classic" }, 3, { taken: new Set(), avoid, random });
  assert.ok(fresh.every((q) => !avoid.has(q.id)), "skips questions asked at earlier nights while others fit");
});

console.log(`\n${TRIVIA_PACK.length} pack questions (${TRIVIA_PACK.filter((p) => p.kind === "picture").length} pictures)`);
console.log(`${passed} passed`);
