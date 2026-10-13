/**
 * Break mode: client-safe shapes and the lineup catalog. A break runs a
 * lineup of games on the overlay while the streamer is away; chat plays by
 * typing. Plan: https://claude.ai/artifact/PCQJnUSNrAfBKHPuZs9cKD
 *
 * Every round has a window: everyone right inside it scores (stream delay
 * makes "first to answer" unfair), and answers keep counting for GRACE_SECONDS
 * after the countdown hits zero, because viewers see the stream a few seconds
 * late.
 */

export type BreakPhase = "intro" | "open" | "reveal" | "standings";

export type BreakGameId =
  | "higher-lower"
  | "odd-one-out"
  | "closest-guess"
  | "fact-or-fiction"
  | "scramble"
  | "high-roller"
  | "lucky-number"
  | "over-under"
  | "handicap-vote"
  | "tier-war-live"
  | "next-build"
  | "roll-call"
  | "shuffle-dice"
  | "stream-bingo"
  | "read-the-room"
  | "zoomed-in"
  | "emoji-puzzle"
  | "trivia-rounds"
  | "chat-brain"
  | "roster-rush"
  | "item-box-royale"
  | "four-in-a-row"
  | "know-the-channel"
  | "chat-bounty"
  | "boss-fight"
  | "five-letters"
  | "kart-derby"
  | "game-trivia";

/** Shuffle Dice faces (src/lib/originals/shuffleDice.ts). */
export type DiceFace = "star" | "coin" | "mushroom" | "shell" | "bomb";

export interface BreakOption {
  key: string;
  label: string;
  img?: string | null;
  sub?: string | null;
}

/**
 * What viewers see during a round. The answer is never in here. `openedAt`
 * is stamped by the runner when the round opens (Zoomed In's steps follow it).
 */
export type BreakRound = (
  | { layout: "choice"; prompt: string; options: BreakOption[]; hint: string; tag?: string; img?: string | null; item?: string }
  | { layout: "number"; prompt: string; hint: string; min: number; max: number; img?: string | null; tag?: string }
  | { layout: "word"; prompt: string; tiles: string[]; hint: string; tag?: string }
  | { layout: "dice"; prompt: string; hint: string; options?: BreakOption[]; tag?: string }
  | { layout: "shuffle"; prompt: string; hint: string; options: BreakOption[]; table: ShuffleTable; tag?: string }
  | { layout: "bingo"; prompt: string; hint: string; url: string | null; tag?: string }
  /** Typed answers: trivia, Chat Brain, Emoji Puzzle (`big` shows large, like the emoji). */
  | { layout: "text"; prompt: string; hint: string; big?: string | null; tag?: string }
  /** Zoomed In: a portrait shown at `steps` zoom levels, `stepSeconds` each, centred on `focus` (percent). */
  | { layout: "zoom"; prompt: string; hint: string; img: string; focus: { x: number; y: number }; steps: number[]; stepSeconds: number; pool: string; tag?: string }
  /** Roster Rush (`pool` = the roster): names found so far come live in BreakView.found. */
  | { layout: "rush"; prompt: string; hint: string; total: number; pool: string; tag?: string }
  /** Item Box Royale: who's still in. */
  | { layout: "royale"; prompt: string; hint: string; stage: "join" | "wave"; alive: string[]; aliveCount: number; tag?: string }
  /** Four in a Row: 42 cells, row by row from the top ("." empty, "c" chat, "b" GameShuffle); options = open columns. */
  | { layout: "connect"; prompt: string; hint: string; board: string; options: BreakOption[]; last: number | null; tag?: string }
  /** Boss Fight: the boss and its health going into this round. */
  | { layout: "boss"; prompt: string; hint: string; boss: BossView; fighters: number; tag?: string }
  /** Five Letters: the guesses played so far and what each letter showed. */
  | { layout: "letters"; prompt: string; hint: string; rows: LetterRow[]; maxRows: number; category: string; tag?: string }
  /** Kart Derby: joining (pick a lane), then the race, one stretch per round (karts move from → to over the round). */
  | { layout: "derby"; prompt: string; hint: string; stage: "join" | "race"; lanes: DerbyLane[]; stretch: number; stretches: number; events: DerbyEvent[]; seconds: number; tag?: string }
) & { openedAt?: string };

