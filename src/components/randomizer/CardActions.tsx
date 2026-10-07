"use client";

import { IconRefresh, IconUserMinus } from "@tabler/icons-react";
import { IconAction } from "@/components/actions/IconAction";

/**
 * A player card's own buttons, as icons with a tooltip that says what each
 * does: refresh this card (and only this card), and remove this player. Every
 * randomizer's cards use it so they look and behave the same. Rolling everyone
 * stays a labelled button in the intro card.
 */
export function CardActions({ refreshLabel, onRefresh, removeLabel, onRemove }: {
  /** "Refresh rider for Sam" */
  refreshLabel: string;
  onRefresh: () => void;
  /** "Remove Sam". Leave out `onRemove` when this seat can't be removed. */
  removeLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <div className="player-card__actions">
      <IconAction label={refreshLabel} icon={IconRefresh} variant="primary" onClick={onRefresh} />
      {onRemove && <IconAction label={removeLabel ?? "Remove player"} icon={IconUserMinus} variant="danger" onClick={onRemove} />}
    </div>
  );
}
