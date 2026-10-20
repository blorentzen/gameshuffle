/**
 * Fire Round's pure rules (src/lib/originals/fireRound.ts) and the pack's wrong
 * answers (src/data/originals/trivia-pack-wrong.ts).
 *   npx tsx scripts/test-fire-round.ts
 */

import { TRIVIA_PACK } from "../src/data/originals/trivia-pack";
import { PACK_WRONG } from "../src/data/originals/trivia-pack-wrong";
import { judgeAnswer, type TriviaQuestion } from "../src/lib/trivia/rules";
import { isBlockedText } from "../src/lib/text/filter";
import {
  boardPoints, choiceIsRight, cleanWrong, fireCategory, fireNumber, fourChoices, heatFor, inCategory, inSeason, numberDistractors, pointsFor, rosterDistractors,
  FIRE_CATEGORIES, FIRE_EPOCH, LENGTHS, MIXED,
} from "../src/lib/originals/fireRound";

let pass = 0;
let fail = 0;
function check(ok: boolean, what: string) {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", what); }
}

const asQuestion = (q: (typeof TRIVIA_PACK)[number]): TriviaQuestion => ({
  prompt: q.prompt, answer: q.answer, accept: q.accept ?? [], askAbout: q.askAbout ?? [], reject: q.reject ?? [], kind: q.kind, options: q.options ?? null,
});

// Heat and points.
check(heatFor(0) === 1 && heatFor(2) === 1 && heatFor(3) === 1.5 && heatFor(5) === 1.5 && heatFor(6) === 2 && heatFor(40) === 2, "heat steps");
check(pointsFor(true, false, 0) === 100 && pointsFor(true, true, 0) === 40, "base points");
check(pointsFor(true, false, 3) === 150 && pointsFor(true, true, 6) === 80, "heat multiplies");
check(pointsFor(false, false, 9) === 0, "wrong scores nothing");
check(boardPoints(0) === 0 && boardPoints(1) === 1 && boardPoints(200) === 1 && boardPoints(201) === 2 && boardPoints(5000) === 10, "board points");
check(fireNumber(FIRE_EPOCH) === 1 && fireNumber("2026-10-21") === 2 && fireNumber("2026-10-01") === 0, "round numbers");
check(fireNumber("2026-11-02") === 14, "round numbers across the clock change");
check(LENGTHS.sprint.seconds === 60 && LENGTHS.lives.seconds === null, "lengths");

// Categories.
check(fireCategory("nope").id === MIXED, "unknown category falls back to mixed");
const geo = fireCategory("geography");
check(inCategory(geo, { category: "Geography" }) && !inCategory(geo, { category: "History" }), "pack category match");
check(inCategory(fireCategory("mario-kart"), { category: "Video games", gameSlug: "mario-kart-world" }), "game category match");
check(!inCategory(fireCategory("mario-kart"), { category: "Video games", gameSlug: null }), "game category needs a slug");
check(new Set(FIRE_CATEGORIES.map((c) => c.id)).size === FIRE_CATEGORIES.length, "category ids unique");

// Wrong answers for every word-answer question.
const text = TRIVIA_PACK.filter((q) => q.kind === "text");
const prompts = new Set(text.map((q) => q.prompt));
for (const key of Object.keys(PACK_WRONG)) check(prompts.has(key), `wrong answers for a prompt not in the pack: ${key}`);
for (const q of text) {
  const wrong = PACK_WRONG[q.prompt];
  check(!!wrong, `no wrong answers: ${q.prompt}`);
  if (!wrong) continue;
  const clean = cleanWrong(wrong, q.answer, q.accept ?? []);
  check(clean?.length === 3, `wrong answers overlap the answer or each other: ${q.prompt}`);
  for (const w of wrong) {
    check(judgeAnswer(w, asQuestion(q)) !== "correct", `a wrong answer would count as right: ${q.prompt} → ${w}`);
    check(!isBlockedText(w), `word filter: ${w}`);
    check(w.length <= 40, `long choice: ${w}`);
  }
  const four = fourChoices(q.answer, wrong, q.prompt);
  check(four.length === 4 && four.filter((c) => choiceIsRight(c, q.answer)).length === 1, `four choices hold the answer once: ${q.prompt}`);
  check(fourChoices(q.answer, wrong, q.prompt).join("|") === four.join("|"), `choices stay in the same order: ${q.prompt}`);
}

// Numbers get theirs by rule.
for (const q of TRIVIA_PACK.filter((x) => x.kind === "number")) {
  const d = numberDistractors(q.answer, q.prompt);
  check(d?.length === 3, `number distractors: ${q.prompt} (${q.answer}) → ${d}`);
  if (!d) continue;
  check(new Set(d).size === 3, `number distractors repeat: ${q.prompt} → ${d}`);
  for (const w of d) check(judgeAnswer(w, asQuestion(q)) !== "correct", `a number distractor counts as right: ${q.prompt} → ${w}`);
  check(numberDistractors(q.answer, q.prompt)!.join() === d.join(), `number distractors stable: ${q.prompt}`);
}
check(numberDistractors("Paris", "x") === null, "no number, no distractors");

// Pictures from their roster.
for (const cat of ["Picture: game characters", "Picture: Overwatch heroes"]) {
  const set = TRIVIA_PACK.filter((q) => q.category === cat);
  const roster = set.map((q) => q.answer);
  for (const q of set) {
    const d = rosterDistractors(q.answer, roster, q.prompt + q.imageUrl, q.accept ?? []);
    check(d?.length === 3 && !d.includes(q.answer), `roster distractors: ${q.answer}`);
    for (const w of d ?? []) check(judgeAnswer(w, asQuestion(q)) !== "correct", `a roster distractor counts as right: ${q.answer} → ${w}`);
  }
}

// Seasonal categories: Halloween only in October, and its questions stay out of Mixed the rest of the year.
{
  const hall = fireCategory("halloween");
  const mixed = fireCategory(MIXED);
  check(hall.id === "halloween" && !!hall.season, "Halloween is a seasonal category");
  check(inSeason(hall, "2026-10-01") && inSeason(hall, "2026-10-31") && !inSeason(hall, "2026-09-30") && !inSeason(hall, "2026-11-01"), "Halloween season is October");
  check(inSeason(mixed, "2026-07-04"), "year-round categories are always in season");
  const spooky = TRIVIA_PACK.filter((q) => q.category === "Halloween");
  check(spooky.length === 100, `Halloween pack has 100 questions (${spooky.length})`);
  const qx = { category: "Halloween", gameSlug: null };
  check(inCategory(hall, qx) && inCategory(mixed, qx, "2026-10-20") && !inCategory(mixed, qx, "2026-07-04"), "Halloween questions in Mixed only in October");
  check(inCategory(mixed, { category: "Geography", gameSlug: null }, "2026-07-04"), "year-round questions stay in Mixed");
  check(inCategory(mixed, qx), "without a day, Mixed takes everything (admin counts)");
  const xmas = fireCategory("christmas");
  const qc = { category: "Christmas", gameSlug: null };
  check(xmas.id === "christmas" && inSeason(xmas, "2026-12-01") && inSeason(xmas, "2026-12-31") && !inSeason(xmas, "2026-11-30"), "Christmas season is December");
  check(TRIVIA_PACK.filter((q) => q.category === "Christmas").length === 100, "Christmas pack has 100 questions");
  check(inCategory(mixed, qc, "2026-12-10") && !inCategory(mixed, qc, "2026-10-20") && !inCategory(mixed, qx, "2026-12-10"), "each holiday only in its own month");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