/** Boss Fight's boss on screen. `glyph` picks its icon on the overlay. */
export interface BossView { name: string; glyph: string; hp: number; maxHp: number }

/** One played Five Letters guess: `marks` per letter, "g" right spot, "y" in the word, "x" not in it. */
export interface LetterRow { word: string; marks: string }

/** A Kart Derby kart: its lane (1 to 8), who's driving and where it is (0 to 100) at the start and end of this stretch. */
export interface DerbyLane { lane: number; label: string; racers: number; from: number; to: number; place?: number }

/** Something that happens during a stretch, `at` = how far through it (0 to 1). */
export interface DerbyEvent { at: number; lane: number; text: string }

/** Shuffle Dice: what's on the table for chat's next call. */
export interface ShuffleTable {
  roll: DiceFace[];
  kept: DiceFace[];
  bombs: number;
  turnPoints: number;
  chat: number;
  house: number;
  target: number;
}

/** What viewers see once a round closes. */
export interface BreakReveal {
  text: string;
  correct?: string[];
  counts?: Record<string, number>;
  answered: number;
  right: number;
  winners?: { name: string; detail?: string; points: number }[];
  dice?: number[];
  rolls?: { name: string; dice: number[] }[];
  number?: number;
  word?: string;
  /** Tier War Live's finished list. */
  tiers?: { tier: string; items: string[] }[];
  /** Shuffle Dice after chat's call (and the house's turn). */
  table?: ShuffleTable;
  /** Four in a Row after both moves, and the winning line's cells. */
  board?: string;
  winLine?: number[];
  /** Item Box Royale: who went out this wave (with their one-line story) and who's left. */
  out?: { name: string; line: string }[];
  outMore?: number;
  alive?: string[];
  aliveCount?: number;
  /** Roster Rush: what chat found, and some it missed. */
  found?: string[];
  missed?: string[];
  /** Boss Fight: the boss after this round's hits. */
  boss?: BossView;
  /** Five Letters: every guess so far, including this round's. */
  rows?: LetterRow[];
  /** Kart Derby: where everyone finished this stretch (and the places at the end). */
  lanes?: DerbyLane[];
}

export interface BreakView {
  id: string;
  status: "running" | "ended";
  phase: BreakPhase;
  phaseEndsAt: string;
  /** During a round: answers count until here (the countdown ends GRACE_SECONDS earlier). */
  answerUntil: string | null;
  countdownEndsAt: string | null;
  /** `hosted` = played on the live page, not by typing in chat (Stream Bingo). */
  game: { id: BreakGameId; name: string; howTo: string; hosted?: boolean } | null;
  next: { id: BreakGameId; name: string } | null;
  gameRound: number;
  gameRounds: number;
  round: BreakRound | null;
  reveal: BreakReveal | null;
  leaders: { name: string; points: number }[];
  /** Everyone who has scored this break. */
  players: number;
  /** Answers in for the round in play. */
  answering: number;
  backBy: string | null;
  startedAt: string;
  endingRequested: boolean;
  champion: { names: string[]; points: number } | null;
  handicap: string | null;
  /** What chat picked (Next Build) or called (Roll Call) for the streamer's next game. */
  nextPick: string | null;
  /** Roster Rush: names chat has found so far this round (live). */
  found: string[] | null;
  /** Stream Bingo's progress while the break is running it. */
  bingo: { called: number; last: number | null; pattern: string; doorsCloseAt: string | null; players: number; winner: string | null } | null;
  chatStreak: number;
  show: "panel" | "full";
  streamer: string;
}

export const GRACE_SECONDS = 5;
export const INTRO_SECONDS = 4;
export const REVEAL_SECONDS = 7;
export const STANDINGS_SECONDS = 8;
/** A break nobody ended stops on its own after this long. */
export const MAX_BREAK_MINUTES = 90;

export interface BreakGameInfo {
  name: string;
  howTo: string;
  /** Played on the live page, not by typing in chat. */
  hosted?: boolean;
  blurb: string;
  rounds: number;
  seconds: number;
}

