/**
 * Daily Duel: what the page receives (types only, client-safe). The server never sends the rest of
 * the Energy row or the events after the forecast; the engine's `viewOf` builds DuelPlayView and
 * the store (src/lib/originals/duel/store.ts) wraps it with the run's details.
 *
 * API (src/app/api/daily-duel):
 *   GET  /api/daily-duel                         → DuelHome
 *   POST /api/daily-duel { action: "start", mode: "official" | "practice" } → { run: DuelRunView }
 *   POST /api/daily-duel { action: "board" }     → { board: { points, tokens } | null } (a guest who just joined the boards)
 *   GET  /api/daily-duel/<id>                    → { run: DuelRunView }
 *   POST /api/daily-duel/<id> { next }           → { run } (send out a card: the lead, or after a knockout)
 *   POST /api/daily-duel/<id> { attach, act }    → { run } (a turn: act = { move } | { swap } | { wait: true })
 * Guests send the dailies' guest id in `x-daily-guest`, as the other dailies do.
 */

import type { DuelLogLine } from "./engine";
import type { DuelCondition, DuelEventKind, DuelSignature, DuelTier, EnergyType } from "./types";
import type { DayMark } from "@/lib/originals/dailies";

export type { DuelLogLine };

export interface DuelMoveView {
  n: string;
  cost: EnergyType[];
  /** The printed damage. */
  d: number;
  /** What it would do right now to the card across the field (weather, critical hit, confusion, boost, Weakness counted); null with no card across. */
  damage: number | null;
  /** It hits the card across for double (Weakness). */
  weak: boolean;
  /** The Energy on this card covers it now. */
  ready: boolean;
  /** Your cards: it's covered once this turn's Energy goes on this card (false between turns). */
  readyWithNew: boolean;
  /** The conditions it puts on the card it hits, each with its chance in percent (empty on days without the condition rules). */
  fx: { c: DuelCondition; chance: number }[];
}

export interface DuelCardView {
  /** Its index on its side (send this back as `next`, `attach` or `swap`). */
  index: number;
  id: string;
  name: string;
  short: string;
  t: EnergyType;
  hp: number;
  weak: EnergyType | null;
  ex: boolean;
  img: string | null;
  moves: DuelMoveView[];
  /** HP left. */
  cur: number;
  energy: EnergyType[];
  out: boolean;
  /** On the field now. */
  field: boolean;
  /** Your cards: turns Team Rocket still has it (0 when it's yours to use). */
  grabbed: number;
  /** It skips its next move (asleep, or a stubborn ace). */
  skips: boolean;
  /** Its lasting condition (Burned, Poisoned, Paralyzed or Asleep), or null. Days with the condition rules only. */
  cond: Exclude<DuelCondition, "confused"> | null;
  /** It's Confused. Days with the condition rules only. */
  confused: boolean;
}

export interface DuelEventView {
  kind: DuelEventKind;
  /** The turn it flips on. */
  turn: number;
  title: string;
  text: string;
  /** What it does in a few words (the arena's banner and the "Next turn" chip). */
  short: string;
}

export interface DuelInPlay {
  weather: { kind: "rain" | "sun" | "sand"; turnsLeft: number } | null;
  /** Your next move does half again as much. */
  crit: boolean;
  /** Your next move does half. */
  confused: boolean;
  /** The trainer's card on the field skips its next move. */
  foeAsleep: boolean;
  foeStubborn: boolean;
  /** Your card on the field can't use a move this turn. */
  youStubborn: boolean;
  /** The trainer's next move does this much more. */
  boost: number;
  /** The card Team Rocket has and the turns left. */
  rocket: { card: number; turnsLeft: number } | null;
}

/** The duel as you can see it: everything on the table, this turn's Energy and the next 3, this turn's event and the next one. */
export interface DuelPlayView {
  /** The turn you're on (0 before the lead goes out). */
  turn: number;
  turnCap: number;
  you: DuelCardView[];
  foe: DuelCardView[];
  /** Your card on the field (-1 before the lead) and the trainer's. */
  yi: number;
  fi: number;
  /** Pick a card to send out first (the lead, or after a knockout): one of `nexts`. */
  needsNext: boolean;
  nexts: number[];
  /** This turn's Energy (null between turns) and the next 3 after it. */
  energy: { now: EnergyType | null; next: EnergyType[] };
  /** Where this turn's Energy can go (every standing card). */
  attachTo: number[];
  /** Waiting cards you can swap in this turn. */
  swaps: number[];
  /** Your card on the field may use a move this turn (false when it's a stubborn ace or Asleep). */
  canMove: boolean;
  /** The day's rules: 2 = conditions play (days built from 2026-10-22). */
  rules: 1 | 2;
  /** The event that flipped at the start of this turn. */
  event: DuelEventView | null;
  /** The next event: it flips at the start of next turn (null when the next turn has none). */
  forecast: DuelEventView | null;
  inPlay: DuelInPlay;
  /** Professor's advice: the move the trainer's card on the field will use next, if nothing changes. */
  advice: { card: number; move: number; name: string } | null;
  /** What happened since your last decision: your turn, the trainer's, then this turn's event. */
  log: DuelLogLine[];
  over: "won" | "lost" | null;
  cardsLeft: number;
  /** The trainer's cards still standing. */
  foeLeft: number;
}

