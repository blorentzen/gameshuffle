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

import { Icon, Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { deleteCompanionSaveAction } from "@/app/tcg-companion/save/actions";
import { formatByKey } from "@/lib/companion/gameSettings";
import { defaultSaveName, type CompanionSavedState } from "@/lib/companion/saveStates";
import { useCompanionToasts } from "./ToastProvider";

interface Props {
  isOpen: boolean;
  savedGames: CompanionSavedState[];
  onResume: (save: CompanionSavedState) => void;
  onStartNew: () => void;
}

export function ResumePicker({
  isOpen,
  savedGames,
  onResume,
  onStartNew,
}: Props) {
  // Mirror server list locally so deletes update the UI instantly.
  const [items, setItems] = useState<CompanionSavedState[]>(savedGames);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { dispatch } = useSession();
  const toasts = useCompanionToasts();

  const handleResume = (save: CompanionSavedState) => {
    dispatch({
      type: "LOAD_SAVED_STATE",
      saveId: save.id,
      snapshot: {
        slots: save.sessionData.slots,
        playerNames: save.sessionData.playerNames,
        winCounters: save.sessionData.winCounters,
        gameSettings: save.gameSettings,
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

  const handleDelete = async (id: string) => {
    setBusyId(id);
    const target = items.find((s) => s.id === id);
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

        {items.length === 0 ? (
          <p className="companion-resume__empty">
            No saved games left.
          </p>
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
                    <button
                      type="button"
                      className="companion-resume__resume-btn"
                      onClick={() => handleResume(save)}
                      disabled={isDeleting}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="companion-resume__delete-btn"
                      onClick={() => handleDelete(save.id)}
                      disabled={isDeleting}
                      title="Delete this saved game"
                    >
                      <Icon name="trash" size="14" />
                    </button>
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
