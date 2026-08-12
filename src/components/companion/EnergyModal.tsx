"use client";

/**
 * Focused energy applicator — opens from a tap on a slot's energy meter so a
 * player can attach / remove energy "right there" without going through the
 * full slot-action sheet. Reuses the same `ADJUST_ENERGY` / `CLEAR_ENERGIES`
 * actions and `.companion-actions__energy-*` styles as SlotActionsModal.
 */

import { Modal } from "@empac/cascadeds";
import type { CSSProperties } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { TablerIcon } from "./TablerIcon";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  position: SlotPosition;
  onClose: () => void;
}

export function EnergyModal({ isOpen, player, position, onClose }: Props) {
  const { state, dispatch } = useSession();
  const mode = useMode();
  const slot = findSlot(state, player, position);
  if (!slot) return null;

  const adjust = (energyKey: string, delta: number) =>
    dispatch({ type: "ADJUST_ENERGY", player, position, energyKey, delta });
  const total = mode.energyTypes.reduce(
    (sum, def) => sum + (slot.energies[def.key] ?? 0),
    0,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Energy: ${slot.name ?? "piece"}`}
    >
      <div className="companion-energy">
        <div className="companion-actions__energy-grid">
          {mode.energyTypes.map((def) => {
            const count = slot.energies[def.key] ?? 0;
            return (
              <div
                key={def.key}
                className="companion-actions__energy-row"
                style={{ "--energy-color": def.color } as CSSProperties}
              >
                <span
                  className={`companion-actions__energy-chip${
                    def.invertText
                      ? " companion-actions__energy-chip--invert"
                      : ""
                  }`}
                  title={def.label}
                >
                  <TablerIcon name={def.icon} size="16" />
                </span>
                <span className="companion-actions__energy-label">
                  {def.label}
                </span>
                <div className="companion-actions__energy-counter">
                  <button
                    type="button"
                    className="companion-actions__energy-btn"
                    onClick={() => adjust(def.key, -1)}
                    disabled={count === 0}
                    aria-label={`Remove one ${def.label} energy`}
                  >
                    −
                  </button>
                  <span className="companion-actions__energy-count">
                    {count}
                  </span>
                  <button
                    type="button"
                    className="companion-actions__energy-btn"
                    onClick={() => adjust(def.key, 1)}
                    aria-label={`Attach one ${def.label} energy`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {total > 0 && (
          <button
            type="button"
            className="companion-energy__clear"
            onClick={() => dispatch({ type: "CLEAR_ENERGIES", player, position })}
          >
            Clear all energy
          </button>
        )}
      </div>
    </Modal>
  );
}
