"use client";

/**
 * Per-player "Resolve" prompt — appears when the player has at least
 * one slot with an active condition. Tapping opens the ResolveModal
 * (hosted at the page root via ResolveOverlayProvider).
 *
 * v2 dropped the step-by-step walker, so this button no longer
 * dispatches START_CHECKUP — it just toggles the overlay open.
 */

import { useMode, useSession } from "@/lib/companion/SessionContext";
import { playerHasCheckup } from "@/lib/companion/state";
import { useResolveOverlay } from "@/app/tcg-companion/CompanionPage";
import type { PlayerId } from "@/lib/companion/types";

interface Props {
  player: PlayerId;
}

export function CheckupPrompt({ player }: Props) {
  const { state } = useSession();
  const mode = useMode();
  const { setOpen } = useResolveOverlay();
  const ready = playerHasCheckup(state, player);

  if (!ready) return null;

  return (
    <button
      type="button"
      className="companion-checkup-prompt"
      onClick={() => setOpen(player)}
      title={`Resolve ${mode.displayName} conditions`}
    >
      <span className="companion-checkup-prompt__icon" aria-hidden="true">
        ↻
      </span>
      <span>Resolve</span>
    </button>
  );
}