/**
 * The trainer's picture (picks 2026-10-21, https://claude.ai/artifact/4YeQz1MVRnuBLkSHmkMCmp): the
 * art window of their own Supporter card, or of their ace's card when no card shows them
 * (src/lib/originals/duel/pictures.ts). The page crops it with CSS (TrainerArt); the share card
 * cuts it on the server with artCrop.
 */
export interface DuelPicture {
  /** "card": their own Supporter card; "ace": the last card of their team, when no card shows them. */
  kind: "card" | "ace";
  /** The card's Scrydex id (My Cards takes it). */
  id: string;
  /** The card's picture: Scrydex's medium image, exactly as stored. */
  img: string;
  /** The card's printed name ("Bertha's Warmth"; an ace's short name, "Manectric"). */
  card: string;
  set: string | null;
  artist: string | null;
  /** The art window on the image: x, y, width, height as shares of it. */
  box: [number, number, number, number];
  /** The image's width over its height. */
  ratio: number;
  /** The face in the art window (x, y as shares of it) and the round portrait's zoom (1 = the art window's full height). */
  face: [number, number, number];
  /** Words for screen readers where the picture carries meaning ("Bertha, from the card Bertha's Warmth"). */
  alt: string;
  /** The credit at the foot of the page ("Bertha's picture: Bertha's Warmth (Rising Rivals), illustrated by Ken Sugimori."). */
  credit: string;
}

export interface DuelTrainerView {
  id: string;
  name: string;
  title: string;
  game: string;
  tier: DuelTier;
  tierLabel: string;
  signature: { title: string; effect: DuelSignature; text: string };
  teamSize: number;
  /** Their picture (null only when neither their card nor their ace has one). */
  picture: DuelPicture | null;
  /** A line about who they are in their games (src/data/originals/duel/bios.ts), when written. */
  bio: string | null;
}

/** Today's challenger, for the cards that lead into the Duel (homepage, the other dailies): no cards of yours, nothing about the answer. */
export interface DuelChallengerView {
  day: string;
  number: number;
  name: string;
  title: string;
  game: string;
  tierLabel: string;
  picture: DuelPicture | null;
  bio: string | null;
  /** Their team as cards, in battle order (our own card faces: the art, type and HP). */
  team: { name: string; img: string | null; t: EnergyType; hp: number }[];
}

export interface DuelRunView {
  id: string;
  day: string;
  /** Duel number (#1 on DUEL_EPOCH; 0 before). */
  number: number;
  /** The first duel you started today: it counts for streaks and the boards. */
  official: boolean;
  status: "playing" | "done";
  trainer: DuelTrainerView;
  play: DuelPlayView;
  result: "won" | "lost" | null;
  /** Turns played so far (the final count once done). */
  turns: number;
  cardsLeft: number;
  /** The day's par: only once your official duel is over. */
  par: number | null;
  /** Board points (an official duel, once over). */
  points: number | null;
  /** Start to the final move, once over. */
  seconds: number | null;
  startedAt: string;
  serverNow: string;
  /** An official duel on the boards: points and tokens (null for practice, or a guest not on the boards yet). */
  board: { points: number; tokens: number } | null;
  /** The share text once over (squares, never a card's name). */
  share: string | null;
}

export interface DuelHistory {
  /** Days in a row with the official duel won (today, or up to yesterday while today's is open). */
  streak: number;
  best: number;
  played: number;
  won: number;
  /** Fastest win, in seconds. */
  fastest: number | null;
  /** The last 14 days, oldest first. */
  recent: DayMark[];
}

export interface DuelHome {
  /** False before the migration, or when today's duel couldn't be built. */
  ready: boolean;
  day: string;
  number: number;
  tier: DuelTier;
  trainer: DuelTrainerView | null;
  /** Today's six, as they start (full HP, no Energy). */
  pack: DuelCardView[];
  /** The trainer's team in order. */
  team: DuelCardView[];
  /** Your official duel today, if you've started it. */
  official: { id: string; status: "playing" | "done"; result: "won" | "lost" | null; turns: number; cardsLeft: number; seconds: number | null; points: number | null } | null;
  /** The day's par: only once your official duel is over. */
  par: number | null;
  /** Practice opens once your official duel is over. */
  practiceAllowed: boolean;
  /** A duel in progress to pick back up: the official one first, else the latest practice. */
  current: DuelRunView | null;
  history: DuelHistory;
  signedIn: boolean;
}
