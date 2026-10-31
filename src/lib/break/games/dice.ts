/**
 * The luck games: dice and numbers, nothing to know, everyone can win.
 *
 *   High Roller    type "roll", everyone gets two dice, highest three totals score
 *   Lucky Number   pick 1 to 100, closest to the roll scores
 *   Over or Under  call two dice before they roll: over 7, under 7, or exactly 7
 *
 * The roll happens when the window closes (the server's random numbers), so a
 * late typer can't see the result first.
 */

import { randomInt } from "node:crypto";
import type { BreakGame, BreakAnswer } from "./common";
import { chatLine, closestAwards, count, nameOf, rightAwards, tally } from "./common";

const die = () => randomInt(1, 7);

export const highRoller: BreakGame = {
  id: "high-roller",
  make: () => ({
    key: null,
    round: { layout: "dice", prompt: "Everyone rolls two dice. Highest roll wins.", hint: "Type roll" },
    secret: {},
  }),
  accept: (text) => (/^!?roll\.?$/i.test(text.trim()) ? "roll" : null),
  judge: (_draft, answers) => {
    const rolls = answers.map((a) => ({ a, dice: [die(), die()] })).map((r) => ({ ...r, total: r.dice[0] + r.dice[1] }));
    rolls.sort((p, q) => q.total - p.total);
    const totals = [...new Set(rolls.map((r) => r.total))].slice(0, 3);
    const awards = rolls
      .filter((r) => totals.includes(r.total))
      .map((r) => ({ platform: r.a.platform, viewer: r.a.viewer, name: r.a.name, points: 3 - totals.indexOf(r.total) }));
    const top = rolls.filter((r) => r.total === totals[0]);
    const winners = rolls.filter((r) => totals.includes(r.total)).slice(0, 5).map((r) => ({ name: nameOf(r.a), detail: String(r.total), points: 3 - totals.indexOf(r.total) }));
    const text = rolls.length
      ? `${top.map((r) => nameOf(r.a)).slice(0, 3).join(", ")} rolled ${totals[0]}${top.length > 1 ? " (a tie)" : ""}.`
      : "Nobody rolled.";
    return {
      awards,
      reveal: { text, answered: rolls.length, right: top.length, rolls: rolls.slice(0, 10).map((r) => ({ name: nameOf(r.a), dice: r.dice })), winners },
      line: rolls.length ? chatLine(`High Roller: ${text} ${rolls.length} rolled.`) : null,
    };
  },
};

export const luckyNumber: BreakGame = {
  id: "lucky-number",
  make: () => ({
    key: null,
    round: { layout: "number", prompt: "Pick a number from 1 to 100. Closest to the roll wins.", hint: "Type a number", min: 1, max: 100 },
    secret: {},
  }),
  accept: (text) => {
    const m = text.trim().match(/^(\d{1,3})$/);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= 100 ? String(n) : null;
  },
  judge: (_draft, answers: BreakAnswer[]) => {
    const roll = randomInt(1, 101);
    const { awards, winners } = closestAwards(answers, roll, 2);
    const exact = answers.filter((a) => Number(a.answer) === roll).length;
    return {
      awards,
      reveal: { text: `The roll: ${roll}.`, number: roll, answered: answers.length, right: exact, winners },
      line: chatLine(`Lucky Number: ${roll}. ${winners.length ? `Closest: ${winners.slice(0, 3).map((w) => `${w.name} (${w.detail})`).join(", ")}.` : "Nobody picked."}`),
    };
  },
};

const OU_OPTIONS = [
  { key: "under", label: "Under 7" },
  { key: "7", label: "Exactly 7" },
  { key: "over", label: "Over 7" },
];

export const overUnder: BreakGame = {
  id: "over-under",
  make: () => ({
    key: null,
    round: { layout: "dice", prompt: "Two dice are about to roll. Over 7, under 7, or exactly 7?", hint: "Type over, under or 7", options: OU_OPTIONS },
    secret: {},
  }),
  accept: (text) => {
    const t = text.trim().toLowerCase().replace(/[.!]$/, "");
    if (t === "over" || t === "o") return "over";
    if (t === "under" || t === "u") return "under";
    if (t === "7" || t === "seven") return "7";
    return null;
  },
  judge: (_draft, answers) => {
    const dice = [die(), die()];
    const sum = dice[0] + dice[1];
    const correct = sum > 7 ? "over" : sum < 7 ? "under" : "7";
    const counts = count(answers);
    const right = counts[correct] ?? 0;
    const label = correct === "7" ? "Exactly 7" : correct === "over" ? "Over 7" : "Under 7";
    return {
      awards: rightAwards(answers, new Set([correct]), correct === "7" ? 4 : 1),
      reveal: { text: `${dice[0]} + ${dice[1]} = ${sum}. ${label}!`, dice, correct: [correct], counts, answered: answers.length, right },
      line: chatLine(`Over or Under: ${dice[0]} + ${dice[1]} = ${sum}, ${label.toLowerCase()}. ${tally(right, answers.length)}.`),
    };
  },
};
