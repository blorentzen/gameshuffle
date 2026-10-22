import "server-only";

/**
 * Daily Duel: the roster and card data the day builder draws from (made by
 * scripts/build-duel-cards.ts into src/data/originals/duel/). Only the builder reads it: a built day
 * keeps its own copy of its cards and trainer (duel_days.cards / .trainer), so a stored day plays
 * the same after the data changes.
 */

import { DUEL_CARDS } from "@/data/originals/duel/cards.generated";
import { DUEL_POOL } from "@/data/originals/duel/pool";
import { DUEL_TRAINERS } from "@/data/originals/duel/trainers";
import type { DuelCard, DuelTrainer } from "./types";

export interface DuelData {
  cards: Readonly<Record<string, DuelCard>>;
  pool: readonly string[];
  trainers: readonly DuelTrainer[];
}

export const DUEL_DATA: DuelData = { cards: DUEL_CARDS, pool: DUEL_POOL, trainers: DUEL_TRAINERS };
