// The road's tools (picks 2026-10-25): each tool in the engine, the cap, the view, and the rules in tools.ts.
// npx tsx scripts/test-road-tools.ts
import { makeSetup } from "../src/lib/originals/duel/solver";
import { applyStep, damageOf, isLegal, replay, startState, toolTargets, viewOf, type DuelSetup, type DuelState } from "../src/lib/originals/duel/engine";
import { BADGE_TOOLS, TOOLS, TOOL_IDS, badgeTools, leagueTools, patchAmount, powerAmount, regionTools, rewardTool, shelfFor } from "../src/lib/originals/duel/tools";
import { stepOf } from "../src/lib/originals/duel/steps";
import type { DuelCard, DuelStep, DuelTrainer, EnergyType } from "../src/lib/originals/duel/types";

let pass = 0, fail = 0;
const ok = (c: unknown, msg: string) => { if (c) pass++; else { fail++; console.log("FAIL", msg); } };

const card = (id: string, t: EnergyType, hp: number, moves: DuelCard["moves"], weak: EnergyType | null = null): DuelCard => ({ id, name: id, short: id, t, hp, weak, ex: false, moves, img: null });
const cards: Record<string, DuelCard> = {
  a: card("a", "Fire", 90, [{ n: "Ember", cost: ["Fire"], d: 30 }, { n: "Flare", cost: ["Fire", "Fire"], d: 60 }]),
  b: card("b", "Water", 120, [{ n: "Splash", cost: ["Water"], d: 20 }, { n: "Surf", cost: ["Water", "Colorless"], d: 60 }]),
  c: card("c", "Grass", 60, [{ n: "Vine", cost: ["Grass"], d: 30 }]),
  f1: card("f1", "Fighting", 200, [{ n: "Punch", cost: ["Fighting"], d: 40 }]),
  f2: card("f2", "Fighting", 200, [{ n: "Kick", cost: ["Fighting"], d: 40 }]),
};
const trainer: DuelTrainer = { id: "t", name: "Trainer", title: "x", game: "g", tier: "gym", team: ["f1", "f2"], signature: { title: "x", effect: "boost30" } };
const row: EnergyType[] = Array.from({ length: 40 }, (_, i) => (["Fire", "Water", "Grass"] as EnergyType[])[i % 3]);

/** A rules 6 setup (hand, comeback), three cards, with `tools`. */
const setupOf = (tools: number): DuelSetup => {
  const s = makeSetup(cards, trainer, ["a", "b", "c"], row, [], { rules: 6, seed: "tools" })!;
  s.tools = tools;
  return s;
};
const lead = (setup: DuelSetup): DuelState => {
  let s = startState(setup);
  if (setup.bring) s = applyStep(setup, s, { bring: [0, 1, 2] })!;
  return applyStep(setup, s, { next: 0 })!;
};
const tool = (setup: DuelSetup, s: DuelState, st: DuelStep) => applyStep(setup, s, st);

// No tools in a duel that allows none (the Daily Duel's Hard, the solver).
{
  const setup = setupOf(0);
  const s = lead(setup);
  ok(tool(setup, s, { tool: "look" }) === null, "a duel with no tools refuses one");
  ok(viewOf(setup, s, { name: "T", signature: trainer.signature }).tools === null, "no tools part in the view");
}

// Patch Up: heals 50 on a damaged card; refused at full HP.
{
  const setup = setupOf(2);
  let s = lead(setup);
  ok(toolTargets(setup, s, "patch").cards.length === 0, "nothing to patch at full HP");
  ok(tool(setup, s, { tool: "patch" }) === null, "Patch Up refused at full HP");
  s = applyStep(setup, s, { attach: 0, act: { wait: true }, use: 0 })!;
  const hurt = s.you[0].cur;
  ok(hurt < 90, "the trainer hit your card");
  const t = tool(setup, s, { tool: "patch", card: 0 })!;
  ok(t && t.you[0].cur === Math.min(90, hurt + 50) && patchAmount() === 50, "Patch Up heals 50");
  ok(t.turn === s.turn && t.pending !== null, "the turn goes on after a tool");
  ok(t.used?.length === 1 && t.log.at(-1)?.kind === "tool" && /Patch Up/.test(t.log.at(-1)!.text), "the tool is counted and logged");
}

