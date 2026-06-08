"use client";

/**
 * Companion route — Wave 1–3 client shell.
 *
 * Loads Pokémon Mode (the only v1 mode) into the SessionProvider
 * and renders the board. Header carries the title + Reset Game.
 * The page receives a `viewer` prop from its server-side parent
 * that tells it whether the user is authenticated (results persist)
 * or playing as a guest (no persistence).
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import {
  IconDeviceFloppy,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";
import { SessionProvider, useSession } from "@/lib/companion/SessionContext";
import { CompanionBoard } from "@/components/companion/CompanionBoard";
import { ResolveModal } from "@/components/companion/ResolveModal";
import { GameOverModal } from "@/components/companion/GameOverModal";
import { FeedbackButton } from "@/components/companion/FeedbackButton";
import { TurnInfoModal } from "@/components/companion/TurnInfoModal";
import { GameSettingsModal } from "@/components/companion/GameSettingsModal";
import { SaveGameModal } from "@/components/companion/SaveGameModal";
import { ResumePicker } from "@/components/companion/ResumePicker";
import { CompanionToastProvider } from "@/components/companion/ToastProvider";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import type { PlayerId } from "@/lib/companion/types";
import type { CompanionSavedState } from "@/lib/companion/saveStates";

/** Which player's Resolve modal is open, or null when closed. The
 *  context provider below makes this available to CheckupPrompt
 *  (per-player button) without prop-drilling. */
interface ResolveOverlayState {
  open: PlayerId | null;
  setOpen: (next: PlayerId | null) => void;
}

import { createContext, useContext } from "react";
const ResolveContext = createContext<ResolveOverlayState | null>(null);
export function useResolveOverlay(): ResolveOverlayState {
  const ctx = useContext(ResolveContext);
  if (!ctx) throw new Error("useResolveOverlay outside provider");
  return ctx;
}

export interface CompanionViewer {
  /** "auth" — signed-in GameShuffle user; results persist.
   *  "guest" — in-memory only, no persistence. */
  kind: "auth" | "guest";
  /** Display name for the signed-in player (shown in header). Unused
   *  for guests. */
  displayName?: string | null;
  /** Effective subscription tier — drives feature gating across the
   *  Companion (save state, online play, full customization). For
   *  guests this is undefined. Computed server-side via
   *  `effectiveTier({ tier, role })` so the staff impersonation
   *  cookie is honored. */
  tier?: import("@/lib/subscription").SubscriptionTier;
}

interface Props {
  viewer: CompanionViewer;
  /** Pre-fetched saved games. Used by the Resume picker. Empty for
   *  guests / users without the save_state capability. */
  savedGames: CompanionSavedState[];
  /** Deep-link auto-resume target from `?resume=<id>`. When set, the
   *  page dispatches LOAD_SAVED_STATE on mount and skips the resume
   *  picker / settings modal entirely. */
  autoResume: CompanionSavedState | null;
  /** When true the floating feedback button + modal render.
   *  Server-resolved from `COMPANION_BETA_MODE === "True"`. */
  betaModeOn: boolean;
}

export function CompanionPage({ viewer, savedGames, autoResume, betaModeOn }: Props) {
  // Player 1 auto-seeds with the signed-in user's display name so
  // their identity is recognized on the board out of the box. Guests
  // (no display name) fall back to the engine's "Player 1" default.
  // Player 2 stays open for the opponent to fill in.
  const player1Name =
    viewer.kind === "auth" ? viewer.displayName ?? null : null;

  return (
    <SessionProvider
      mode={pokemonMode}
      player1Name={player1Name}
      initialSavedState={autoResume}
    >
      <CompanionToastProvider>
        <ResolveOverlayProvider>
          <div className="companion-page">
            <Header viewer={viewer} />
            <GameSettingsGate savedGames={savedGames}>
              <CompanionBoard />
              <GameOverModal viewer={viewer} />
            </GameSettingsGate>
            {betaModeOn && (
              <FeedbackButton viewerIsAuthenticated={viewer.kind === "auth"} />
            )}
          </div>
        </ResolveOverlayProvider>
      </CompanionToastProvider>
    </SessionProvider>
  );
}

