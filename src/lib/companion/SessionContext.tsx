"use client";

/**
 * React context wrapper around the Companion reducer + active mode.
 *
 * Components consume `useSession()` for state/dispatch and
 * `useMode()` for label/rule lookup. Keeping the mode in its own
 * hook (vs. stitching it into the state) means a mode swap (when
 * Wave 2+ adds a mode picker) doesn't need to re-fork the reducer
 * shape — only re-initialize with a fresh `ModeConfig`.
 *
 * Wave 3: also exposes `startedAt` — set on mount and reset by
 * RESET_GAME — so the game-end persistence call (Wave 3) has a
 * real `started_at` for the row.
 *
 * Play together: in a shared game (`live`) the board comes from the server.
 * Moves show on this phone straight away (laid over the server's board until
 * the server confirms them) and go to the server one at a time; the phone
 * checks for the other player's moves every POLL_MS while open. Coin flips
 * and dice come from the server (`random`). Undo asks the server, which only
 * takes back this player's own last move. Rules in liveRules.ts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { initialSessionState, makeReducer, withHistory } from "./state";
import { remindFor } from "./reminders";
import { useToast } from "@/components/toast/ToastProvider";
import type { ModeConfig, PlayerId, SessionState, SlotPosition } from "./types";
import type { SessionAction } from "./state";
import { clearLocalGame, writeLocalGame } from "./autosave";
import { flipCoin, rollDie } from "./rng";
import { POLL_MS, hostOnly, serverRolls, type LiveMove, type LiveSeatView, type LiveView, type Seat } from "./liveRules";
import { isFailure, liveCreate, liveEnd, liveGet, liveMove, liveRollCall, liveUndoCall } from "./liveClient";

/** A shared game as this phone knows it. */
export interface LiveInfo {
  code: string;
  you: Seat;
  host: boolean;
  seats: Record<Seat, LiveSeatView>;
  lastMove: LiveMove | null;
  /** Ended by the host or idle ("ended"), or this phone isn't in it any more ("removed"). */
  ended: false | "ended" | "removed";
}

interface LiveLocal extends LiveInfo {
  token: string | null;
  version: number;
  canUndo: boolean;
  /** The board as the server last said it. */
  server: SessionState;
}

/** How a shared game starts on this phone (joining, or opening its link again). */
export interface LiveBoot {
  code: string;
  token: string | null;
  view: LiveView;
}

export interface CoinResult {
  side: "a" | "b";
  /** The server's flip a resolve move should name (Burn, Asleep). */
  rollId?: string;
  /** Already on the board's coin log (the server logged it): don't log it again. */
  logged: boolean;
}

export interface DieResult {
  value: number;
  logged: boolean;
}

interface SessionContextValue {
  state: SessionState;
  /** Dispatch wrapper that also resets `startedAt` on RESET_GAME so
   *  the next game's started_at is fresh when it ends. */
  dispatch: Dispatch<SessionAction>;
  mode: ModeConfig;
  /** Epoch ms — when the current game started. Resets on RESET_GAME. */
  startedAt: number;
  /** True when the player is a signed-in GS account (not a guest) — gates
   *  the "From My Cards" picker in the place-piece flow. */
  isAuthenticated: boolean;
  /** GS Pro (Play together needs it to start a game). */
  isPro: boolean;
  /** Step back one change (up to 50). Coin and dice logs stay as they are. */
  undo: () => void;
  canUndo: boolean;
  /** The slot to flash after something lands on it (Energy attached, say). */
  flash: { player: PlayerId; position: SlotPosition; at: number } | null;
  flashSlot: (player: PlayerId, position: SlotPosition) => void;
  /** The shared game this phone is in, or null on a single phone. */
  live: LiveInfo | null;
  /** Whose side sits at the bottom of this phone's board. */
  bottom: PlayerId;
  /** Share this phone's game (GS Pro). */
  startLive: () => Promise<{ ok: true; code: string } | { ok: false; error: string; message: string }>;
  /** Host: end the shared game for both phones (this phone keeps the board). */
  endLive: () => Promise<void>;
  /** Stop sharing on this phone and keep playing on it alone. */
  leaveLive: () => void;
  /** Coin flips and dice: from the server in a shared game, from this phone otherwise. */
  random: {
    coin: (use?: "log" | "resolve") => Promise<CoinResult>;
    die: (faces: number) => Promise<DieResult>;
  };
}

