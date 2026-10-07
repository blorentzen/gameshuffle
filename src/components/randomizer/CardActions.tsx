"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton, Tooltip } from "@empac/cascadeds";
import { IconRefresh, IconUserMinus } from "@tabler/icons-react";

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
      <TipButton label={refreshLabel} variant="primary" onClick={onRefresh}><IconRefresh size={18} stroke={2} /></TipButton>
      {onRemove && <TipButton label={removeLabel ?? "Remove player"} variant="danger" onClick={onRemove}><IconUserMinus size={18} stroke={2} /></TipButton>}
    </div>
  );
}

function TipButton({ label, variant, onClick, children }: { label: string; variant: "primary" | "danger"; onClick: () => void; children: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null);
  // CDS gap: Tooltip's trigger span is focusable even around a button, which
  // gives each action two tab stops. Take the span out of the tab order; the
  // tip still shows when the button has focus (focus events bubble to it).
  useEffect(() => {
    wrap.current?.querySelector(".empac-tooltip-trigger")?.setAttribute("tabindex", "-1");
  }, []);
  return (
    <span ref={wrap} className="card-action">
      <Tooltip content={label} position="top">
        <IconButton variant={variant} size="small" aria-label={label} onClick={onClick}>{children}</IconButton>
      </Tooltip>
    </span>
  );
}
