"use client";

/**
 * Persists the action a viewer was attempting (e.g., "pick this track")
 * across the Twitch OAuth round-trip, then replays it after the
 * authenticated viewer lands back on the live view.
 *
 * Per spec §9.2: when an unauthenticated viewer clicks an action that
 * needs identity, we open the auth modal, redirect through Supabase
 * Auth's Twitch provider, then return to the live view URL. This hook
 * stashes the pending action in sessionStorage before redirect and
 * fires it on mount when the page comes back, so the click feels
 * continuous from the user's perspective.
 *
 * sessionStorage keeps the data tab-scoped and ephemeral — perfect for
 * a one-shot replay.
 */

import { useCallback, useEffect } from "react";

const STORAGE_KEY = "gs_live_pending_action";

export interface PendingAction {
  /** Distinguishes which surface the action should replay against. */
  kind: "pick-track" | "ban-track" | "pick-item" | "ban-item";
  /** The track id / item-preset id to act on. */
  id: string;
  /** Slug of the live view we should be back on after auth. Sanity-checked
   *  on replay so a stale action from a different streamer doesn't fire. */
  expectedSlug: string;
}

export function rememberPendingAction(action: PendingAction): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  } catch {
    // sessionStorage can throw in private modes; replay-after-auth
    // becomes "you have to click again," which is acceptable.
  }
}

export function clearPendingAction(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readPendingAction(): PendingAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAction;
    if (!parsed.kind || !parsed.id || !parsed.expectedSlug) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ReplayHandlerArgs {
  action: PendingAction;
}

/**
 * On mount, check for a pending action and invoke the replay handler
 * if one matches the current slug. Always clears the stored action
 * after read so it can't replay twice on a refresh.
 */
export function useReplayActionAfterAuth(args: {
  currentSlug: string;
  isAuthenticated: boolean;
  onReplay: (a: ReplayHandlerArgs) => void;
}): void {
  const { currentSlug, isAuthenticated, onReplay } = args;
  // Stable ref to the handler isn't critical here — the effect runs once
  // on auth state transitions and clears the storage either way.
  const replay = useCallback(
    (action: PendingAction) => onReplay({ action }),
    [onReplay]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = readPendingAction();
    clearPendingAction();
    if (!pending) return;
    if (pending.expectedSlug !== currentSlug) return;
    replay(pending);
  }, [isAuthenticated, currentSlug, replay]);
}
