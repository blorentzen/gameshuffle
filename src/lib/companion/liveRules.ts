/**
 * Play together: the rules for a game shared between two phones. Pure and
 * client-safe; the server (`live.ts`) runs every move through the same
 * reducer the phone uses, and these helpers decide what a phone may send,
 * what a move is called on the other phone, and when Undo is allowed.
 *
 * Nobody's deck or hand is in the game: it's the same companion board,
 * kept in step. Coin flips and dice are rolled by the server.
 */

import { findSlot, type SessionAction } from "./state";
import type { ModeConfig, PlayerId, SessionState, SlotPosition } from "./types";

/** No I, O, 0 or 1, so a code read across a table can't be misheard. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
/** How many moves back Undo can reach (your own, and only while nobody moved since). */
export const PAST_CAP = 5;
/** A shared game with no move for this long is over. */
export const IDLE_HOURS = 12;
/** How often a phone checks for the other player's moves while open. */
export const POLL_MS = 1500;
/** Not heard from for this long = shown as away. */
export const AWAY_MS = 45_000;
/** Recorded as seen at most this often (a check-in is a database write). */
export const SEEN_EVERY_MS = 15_000;

export type Seat = PlayerId;

/** What the other phone is told about a move. `big` ones also pop a note. */
export interface LiveMove {
  by: Seat;
  text: string;
  big: boolean;
  at: string;
  version: number;
}

export interface LiveSeatView {
  name: string;
  joined: boolean;
  away: boolean;
  /** Signed in (their result is saved). */
  account: boolean;
}

/** What a phone in the game sees. */
export interface LiveView {
  code: string;
  version: number;
  state: SessionState;
  you: Seat;
  host: boolean;
  seats: Record<Seat, LiveSeatView>;
  lastMove: LiveMove | null;
  ended: boolean;
  /** This phone has a move of its own to take back (see undoCheck). */
  canUndo: boolean;
}

/** What the join page sees before joining. */
export interface LivePreview {
  code: string;
  hostName: string;
  open: boolean;
  ended: boolean;
}

/** The board before a move, so its maker can take it back. */
export interface PastEntry {
  by: Seat;
  version: number;
  state: SessionState;
  /** A coin flip or die roll: on the list so Undo can't reach past it, never taken back. */
  kind?: "roll";
}

export function makeCode(randomIndex: (n: number) => number): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return code;
}

/** "kq7 m3p" or "KQ7-M3P" → "KQ7M3P"; anything that can't be a code → null. */
export function normalizeCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** "KQ7 M3P", easier to read out. */
export function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Only the host starts a new game, loads a save or changes the settings. */
const HOST_ONLY = new Set<SessionAction["type"]>(["RESET_GAME", "LOAD_SAVED_STATE", "APPLY_GAME_SETTINGS", "LINK_SAVE_ID"]);
export function hostOnly(action: SessionAction): boolean {
  return HOST_ONLY.has(action.type);
}

/** Phones never send these in a shared game: the server rolls and logs them. */
const SERVER_ROLLS = new Set<SessionAction["type"]>(["LOG_COIN_FLIP", "LOG_DICE_ROLL"]);
export function serverRolls(action: SessionAction): boolean {
  return SERVER_ROLLS.has(action.type);
}

/** Keep the last few boards for Undo. */
export function pushPast(past: PastEntry[], entry: PastEntry): PastEntry[] {
  return [...past, entry].slice(-PAST_CAP);
}

/**
 * Undo takes back your own last move, and only while it's the latest one. A
 * coin flip or die roll is never taken back (that would be a re-flip).
 */
export function undoCheck(past: PastEntry[], seat: Seat): { ok: true; entry: PastEntry } | { ok: false; reason: "nothing" | "not_yours" | "roll"; by?: Seat } {
  const last = past[past.length - 1];
  if (!last) return { ok: false, reason: "nothing" };
  if (last.by !== seat) return { ok: false, reason: "not_yours", by: last.by };
  if (last.kind === "roll") return { ok: false, reason: "roll" };
  return { ok: true, entry: last };
}

/** The other seat. */
export function otherSeat(seat: Seat): Seat {
  return seat === "p1" ? "p2" : "p1";
}

/** A seat is away when it hasn't checked in for a while. */
export function isAway(seenAt: string | null | undefined, now: number): boolean {
  if (!seenAt) return true;
  return now - Date.parse(seenAt) > AWAY_MS;
}

function where(mode: ModeConfig, position: SlotPosition): string {
  return position === "active" ? `the ${mode.positionLabels.active} spot` : `the ${mode.positionLabels.bench}`;
}

function nameAt(state: SessionState, player: PlayerId, position: SlotPosition): string {
  return findSlot(state, player, position)?.name?.trim() || "a Pokémon";
}

/**
 * A short line about a move, as the other player reads it ("Riley put 30
 * damage on Pikachu ex"), from the board before the move. Null = not worth
 * saying (a cosmetic change).
 */
