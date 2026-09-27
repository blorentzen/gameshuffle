/**
 * Shared Mario Party engine: the shape every Mario Party game's data takes, so
 * a new entry (Superstars, the next one) is a data file, not new code.
 * Client-safe: no server imports. See specs/gs-pro-updates/gs-mario-party-jamboree-spec.md.
 */

/** Which release the player owns. Content marked `switch2` only exists there. */
export type PartyEdition = "switch1" | "switch2";

export interface PartyCharacter {
  name: string;
  /** Art path under the game's asset base. Only rendered once `artReady`. */
  img: string;
  /** Has to be unlocked in-game before it can be picked. */
  unlockable?: boolean;
  /** Jamboree Buddy ability, when this character can appear as one. */
  buddy?: string;
}

export interface PartyBoard {
  id: string;
  name: string;
  /** Our own one-line summary. */
  blurb: string;
  /** The game's own 1 to 5 difficulty rating. */
  difficulty: number;
  /** Tile colour, used until art is uploaded (and behind it after). */
  color: string;
  img: string;
  unlockable?: boolean;
  unlockHint?: string;
}

export interface PartyBonusMode {
  id: string;
  label: string;
  blurb: string;
}

export interface PartyRuleset {
  id: string;
  label: string;
  blurb: string;
  /** Turn counts the game allows. One entry means the ruleset fixes it. */
  turns: number[];
  /** Bonus Star modes this ruleset can use (ids from `bonusModes`). */
  bonus: string[];
  /** Players pair up into teams of two. */
  teams?: boolean;
  edition?: PartyEdition;
}

export type PartyMinigameCategoryId = string;

export interface PartyMinigameCategory {
  id: PartyMinigameCategoryId;
  label: string;
  /** Who plays, in the game's terms ("4 players", "1 vs 3"). */
  players: string;
  /** Turns up during a board game. Off-board modes default to excluded. */
  board: boolean;
  edition?: PartyEdition;
}

export interface PartyMinigame {
  name: string;
  category: PartyMinigameCategoryId;
  /** Needs a detached Joy-Con held for motion controls. */
  motion?: boolean;
  /** A coin-collecting minigame. */
  coin?: boolean;
  /** Can't come up under Pro Rules. */
  noPro?: boolean;
  edition?: PartyEdition;
  /** Special hardware beyond buttons. */
  controls?: "mouse" | "camera" | "mic";
}

/** A way to spend part of the night (the board game, a minigame mode, a co-op break). */
export interface PartyMode {
  id: string;
  label: string;
  blurb: string;
  /** How many people can play it on one Switch. */
  minPlayers: number;
  maxPlayers: number;
  /** Players work together instead of against each other. */
  coop?: boolean;
  /** Needs detached Joy-Con held for motion controls. */
  motion?: boolean;
  /** Rough minutes for one sitting. The board game is sized from its turns instead. */
  minutes: number;
  /** A setting to roll with it (target Stars, rounds, difficulty). */
  options?: { label: string; values: string[] };
  /** The main event: the board game itself. */
  board?: boolean;
  unlockable?: boolean;
  unlockHint?: string;
  edition?: PartyEdition;
}

export interface PartyGame {
  slug: string;
  label: string;
  /** Short form for tight spots ("Jamboree"). */
  shortLabel: string;
  /** Editions on sale. Null when the game only has one. */
  editions: { id: PartyEdition; label: string }[] | null;
  /** Seats at a board game (humans plus CPUs). */
  seats: number;
  /** Base URL the character and board `img` paths hang off. */
  assetBase: string;
  /** Art has been uploaded to `assetBase`. Until then tiles render instead. */
  artReady: boolean;
  characters: PartyCharacter[];
  boards: PartyBoard[];
  rulesets: PartyRuleset[];
  bonusModes: PartyBonusMode[];
  /** Every Bonus Star in the game, for reference. */
  bonusStars: { name: string; rewards: string }[];
  minigameCategories: PartyMinigameCategory[];
  minigames: PartyMinigame[];
  /** Modes that work for people on one Switch, for planning a night. */
  modes: PartyMode[];
  /** Rough minutes per board-game turn with four seats, for sizing the night. */
  minutesPerTurn: number;
}

/** Content the player can actually see, given the edition they own. */
export function inEdition<T extends { edition?: PartyEdition }>(rows: T[], edition: PartyEdition): T[] {
  return rows.filter((r) => !r.edition || r.edition === edition || edition === "switch2");
}
