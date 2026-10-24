/**
 * Daily Duel: shared types (picks 2026-10-21, https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk).
 * A daily card duel: the trainer of the day brings the team they used in the games, each Pokémon
 * as one of its real cards; you get six random cards (the same for everyone) and knock out all of
 * theirs. Real Energy (one a turn from the day's row, put on any of your cards, it stays), Weakness
 * doubles damage, card text is flavor (numbers only), events every few turns with no coin flips.
 * Client-safe: no server imports.
 */

export type EnergyType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Metal" | "Dragon" | "Colorless";

/**
 * The Duel's conditions (picks 2026-10-22, https://claude.ai/artifact/534LAa7cDPtr1rsCvh39UE): borrowed
 * from the card's words, played by the Duel's own rules (engine.ts), each a chance like the games.
 */
export type DuelCondition = "burned" | "poisoned" | "paralyzed" | "asleep" | "confused";

/**
 * The rules a day was built with (duel_days.rules): 1 = the first rules; 2 = conditions play (picks
 * 2026-10-22); 3 = conditions, and every six has at least one card with a condition move (Britton,
 * 2026-10-22). The engine plays 2 and 3 alike; 3 is a build rule. 4 (Britton's picks 2026-10-22,
 * https://claude.ai/artifact/41n2aCkBTkpmcG5DYt4zoz): you bring as many of your six as the trainer
 * brings (at least 3), picked after Battle now, and a trainer with fewer than six cards starts each
 * card with an Energy for every card it's short (up to 3). 5 (Britton's picks 2026-10-22,
 * https://claude.ai/artifact/MFwJQi5RBdq92B1JKS2EWZ): a hand of three Energy to pick from, a card
 * coming in after a knockout brings an Energy for each card you've lost (up to 2), "+" and "×"
 * attacks count, and days are built to weekday win targets with at least two of the professor's plans.
 * 6 (Britton's picks 2026-10-23, https://claude.ai/artifact/BXp1RfGmpEis5UanYC4bdb): the trainer plays by
 * the same rules (its own hand of three from its own row, the comeback charge). 7 (Britton, 2026-10-24): three
 * modes, and Normal's comeback is one Energy after a knockout (Easy: one for each card you've lost; Hard:
 * none). Days are built for Normal, so a rules 7 day's par and targets assume the single Energy.
 */
export type DuelRules = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A duel's mode (rules 6 days on): Easy (Britton, 2026-10-24) brings an Energy for each card you've lost
 * after a knockout and scores 200 less; Normal brings one; Hard brings none, gives no professor and
 * scores 200 more. The trainer's own comeback is the same in every mode.
 */
export type DuelLevel = "easy" | "normal" | "hard";

/** A condition a move puts on the card it hits: `coin` when the card flips a coin for it (a smaller chance). */
export interface DuelMoveFx {
  c: DuelCondition;
  coin?: true;
}

/**
 * What a "+" or "×" attack counts (rules 5, picks 2026-10-22: Miltank's Rout should count the
 * trainer's waiting cards). Read from the card's text by cardRules.ts plusOf; "foe" is the side
 * across the field from the card using the move, "you"/"self" its own side.
 */
export type DuelPlusKind =
  | "foeBench" | "foeLeft" | "youBench" | "bothBench" | "bothLeft"
  | "selfEnergy" | "foeEnergy" | "selfDamage" | "foeDamage"
  | "spareEnergy" | "youLeft" | "foeType" | "arrived"
  | "foeEx" | "foeCond" | "selfCond" | "youLost" | "foeLost";

export interface DuelPlus {
  /** "+": the printed number plus `per` for each one; "x": `per` for each one. */
  op: "+" | "x";
  kind: DuelPlusKind;
  per: number;
  /** Counts once (`per` more when it's true): an ex, a condition, any damage at all. */
  flat?: true;
  /** Only Energy of this type counts. */
  t?: EnergyType;
  /** selfCond, foeCond: only these conditions count (Facade: Burned or Poisoned). */
  conds?: DuelCondition[];
  /** The most it adds ("You can't add more than 20 damage"). */
  max?: number;
}

/** A move as the duel plays it: the printed name, the printed Energy cost, the printed damage as a number ("130+" and "50×" count as 130 and 50 until rules 5). */
export interface DuelMove {
  n: string;
  cost: EnergyType[];
  d: number;
  /** The conditions it puts on the card it hits (cardRules.ts conditionsOf). Played only on days built with the condition rules. */
  fx?: DuelMoveFx[];
  /** A "+" or "×" attack's count (cardRules.ts plusOf). Played from rules 5. */
  plus?: DuelPlus;
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

/**
 * Difficulty by weekday (picks: easy Monday, hardest Sunday; Saturday is Boss day, picks 2026-10-21 roster round).
 * "grunt" and "admin" are Trainer Road's villain teams (road encounters, picks 2026-10-24,
 * https://claude.ai/artifact/GRHU4zVKU8TjMpu4dQ9Kat): grunts easier than a region's Gym Leaders, admins
 * leading a story battle. The Daily Duel never picks them (tierFor only gives the weekday five).
 */
export type DuelTier = "gym" | "elite" | "rival" | "boss" | "champion" | "grunt" | "admin";

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
  /** Where in that game, when one person has several teams from it (a villain team's grunts: "Mt. Moon"). */
  place?: string;
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
  /** Rules 5: which Energy in your hand goes on (an index; 0 when absent). */
  use?: number;
}

/** One step of a duel: the cards you bring (rules 4, first), a card to send out (the lead, or after a knockout), or a turn. */
export type DuelStep = { bring: number[] } | { next: number } | DuelAction;