export function describeMove(before: SessionState, action: SessionAction, mode: ModeConfig, by: Seat): { text: string; big: boolean } | null {
  const who = before.playerNames[by]?.trim() || (by === "p1" ? "Player 1" : "Player 2");
  const coin = (side: "a" | "b") => (side === "a" ? mode.coinLabels.a : mode.coinLabels.b);
  switch (action.type) {
    case "PLACE_PIECE":
      return { text: `${who} put ${action.name?.trim() || "a Pokémon"} in ${where(mode, action.position)}`, big: false };
    case "REMOVE_PIECE":
      return { text: `${who} discarded ${nameAt(before, action.player, action.position)}`, big: false };
    case "KNOCKOUT":
      return { text: `${who} Knocked Out ${nameAt(before, action.player, action.position)}`, big: true };
    case "ADJUST_DAMAGE":
    case "APPLY_DAMAGE_WITH_KO_CHECK": {
      if (!action.delta) return null;
      const name = nameAt(before, action.player, action.position);
      return action.delta > 0
        ? { text: `${who} put ${action.delta} damage on ${name}`, big: false }
        : { text: `${who} took ${-action.delta} damage off ${name}`, big: false };
    }
    case "RESET_DAMAGE":
      return { text: `${who} cleared the damage on ${nameAt(before, action.player, action.position)}`, big: false };
    case "TOGGLE_CONDITION": {
      const label = action.which === "a" ? mode.conditionALabel : mode.conditionBLabel;
      const name = nameAt(before, action.player, action.position);
      return { text: action.value ? `${who} gave ${name} ${label}` : `${who} took ${label} off ${name}`, big: false };
    }
    case "TOGGLE_EXTRA_CONDITION": {
      const label = mode.extraConditions.find((c) => c.key === action.key)?.label ?? "a condition";
      const name = nameAt(before, action.player, action.position);
      return { text: action.value ? `${who} made ${name} ${label}` : `${name} is no longer ${label}`, big: false };
    }
    case "ADJUST_ENERGY": {
      if (!action.delta) return null;
      const label = mode.energyTypes.find((e) => e.key === action.energyKey)?.label ?? "an";
      const name = nameAt(before, action.player, action.position);
      return action.delta > 0
        ? { text: `${who} attached ${label} Energy to ${name}`, big: false }
        : { text: `${who} took ${label} Energy off ${name}`, big: false };
    }
    case "CLEAR_ENERGIES":
      return { text: `${who} took all the Energy off ${nameAt(before, action.player, action.position)}`, big: false };
    case "MOVE_PIECE": {
      const name = nameAt(before, action.player, action.from);
      if (action.to === "active") return { text: `${who} made ${name} the ${mode.positionLabels.active} Pokémon`, big: false };
      if (action.from === "active") return { text: `${who} moved ${name} to the ${mode.positionLabels.bench}`, big: false };
      return { text: `${who} moved ${name} on the ${mode.positionLabels.bench}`, big: false };
    }
    case "UPDATE_PIECE_META": {
      const old = nameAt(before, action.player, action.position);
      if (action.evolved && action.name) return { text: `${who} evolved ${old} into ${action.name}`, big: false };
      if (action.tool !== undefined) return { text: action.tool ? `${who} attached a Tool to ${old}` : `${who} took the Tool off ${old}`, big: false };
      return { text: `${who} changed ${old}`, big: false };
    }
    case "ADJUST_WIN_COUNTER": {
      const owner = before.playerNames[action.player] || "A player";
      const n = (before.winCounters[action.player] ?? 0) + action.delta;
      return { text: `${owner} now has ${n} ${mode.winCounterLabel.toLowerCase()} left`, big: false };
    }
    case "SET_PLAYER_NAME":
      return { text: `${before.playerNames[action.player] || "A player"} is now ${action.name}`, big: false };
    case "LOG_COIN_FLIP":
      return { text: `${who} flipped a coin: ${coin(action.side)}`, big: true };
    case "LOG_DICE_ROLL":
      return { text: `${who} rolled a d${action.faces}: ${action.result}`, big: true };
    case "RESOLVE_BURN_COIN":
      return { text: `${who} flipped for ${mode.conditionBLabel} on ${nameAt(before, action.player, action.position)}: ${coin(action.side)}`, big: true };
    case "RESOLVE_EXTRA_COIN": {
      const label = mode.extraConditions.find((c) => c.key === action.key)?.label ?? "a condition";
      return { text: `${who} flipped for ${label} on ${nameAt(before, action.player, action.position)}: ${coin(action.side)}`, big: true };
    }
    case "START_TURNS":
      return { text: `${before.playerNames[action.first] || "A player"} goes first`, big: true };
    case "END_TURN": {
      if (!before.turn) return null;
      const next = otherSeat(before.turn.player);
      return { text: `${before.playerNames[before.turn.player]} ended their turn. ${before.playerNames[next]}'s turn`, big: true };
    }
    case "ATTACK": {
      const target = nameAt(before, action.target.player, action.target.position);
      const attacker = before.turn ? nameAt(before, before.turn.player, "active") : who;
      return { text: `${attacker}${action.name ? ` used ${action.name}` : " attacked"}: ${action.damage} to ${target}`, big: true };
    }
    case "MARK_USED":
      return null;
    case "RESET_GAME":
      return { text: `${who} started a new game`, big: true };
    case "LOAD_SAVED_STATE":
      return { text: `${who} loaded a saved game`, big: true };
    case "APPLY_GAME_SETTINGS":
      return { text: `${who} set up the game`, big: true };
    default:
      return null;
  }
}
