/**
 * Playing together in the Discord Activity: the rules both sides share
 * (client-safe). The room itself (src/lib/activity/room.ts) is server-only.
 *
 * One room per Activity instance: everyone who opens GameShuffle in the same
 * call. The first player in runs it; when they leave, the next player to look
 * in takes over. Games:
 *   quickfire  short rounds from break mode's games (Higher or Lower, Zoomed
 *              In, trivia...), answered on each player's own screen, judged by
 *              the game; a round closes early once everyone has answered.
 *   roll       Roll for the call: one pick each from a randomizer (a kart
 *              combo, a fighter, a hero) plus the match setup, by name.
 */

import type { BreakGameId, BreakReveal, BreakRound } from "@/lib/break/types";
import type { ChatRoll } from "@/lib/twitch/chatRoll";

/** Someone counts as here while their screen has checked in within this long. */
export const ACTIVE_MS = 25_000;
/** A host who hasn't checked in for this long hands the room to whoever looks in next. */
export const HOST_STALE_MS = 30_000;
/** Screens poll this often while the tab is open. */
export const ROOM_POLL_MS = 1_500;
/** Seconds between rounds (the next game's name) and on each reveal. */
export const INTRO_SECONDS = 3;
export const REVEAL_SECONDS = 6;
/** A little slack for the last tap to arrive after the clock hits zero. */
export const ANSWER_GRACE_MS = 1_000;
/** Players a room keeps (a Discord call can hold more, but scoreboards stop being fun). */
export const MAX_PLAYERS = 40;

export type RoomGame = "quickfire" | "roll" | "party" | "brain";

export type QuickfireSetId = "mixed" | "characters" | "trivia" | "words" | "rush";
/** Break games that play well in a call: one round each, no streamer in the loop. */
export const QUICKFIRE_SETS: Record<QuickfireSetId, { name: string; blurb: string; games: BreakGameId[] }> = {
  mixed: {
    name: "A bit of everything",
    blurb: "Character facts, zoomed-in pictures, emoji puzzles, trivia and this-or-that questions.",
    games: ["higher-lower", "zoomed-in", "emoji-puzzle", "fact-or-fiction", "read-the-room", "trivia-rounds", "odd-one-out", "scramble", "closest-guess"],
  },
  characters: {
    name: "Know your characters",
    blurb: "Which is heavier, who came first, the odd one out and zoomed-in pictures.",
    games: ["higher-lower", "odd-one-out", "zoomed-in", "fact-or-fiction", "scramble", "closest-guess"],
  },
  trivia: { name: "Trivia", blurb: "Questions from the GameShuffle trivia pack.", games: ["trivia-rounds"] },
  words: { name: "Emoji and words", blurb: "Games told in emoji and scrambled names.", games: ["emoji-puzzle", "scramble"] },
  rush: { name: "Roster Rush", blurb: "Name a whole roster together against the clock. Every name is a point.", games: ["roster-rush"] },
};
export const QUICKFIRE_SET_IDS = Object.keys(QUICKFIRE_SETS) as QuickfireSetId[];

export type QuickfireFocus = "any" | "mario-kart" | "mario-party" | "smash";
/** Which Daily fact sets a focus plays from, and the game it leans on (Zoomed In's rosters). */
export const QUICKFIRE_FOCUS: Record<QuickfireFocus, { name: string; puzzles: string[] | null; game: string | null }> = {
  any: { name: "Any game", puzzles: null, game: null },
  "mario-kart": { name: "Mario Kart", puzzles: ["mk8dx-character", "mkworld-character"], game: "mario-kart-8-deluxe" },
  "mario-party": { name: "Mario Party", puzzles: ["party-character"], game: "super-mario-party-jamboree" },
  smash: { name: "Smash", puzzles: ["smash-fighter"], game: "super-smash-bros-ultimate" },
};
export const QUICKFIRE_FOCUS_IDS = Object.keys(QUICKFIRE_FOCUS) as QuickfireFocus[];
export const ROUND_COUNTS = [5, 10, 15] as const;
/** Roster Rush is one long round, so a "game" of it is a few rosters. */
export const RUSH_ROUNDS = [1, 2, 3] as const;

/** Each round's game: the set's games in a shuffled order, again and again (no game twice in a row when there's a choice). */
export function lineupFor(set: QuickfireSetId, rounds: number, rand: () => number = Math.random): BreakGameId[] {
  const games = QUICKFIRE_SETS[set].games;
  const out: BreakGameId[] = [];
  while (out.length < rounds) {
    const pass = [...games];
    for (let i = pass.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pass[i], pass[j]] = [pass[j], pass[i]];
    }
    if (pass.length > 1 && out.length && pass[0] === out[out.length - 1]) pass.push(pass.shift()!);
    out.push(...pass);
  }
  return out.slice(0, rounds);
}

/** Players best first; ties share a place ("1st, 1st, 3rd"). */
export function ranked<T extends { score: number; name: string }>(players: T[]): (T & { place: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) place = i + 1;
    return { ...p, place };
  });
}