/** Wave 1a. Order here is the default lineup. */
export const BREAK_GAMES: Record<BreakGameId, BreakGameInfo> = {
  "higher-lower": { name: "Higher or Lower", howTo: "Type 1 or 2", blurb: "Two characters: which is heavier, which came first.", rounds: 5, seconds: 15 },
  "over-under": { name: "Over or Under", howTo: "Type over, under or 7", blurb: "Call the two dice before they roll. Exactly 7 pays most.", rounds: 3, seconds: 15 },
  "odd-one-out": { name: "Odd One Out", howTo: "Type 1 to 4", blurb: "Four characters, one doesn't belong.", rounds: 4, seconds: 20 },
  scramble: { name: "Scramble", howTo: "Type the word", blurb: "Unscramble a character's name.", rounds: 4, seconds: 25 },
  "lucky-number": { name: "Lucky Number", howTo: "Type a number from 1 to 100", blurb: "Closest to the roll wins.", rounds: 2, seconds: 20 },
  "fact-or-fiction": { name: "Fact or Fiction", howTo: "Type T or F", blurb: "True or false, about the characters you know.", rounds: 5, seconds: 12 },
  "closest-guess": { name: "Closest Guess", howTo: "Type a year", blurb: "Guess the year; closest answers score.", rounds: 3, seconds: 20 },
  "high-roller": { name: "High Roller", howTo: "Type roll", blurb: "Everyone rolls two dice. Highest wins.", rounds: 1, seconds: 20 },
  "handicap-vote": { name: "Handicap Vote", howTo: "Type 1, 2 or 3", blurb: "Chat picks the streamer's handicap for the first game back.", rounds: 1, seconds: 30 },
  "tier-war-live": { name: "Tier War Live", howTo: "Type S, A, B, C or D", blurb: "Chat ranks six things, one at a time. Match the room to score.", rounds: 6, seconds: 15 },
  "next-build": { name: "Chat Picks Your Next Build", howTo: "Type 1, 2 or 3", blurb: "Chat votes the streamer's next kart or fighter, one part at a time. Mario Kart and Smash.", rounds: 4, seconds: 20 },
  "roll-call": { name: "Roll Call", howTo: "Type 1, 2 or 3", blurb: "Call which of three rolls the randomizer picks for the streamer's next game.", rounds: 1, seconds: 20 },
  "shuffle-dice": { name: "Shuffle Dice", howTo: "Type roll or bank", blurb: "Chat against the house: roll again or bank, and don't hit three Bombs.", rounds: 12, seconds: 12 },
  "stream-bingo": { name: "Stream Bingo", howTo: "Get a card on the live page", hosted: true, blurb: "Bingo runs itself: cards for a minute, a number every 10 seconds, first line wins. Up to 5 minutes.", rounds: 1, seconds: 300 },
  // Wave 2
  "read-the-room": { name: "Read the Room", howTo: "Type 1 or 2", blurb: "A this-or-that question. Pick what most of chat will pick.", rounds: 4, seconds: 15 },
  "zoomed-in": { name: "Zoomed In", howTo: "Type the name. One guess each", blurb: "A close-up that zooms out. The sooner you name it, the more you score.", rounds: 3, seconds: 32 },
  "emoji-puzzle": { name: "Emoji Puzzle", howTo: "Type the game", blurb: "A game told in emoji. Name it.", rounds: 4, seconds: 25 },
  "trivia-rounds": { name: "Trivia", howTo: "Type your answer", blurb: "Questions from the GameShuffle trivia pack.", rounds: 5, seconds: 20 },
  "chat-brain": { name: "Chat Brain", howTo: "Type a short answer", blurb: "Chat answers a Chat Brain question. Answers build the boards.", rounds: 2, seconds: 30 },
  "roster-rush": { name: "Roster Rush", howTo: "Type names, as many as you know", blurb: "Name every character on a roster together before time runs out.", rounds: 1, seconds: 75 },
  "item-box-royale": { name: "Item Box Royale", howTo: "Type join to get in", blurb: "Everyone who joins is in. Items knock players out until one is left.", rounds: 8, seconds: 25 },
  "four-in-a-row": { name: "Four in a Row", howTo: "Type a column, 1 to 7", blurb: "Chat votes each move against GameShuffle. Up to 4 minutes.", rounds: 21, seconds: 12 },
  "know-the-channel": { name: "Know the Channel", howTo: "Type your answer", blurb: "Questions about this channel, written by the streamer and their mods. Skips itself until some are approved.", rounds: 3, seconds: 20 },
  "chat-bounty": { name: "Chat Sets the Bounty", howTo: "Type 1, 2 or 3", blurb: "Chat votes a challenge for the streamer's next game. Pull it off and the voters split the tokens. Skips itself until a bounty amount is set.", rounds: 1, seconds: 30 },
  // Wave 3
  "boss-fight": { name: "Boss Fight", howTo: "Type hit", blurb: "Chat against a boss. Everyone who hits it scores if it goes down in time. More fighters, more health.", rounds: 5, seconds: 12 },
  "five-letters": { name: "Five Letters", howTo: "Type a five-letter word", blurb: "Chat works out a five-letter gaming word together. The most-typed guess is played each round.", rounds: 6, seconds: 18 },
  "kart-derby": { name: "Kart Derby", howTo: "Type a lane, 1 to 8", blurb: "Pick a lane and watch the race. Item boxes swing it; the podium lanes score.", rounds: 4, seconds: 30 },
  "game-trivia": { name: "Game Trivia", howTo: "Type your answer", blurb: "Questions about the game you're streaming, from packs GameShuffle checks. General gaming questions until your game has one.", rounds: 4, seconds: 20 },
};