/** Pre-game gate. Decision tree:
 *    1. Game not started AND user has saved games → Resume picker
 *    2. Game not started AND no saved games → New Game modal
 *    3. Game started → board
 *  Resume picker offers "Start new game" to fall through to (2). */
function GameSettingsGate({
  savedGames,
  children,
}: {
  savedGames: CompanionSavedState[];
  children: React.ReactNode;
}) {
  const { state } = useSession();
  // Track whether the user has dismissed the resume picker in favor
  // of a new game. Stays in-memory because we want the picker back
  // on a Reset Game (which flips gameStarted off, re-renders this).
  const [dismissedResume, setDismissedResume] = useState(false);

  if (state.gameSettings.gameStarted) return <>{children}</>;

  if (savedGames.length > 0 && !dismissedResume) {
    return (
      <ResumePicker
        isOpen={true}
        savedGames={savedGames}
        onResume={() => {
          // LOAD_SAVED_STATE dispatch happens inside the picker;
          // dismissing here just hides the modal layer.
          setDismissedResume(true);
        }}
        onStartNew={() => setDismissedResume(true)}
      />
    );
  }

  return <GameSettingsModal isOpen={true} onApplied={() => undefined} />;
}

/** Hosts the per-player Resolve modal at the page root and exposes
 *  an `open`/`setOpen` context so CheckupPrompt buttons can open it
 *  without prop-drilling through the board hierarchy. */
function ResolveOverlayProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<PlayerId | null>(null);
  return (
    <ResolveContext.Provider value={{ open, setOpen }}>
      {children}
      {open && (
        <ResolveModal
          isOpen={true}
          player={open}
          onClose={() => setOpen(null)}
        />
      )}
    </ResolveContext.Provider>
  );
}

function Header({ viewer }: { viewer: CompanionViewer }) {
  const { dispatch, state, mode } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [turnInfoOpen, setTurnInfoOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Save button only renders for authenticated users — guests don't
  // have the `companion.save_state` capability. Tier badge already
  // signals which side of the gate they're on. Don't render the Save
  // affordance until the game has actually started; saving an empty
  // board is weird UX and the game-settings modal owns that
  // surface anyway.
  const canSave =
    viewer.kind === "auth" && state.gameSettings.gameStarted;

  const handleReset = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    dispatch({ type: "RESET_GAME", mode });
    setConfirming(false);
  };

  return (
    <header className="companion-page__header">
      <div>
        <h1 className="companion-page__title">TCG Companion</h1>
        <p className="companion-page__subtitle">
          {mode.displayName} Mode
          {viewer.kind === "guest" ? " · Guest" : ""}
          {viewer.kind === "auth" && viewer.tier === "pro" && (
            <span
              className="companion-page__tier-badge companion-page__tier-badge--pro"
              title="GS Pro"
            >
              Pro
            </span>
          )}
          {viewer.kind === "auth" && viewer.tier === "free" && (
            <span
              className="companion-page__tier-badge companion-page__tier-badge--free"
              title="Free GS account"
            >
              Free
            </span>
          )}
        </p>
      </div>
      <div className="companion-page__header-actions">
        <Button
          variant="ghost"
          size="small"
          iconBefore={IconInfoCircle}
          onClick={() => setTurnInfoOpen(true)}
          title="Turn information"
        >
          Turn info
        </Button>
        <Button
          variant={confirming ? "danger" : "secondary"}
          size="small"
          iconBefore={IconRefresh}
          onClick={handleReset}
        >
          {confirming ? "Confirm reset?" : "Reset game"}
        </Button>
        {canSave && (
          <Button
            variant="primary"
            size="small"
            iconBefore={IconDeviceFloppy}
            onClick={() => setSaveOpen(true)}
            title="Save this game to resume later"
            className="companion-page__save"
          >
            Save
          </Button>
        )}
      </div>
      <TurnInfoModal
        isOpen={turnInfoOpen}
        onClose={() => setTurnInfoOpen(false)}
      />
      {canSave && (
        <SaveGameModal
          isOpen={saveOpen}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </header>
  );
}