// The cap: one a duel unless the duel allows more.
{
  const setup = setupOf(1);
  let s = lead(setup);
  s = tool(setup, s, { tool: "look" })!;
  ok(s && toolTargets(setup, s, "power").cards.length === 0, "one tool used: no more");
  ok(tool(setup, s, { tool: "power" }) === null, "the second tool is refused");
  const two = setupOf(2);
  let u = lead(two);
  u = tool(two, u, { tool: "look" })!;
  u = tool(two, u, { tool: "power" })!;
  ok(u && u.used?.length === 2, "two tools where the duel allows two");
  ok(tool(two, u, { tool: "spare", type: u.hand![0] }) === null, "a third is refused");
  ok(u.log.filter((l) => l.kind === "tool").length === 2, "both tools stay in the turn's log");
}

// Power Up: +30 on this turn's attack only.
{
  const setup = setupOf(1);
  let s = lead(setup);
  // Give the Fire card a Fire so Ember is paid.
  s = applyStep(setup, s, { attach: 0, act: { wait: true }, use: s.hand!.indexOf("Fire") })!;
  const base = damageOf(s, cards.a, cards.f1, cards.a.moves[0], true);
  const p = tool(setup, s, { tool: "power" })!;
  ok(damageOf(p, cards.a, cards.f1, cards.a.moves[0], true) === base + 30, "Power Up adds 30");
  const view = viewOf(setup, p, { name: "T", signature: trainer.signature });
  ok(view.tools?.power === 30 && view.you[0].moves[0].damage === base + 30, "the view shows the boosted damage");
  const before = p.foe[p.fi].cur;
  const after = applyStep(setup, p, { attach: 0, act: { move: 0 }, use: 0 })!;
  ok(before - (after.foe[0].out ? 0 : after.foe[0].cur) === base + 30, "the attack lands with the boost");
  ok(!after.fx.power, "the boost is gone after the attack");
  ok(after.log[0]?.kind === "tool", "the turn's log starts with the tool line");
  ok(powerAmount() === 30, "Power Up adds a flat 30");
}

// Quick Switch: swaps in a waiting card that still acts; cures the one leaving.
{
  const setup = setupOf(1);
  const s = lead(setup);
  s.you[0].cond = { k: "poisoned", n: 1 };
  const t = tool(setup, s, { tool: "switch", card: 1 })!;
  ok(t && t.yi === 1 && !t.you[0].cond, "Quick Switch brings in the card and cures the one leaving");
  ok(isLegal(setup, t, { attach: 1, act: { move: 0 }, use: t.hand!.indexOf("Water") }), "the new card can attack this turn");
  ok(tool(setup, s, { tool: "switch", card: 0 }) === null, "can't switch in the card already on the field");
}

// Cure All: only with a condition.
{
  const setup = setupOf(1);
  const s = lead(setup);
  ok(tool(setup, s, { tool: "cure" }) === null, "nothing to cure");
  s.you[0].conf = 2;
  s.you[0].cond = { k: "asleep", n: 2 };
  const t = tool(setup, s, { tool: "cure" })!;
  ok(t && !t.you[0].cond && !t.you[0].conf, "Cure All clears Asleep and Confused");
  ok(isLegal(setup, t, { attach: 0, act: { wait: true }, use: 0 }), "the turn goes on");
}

// Spare Energy: a second Energy from the hand (the hand draws again); a type you don't hold is refused.
{
  const setup = setupOf(1);
  const s = lead(setup);
  const hand = s.hand!.slice();
  const missing = (["Fire", "Water", "Grass", "Lightning"] as EnergyType[]).find((t) => !hand.includes(t))!;
  ok(tool(setup, s, { tool: "spare", card: 0, type: missing }) === null, "a type not in the hand is refused");
  ok(tool(setup, s, { tool: "spare", card: 0 }) === null, "Spare Energy needs a type");
  const t = tool(setup, s, { tool: "spare", card: 0, type: hand[1] })!;
  ok(t.you[0].energy.length === 1 && t.you[0].energy[0] === hand[1], "the Energy goes on");
  ok(t.hand!.length === 3 && t.drawn === (s.drawn ?? 0) + 1, "the hand draws the next");
  const u = applyStep(setup, t, { attach: 0, act: { wait: true }, use: 0 })!;
  ok(u.you[0].energy.length === 2, "the turn's own Energy still goes on");
}

