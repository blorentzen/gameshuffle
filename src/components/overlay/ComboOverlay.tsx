import type { CSSProperties } from "react";
import { getImagePath } from "@/lib/images";

export interface ComboOverlaySlot {
  img: string;
  name: string;
}

export interface ComboOverlayPayload {
  /** Who drew the combo (broadcaster display name). */
  displayName: string;
  /** Combo parts in order — 4 for MK8DX (char/vehicle/wheels/glider), 2 for MKW. */
  slots: ComboOverlaySlot[];
}

/**
 * The broadcaster's shuffled kart combo, as a positionable overlay piece.
 *
 * Reuses the `.gs-overlay__card` styling from overlay.css but renders it
 * STATICALLY (always visible, no entrance animation via the `--static`
 * modifier), so it can be dropped into the Overlay Layout editor's stage and
 * anywhere a placed combo card is needed. `style` carries the placement
 * (position + scale) from the layout system; the live overlay keeps its own
 * animated version and only positions the wrapper.
 */
export function ComboOverlay({
  payload,
  style,
}: {
  payload: ComboOverlayPayload;
  style?: CSSProperties;
}) {
  return (
    <div className="gs-overlay__card gs-overlay__card--static" style={style}>
      <div className="gs-overlay__header">
        <span className="gs-overlay__dice" aria-hidden>
          🎲
        </span>
        <span className="gs-overlay__name">{payload.displayName}</span>
        <span className="gs-overlay__verb">drew</span>
      </div>
      <div className="gs-overlay__slots">
        {payload.slots.map((slot, i) => (
          <div key={i} className="gs-overlay__slot">
            <div className="gs-overlay__slot-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getImagePath(slot.img)} alt={slot.name} width={120} height={120} />
            </div>
            <div className="gs-overlay__slot-name">{slot.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
