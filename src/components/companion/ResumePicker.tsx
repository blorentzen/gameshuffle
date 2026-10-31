"use client";

/**
 * Pre-game resume picker — surfaces when an authenticated user has
 * saved games AND the current session hasn't started yet. Lets them
 * pick a save to restore, delete unwanted saves, or proceed to the
 * New Game format picker.
 *
 * The list arrives via the server page (auth-only, RLS-scoped). We
 * keep a local copy so deletes remove the row instantly without a
 * round trip.
 */

import { Button, Modal } from "@empac/cascadeds";
import { IconTrash } from "@tabler/icons-react";
import { IconAction } from "@/components/actions/IconAction";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { deleteCompanionSaveAction } from "@/app/tcg-companion/save/actions";
import { formatByKey } from "@/lib/companion/gameSettings";
import { defaultSaveName, type CompanionSavedState } from "@/lib/companion/saveStates";
import type { LocalGame } from "@/lib/companion/autosave";
import { useCompanionToasts } from "./ToastProvider";

interface Props {
  isOpen: boolean;
  savedGames: CompanionSavedState[];
  /** The game this browser kept on its own (autosave.ts), offered first. */
  localGame?: LocalGame | null;
  onResume: (save: CompanionSavedState | null) => void;
  onStartNew: () => void;
}

export function ResumePicker({
  isOpen,
  savedGames,
  localGame = null,
  onResume,
  onStartNew,
}: Props) {
  // Mirror server list locally so deletes update the UI instantly.
  const [items, setItems] = useState<CompanionSavedState[]>(savedGames);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { dispatch } = useSession();
  const toasts = useCompanionToasts();
  const confirm = useConfirm();

  const handleResume = (save: CompanionSavedState) => {
    dispatch({
      type: "LOAD_SAVED_STATE",
      saveId: save.id,
      snapshot: {
        slots: save.sessionData.slots,
        playerNames: save.sessionData.playerNames,
        winCounters: save.sessionData.winCounters,
        gameSettings: save.gameSettings,
        turn: save.sessionData.turn ?? null,
      },
    });
    onResume(save);
    const formatLabel = formatByKey(save.gameSettings.format).label;
    const displayName =
      save.name?.trim() || defaultSaveName(formatLabel, save.updatedAt);
    toasts.push({
      variant: "success",
      title: "Saved game loaded",
      message: `Resumed "${displayName}".`,
    });
  };

  const handleResumeLocal = (g: LocalGame) => {
    dispatch({
      type: "LOAD_SAVED_STATE",
      saveId: g.loadedFromSaveId,
      snapshot: { slots: g.slots, playerNames: g.playerNames, winCounters: g.winCounters, gameSettings: g.gameSettings, turn: g.turn ?? null },
    });
    onResume(null);
    toasts.push({ variant: "success", title: "Game resumed", message: `${g.playerNames.p1} vs ${g.playerNames.p2}, right where you left it.` });
  };

  const handleDelete = async (id: string) => {
    const target = items.find((s) => s.id === id);
    const label = target?.name?.trim() || (target ? defaultSaveName(formatByKey(target.gameSettings.format).label, target.updatedAt) : "this saved game");
    if (!(await confirm({ title: `Delete "${label}"?`, body: "The saved game is removed for good.", confirmLabel: "Delete save" }))) return;
    setBusyId(id);
    const result = await deleteCompanionSaveAction(id);
    if (result.ok) {
      setItems((prev) => prev.filter((s) => s.id !== id));
      const formatLabel = target
        ? formatByKey(target.gameSettings.format).label
        : null;
      const displayName =
        target?.name?.trim() ||
        (target && formatLabel
          ? defaultSaveName(formatLabel, target.updatedAt)
          : "saved game");
      toasts.push({
        variant: "info",
        title: "Saved game deleted",
        message: `"${displayName}" was removed from your saves.`,
      });
    } else {
      toasts.push({
        variant: "error",
        title: "Delete failed",
        message: "Couldn't remove that save. Try again.",
      });
    }
    setBusyId(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onStartNew}
      title="Resume a saved game"
      size="large"
      primaryAction={{ label: "Start new game", onClick: onStartNew }}
    >
      <div className="companion-resume">
        <p className="companion-resume__lede">
          Pick up where you left off, or start a fresh match.
        </p>

        {localGame && (
          <ul className="companion-resume__list">
            <li className="companion-resume__item">
              <div className="companion-resume__item-body">
                <div className="companion-resume__item-name">Your last game on this device</div>
                <div className="companion-resume__item-meta">
                  {formatByKey(localGame.gameSettings.format).label} · Prizes left: {localGame.playerNames.p1} {localGame.winCounters.p1}, {localGame.playerNames.p2} {localGame.winCounters.p2}
                </div>
                <div className="companion-resume__item-time">Saved {formatRelative(localGame.savedAt)}</div>
              </div>
              <div className="companion-resume__item-actions">
                <Button variant="primary" size="small" onClick={() => handleResumeLocal(localGame)}>Resume</Button>
              </div>
            </li>
          </ul>
        )}

        {items.length === 0 ? (
          localGame ? null : (
            <p className="companion-resume__empty">
              No saved games left.
            </p>
          )
        ) : (
          <ul className="companion-resume__list">
            {items.map((save) => {
              const formatLabel = formatByKey(save.gameSettings.format).label;
              const displayName =
                save.name?.trim() || defaultSaveName(formatLabel, save.updatedAt);
              const isDeleting = busyId === save.id;
              return (
                <li key={save.id} className="companion-resume__item">
                  <div className="companion-resume__item-body">
                    <div className="companion-resume__item-name">
                      {displayName}
                    </div>
                    <div className="companion-resume__item-meta">
                      {formatLabel} · {save.gameSettings.prizeCount}{" "}
                      {save.gameSettings.prizeCount === 1 ? "prize" : "prizes"}
                      {" · "}
                      {save.sessionData.playerNames.p1} vs{" "}
                      {save.sessionData.playerNames.p2}
                    </div>
                    <div className="companion-resume__item-time">
                      Saved {formatRelative(save.updatedAt)}
                    </div>
                  </div>
                  <div className="companion-resume__item-actions">
                    <Button variant="primary" size="small" onClick={() => handleResume(save)} disabled={isDeleting}>Resume</Button>
                    <IconAction icon={IconTrash} variant="danger" label={`Delete ${displayName}`} onClick={() => void handleDelete(save.id)} disabled={isDeleting} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** Tiny "X minutes ago" helper. Computed at render time so the
 *  reducer stays pure — no Date.now() in state code. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${day === 1 ? "day" : "days"} ago`;
  return new Date(iso).toLocaleDateString();
}
