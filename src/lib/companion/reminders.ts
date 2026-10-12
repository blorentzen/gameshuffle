/**
 * Rule reminders for moves on the board (pure, client-safe). The board never
 * blocks a move (Britton, 2026-10-11: remind, don't block); this reads the
 * board just before a move and returns the sentence to show next to Undo, or
 * null. Only while turns are tracked, and only for the player whose turn it is:
 * the other player's pieces change through card effects all the time.
 * Attacks are checked inside the attack picker instead (reminderAttack).
 */

import { findSlot, type SessionAction } from "./state";
import type { ModeConfig, SessionState, SlotState } from "./types";
import {
  reminderEnergy,
  reminderEvolve,
  reminderRetreat,
  reminderStadium,
  reminderSupporter,
  type PieceFacts,
} from "./pokemonRules";

/** What a reminder needs to know about a piece, in the mode's own words. */
export function pieceFacts(slot: SlotState, mode: ModeConfig): PieceFacts {
  return {
    name: slot.name,
    enteredTurn: slot.enteredTurn ?? null,
    conditions: [
      slot.conditionA ? mode.conditionALabel : null,
      slot.conditionB ? mode.conditionBLabel : null,
      ...mode.extraConditions.filter((d) => slot.extraConditions[d.key]).map((d) => d.label),
    ].filter((c): c is string => !!c),
    energy: slot.energies,
    rules: slot.rules ?? null,
  };
}

export function remindFor(state: SessionState, action: SessionAction, mode: ModeConfig): string | null {
  const turn = state.turn;
  if (!turn) return null;
  const who = state.playerNames[turn.player];

  switch (action.type) {
    case "ADJUST_ENERGY": {
      if (action.delta <= 0 || action.player !== turn.player) return null;
      return findSlot(state, action.player, action.position)?.occupied ? reminderEnergy(turn, who) : null;
    }
    case "MOVE_PIECE": {
      if (action.player !== turn.player || action.from === action.to) return null;
      const to = findSlot(state, action.player, action.to);
      // Promoting into an empty Active (after a Knock Out) isn't a retreat.
      const retreat = action.from === "active" || (action.to === "active" && !!to?.occupied);
      const active = findSlot(state, action.player, "active");
      return retreat && active?.occupied ? reminderRetreat(turn, who, pieceFacts(active, mode)) : null;
    }
    case "UPDATE_PIECE_META": {
      if (action.player !== turn.player) return null;
      const slot = findSlot(state, action.player, action.position);
      if (!slot?.occupied) return null;
      const evolved = action.evolved === true || (action.koValue !== undefined && action.koValue !== slot.koValue);
      return evolved ? reminderEvolve(turn, pieceFacts(slot, mode)) : null;
    }
    case "MARK_USED": {
      if (!action.value) return null;
      if (action.key === "supporter") return reminderSupporter(turn, who);
      if (action.key === "stadium") return reminderStadium(turn, who);
      return null;
    }
    default:
      return null;
  }
}

/** "This Pokémon also does 30 damage to itself." → 30 (the attack picker offers to add it). */
export function selfDamage(text: string | null): number | null {
  const m = text?.match(/does (\d+) damage to itself/i);
  return m ? Number(m[1]) : null;
}
