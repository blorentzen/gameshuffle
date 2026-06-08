/**
 * Shared types for the Companion save-state surface.
 *
 * Save state captures a snapshot of an in-progress game so an
 * authenticated user can resume mid-match. Shipped to Free+ via
 * the `companion.save_state` capability key in `subscription.ts`.
 *
 * History (coin / dice rolls) is intentionally dropped on save —
 * it's UI-affordance noise, not gameplay state. Restoring boots a
 * fresh history.
 */

import type { GameSettings } from "./gameSettings";
import type { PlayerId, SlotState } from "./types";

/** v1 of the persisted shape. Bump when SessionState changes
 *  incompatibly and add a migration in `migrateSaveState`. */
export const SAVE_STATE_VERSION = 1;

/** The reducible portion of SessionState we persist — gameSettings
 *  is stored separately on the row so the Resume picker can read
 *  format + prize count without parsing this blob. */
export interface CompanionSessionSnapshot {
  slots: SlotState[];
  playerNames: Record<PlayerId, string>;
  winCounters: Record<PlayerId, number>;
}

/** What the Resume picker + Save flow read back from the DB row.
 *  Mirrors a `companion_save_states` row, normalized for the
 *  client. Timestamps come back as ISO strings. */
export interface CompanionSavedState {
  id: string;
  name: string | null;
  mode: string;
  gameSettings: GameSettings;
  sessionData: CompanionSessionSnapshot;
  stateVersion: number;
  updatedAt: string;
  createdAt: string;
}

/** Payload accepted by the save server action. `id` present →
 *  update existing; `id` omitted → insert new. */
export interface SaveCompanionGameInput {
  id?: string;
  name: string | null;
  mode: string;
  gameSettings: GameSettings;
  sessionData: CompanionSessionSnapshot;
}

/** Default human-friendly name when the user doesn't pick one —
 *  "<format-label> · <YYYY-MM-DD>". The date is supplied by the
 *  client (the reducer is pure / can't `new Date()`). */
export function defaultSaveName(formatLabel: string, dateIso: string): string {
  const date = dateIso.slice(0, 10);
  return `${formatLabel} · ${date}`;
}
