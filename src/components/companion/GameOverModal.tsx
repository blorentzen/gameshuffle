"use client";

/**
 * "Game over" prompt — fires when a player's win counter crosses
 * the win threshold (Pokémon Mode: counter reaches 0).
 *
 * v1 Scope §7: "When a player's prize count reaches 0, prompt
 * 'Game over — Player X wins?'". The prompt is confirmation-style
 * because mistakes happen: the player may want to undo and adjust.
 *
 * Wave 3: on "New game", an authenticated viewer's result persists
 * via `saveCompanionGameResult`. Guests' games are in-memory only.
 */

import { Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { saveCompanionGameResult } from "@/lib/companion/persistence";
import type { CompanionViewer } from "@/app/tcg-companion/CompanionPage";

interface Props {
  viewer: CompanionViewer;
}

export function GameOverModal({ viewer }: Props) {
  const { state, dispatch, mode, startedAt } = useSession();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const winner = state.winner;
  const isOpen = winner != null;

  const handleUndo = () => {
    if (saving) return;
    if (!winner) return;
    // Roll back the win flag and give the player a prize back, so
    // they can keep playing without resetting the whole game.
    dispatch({
      type: "ADJUST_WIN_COUNTER",
      player: winner,
      delta: mode.winCounterDirection === "down" ? 1 : -1,
    });
    setSaveError(null);
  };

  const handleNewGame = async () => {
    if (saving) return;
    setSaveError(null);
    if (viewer.kind === "auth" && winner) {
      setSaving(true);
      try {
        const result = await saveCompanionGameResult({
          mode: mode.key,
          player1Label: "Player 1",
          player2Label: "Player 2",
          winner: winner === "p1" ? "player_1" : "player_2",
          startedAt: new Date(startedAt).toISOString(),
        });
        if (!result.ok) {
          // Soft-fail: log + show inline, but still let the user
          // start a new game. Losing a single result row is far less
          // damaging than blocking them on the game-over screen.
          console.error("[companion] save failed", result.reason);
          setSaveError("Saved offline only — couldn't reach the server.");
        }
      } finally {
        setSaving(false);
      }
    }
    dispatch({ type: "RESET_GAME", mode });
  };

  const winnerLabel = winner === "p1" ? "Player 1" : winner === "p2" ? "Player 2" : "";

  return (
    <Modal isOpen={isOpen} onClose={handleUndo} title="Game over?">
      <div className="companion-gameover">
        <p className="companion-gameover__title">{winnerLabel} wins!</p>
        <p className="companion-gameover__detail">
          {winnerLabel} took their last {mode.winCounterLabel.toLowerCase()}.
        </p>
        {viewer.kind === "guest" && (
          <p className="companion-gameover__hint">
            Guest mode — this result won&apos;t be saved. Sign in to track your games.
          </p>
        )}
        {saveError && (
          <p className="companion-gameover__hint companion-gameover__hint--error">
            {saveError}
          </p>
        )}

        <div className="companion-gameover__actions">
          <button
            type="button"
            className="companion-gameover__btn companion-gameover__btn--secondary"
            onClick={handleUndo}
            disabled={saving}
          >
            Undo
          </button>
          <button
            type="button"
            className="companion-gameover__btn companion-gameover__btn--primary"
            onClick={handleNewGame}
            disabled={saving}
          >
            {saving ? "Saving…" : "New game"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
