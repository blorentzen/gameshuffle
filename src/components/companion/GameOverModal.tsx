"use client";

/**
 * "Game over" prompt — fires when a player's win counter crosses
 * the win threshold (Pokémon Mode: counter reaches 0).
 *
 * v1 Scope §7: "When a player's prize count reaches 0, prompt
 * 'Game over — Player X wins?'". The prompt is confirmation-style
 * because mistakes happen: Undo (or closing it) steps back the move
 * that ended the game, with the board restored.
 *
 * Wave 3: on "New game", an authenticated viewer's result persists
 * via `saveCompanionGameResult`. Guests' games are in-memory only.
 */

import { Button, Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { saveCompanionGameResult } from "@/lib/companion/persistence";
import type { CompanionViewer } from "@/app/tcg-companion/CompanionPage";

interface Props {
  viewer: CompanionViewer;
}

export function GameOverModal({ viewer }: Props) {
  const { state, dispatch, mode, startedAt, undo } = useSession();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const winner = state.winner;
  const isOpen = winner != null;

  // Step back the move that ended the game (a Knock Out puts the Pokémon
  // back, prize counts and all). The old version gave a prize back but never
  // cleared the winner, so the window stayed open and each Undo added a prize.
  const handleUndo = () => {
    if (saving || !winner) return;
    undo();
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
          player1Label: state.playerNames.p1,
          player2Label: state.playerNames.p2,
          winner: winner === "p1" ? "player_1" : "player_2",
          startedAt: new Date(startedAt).toISOString(),
        });
        if (!result.ok) {
          // Soft-fail: log + show inline, but still let the user
          // start a new game. Losing a single result row is far less
          // damaging than blocking them on the game-over screen.
          console.error("[companion] save failed", result.reason);
          setSaveError("Couldn't save this result to your account. Your next games still save.");
        }
      } finally {
        setSaving(false);
      }
    }
    dispatch({ type: "RESET_GAME", mode });
  };

  const winnerLabel = winner ? state.playerNames[winner] : "";

  return (
    <Modal isOpen={isOpen} onClose={handleUndo} title="Game over?">
      <div className="companion-gameover">
        <p className="companion-gameover__title">{winnerLabel} wins!</p>
        <p className="companion-gameover__detail">
          {winnerLabel} took their last {mode.winCounterLabel.toLowerCase()}.
        </p>
        {viewer.kind === "guest" && (
          <p className="companion-gameover__hint">
            Guest mode: this result won&apos;t be saved. Sign in to track your games.
          </p>
        )}
        {saveError && (
          <p className="companion-gameover__hint companion-gameover__hint--error">
            {saveError}
          </p>
        )}

        <div className="companion-gameover__actions">
          <Button variant="secondary" onClick={handleUndo} disabled={saving}>Undo the last move</Button>
          <Button variant="primary" onClick={() => void handleNewGame()} disabled={saving} loading={saving}>
            New game
          </Button>
        </div>
      </div>
    </Modal>
  );
}