// Look Ahead: six Energy and the event after next for three turns.
{
  const setup = setupOf(1);
  setup.events = [{ turn: 3, kind: "potion" }];
  const s = lead(setup);
  const v0 = viewOf(setup, s, { name: "T", signature: trainer.signature });
  ok(v0.energy.next.length === 3 && !v0.later, "three ahead without it");
  const t = tool(setup, s, { tool: "look" })!;
  const v1 = viewOf(setup, t, { name: "T", signature: trainer.signature });
  ok(v1.energy.next.length === 6 && v1.later?.kind === "potion", "six ahead and the event two turns on");
  let u = applyStep(setup, t, { attach: 0, act: { wait: true }, use: 0 })!;
  u = applyStep(setup, u, { attach: 0, act: { wait: true }, use: 0 })!;
  ok(viewOf(setup, u, { name: "T", signature: trainer.signature }).energy.next.length === 6, "still six on the third turn");
  u = applyStep(setup, u, { attach: u.yi, act: { wait: true }, use: 0 })!;
  if (u.yi < 0 || u.you[u.yi].out) u = applyStep(setup, u, { next: 1 })!;
  ok(u.turn === 4 && viewOf(setup, u, { name: "T", signature: trainer.signature }).energy.next.length === 3, "back to three after three turns");
}

// Second Wind: back with half HP, no Energy; only a knocked-out card.
{
  const setup = setupOf(1);
  const s = lead(setup);
  ok(tool(setup, s, { tool: "wind" }) === null, "nothing knocked out");
  s.you[2].out = true;
  s.you[2].cur = 0;
  const t = tool(setup, s, { tool: "wind", card: 2 })!;
  ok(t && !t.you[2].out && t.you[2].cur === 30 && t.you[2].energy.length === 0, "the card comes back with half its HP");
  ok(tool(setup, s, { tool: "wind", card: 1 }) === null, "a standing card can't be brought back");
}

// Replays: tool steps replay the same, and a step line keeps working.
{
  const setup = setupOf(2);
  const line: DuelStep[] = [{ bring: [0, 1, 2] }, { next: 0 }, { tool: "look" }, { attach: 0, act: { wait: true }, use: 0 }, { tool: "patch", card: 0 }, { attach: 0, act: { wait: true }, use: 0 }];
  const a = replay(setup.bring ? setup : { ...setup }, setup.bring ? line : line.slice(1));
  const b = replay(setup.bring ? setup : { ...setup }, setup.bring ? line : line.slice(1));
  ok(a && b && JSON.stringify(a) === JSON.stringify(b), "a line with tools replays the same");
}

// The request parser.
ok(JSON.stringify(stepOf({ tool: "spare", card: 1, type: "Water" })) === JSON.stringify({ tool: "spare", card: 1, type: "Water" }), "stepOf reads a tool step");
ok(stepOf({ tool: "hammer" }) === null && stepOf({ tool: "patch", card: 9 }) === null && stepOf({ tool: "spare", type: "Ice" }) === null, "stepOf refuses a bad tool, card or type");

// tools.ts: shelves, rewards.
ok(TOOL_IDS.every((t) => TOOLS[t].price > 0 && TOOLS[t].name && TOOLS[t].card), "every tool has a name, a card and a price");
ok(JSON.stringify(shelfFor("kanto", 0, false)) === JSON.stringify(["patch", "look"]), "Kanto's shelf starts with Patch Up and Look Ahead");
ok(shelfFor("kanto", 1, false).includes("cure") && !shelfFor("kanto", 1, false).includes("switch"), "Brock's badge opens Cure All");
ok(shelfFor("kanto", 5, false).length === 7, "Koga's badge opens the last");
ok(shelfFor("johto", 0, false).length === 7 && shelfFor("kanto", 2, true).length === 7, "everything after Kanto, or once cleared");
ok(badgeTools("kanto", 0)[0] === "cure" && badgeTools("kanto", 4)[0] === "wind" && BADGE_TOOLS.kanto.length === 5, "Brock gives Cure All, Koga Second Wind");
ok(badgeTools("kanto", 6)[0] === rewardTool("badge:kanto:6"), "later badges give from the rotation");
ok(leagueTools("kanto").length === 2 && regionTools("kanto").length === 3, "two with the League, three with a region");
ok(rewardTool("x") === rewardTool("x"), "the same reward gives the same tool");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
