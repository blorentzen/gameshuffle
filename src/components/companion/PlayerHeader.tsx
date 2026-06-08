"use client";

/**
 * Per-player header strip — name (editable inline) + win counter
 * + checkup prompt. One sits at the top edge of the board for P2,
 * one at the bottom for P1, so each player's identity reads near
 * their own side.
 *
 * Name editing is a click-to-edit pattern: the label becomes an
 * input on click, Enter commits, Escape/blur cancels (or commits on
 * blur if the input changed). Limits + sanitization happen in the
 * reducer's `SET_PLAYER_NAME` handler.
 */

import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import type { PlayerId } from "@/lib/companion/types";
import { WinCounter } from "./WinCounter";
import { CheckupPrompt } from "./CheckupPrompt";

interface Props {
  player: PlayerId;
  /** Visual rank — "primary" = the local user / signed-in player
   *  (more prominent label); "secondary" = opponent. v1 doesn't
   *  bind these to auth state yet; both render identically until
   *  the dual-device path ships. */
  rank?: "primary" | "secondary";
}

export function PlayerHeader({ player, rank = "primary" }: Props) {
  const { state, dispatch } = useSession();
  const name = state.playerNames[player];

  return (
    <div
      className={`companion-player-header companion-player-header--${rank}`}
    >
      <NameField
        value={name}
        onCommit={(next) =>
          dispatch({ type: "SET_PLAYER_NAME", player, name: next })
        }
      />
      <div className="companion-player-header__right">
        <CheckupPrompt player={player} />
        <WinCounter player={player} />
      </div>
    </div>
  );
}

/**
 * Editable name affordance. Sub-component is split so we can
 * key-remount the input each time the user enters edit mode — the
 * `draft` state is seeded from the current `value` at mount, which
 * keeps the component compliant with React 19's "no setState in
 * effect body" rule (no syncing back to props via useEffect).
 */
function NameField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Bumped on each edit-mode entry so the inner editor remounts
  // with a fresh draft initialized from the current `value`.
  const [editNonce, setEditNonce] = useState(0);

  if (!editing) {
    return (
      <button
        type="button"
        className="companion-player-header__name"
        onClick={() => {
          setEditNonce((n) => n + 1);
          setEditing(true);
        }}
        aria-label={`Edit name: ${value}`}
      >
        <span className="companion-player-header__name-text">{value}</span>
        <span
          className="companion-player-header__name-pencil"
          aria-hidden="true"
        >
          ✎
        </span>
      </button>
    );
  }

  return (
    <NameEditor
      key={editNonce}
      initial={value}
      onCommit={(next) => {
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function NameEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  // Autofocus + select-all on mount via a ref callback — runs at
  // commit phase, before the user can interact, without an effect.
  const setRef = (el: HTMLInputElement | null) => {
    if (el && document.activeElement !== el) {
      el.focus();
      el.select();
    }
  };

  return (
    <input
      ref={setRef}
      type="text"
      className="companion-player-header__name-input"
      value={draft}
      maxLength={24}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(draft);
        else if (e.key === "Escape") onCancel();
      }}
    />
  );
}
