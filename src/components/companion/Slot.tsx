"use client";

/**
 * A single board slot. Empty slots show a tap-to-place affordance;
 * occupied slots show name + damage with controls accessible via the
 * slot-action sheet that opens on tap.
 *
 * Wave 1: occupied/empty + damage.
 * Wave 2: condition badges; condition toggles inside SlotActionsModal.
 * Wave 3: draggable when occupied; droppable always — moving onto
 * another slot in the SAME player's area triggers MOVE_PIECE (which
 * clears conditions when arriving on the bench).
 *
 * dnd-kit's PointerSensor uses a distance threshold so a quick tap
 * still opens the action sheet — only sustained pointer movement
 * activates the drag.
 */

import type { CSSProperties } from "react";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Icon } from "@empac/cascadeds";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { PlacePieceModal } from "./PlacePieceModal";
import { SlotActionsModal } from "./SlotActionsModal";
import { TablerIcon } from "./TablerIcon";
import { isSlotThemed } from "@/lib/companion/styling";

interface Props {
  player: PlayerId;
  position: SlotPosition;
  /** When true the slot renders larger / more prominent (Active). */
  emphasis: "active" | "bench";
}

/** Encode the slot address as the dnd-kit id. The board's onDragEnd
 *  decodes it back into (player, position) before dispatching. */
export function slotDndId(player: PlayerId, position: SlotPosition): string {
  return `slot:${player}:${position}`;
}

export function parseSlotDndId(
  id: string,
): { player: PlayerId; position: SlotPosition } | null {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "slot") return null;
  return {
    player: parts[1] as PlayerId,
    position: parts[2] as SlotPosition,
  };
}

