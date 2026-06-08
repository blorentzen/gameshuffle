"use client";

/**
 * Client-side gate-vs-board decider.
 *
 * Reads the localStorage / sessionStorage flags that aren't
 * available in the server component and decides which surface to
 * render:
 *
 *   - Authenticated → CompanionPage (auth viewer)
 *   - Beta mode ON + localStorage `gs_companion_beta_access` →
 *     CompanionPage (guest viewer, tester flow)
 *   - sessionStorage `gs_companion_guest` set → CompanionPage
 *     (guest viewer, the user previously opted in this tab)
 *   - Anything else → CompanionEntry (chooser)
 *
 * The localStorage flag is only honored when `betaModeOn` is true.
 * Flipping the env var off — per spec — must invalidate the flag,
 * which is exactly what this guard achieves (the conditional itself
 * is the invalidation).
 *
 * Storage reads go through useSyncExternalStore so the server
 * snapshot is consistent ("loading" for unauthed) and the client
 * picks up the real value after hydration without tripping the
 * setState-in-effect rule.
 */

import { useCallback, useSyncExternalStore } from "react";
import { CompanionPage } from "./CompanionPage";
import { CompanionEntry } from "./CompanionEntry";

const BETA_ACCESS_KEY = "gs_companion_beta_access";
const GUEST_SESSION_KEY = "gs_companion_guest";
/** Dispatched manually after we set sessionStorage from this tab —
 *  the native `storage` event doesn't fire in the originating tab. */
const LOCAL_CHANGE_EVENT = "companion:guest-changed";

interface Props {
  isAuthenticated: boolean;
  displayName: string | null;
  tier?: import("@/lib/subscription").SubscriptionTier;
  /** Pre-fetched saved games for the Resume picker. Empty array for
   *  guests / users without the save_state capability — fetched
   *  server-side so the picker decision is synchronous. */
  savedGames?: import("@/lib/companion/saveStates").CompanionSavedState[];
  /** Deep-link auto-resume target from `?resume=<id>`. When set, the
   *  client skips the resume picker AND the game-settings modal and
   *  dispatches LOAD_SAVED_STATE on mount. */
  autoResume?: import("@/lib/companion/saveStates").CompanionSavedState | null;
  betaModeOn: boolean;
}

type DecisionKind = "loading" | "entry" | "auth" | "guest";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_CHANGE_EVENT, callback);
  };
}

function readDecision(
  isAuthenticated: boolean,
  betaModeOn: boolean,
): DecisionKind {
  if (isAuthenticated) return "auth";
  try {
    if (betaModeOn && window.localStorage.getItem(BETA_ACCESS_KEY) === "1") {
      return "guest";
    }
    if (window.sessionStorage.getItem(GUEST_SESSION_KEY) === "1") {
      return "guest";
    }
  } catch {
    // Storage blocked (private mode etc.) — fall through to the
    // chooser; user can opt in again.
  }
  return "entry";
}

export function CompanionShell({
  isAuthenticated,
  displayName,
  tier,
  savedGames = [],
  autoResume = null,
  betaModeOn,
}: Props) {
  const getSnapshot = useCallback(
    () => readDecision(isAuthenticated, betaModeOn),
    [isAuthenticated, betaModeOn],
  );
  // Server render: nothing about the client storage is known, so an
  // unauthed user gets a placeholder until hydration runs the real
  // snapshot. An authed user can render the board immediately.
  const getServerSnapshot = useCallback(
    (): DecisionKind => (isAuthenticated ? "auth" : "loading"),
    [isAuthenticated],
  );

  const decision = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleEnterAsGuest = useCallback(() => {
    try {
      window.sessionStorage.setItem(GUEST_SESSION_KEY, "1");
    } catch {
      // Best-effort — same-tab opt-in is the source of truth even
      // if the storage write fails, so we still dispatch the
      // re-evaluation event.
    }
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  }, []);

  if (decision === "loading") {
    return <div className="companion-page" />;
  }

  if (decision === "entry") {
    return (
      <CompanionEntry
        betaModeOn={betaModeOn}
        onEnterAsGuest={handleEnterAsGuest}
      />
    );
  }

  return (
    <CompanionPage
      viewer={
        decision === "auth"
          ? { kind: "auth", displayName, tier }
          : { kind: "guest" }
      }
      savedGames={savedGames}
      autoResume={autoResume}
      betaModeOn={betaModeOn}
    />
  );
}