/** Adds a round's points to the running scores (identity id → points). */
export function addPoints(scores: Record<string, number>, awards: { id: string; points: number }[]): Record<string, number> {
  const out = { ...scores };
  for (const a of awards) if (a.points) out[a.id] = (out[a.id] ?? 0) + a.points;
  return out;
}

/** Everyone who's here has answered: the round can close early. */
export function everyoneAnswered(active: string[], answered: Set<string>): boolean {
  return active.length > 0 && active.every((id) => answered.has(id));
}

// ── What the page sees ──────────────────────────────────────────────────────

export interface RoomPlayer {
  id: string;
  name: string;
  avatar: string | null;
  active: boolean;
  score: number;
  place: number;
  /** Quick-fire: answered the open round. */
  answered: boolean;
}

export interface QuickfireView {
  set: QuickfireSetId;
  setName: string;
  focus: QuickfireFocus;
  rounds: number;
  roundNo: number;
  game: { id: BreakGameId; name: string; howTo: string } | null;
  round: BreakRound | null;
  reveal: BreakReveal | null;
  /** Roster Rush: names found so far. */
  found: string[] | null;
  /** This player's answer to the open round. */
  mine: string | null;
  answering: number;
  /** Points from the last reveal, by name. */
  lastPoints: { id: string; name: string; points: number }[];
  oneGuess: boolean;
}

export interface RollView {
  slug: string;
  title: string;
  noun: string;
  arg: string;
  choices: { label: string; arg: string }[];
  rolls: { id: string; name: string; roll: ChatRoll; rerolls: number }[];
  setup: ChatRoll | null;
  setupChoices: { label: string; arg: string }[] | null;
  canSetup: boolean;
}

/** Most Likely To, Odd One Out or Tier Wars: the live night panel's view, plus the seats' names. */
export interface PartyRoomView {
  slug: "most-likely-to" | "odd-one-out" | "tier-wars" | "number-bingo";
  name: string;
  /** In the shape the live-night panel for this game takes (src/components/party/*Panel.tsx). */
  activity: unknown;
  mySeat: number | null;
  seatNames: Record<number, string>;
}

export const PARTY_GAMES: { slug: PartyRoomView["slug"]; name: string; blurb: string }[] = [
  { slug: "most-likely-to", name: "Most Likely To", blurb: "Vote for whoever in the call fits the prompt. Match the room to score." },
  { slug: "odd-one-out", name: "Odd One Out", blurb: "Everyone gets the same secret word but one. Talk it out in voice and vote." },
  { slug: "tier-wars", name: "Tier Wars", blurb: "Rank six things S to D. The room's tier list builds, hottest take called out." },
  { slug: "number-bingo", name: "Bingo", blurb: "A card each, a number called every few seconds, first real bingo wins. Two or more." },
];

/** Chat Brain boards: the board as everyone sees it (labels only once found, or when it's over). */
export interface BrainRoomView {
  boards: number;
  boardNo: number;
  question: string;
  slots: { rank: number; points: number; label: string | null; finder: { id: string; name: string } | null }[];
  strikes: number;
  maxStrikes: number;
  lastFind: { name: string; label: string; points: number } | null;
}

export interface RoomView {
  me: string;
  isHost: boolean;
  host: { id: string; name: string } | null;
  players: RoomPlayer[];
  game: RoomGame | null;
  phase: string;
  endsAt: string | null;
  /** The server's clock, so every screen counts down together. */
  serverNow: string;
  quickfire: QuickfireView | null;
  roll: RollView | null;
  party: PartyRoomView | null;
  brain: BrainRoomView | null;
  /** How many Chat Brain boards the room could play (lobby only; 0 hides the game). */
  brainBoards: number | null;
  /** Games a host can pick for Roll for the call (in the lobby only). */
  rollGames: { slug: string; title: string; choices: { label: string; arg: string }[] }[] | null;
}

/** The light read other tabs make: is anyone playing together, and what. */
export interface RoomPeek {
  players: number;
  game: RoomGame | null;
  host: string | null;
}

export const ROOM_ERRORS: Record<string, string> = {
  no_room: "Play together works inside a Discord call. Launch GameShuffle from the App Launcher in a voice channel or call.",
  not_host: "Only the person running the room can do that.",
  closed: "That round just closed.",
  not_an_answer: "That isn't an answer for this round.",
  busy: "Someone else just changed the room. Try again.",
  bad_request: "Something about that didn't make sense. Try again.",
  not_ready: "Play together is almost ready. Check back soon.",
  full: "This room is full.",
  need_three: "This one needs at least three people in the room.",
  need_two: "Bingo needs at least two people in the room.",
  no_bingo: "Not a bingo yet. Check your card against the numbers called.",
  no_boards: "There are no Chat Brain boards to play yet.",
  already_found: "Someone already found that one.",
  not_on_board: "Not on the board.",
  round_open: "Reveal this round first.",
  rank_everything: "Put every item in a tier first.",
  no_votes: "Nobody has answered yet.",
  not_playing: "You'll play from the next round.",
};
