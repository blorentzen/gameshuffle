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
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { initialSessionState, makeReducer } from "./state";
import type { ModeConfig, SessionState } from "./types";
import type { SessionAction } from "./state";

interface SessionContextValue {
  state: SessionState;
  /** Dispatch wrapper that also resets `startedAt` on RESET_GAME so
   *  the next game's started_at is fresh when it ends. */
  dispatch: Dispatch<SessionAction>;
  mode: ModeConfig;
  /** Epoch ms — when the current game started. Resets on RESET_GAME. */
  startedAt: number;
}

const Ctx = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  mode: ModeConfig;
  /** Seed for Player 1's name — typically the signed-in user's
   *  display name. Falls back to the engine default ("Player 1")
   *  when not provided (e.g. guest mode). Read once at mount; the
   *  user can rename inline in the header at any point. */
  player1Name?: string | null;
  /** Seed for Player 2's name. v1 leaves this open for the opponent
   *  to type in; once dual-device sessions ship, this becomes the
   *  joining player's display name. */
  player2Name?: string | null;
  /** Optional saved-state snapshot to boot with. When provided, the
   *  reducer initializer skips the empty-board defaults and seeds
   *  directly from the saved row — this is the auto-resume path
   *  triggered by `?resume=<id>` deep links. */
  initialSavedState?: import("./saveStates").CompanionSavedState | null;
  children: ReactNode;
}

export function SessionProvider({
  mode,
  player1Name,
  player2Name,
  initialSavedState,
  children,
}: SessionProviderProps) {
  const reducer = useMemo(() => makeReducer(mode), [mode]);
  const [state, baseDispatch] = useReducer(reducer, mode, (m) => {
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
  });

  // We can't compute Date.now() at module init time without
  // poisoning the reducer's purity, but useState's lazy initializer
  // runs on mount (not during render) so it's the React-blessed way
  // to stamp a fresh value. RESET_GAME then refreshes it via
  // setStartedAt below.
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());

  const dispatch = useCallback<Dispatch<SessionAction>>(
    (action) => {
      baseDispatch(action);
      if (action.type === "RESET_GAME") {
        setStartedAt(Date.now());
      }
    },
    [baseDispatch],
  );

  const value = useMemo(
    () => ({ state, dispatch, mode, startedAt }),
    [state, dispatch, mode, startedAt],
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