const Ctx = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  mode: ModeConfig;
  /** Seed for Player 1's name — typically the signed-in user's
   *  display name. Falls back to the engine default ("Player 1")
   *  when not provided (e.g. guest mode). Read once at mount; the
   *  user can rename inline in the header at any point. */
  player1Name?: string | null;
  /** Seed for Player 2's name. In a shared game the joining player's
   *  name comes from the server instead. */
  player2Name?: string | null;
  /** Optional saved-state snapshot to boot with. When provided, the
   *  reducer initializer skips the empty-board defaults and seeds
   *  directly from the saved row — this is the auto-resume path
   *  triggered by `?resume=<id>` deep links. */
  initialSavedState?: import("./saveStates").CompanionSavedState | null;
  /** Whether the player is signed in — enables the "From My Cards" picker. */
  isAuthenticated?: boolean;
  isPro?: boolean;
  /** Boot straight into a shared game (`?play=CODE`). */
  live?: LiveBoot | null;
  children: ReactNode;
}

/** The board a session starts with: a saved game (`?resume=`), or an empty board with the seeded names. */
function initialBoard(
  m: ModeConfig,
  seed: { initialSavedState?: import("./saveStates").CompanionSavedState | null; player1Name?: string | null; player2Name?: string | null },
): SessionState {
  const { initialSavedState, player1Name, player2Name } = seed;
  const fresh = initialSessionState(m);
  // Auto-resume path: hydrate the session from a saved-state row.
  // Names take from the save (those are part of game identity);
  // history resets (UI noise, not gameplay state).
  if (initialSavedState) {
    return {
      ...fresh,
      slots: initialSavedState.sessionData.slots,
      playerNames: initialSavedState.sessionData.playerNames,
      winCounters: initialSavedState.sessionData.winCounters,
      turn: initialSavedState.sessionData.turn ?? null,
      gameSettings: { ...initialSavedState.gameSettings, gameStarted: true },
      loadedFromSaveId: initialSavedState.id,
    };
  }
  if (!player1Name && !player2Name) return fresh;
  return {
    ...fresh,
    playerNames: {
      p1: player1Name?.trim() || fresh.playerNames.p1,
      p2: player2Name?.trim() || fresh.playerNames.p2,
    },
  };
}

function fromView(view: LiveView, token: string | null): LiveLocal {
  return {
    code: view.code,
    you: view.you,
    host: view.host,
    seats: view.seats,
    lastMove: view.lastMove,
    ended: view.ended ? "ended" : false,
    token,
    version: view.version,
    canUndo: view.canUndo,
    server: view.state,
  };
}

/** Keep the browser's address on the shared game, so a refresh gets back in. */
function setAddress(code: string | null) {
  try {
    window.history.replaceState(window.history.state, "", code ? `/tcg-companion?play=${code}` : "/tcg-companion");
  } catch {
    /* not in a browser */
  }
}

