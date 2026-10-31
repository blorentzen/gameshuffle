"use client";

/**
 * Game menu — a pause-menu-style sheet for game-level controls (Save, New
 * game), opened from the header's Menu button. Keeps these off the always-on
 * header so the board stays clean; grows naturally if we add more later.
 * "Actions only" per the design call — settings summary is read-only.
 */

import { Modal, Button } from "@empac/cascadeds";
import { useState } from "react";
import { IconUserPlus, IconUsers } from "@tabler/icons-react";
import { JoinByCode } from "./JoinByCode";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Read-only current-game summary, e.g. "Standard · 6 prizes". */
  summary: string;
  /** Save only shows for a signed-in player mid-game. */
  canSave: boolean;
  onSave: () => void;
  /** Hidden for the second phone of a shared game (only the host starts one). */
  canStartNew?: boolean;
  onNewGame: () => void;
  /** Play together: null on a single phone; otherwise whether this phone hosts. */
  live?: { host: boolean; opponent: string | null } | null;
  /** Play together is switched on (its table exists). */
  canPlayTogether?: boolean;
  onPlayTogether: () => void;
  onEndLive: () => void;
  onLeaveLive: () => void;
  /** Host: open the second seat again. */
  onFreeSeat: () => void;
}

export function GameMenuModal({
  isOpen,
  onClose,
  summary,
  canSave,
  onSave,
  canStartNew = true,
  onNewGame,
  live = null,
  canPlayTogether = false,
  onPlayTogether,
  onEndLive,
  onLeaveLive,
  onFreeSeat,
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
          {!live && canPlayTogether && (
            <Button variant="secondary" fullWidth iconBefore={IconUsers} onClick={onPlayTogether}>
              Play together
            </Button>
          )}
          {live?.host && (
            <Button variant="secondary" fullWidth iconBefore={IconUserPlus} onClick={onPlayTogether}>
              Show the game code
            </Button>
          )}
          {canStartNew && (
            <Button
              variant={confirmingNew ? "danger" : "secondary"}
              fullWidth
              onClick={handleNewGame}
            >
              {confirmingNew ? "Confirm: start a new game?" : "New game"}
            </Button>
          )}
          {live?.host && live.opponent && (
            <Button variant="ghost" fullWidth onClick={onFreeSeat}>
              Let someone else join
            </Button>
          )}
          {live && (
            <Button variant="ghost" fullWidth onClick={live.host ? onEndLive : onLeaveLive}>
              {live.host ? "End the shared game" : "Leave the shared game"}
            </Button>
          )}
        </div>
        {!live && <JoinByCode compact />}
      </div>
    </Modal>
  );
}
