/**
 * Play together: what each request does to a shared game, as pure functions
 * (no database, randomness passed in), so the whole flow is testable
 * (scripts/test-companion-live.ts). `live.ts` loads the row, calls one of
 * these, and saves the patch only if nobody saved in between.
 */

import { makeReducer, type SessionAction } from "./state";
import type { ModeConfig, SessionState } from "./types";
import {
  describeMove,
  hostOnly,
  isAway,
  otherSeat,
  pushPast,
  serverRolls,
  undoCheck,
  type LiveMove,
  type LiveSeatView,
  type LiveView,
  type PastEntry,
  type Seat,
} from "./liveRules";

export interface SeatRow {
  name: string;
  userId: string | null;
  tokenHash: string | null;
  seenAt: string | null;
}

/** A flip the server made for a coin a phone is about to use (Burn, Asleep). */
export interface PendingRoll {
  id: string;
  seat: Seat;
  side: "a" | "b";
  at: string;
}

/** The parts of a `companion_live_games` row the plans read and write. */
export interface GameRow {
  code: string;
  seats: Partial<Record<Seat, SeatRow>>;
  state: SessionState;
  version: number;
  past: PastEntry[];
  last_move: LiveMove | null;
  pending_rolls: PendingRoll[];
  ended_at: string | null;
}

export type LiveError =
  | "missing"      // the table isn't there yet
  | "not_found"
  | "ended"
  | "full"
  | "not_in_game"
  | "host_only"
  | "bad_move"
  | "bad_name"
  | "busy";        // kept colliding with the other phone's moves

export type LiveResult<T> = { ok: true; value: T } | { ok: false; error: LiveError; message?: string };
export const fail = <T>(error: LiveError, message?: string): LiveResult<T> => ({ ok: false, error, message });

/** A change to save, or null for "nothing changed". */
export type Patch = Partial<Pick<GameRow, "seats" | "state" | "version" | "past" | "last_move" | "pending_rolls">>;
export type Plan = LiveResult<Patch | null>;

/** Moves that start over: Undo can't reach back past them. */
const FRESH_START = new Set<SessionAction["type"]>(["RESET_GAME", "LOAD_SAVED_STATE", "APPLY_GAME_SETTINGS"]);

/** Keep the seats' names in step with the board's (a rename on either phone). */
export function syncNames(seats: GameRow["seats"], state: SessionState): GameRow["seats"] {
  const out = { ...seats };
  for (const seat of ["p1", "p2"] as const) {
    if (out[seat] && state.playerNames[seat]) out[seat] = { ...out[seat]!, name: state.playerNames[seat] };
  }
  return out;
}

export function viewFor(row: GameRow, you: Seat, now: number): LiveView {
  const seat = (id: Seat): LiveSeatView => {
    const s = row.seats[id];
    return { name: row.state.playerNames[id] ?? s?.name ?? "", joined: !!s, away: s ? isAway(s.seenAt, now) : true, account: !!s?.userId };
  };
  return {
    code: row.code,
    version: row.version,
    state: row.state,
    you,
    host: you === "p1",
    seats: { p1: seat("p1"), p2: seat("p2") },
    lastMove: row.last_move,
    ended: !!row.ended_at,
    canUndo: undoCheck(row.past ?? [], you).ok,
  };
}

/** The opponent takes the empty seat; the board gets their name. */
export function planJoin(row: GameRow, mode: ModeConfig, joiner: { name: string; userId: string | null; tokenHash: string | null }, now: string): Plan {
  if (row.seats.p2) return fail("full");
  const state = makeReducer(mode)(row.state, { type: "SET_PLAYER_NAME", player: "p2", name: joiner.name });
  const version = row.version + 1;
  return {
    ok: true,
    value: {
      seats: { ...row.seats, p2: { name: joiner.name, userId: joiner.userId, tokenHash: joiner.tokenHash, seenAt: now } },
      state,
      version,
      last_move: { by: "p2", text: `${joiner.name} joined`, big: true, at: now, version },
    },
  };
}

/**
 * One move from a phone. Phones never log coins or dice (the server does);
 * only the host starts a new game; a coin being resolved uses the server's
 * flip (`coin` is the server's fallback flip when the phone didn't ask first).
 */
