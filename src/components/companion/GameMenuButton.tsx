"use client";

/**
 * "Menu" affordance — a pause-menu entry point that lives with the battle-line
 * utilities (coin / dice / turn info), not the header. Self-contained: owns the
 * menu + save modal open state and reads everything it needs from the session.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconMenu2 } from "@tabler/icons-react";
import { useSession } from "@/lib/companion/SessionContext";
import { formatByKey } from "@/lib/companion/gameSettings";
import { GameMenuModal } from "./GameMenuModal";
import { SaveGameModal } from "./SaveGameModal";

export function GameMenuButton() {
  const { state, dispatch, mode, isAuthenticated } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Save only for authenticated players mid-game — guests lack the
  // `companion.save_state` capability, and saving an empty board is odd UX.
  const canSave = isAuthenticated && state.gameSettings.gameStarted;

  // Read-only current-game summary, e.g. "Standard TCG · 6 prize cards".
  const summary = `${formatByKey(state.gameSettings.format).label} · ${
    state.gameSettings.prizeCount
  } ${mode.winCounterLabel.toLowerCase()}`;

  return (
    <>
      <Button
        variant="secondary"
        size="small"
        iconBefore={IconMenu2}
        onClick={() => setMenuOpen(true)}
        title="Game menu: save or start a new game"
        className="companion-active-battle__menu"
      >
        Menu
      </Button>
      <GameMenuModal
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        summary={summary}
        canSave={canSave}
        onSave={() => {
          setMenuOpen(false);
          setSaveOpen(true);
        }}
        onNewGame={() => {
          dispatch({ type: "RESET_GAME", mode });
          setMenuOpen(false);
        }}
      />
      {canSave && (
        <SaveGameModal isOpen={saveOpen} onClose={() => setSaveOpen(false)} />
      )}
    </>
  );
}
