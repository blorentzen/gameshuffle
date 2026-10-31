/** Every break game by id. Add a game: a BreakGame here plus its entry in BREAK_GAMES (types.ts). */

import type { BreakGameId } from "../types";
import type { BreakGame } from "./common";
import { closestGuess, factOrFiction, higherLower, oddOneOut, scramble } from "./facts";
import { highRoller, luckyNumber, overUnder } from "./dice";
import { handicapVote } from "./handicap";
import { tierWarLive } from "./tierLive";
import { nextBuild } from "./nextBuild";
import { rollCall } from "./rollCall";
import { shuffleDice } from "./shuffleDice";
import { streamBingo } from "./bingo";
import { readTheRoom } from "./room";
import { zoomedIn } from "./zoom";
import { emojiPuzzle } from "./emoji";
import { triviaRounds } from "./trivia";
import { chatBrain } from "./brain";
import { rosterRush } from "./rush";
import { itemBoxRoyale } from "./royale";
import { fourInARow } from "./connect";
import { knowTheChannel } from "./channel";
import { chatBounty } from "./bounty";
import { bossFight } from "./boss";
import { fiveLetters } from "./letters";
import { kartDerby } from "./derby";
import { gameTrivia } from "./gameTrivia";

export const GAMES: Record<BreakGameId, BreakGame> = {
  "higher-lower": higherLower,
  "odd-one-out": oddOneOut,
  "closest-guess": closestGuess,
  "fact-or-fiction": factOrFiction,
  scramble,
  "high-roller": highRoller,
  "lucky-number": luckyNumber,
  "over-under": overUnder,
  "handicap-vote": handicapVote,
  "tier-war-live": tierWarLive,
  "next-build": nextBuild,
  "roll-call": rollCall,
  "shuffle-dice": shuffleDice,
  "stream-bingo": streamBingo,
  "read-the-room": readTheRoom,
  "zoomed-in": zoomedIn,
  "emoji-puzzle": emojiPuzzle,
  "trivia-rounds": triviaRounds,
  "chat-brain": chatBrain,
  "roster-rush": rosterRush,
  "item-box-royale": itemBoxRoyale,
  "four-in-a-row": fourInARow,
  "know-the-channel": knowTheChannel,
  "chat-bounty": chatBounty,
  "boss-fight": bossFight,
  "five-letters": fiveLetters,
  "kart-derby": kartDerby,
  "game-trivia": gameTrivia,
};

export type { BreakGame, BreakAnswer, Award, Judged, MakeContext, RoundDraft, RunMeta } from "./common";
export { puzzleOrder } from "./facts";
