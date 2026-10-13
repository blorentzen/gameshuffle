"use client";

/**
 * "Menu" affordance — a pause-menu entry point that lives with the battle-line
 * utilities (coin / dice / turn info), not the header. Self-contained: owns the
 * menu + save modal open state and reads everything it needs from the session.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconArrowBackUp, IconMenu2 } from "@tabler/icons-react";
import { useSession } from "@/lib/companion/SessionContext";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { formatByKey } from "@/lib/companion/gameSettings";
import { GameMenuModal } from "./GameMenuModal";
import { SaveGameModal } from "./SaveGameModal";
import { PlayTogetherModal } from "./PlayTogetherModal";
import { useLiveReady } from "@/lib/companion/useLiveReady";

export function GameMenuButton() {
  const { state, dispatch, mode, isAuthenticated, undo, canUndo, live, endLive, leaveLive, freeSeat } = useSession();
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [togetherOpen, setTogetherOpen] = useState(false);
  const liveReady = useLiveReady();
  const opponent = live ? state.playerNames[live.you === "p1" ? "p2" : "p1"] : "";

  // Save only for authenticated players mid-game — guests lack the
  // `companion.save_state` capability, and saving an empty board is odd UX.
  const canSave = isAuthenticated && state.gameSettings.gameStarted;

  // Read-only current-game summary, e.g. "Standard TCG · 6 prize cards".
  const summary = `${formatByKey(state.gameSettings.format).label} · ${
    state.gameSettings.prizeCount
  } ${mode.winCounterLabel.toLowerCase()}`;

  return (
    <>
      <Button variant="secondary" size="small" iconBefore={IconArrowBackUp} onClick={undo} disabled={!canUndo} title="Undo the last change" className="companion-active-battle__undo">
        Undo
      </Button>
      <Button
        variant="secondary"
        size="small"
        iconBefore={IconMenu2}
        onClick={() => setMenuOpen(true)}
        title="Game menu: save, play together or start a new game"
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
        canStartNew={!live || live.host}
        onNewGame={async () => {
          setMenuOpen(false);
          const ok = await confirm({
            title: "Start a new game?",
            body: live
              ? `This game ends on both phones and Undo can't bring it back. ${opponent} stays in for the new one.`
              : canSave ? "This game ends and Undo can't bring it back. To keep it, save it from the menu first." : "This game ends and Undo can't bring it back.",
            confirmLabel: "Start a new game",
          });
          if (ok) dispatch({ type: "RESET_GAME", mode });
        }}
        live={live && !live.ended ? { host: live.host, opponent: live.seats.p2.joined ? live.seats.p2.name : null } : null}
        canPlayTogether={liveReady}
        onPlayTogether={() => {
          setMenuOpen(false);
          setTogetherOpen(true);
        }}
        onEndLive={async () => {
          setMenuOpen(false);
          const ok = await confirm({
            title: "End the shared game?",
            body: `${opponent || "Your opponent"}'s phone stops following this game. The board stays on your phone.`,
            confirmLabel: "End the shared game",
          });
          if (ok) await endLive();
        }}
        onFreeSeat={async () => {
          setMenuOpen(false);
          const ok = await confirm({
            title: `Let someone else join?`,
            body: `${opponent || "Your opponent"}'s phone leaves the game and the seat opens for the next person with the code. The board stays as it is.`,
            confirmLabel: "Open the seat",
          });
          if (!ok) return;
          await freeSeat();
          setTogetherOpen(true);
        }}
        onLeaveLive={async () => {
          setMenuOpen(false);
          const ok = await confirm({
            title: "Leave the shared game?",
            body: "This phone stops following the game and keeps the board as it is. The link gets you back in.",
            confirmLabel: "Leave",
          });
          if (ok) leaveLive();
        }}
      />
      {togetherOpen && <PlayTogetherModal isOpen onClose={() => setTogetherOpen(false)} />}
      {canSave && (
        <SaveGameModal isOpen={saveOpen} onClose={() => setSaveOpen(false)} />
      )}
    </>
  );
}