export function planMove(row: GameRow, seat: Seat, raw: SessionAction, mode: ModeConfig, coin: () => "a" | "b", now: string): Plan {
  if (!raw || typeof raw !== "object" || typeof (raw as { type?: unknown }).type !== "string") return fail("bad_move");
  let action = raw;
  if (serverRolls(action)) return fail("bad_move", "Coin flips and dice are rolled by GameShuffle in a shared game.");
  if (hostOnly(action) && seat !== "p1") return fail("host_only", `Only ${row.state.playerNames.p1 || "the host"} can do that in this game.`);
  if (action.type === "RESET_GAME") action = { ...action, mode };
  let pending = row.pending_rolls ?? [];
  const resolving = action.type === "RESOLVE_BURN_COIN" || action.type === "RESOLVE_EXTRA_COIN";
  if (action.type === "RESOLVE_BURN_COIN" || action.type === "RESOLVE_EXTRA_COIN") {
    const rollId = action.rollId;
    const roll = rollId ? pending.find((r) => r.id === rollId && r.seat === seat) : undefined;
    const side = roll ? roll.side : coin();
    pending = pending.filter((r) => r.id !== rollId);
    action = { ...action, side, rollId: undefined };
  }
  const before = row.state;
  const next = makeReducer(mode)(before, action);
  // The reducer sometimes returns a fresh copy for a move that changes nothing.
  if (next === before || JSON.stringify(next) === JSON.stringify(before)) return { ok: true, value: null };
  const said = describeMove(before, action, mode, seat);
  const version = row.version + 1;
  return {
    ok: true,
    value: {
      state: next,
      version,
      seats: syncNames(row.seats, next),
      past: FRESH_START.has(action.type)
        ? []
        : pushPast(row.past ?? [], { by: seat, version: row.version, state: before, ...(resolving ? { kind: "roll" as const } : {}) }),
      last_move: said ? { by: seat, text: said.text, big: said.big, at: now, version } : row.last_move,
      pending_rolls: pending,
    },
  };
}

/** Take back this seat's own last move, while nobody has moved since (never a flip). */
export function planUndo(row: GameRow, seat: Seat, now: string): Plan {
  const check = undoCheck(row.past ?? [], seat);
  if (!check.ok) {
    if (check.reason === "nothing") return fail("bad_move", "Nothing of yours to take back.");
    if (check.reason === "roll") return fail("bad_move", "A coin flip or die roll can't be taken back in a shared game.");
    return fail("bad_move", `${row.state.playerNames[check.by ?? otherSeat(seat)]} has moved since. Change it back by hand.`);
  }
  const version = row.version + 1;
  return {
    ok: true,
    value: {
      state: check.entry.state,
      version,
      seats: syncNames(row.seats, check.entry.state),
      past: (row.past ?? []).slice(0, -1),
      last_move: { by: seat, text: `${row.state.playerNames[seat]} took back their last move`, big: false, at: now, version },
    },
  };
}

/**
 * A server roll. `log`: on the board's log for both players (and on the Undo
 * list so nobody's Undo reaches past it). `resolve`: kept for the phone's
 * resolve move; the board and its version don't change.
 */
export function planRoll(
  row: GameRow,
  seat: Seat,
  roll: { kind: "coin" | "die"; faces: number; use: "log" | "resolve"; value: number | "a" | "b"; rollId?: string },
  mode: ModeConfig,
  now: string,
): Plan {
  if (roll.use === "resolve") {
    if (roll.kind !== "coin" || !roll.rollId) return fail("bad_move");
    const pending = [...(row.pending_rolls ?? []), { id: roll.rollId, seat, side: roll.value as "a" | "b", at: now }].slice(-6);
    return { ok: true, value: { pending_rolls: pending } };
  }
  const action: SessionAction = roll.kind === "coin"
    ? { type: "LOG_COIN_FLIP", side: roll.value as "a" | "b" }
    : { type: "LOG_DICE_ROLL", faces: roll.faces, result: roll.value as number };
  const before = row.state;
  const next = makeReducer(mode)(before, action);
  const said = describeMove(before, action, mode, seat);
  const version = row.version + 1;
  return {
    ok: true,
    value: {
      state: next,
      version,
      past: pushPast(row.past ?? [], { by: seat, version: row.version, state: before, kind: "roll" }),
      last_move: said ? { by: seat, text: said.text, big: true, at: now, version } : row.last_move,
    },
  };
}