export function SessionProvider({
  mode,
  player1Name,
  player2Name,
  initialSavedState,
  isAuthenticated = false,
  isPro = false,
  live: liveBoot = null,
  children,
}: SessionProviderProps) {
  const base = useMemo(() => makeReducer(mode), [mode]);
  const reducer = useMemo(() => withHistory(base), [base]);
  const [history, baseDispatch] = useReducer(reducer, mode, (m) => ({ present: initialBoard(m, { initialSavedState, player1Name, player2Name }), past: [] }));

  // ---- Play together -------------------------------------------------------
  const [live, setLive] = useState<LiveLocal | null>(() => (liveBoot ? fromView(liveBoot.view, liveBoot.token) : null));
  // Moves sent but not yet confirmed, laid over the server's board.
  const [pending, setPending] = useState<{ id: number; action: SessionAction }[]>([]);
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextMoveId = useRef(0);

  const state = useMemo(
    () => (live ? pending.reduce((s, p) => base(s, p.action), live.server) : history.present),
    [live, pending, history.present, base],
  );

  const { toast } = useToast();

  const applyView = useCallback((view: LiveView) => {
    setLive((prev) => {
      if (!prev || prev.code !== view.code || view.version < prev.version) return prev;
      return { ...prev, version: view.version, server: view.state, you: view.you, host: view.host, seats: view.seats, lastMove: view.lastMove, ended: view.ended ? "ended" : false, canUndo: view.canUndo };
    });
  }, []);

  const markEnded = useCallback((how: "ended" | "removed") => {
    setLive((prev) => (prev && !prev.ended ? { ...prev, ended: how } : prev));
  }, []);

  // The other player's big moments (flips, attacks, turn changes) pop a note.
  const toasted = useRef<number | null>(null);
  const lastMove = live?.lastMove ?? null;
  const you = live?.you ?? null;
  useEffect(() => {
    if (!lastMove) return;
    const first = toasted.current == null;
    if (!first && lastMove.version <= (toasted.current ?? 0)) return;
    toasted.current = lastMove.version;
    if (!first && lastMove.by !== you && lastMove.big) toast({ variant: "info", message: lastMove.text });
  }, [lastMove, you, toast]);

  // Check for the other player's moves while this phone is open.
  const liveCode = live?.code ?? null;
  const liveEnded = live?.ended ?? false;
  useEffect(() => {
    if (!liveCode || liveEnded) return;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      const l = liveRef.current;
      if (!l || l.ended) return;
      busy = true;
      const res = await liveGet(l.code, l.token, l.version);
      busy = false;
      if (stopped) return;
      if (isFailure(res)) {
        if (res.status === 410) markEnded("ended");
        else if (res.status === 403 || res.status === 404) markEnded("removed");
        return;
      }
      if (res.view) applyView(res.view);
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveCode, liveEnded, applyView, markEnded]);

  /** Send one move; moves go one at a time so the server sees them in order. */
  const sendMove = useCallback(
    (action: SessionAction) => {
      const id = ++nextMoveId.current;
      setPending((p) => [...p, { id, action }]);
      queue.current = queue.current.then(async () => {
        const l = liveRef.current;
        if (!l) return;
        const res = await liveMove(l.code, l.token, action);
        setPending((p) => p.filter((m) => m.id !== id));
        if (isFailure(res)) {
          if (res.status === 410) markEnded("ended");
          else toast({ variant: "warning", message: res.message });
          return;
        }
        applyView(res.view);
      });
    },
    [applyView, markEnded, toast],
  );

  const liveUndo = useCallback(async () => {
    const l = liveRef.current;
    if (!l) return;
    await queue.current;
    const res = await liveUndoCall(l.code, l.token);
    if (isFailure(res)) toast({ variant: "info", message: res.message });
    else applyView(res.view);
  }, [applyView, toast]);

  // Keep the game in progress in this browser after every change (a shared
  // game lives on the server, and its link gets back in).
  const isLive = !!live;
  useEffect(() => { if (!isLive) writeLocalGame(state); }, [state, isLive]);

  // We can't compute Date.now() at module init time without
  // poisoning the reducer's purity, but useState's lazy initializer
  // runs on mount (not during render) so it's the React-blessed way
  // to stamp a fresh value. RESET_GAME then refreshes it via
  // setStartedAt below.
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());

  // Rule reminders (remind, don't block): the move always happens, and a
  // reminder shows with Undo. Undo only takes back that move: after any other
  // move the toast's Undo says so instead of undoing the wrong thing.
  const moves = useRef(0);
  const dispatch = useCallback<Dispatch<SessionAction>>(
    (action) => {
      const l = liveRef.current;
      if (l) {
        if (l.ended) { toast({ variant: "info", message: "This shared game has ended." }); return; }
        // Which save row this is only means something on the phone that saved it.
        if (action.type === "LINK_SAVE_ID") return;
        // The server rolls and logs coins and dice in a shared game.
        if (serverRolls(action)) return;
        if (hostOnly(action) && !l.host) {
          toast({ variant: "info", message: `Only ${l.seats.p1.name || "the host"} can do that in a shared game.` });
          return;
        }
      }
      const reminder = remindFor(state, action, mode);
      if (l) sendMove(action);
      else baseDispatch(action);
      const move = ++moves.current;
      if (reminder) {
        toast({
          variant: "warning",
          title: "Rule check",
          message: reminder,
          action: {
            label: "Undo",
            onClick: () => {
              if (moves.current !== move) {
                toast({ variant: "info", message: "Something else changed since. Use Undo in the board's menu to step back." });
                return;
              }
              if (liveRef.current) void liveUndo();
              else baseDispatch({ type: "UNDO" });
            },
          },
        });
      }
      if (action.type === "RESET_GAME") {
        if (!l) clearLocalGame();
        setStartedAt(Date.now());
      }
    },
    [baseDispatch, state, mode, toast, sendMove, liveUndo],
  );
  const undo = useCallback(() => {
    moves.current += 1;
    if (liveRef.current) void liveUndo();
    else baseDispatch({ type: "UNDO" });
  }, [baseDispatch, liveUndo]);
  // In a shared game the server says whether this phone has a move to take back.
  const canUndo = live ? !live.ended && live.canUndo : history.past.length > 0;
  const [flash, setFlash] = useState<SessionContextValue["flash"]>(null);
  const flashSlot = useCallback<SessionContextValue["flashSlot"]>((player, position) => setFlash({ player, position, at: Date.now() }), []);

  const startLive = useCallback<SessionContextValue["startLive"]>(async () => {
    const res = await liveCreate(history.present, mode.key);
    if (isFailure(res)) return { ok: false, error: res.error, message: res.message };
    // A new game has no moves yet, so the very first one ("Riley joined") pops.
    toasted.current = 0;
    setPending([]);
    setLive(fromView(res.view, null));
    setAddress(res.view.code);
    return { ok: true, code: res.view.code };
  }, [history.present, mode.key]);

  /** Back to a board on this phone alone, keeping what's on it now. */
  const goLocal = useCallback(() => {
    baseDispatch({ type: "REPLACE_STATE", state });
    setPending([]);
    setLive(null);
    toasted.current = null;
    setAddress(null);
  }, [state]);

  const endLive = useCallback(async () => {
    const l = liveRef.current;
    if (!l) return;
    await queue.current;
    const res = await liveEnd(l.code, l.token);
    if (isFailure(res) && res.status !== 410) {
      toast({ variant: "warning", message: res.message });
      return;
    }
    goLocal();
    toast({ variant: "success", message: "Shared game ended. The board stays on this phone." });
  }, [goLocal, toast]);

  const random = useMemo<SessionContextValue["random"]>(() => {
    const offline = () => toast({ variant: "warning", message: "Couldn't reach GameShuffle, so this roll only shows on your phone." });
    return {
      coin: async (use = "log") => {
        const l = liveRef.current;
        const local = (): CoinResult => ({ side: flipCoin() === 0 ? "a" : "b", logged: false });
        if (!l || l.ended) return local();
        await queue.current;
        const res = await liveRollCall(l.code, l.token, { kind: "coin", use });
        if (isFailure(res) || (res.value !== "a" && res.value !== "b")) {
          offline();
          return { ...local(), logged: true };
        }
        applyView(res.view);
        return { side: res.value, rollId: res.rollId, logged: use === "log" };
      },
      die: async (faces) => {
        const l = liveRef.current;
        if (!l || l.ended) return { value: rollDie(faces), logged: false };
        await queue.current;
        const res = await liveRollCall(l.code, l.token, { kind: "die", faces, use: "log" });
        if (isFailure(res) || typeof res.value !== "number") {
          offline();
          return { value: rollDie(faces), logged: true };
        }
        applyView(res.view);
        return { value: res.value, logged: true };
      },
    };
  }, [applyView, toast]);

  const liveInfo = useMemo<LiveInfo | null>(
    () => (live ? { code: live.code, you: live.you, host: live.host, seats: live.seats, lastMove: live.lastMove, ended: live.ended } : null),
    [live],
  );
  const bottom: PlayerId = live?.you ?? "p1";

  const value = useMemo(
    () => ({ state, dispatch, mode, startedAt, isAuthenticated, isPro, undo, canUndo, flash, flashSlot, live: liveInfo, bottom, startLive, endLive, leaveLive: goLocal, random }),
    [state, dispatch, mode, startedAt, isAuthenticated, isPro, undo, canUndo, flash, flashSlot, liveInfo, bottom, startLive, endLive, goLocal, random],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession called outside <SessionProvider>");
  return ctx;
}

export function useMode(): ModeConfig {
  return useSession().mode;
}