export function Slot({ player, position, emphasis }: Props) {
  const { state } = useSession();
  const mode = useMode();
  const slot = findSlot(state, player, position);
  const [placing, setPlacing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [placeNonce, setPlaceNonce] = useState(0);

  const id = slotDndId(player, position);

  // Only OCCUPIED slots are draggable — there's nothing to drag from
  // an empty slot.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id,
    disabled: !slot?.occupied,
  });

  // Every slot is droppable (empty receives, occupied swaps).
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  if (!slot) return null;

  // For active slots, prefix with the actual player name so it's
  // obvious whose active it is at a glance — important now that the
  // two actives sit side-by-side. Falls back to "P1" / "P2" if names
  // are blank (engine defaults aren't blank, but defensive). Bench
  // slots stay generic since they're always next to their own header.
  const positionLabel = (() => {
    if (position !== "active") return mode.positionLabels.bench;
    const name =
      state.playerNames[player]?.trim() || (player === "p1" ? "P1" : "P2");
    return `${name} · ${mode.positionLabels.active}`;
  })();

  const handleClick = () => {
    // Drag operations don't reach this handler — dnd-kit's pointer
    // sensor only activates after the distance threshold, so a quick
    // tap still routes through onClick.
    if (slot.occupied) {
      setActionsOpen(true);
    } else {
      setPlaceNonce((n) => n + 1);
      setPlacing(true);
    }
  };

  const setRef = (node: HTMLButtonElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const className = [
    "companion-slot",
    `companion-slot--${emphasis}`,
    slot.occupied ? "companion-slot--occupied" : "companion-slot--empty",
    isDragging ? "companion-slot--dragging" : "",
    isOver ? "companion-slot--drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Stamp the theme attribute only when the slot is BOTH occupied
  // and themed — empty slots stay neutral regardless of any stale
  // theme still sitting on the row.
  const themedAttrs: Record<string, string> | undefined =
    slot.occupied && isSlotThemed(slot.slotTheme)
      ? { "data-slot-theme": slot.slotTheme }
      : undefined;

  return (
    <>
      <button
        ref={setRef}
        type="button"
        className={className}
        onClick={handleClick}
        aria-label={
          slot.occupied
            ? `${positionLabel} slot — ${slot.name ?? "unnamed"}, ${slot.damage} damage. Tap to manage, drag to move.`
            : `Empty ${positionLabel.toLowerCase()} slot — tap to place.`
        }
        {...themedAttrs}
        {...listeners}
        {...attributes}
      >
        {/* Inner card panel. Empty slots collapse to a transparent
            wrapper (no visible card); themed occupied slots show a
            light surface that separates the text from the pattern
            so neither competes for attention. */}
        <span className="companion-slot__inner">
          {slot.occupied ? (
            <>
              {/* Type badge intentionally removed — the slot's themed
                  background pattern already carries the type signal,
                  so the text chip was redundant noise. The CSS
                  `.companion-slot__type-badge` rules can be reaped
                  once we're sure no other surface needs them. */}
              <span className="companion-slot__name">{slot.name ?? "—"}</span>
              <span className="companion-slot__damage">
                {slot.damage}
                {slot.maxHp != null && (
                  <span className="companion-slot__max-hp">/{slot.maxHp}</span>
                )}
              </span>
              {(slot.conditionA ||
                slot.conditionB ||
                mode.extraConditions.some((d) => slot.extraConditions[d.key])) && (
                <span className="companion-slot__conditions" aria-hidden="true">
                  {slot.conditionA && (
                    <span
                      className="companion-slot__condition"
                      style={
                        {
                          "--condition-color": mode.conditionAColor,
                        } as CSSProperties
                      }
                      title={mode.conditionALabel}
                    >
                      <Icon
                        name={
                          mode.conditionAIcon as Parameters<typeof Icon>[0]["name"]
                        }
                        size="16"
                      />
                    </span>
                  )}
                  {slot.conditionB && (
                    <span
                      className="companion-slot__condition"
                      style={
                        {
                          "--condition-color": mode.conditionBColor,
                        } as CSSProperties
                      }
                      title={mode.conditionBLabel}
                    >
                      <Icon
                        name={
                          mode.conditionBIcon as Parameters<typeof Icon>[0]["name"]
                        }
                        size="16"
                      />
                    </span>
                  )}
                  {mode.extraConditions.map((def) =>
                    slot.extraConditions[def.key] ? (
                      <span
                        key={def.key}
                        className="companion-slot__condition"
                        style={
                          {
                            "--condition-color": def.color,
                          } as CSSProperties
                        }
                        title={def.label}
                      >
                        <Icon
                          name={def.icon as Parameters<typeof Icon>[0]["name"]}
                          size="16"
                        />
                      </span>
                    ) : null,
                  )}
                </span>
              )}
              {mode.energyTypes.length > 0 &&
                mode.energyTypes.some((def) => (slot.energies[def.key] ?? 0) > 0) && (
                  <span className="companion-slot__energies" aria-hidden="true">
                    {mode.energyTypes.map((def) => {
                      const count = slot.energies[def.key] ?? 0;
                      if (count <= 0) return null;
                      return (
                        <span
                          key={def.key}
                          className={`companion-slot__energy${
                            def.invertText
                              ? " companion-slot__energy--invert"
                              : ""
                          }`}
                          style={
                            { "--energy-color": def.color } as CSSProperties
                          }
                          title={`${def.label} energy ×${count}`}
                        >
                          <TablerIcon name={def.icon} size="12" />
                          <span className="companion-slot__energy-count">
                            {count}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}
              <span className="companion-slot__position">{positionLabel}</span>
            </>
          ) : (
            <>
              <span className="companion-slot__placeholder">+</span>
              <span className="companion-slot__position">{positionLabel}</span>
            </>
          )}
        </span>
      </button>

      <PlacePieceModal
        key={`place-${placeNonce}`}
        isOpen={placing}
        player={player}
        position={position}
        onClose={() => setPlacing(false)}
      />
      <SlotActionsModal
        isOpen={actionsOpen}
        player={player}
        position={position}
        onClose={() => setActionsOpen(false)}
      />
    </>
  );
}
