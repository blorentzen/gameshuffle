/**
 * Daily Duel: the events in words (client-safe, no imports beyond types). Plain words, the
 * trainer's name filled in. Each event has a title, its full text (the start card, the turn log,
 * screen readers) and a short line (the arena's banner and the "Next turn" chip: numbers, no
 * full stop).
 */

import type { DuelEventKind, DuelSignature, DuelTrainer } from "./types";

const EVENT_COPY: Record<Exclude<DuelEventKind, "signature">, { title: string; text: string; short: string }> = {
  rain: { title: "Rain begins to fall", text: "Water moves do 30 more and Fire moves 30 less, for 3 turns.", short: "Water +30, Fire −30 for 3 turns" },
  sun: { title: "The sunlight turned harsh", text: "Fire moves do 30 more and Water moves 30 less, for 3 turns.", short: "Fire +30, Water −30 for 3 turns" },
  sand: { title: "A sandstorm kicked up", text: "At the end of each turn, cards on the field that aren't Fighting or Metal take 10, for 3 turns. It never knocks a card out.", short: "Cards that aren't Fighting or Metal take 10 a turn, for 3 turns" },
  rocket: { title: "Team Rocket swoops in", text: "They grab one of your waiting cards for 2 turns: the one with the most Energy. You can't swap to it.", short: "They hold your waiting card with the most Energy for 2 turns" },
  joy: { title: "Nurse Joy patches you up", text: "Your card on the field heals 50.", short: "Your card heals 50" },
  wild: { title: "A wild Pokémon appears", text: "It hits both cards on the field for 20. It never knocks a card out.", short: "Both cards take 20" },
  sleep: { title: "{trainer}'s Pokémon fell asleep", text: "{trainer}'s card on the field skips its next move.", short: "{trainer}'s card skips its next move" },
  confused: { title: "Your Pokémon is confused", text: "Your next move does half damage.", short: "Your next move does half" },
  ace: { title: "A stubborn ace", text: "Whichever card on the field has more HP skips its next move (the trainer's on a tie).", short: "The card with more HP skips its next move" },
  crit: { title: "A critical hit", text: "Your next move does half again as much.", short: "Your next move does 1.5×" },
  advice: { title: "Professor's advice", text: "You see which move {trainer} will use next.", short: "See {trainer}'s next move" },
  potion: { title: "A Potion drops", text: "Your card on the field heals 30.", short: "Your card heals 30" },
  revive: { title: "A Revive", text: "Your knocked-out card with the most HP comes back with half its HP, waiting, with no Energy.", short: "Your best knocked-out card comes back at half HP" },
};

const SIGNATURE_TEXT: Record<DuelSignature, string> = {
  energy2: "{trainer}'s card on the field gets 2 Energy.",
  heal50: "{trainer}'s card on the field heals 50.",
  boost30: "{trainer}'s next move does 30 more.",
};

const SIGNATURE_SHORT: Record<DuelSignature, string> = {
  energy2: "{trainer}'s card gets 2 Energy",
  heal50: "{trainer}'s card heals 50",
  boost30: "{trainer}'s next move does 30 more",
};

/** An event's title, what it does, and the short line, in the trainer's name. */
export function eventCopy(kind: DuelEventKind, trainer: Pick<DuelTrainer, "name" | "signature">): { title: string; text: string; short: string } {
  const fill = (s: string) => s.replaceAll("{trainer}", trainer.name);
  if (kind === "signature") {
    const e = trainer.signature.effect;
    return { title: fill(trainer.signature.title), text: fill(SIGNATURE_TEXT[e]), short: fill(SIGNATURE_SHORT[e]) };
  }
  const c = EVENT_COPY[kind];
  return { title: fill(c.title), text: fill(c.text), short: fill(c.short) };
}

/** What a signature does, in the trainer's name (for the trainer's card on the page). */
export const signatureText = (trainer: Pick<DuelTrainer, "name" | "signature">) => SIGNATURE_TEXT[trainer.signature.effect].replaceAll("{trainer}", trainer.name);
