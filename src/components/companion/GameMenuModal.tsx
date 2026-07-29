"use client";

/**
 * Game menu — a pause-menu-style sheet for game-level controls (Save, New
 * game), opened from the header's Menu button. Keeps these off the always-on
 * header so the board stays clean; grows naturally if we add more later.
 * "Actions only" per the design call — settings summary is read-only.
 */

import { Modal, Button } from "@empac/cascadeds";
import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Read-only current-game summary, e.g. "Standard · 6 prizes". */
  summary: string;
  /** Save only shows for a signed-in player mid-game. */
  canSave: boolean;
  onSave: () => void;
  onNewGame: () => void;
}

export function GameMenuModal({
  isOpen,
  onClose,
  summary,
  canSave,
  onSave,
  onNewGame,
}: Props) {
  const [confirmingNew, setConfirmingNew] = useState(false);

  const close = () => {
    setConfirmingNew(false);
    onClose();
  };

  const handleNewGame = () => {
    if (!confirmingNew) {
      setConfirmingNew(true);
      return;
    }
    onNewGame();
    setConfirmingNew(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Game Menu">
      <div className="companion-menu">
        <p className="companion-menu__current">{summary}</p>
        <div className="companion-menu__actions">
          {canSave && (
            <Button variant="primary" fullWidth onClick={onSave}>
              Save game
            </Button>
          )}
          <Button
            variant={confirmingNew ? "danger" : "secondary"}
            fullWidth
            onClick={handleNewGame}
          >
            {confirmingNew ? "Confirm — start a new game?" : "New game"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
