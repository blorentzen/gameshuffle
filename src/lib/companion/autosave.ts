/**
 * The game in progress, kept in this browser after every change so a reload,
 * a locked phone or a closed tab never loses it (guests too). Separate from
 * account saves (saveStates.ts), which stay a deliberate "Save" for signed-in
 * players. Offered back on the resume list; cleared when a new game starts.
 * Client-only; every read and write is guarded (private windows, blocked
 * storage).
 */

import type { GameSettings } from "./gameSettings";
import type { PlayerId, SessionState, SlotState } from "./types";

const KEY = "gs-companion-autosave";
const VERSION = 1;
/** Older than this and it isn't offered back (a game from last week is noise). */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface LocalGame {
  savedAt: string;
  slots: SlotState[];
  playerNames: Record<PlayerId, string>;
  winCounters: Record<PlayerId, number>;
  gameSettings: GameSettings;
  loadedFromSaveId: string | null;
  turn?: import("./pokemonRules").TurnState | null;
}

export function writeLocalGame(state: SessionState): void {
  try {
    // Before a game starts (the resume list is up) there's nothing to keep, and
    // the kept game must survive until the player picks: clearing is explicit.
    if (!state.gameSettings.gameStarted) return;
    const game: LocalGame & { v: number } = {
      v: VERSION,
      savedAt: new Date().toISOString(),
      slots: state.slots,
      playerNames: state.playerNames,
      winCounters: state.winCounters,
      gameSettings: state.gameSettings,
      loadedFromSaveId: state.loadedFromSaveId,
      turn: state.turn ?? null,
    };
    window.localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // Storage full or blocked: the game still plays, it just won't come back after a reload.
  }
}

/** The game this browser kept, if it's recent and has something on the board. */
export function readLocalGame(): LocalGame | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Partial<LocalGame> & { v?: number };
    if (g.v !== VERSION || !Array.isArray(g.slots) || !g.playerNames || !g.winCounters || !g.gameSettings || !g.savedAt) return null;
    if (Date.now() - Date.parse(g.savedAt) > MAX_AGE_MS) return null;
    if (!g.slots.some((s) => s.occupied)) return null;
    return { savedAt: g.savedAt, slots: g.slots, playerNames: g.playerNames, winCounters: g.winCounters, gameSettings: g.gameSettings, loadedFromSaveId: g.loadedFromSaveId ?? null, turn: g.turn ?? null };
  } catch {
    return null;
  }
}

export function clearLocalGame(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