export const BREAK_GAME_IDS = Object.keys(BREAK_GAMES) as BreakGameId[];
/** The lineup a channel starts with: kinds mixed, the "for when you're back" games last. */
export const DEFAULT_LINEUP: BreakGameId[] = [
  "higher-lower", "read-the-room", "over-under", "zoomed-in", "kart-derby", "odd-one-out", "tier-war-live", "trivia-rounds",
  "scramble", "item-box-royale", "lucky-number", "five-letters", "emoji-puzzle", "game-trivia", "shuffle-dice", "boss-fight", "chat-brain",
  "fact-or-fiction", "roster-rush", "know-the-channel", "closest-guess", "high-roller", "roll-call", "next-build", "handicap-vote", "chat-bounty",
];

export function isBreakGameId(v: unknown): v is BreakGameId {
  return typeof v === "string" && v in BREAK_GAMES;
}

/**
 * When each game after the first waves arrived (Pacific). A channel whose
 * settings were last saved before then gets the game added to its lineup;
 * one that saved after had the chance to leave it out.
 */
export const BREAK_GAME_ADDED: Partial<Record<BreakGameId, string>> = {
  "boss-fight": "2026-10-12T00:00:00-07:00",
  "five-letters": "2026-10-12T00:00:00-07:00",
  "kart-derby": "2026-10-12T00:00:00-07:00",
  "game-trivia": "2026-10-12T00:00:00-07:00",
};

/** The "for when you're back" games stay last when new games join a saved lineup. */
const CLOSERS: BreakGameId[] = ["roll-call", "next-build", "handicap-vote", "chat-bounty"];

/** A saved lineup plus the games that arrived after it was saved. */
export function withNewGames(lineup: BreakGameId[], savedAt: string | null | undefined): BreakGameId[] {
  const saved = savedAt ? Date.parse(savedAt) : NaN;
  if (!Number.isFinite(saved)) return lineup;
  const fresh = (Object.keys(BREAK_GAME_ADDED) as BreakGameId[]).filter((id) => !lineup.includes(id) && Date.parse(BREAK_GAME_ADDED[id]!) > saved);
  if (!fresh.length) return lineup;
  const at = lineup.findIndex((id) => CLOSERS.includes(id));
  return at < 0 ? [...lineup, ...fresh] : [...lineup.slice(0, at), ...fresh, ...lineup.slice(at)];
}

/** A lineup with only known games, no repeats, never empty. */
export function cleanLineup(raw: unknown): BreakGameId[] {
  const list = Array.isArray(raw) ? raw.filter(isBreakGameId) : [];
  const unique = [...new Set(list)];
  return unique.length ? unique : DEFAULT_LINEUP;
}
