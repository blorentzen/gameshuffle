/**
 * Shuffle Dice: Chat vs the House. The GameShuffle Original's push-your-luck
 * dice (src/lib/originals/shuffleDice.ts: Stars 3, Coins 1, every third
 * Mushroom +5, Shells steal a point from the leader, three Bombs bust the
 * turn), played by chat as one team against the house.
 *
 * For a crowd it's one call a round: every scoring die is kept for chat, so
 * the question is only "roll again or bank?". The most votes decides (a tie or
 * no votes banks, the safe call). After chat banks or busts, the house plays
 * its turn on its own (it banks at 8 or with two Bombs out). First to 25 wins,
 * or the leader after 12 calls.
 *
 * Points: everyone who voted on a call scores 1; when chat wins the match,
 * the voters on the winning call get 5 more.
 */

import { BUST_BOMBS, bank, bankValue, keepAndRoll, newTurn, type Face, type TurnState } from "@/lib/originals/shuffleDice";
import type { ShuffleTable } from "../types";
import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, count } from "./common";

const TARGET = 25;
const MAX_CALLS = 12;
const HOUSE_BANKS_AT = 8;

type DiceState = NonNullable<RunMeta["dice"]>;

const allIdx = (t: TurnState) => t.roll.map((_, i) => i);
const turnPoints = (t: TurnState) => (t.bust ? 0 : bankValue(t, allIdx(t)).points);

function table(state: DiceState): ShuffleTable {
  const t = state.turn as TurnState;
  return { roll: t.roll as Face[], kept: t.kept as Face[], bombs: t.bombs, turnPoints: turnPoints(t), chat: state.chat, house: state.house, target: TARGET };
}

/** A fresh roll for chat; a roll that busts on the spot hands the turn to the house (rare). */
function chatTurn(state: DiceState, rand: () => number, notes: string[]): DiceState {
  let s = state;
  for (let i = 0; i < 4; i += 1) {
    const turn = newTurn(rand);
    if (!turn.bust) return { ...s, turn };
    notes.push("Chat's roll came up three Bombs straight away.");
    s = houseTurn({ ...s, turn }, rand, notes);
    if (s.over) return s;
  }
  return { ...s, turn: newTurn(rand) };
}

/** The house plays its turn: rolls until 8 points or two Bombs, then banks. */
function houseTurn(state: DiceState, rand: () => number, notes: string[]): DiceState {
  let t = newTurn(rand);
  for (let i = 0; i < 12 && !t.bust; i += 1) {
    if (turnPoints(t) >= HOUSE_BANKS_AT || t.bombs >= BUST_BOMBS - 1) break;
    const next = keepAndRoll(t, allIdx(t), rand);
    if (next === "keep_one") break;
    t = next;
  }
  if (t.bust) {
    notes.push("The house busted.");
    return state;
  }
  const value = bankValue(t, allIdx(t));
  const [chat, house] = bank([state.chat, state.house], 1, value);
  const stolen = state.chat - chat;
  notes.push(`The house banked ${value.points}${stolen > 0 ? ` and stole ${stolen} with Shells` : ""}.`);
  return { ...state, chat, house, over: house >= TARGET };
}

export const shuffleDice: BreakGame = {
  id: "shuffle-dice",
  rounds: (meta) => (meta.dice?.over ? meta.dice.decisions : MAX_CALLS),
  make: (ctx) => {
    let state = ctx.fresh ? null : ctx.meta.dice ?? null;
    let fresh: RunMeta | undefined;
    if (!state || state.over) {
      state = chatTurn({ chat: 0, house: 0, turn: { kept: [], roll: [], bombs: 0, bust: false }, decisions: 0, over: false }, ctx.rand, []);
      fresh = { dice: state };
    }
    const t = table(state);
    return {
      key: null,
      round: {
        layout: "shuffle",
        prompt: `Roll again, or bank ${t.turnPoints} point${t.turnPoints === 1 ? "" : "s"}?`,
        options: [{ key: "roll", label: "Roll again" }, { key: "bank", label: `Bank ${t.turnPoints}` }],
        hint: "Type roll or bank",
        table: t,
        tag: "Chat vs the House",
      },
      secret: {},
      meta: fresh,
    };
  },
  accept: (text) => {
    const t = text.trim().toLowerCase().replace(/[.!]$/, "");
    if (t === "roll" || t === "r" || t === "roll again") return "roll";
    if (t === "bank" || t === "b") return "bank";
    return null;
  },
  judge: (_draft, answers, meta) => {
    const start = meta.dice;
    if (!start) return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    const counts = count(answers);
    // Most votes; a tie or no votes banks (the safe call).
    const call: "roll" | "bank" = (counts.roll ?? 0) > (counts.bank ?? 0) ? "roll" : "bank";
    const notes: string[] = [];
    let state: DiceState = { ...start, decisions: start.decisions + 1 };
    let turnOver = false;
    const t = state.turn as TurnState;
    if (call === "roll") {
      const next = keepAndRoll(t, allIdx(t), Math.random);
      const after = next === "keep_one" ? t : next;
      state = { ...state, turn: after };
      if (after.bust) {
        notes.push("Chat rolled again: third Bomb, the turn is lost.");
        turnOver = true;
      } else {
        notes.push(`Chat rolled again: ${turnPoints(after)} points riding on this turn.`);
      }
    } else {
      const value = bankValue(t, allIdx(t));
      const [chat, house] = bank([state.chat, state.house], 0, value);
      const stolen = state.house - house;
      state = { ...state, chat, house, over: chat >= TARGET };
      notes.push(`${answers.length ? "Chat banked" : "Nobody voted, so chat banked"} ${value.points}${stolen > 0 ? ` and stole ${stolen} with Shells` : ""}.`);
      turnOver = true;
    }
    if (turnOver && !state.over) {
      state = houseTurn(state, Math.random, notes);
      if (!state.over) state = chatTurn(state, Math.random, notes);
    }
    // Out of calls: the leader takes it.
    if (!state.over && state.decisions >= MAX_CALLS) state = { ...state, over: true };
    const chatWon = state.over && state.chat > state.house;
    if (state.over) notes.push(chatWon ? `Chat wins, ${state.chat} to ${state.house}!` : state.chat === state.house ? `A tie at ${state.chat}.` : `The house wins, ${state.house} to ${state.chat}.`);

    const awards: Award[] = answers.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: 1 + (chatWon && a.answer === call ? 5 : 0) }));
    return {
      awards,
      reveal: { text: notes.join(" "), correct: [call], counts, answered: answers.length, right: counts[call] ?? 0, table: table(state) },
      line: state.over ? chatLine(`Shuffle Dice: ${notes[notes.length - 1]}`) : null,
      meta: { dice: state },
    };
  },
};
