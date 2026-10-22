/**
 * Daily Duel: shared types (picks 2026-10-21, https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk).
 * A daily card duel: the trainer of the day brings the team they used in the games, each Pokémon
 * as one of its real cards; you get six random cards (the same for everyone) and knock out all of
 * theirs. Real Energy (one a turn from the day's row, put on any of your cards, it stays), Weakness
 * doubles damage, card text is flavor (numbers only), events every few turns with no coin flips.
 * Client-safe: no server imports.
 */

export type EnergyType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Metal" | "Dragon" | "Colorless";

/** A move as the duel plays it: the printed name, the printed Energy cost, the printed damage as a number ("130+" and "50×" count as 130 and 50). */
export interface DuelMove {
  n: string;
  cost: EnergyType[];
  d: number;
}

/** A card as the duel plays it, taken from our Scrydex catalog (`tcg_cards`). Only the numbers count. */
export interface DuelCard {
  /** Scrydex card id, e.g. "sv10-232". */
  id: string;
  /** The card's printed name ("Cynthia's Garchomp ex"). */
  name: string;
  /** Short name for tight spots ("Garchomp ex"). */
  short: string;
  t: EnergyType;
  hp: number;
  weak: EnergyType | null;
  /** ex / V / Mega and similar rule-box cards. Shown, and used when balancing packs. */
  ex: boolean;
  moves: DuelMove[];
  /** The medium image URL exactly as Scrydex returned it (never rewritten), or null. */
  img: string | null;
  /** The species ("Garchomp"), when the data gives it; else worked out from `short` (speciesOf in the solver). */
  species?: string;
}

/** Difficulty by weekday (picks: easy Monday, hardest Sunday; Saturday is Boss day, picks 2026-10-21 roster round). */
export type DuelTier = "gym" | "elite" | "rival" | "boss" | "champion";

/** A trainer's one signature event (each trainer has one). */
export type DuelSignature = "energy2" | "heal50" | "boost30";

export interface DuelTrainer {
  /** Stable id, e.g. "cynthia-platinum". Never change once a day has used it. */
  id: string;
  /**
   * Who the trainer is, across their teams ("cynthia" for cynthia-platinum and cynthia-bdsp): the
   * rotation goes by person, and a person with several teams in a tier brings the next one each
   * time they come back (rules.ts trainerFor). Absent on days stored before it existed; personOf
   * works it out from the name then.
   */
  person?: string;
  name: string;
  /** "Champion of Sinnoh", "Pewter City Gym Leader". */
  title: string;
  /** The game the team comes from ("Pokémon Platinum"). */
  game: string;
  tier: DuelTier;
  /** Card ids in team order; the first one leads, as in the game. 3 to 6 cards. */
  team: string[];
  /** The trainer's signature event: its name and what it does. */
  signature: { title: string; effect: DuelSignature };
}

// ─── added by the engine (src/lib/originals/duel/engine.ts) ──────────────────

/**
 * Every event a duel can have (picks 2026-10-21). No coin flips: each does the same thing every
 * time. `signature` is the trainer's own (DuelTrainer.signature.effect says what it does).
 */
export type DuelEventKind =
  | "rain" | "sun" | "sand" | "rocket" | "joy" | "wild" | "sleep" | "confused" | "ace" | "crit" | "advice" | "potion" | "revive" | "signature";

/** An event flips at the start of your turn number `turn`. */
export interface DuelEventAt {
  turn: number;
  kind: DuelEventKind;
}

/** What you do with your turn after placing the Energy: use a move of your card on the field, swap in a waiting card, or wait. */
export type DuelAct = { move: number } | { swap: number } | { wait: true };

/** One of your turns: the Energy goes on card `attach` (your card index), then the act. */
export interface DuelAction {
  attach: number;
  act: DuelAct;
}

/** One step of a duel: a card to send out (the lead, or after a knockout), or a turn. */
export type DuelStep = { next: number } | DuelAction;
