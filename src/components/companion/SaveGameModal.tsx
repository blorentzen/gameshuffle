"use client";

/**
 * Save current game state to the server. Auth-only — Guest viewers
 * don't see the button that opens this modal.
 *
 * Two save flows depending on whether the session is linked to an
 * existing save row (`state.loadedFromSaveId`):
 *
 *   - Fresh game (no link): "Save" — inserts a new row. The session
 *     is then linked to that row via LINK_SAVE_ID so subsequent
 *     saves default to updating it.
 *
 *   - Linked game: shows a mode toggle —
 *       * "Update existing" (default) — overwrites the linked row
 *         with the latest state.
 *       * "Save as new" — inserts a new row + relinks the session
 *         to it. Useful for branching off saves (e.g. "let me
 *         experiment from this midpoint, but keep the original").
 *
 * Name field is optional. If left blank, the server stores null and
 * the resume picker / account My Stuff label it from format + date.
 */

import { Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { saveCompanionGameAction } from "@/app/tcg-companion/save/actions";
import { defaultSaveName } from "@/lib/companion/saveStates";
import { formatByKey } from "@/lib/companion/gameSettings";
import { useCompanionToasts } from "./ToastProvider";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

type SaveMode = "update" | "new";

export function SaveGameModal({ isOpen, onClose, onSaved }: Props) {
  const { state, mode, dispatch } = useSession();
  const toasts = useCompanionToasts();
  const linkedSaveId = state.loadedFromSaveId;
  const formatLabel = formatByKey(state.gameSettings.format).label;
  // Compute the placeholder once per open — uses today's date so
  // the user sees "Standard TCG · 2026-06-07" greyed in the input.
  const placeholder = isOpen
    ? defaultSaveName(formatLabel, new Date().toISOString())
    : "";

  // Mode toggle is only meaningful when there's a linked save. For
  // a fresh game it's implicit "new". Default to "update" for
  // linked games so re-saving is one click.
  const [saveMode, setSaveMode] = useState<SaveMode>(
    linkedSaveId ? "update" : "new",
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUpdate = !!linkedSaveId && saveMode === "update";

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await saveCompanionGameAction({
      id: isUpdate ? linkedSaveId : undefined,
      name: name.trim().length > 0 ? name.trim() : null,
      mode: "pokemon",
      gameSettings: state.gameSettings,
      sessionData: {
        slots: state.slots,
        playerNames: state.playerNames,
        winCounters: state.winCounters,
      },
    });
    setBusy(false);
    if (!result.ok || !result.id) {
      const errorMessage =
        result.reason === "not_authenticated"
          ? "Sign in to save your game."
          : "Save failed. Try again.";
      setError(errorMessage);
      // Also fire a toast so the user gets a visible signal even if
      // they're looking elsewhere when the error lands.
      toasts.push({
        variant: "error",
        title: "Save failed",
        message: errorMessage,
      });
      return;
    }
    // Link this session to the (possibly new) save id so subsequent
    // saves default to updating it.
    dispatch({ type: "LINK_SAVE_ID", saveId: result.id });
    onSaved?.(result.id);
    // Success toast — different copy for update vs new so the user
    // gets confirmation of which flow ran.
    toasts.push({
      variant: "success",
      title: isUpdate ? "Save updated" : "Game saved",
      message: isUpdate
        ? "Your latest progress overwrote the existing save."
        : "Resume it later from the Companion home screen or your account.",
    });
    setName("");
    onClose();
  };

  const title = linkedSaveId ? "Save game" : "Save game";
  const primaryLabel = busy
    ? "Saving…"
    : isUpdate
    ? "Update existing"
    : "Save as new";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="medium"
      primaryAction={{ label: primaryLabel, onClick: handleSave }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="companion-save-modal">
        <p className="companion-save-modal__lede">
          {isUpdate
            ? "Overwrites the saved game with the current state."
            : "Saves this match so you can resume it later."}
        </p>

        {linkedSaveId && (
          <div className="companion-save-modal__mode">
            <label className="companion-save-modal__radio">
              <input
                type="radio"
                name="save-mode"
                value="update"
                checked={saveMode === "update"}
                onChange={() => setSaveMode("update")}
                disabled={busy}
              />
              <span>
                <strong>Update existing</strong>
                <span className="companion-save-modal__radio-hint">
                  Overwrite this save with the latest state
                </span>
              </span>
            </label>
            <label className="companion-save-modal__radio">
              <input
                type="radio"
                name="save-mode"
                value="new"
                checked={saveMode === "new"}
                onChange={() => setSaveMode("new")}
                disabled={busy}
              />
              <span>
                <strong>Save as new</strong>
                <span className="companion-save-modal__radio-hint">
                  Branch off — keep the original, save a copy
                </span>
              </span>
            </label>
          </div>
        )}

        <label className="companion-save-modal__field">
          <span>{isUpdate ? "Rename (optional)" : "Name (optional)"}</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="companion-save-modal__hint">
          {formatLabel} · {state.gameSettings.prizeCount}{" "}
          {state.gameSettings.prizeCount === 1 ? "prize" : "prizes"} ·{" "}
          {mode.displayName}
        </p>
        {error && <p className="companion-save-modal__error">{error}</p>}
      </div>
    </Modal>
  );
}
