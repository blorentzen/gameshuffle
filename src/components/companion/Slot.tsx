"use client";

/**
 * A single board slot. Empty slots show a tap-to-place affordance; an
 * occupied slot shows the Pokémon in the board's icon language (see
 * glyphs.tsx and the Help sheet's key): its type circle, condition tags,
 * name, HP left with a heart and a thin bar, attached Energy circles and a
 * damage pill. Tapping the damage pill opens the counter tray, tapping the
 * Energy opens Add Energy, anywhere else opens the Pokémon's window.
 * (One button for the whole slot, so dragging keeps working: taps are
 * routed by where they land.)
 *
 * Card art: only the art window shows. Small slots fill with it; big slots
 * (desktop Actives) show it framed at no more than about 1.5x its size over
 * a blurred copy, so the medium image (the largest our Scrydex terms allow)
 * never stretches.
 *
 * dnd-kit's PointerSensor uses a distance threshold so a quick tap still
 * opens the right window; only sustained movement starts a drag.
 */

import type { CSSProperties, MouseEvent } from "react";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { PlacePieceModal } from "./PlacePieceModal";
import { SlotActionsModal } from "./SlotActionsModal";
import { EnergyPicker } from "./EnergyPicker";
import { CountersModal } from "./CountersModal";
import { TablerIcon } from "./TablerIcon";
import { ConditionTag, CounterToken, EnergyDot, conditionLooks } from "./glyphs";
import { isSlotThemed } from "@/lib/companion/styling";

interface Props {
  player: PlayerId;
  position: SlotPosition;
  /** When true the slot renders larger / more prominent (Active). */
  emphasis: "active" | "bench";
  /** Presentational clone inside the DragOverlay — no dnd hooks, no clicks
   *  (avoids a duplicate draggable id fighting the real slot). */
  overlay?: boolean;
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

export function Slot({ player, position, emphasis, overlay = false }: Props) {
  const { state, flash } = useSession();
  const mode = useMode();
  const slot = findSlot(state, player, position);
  const [placing, setPlacing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [countersOpen, setCountersOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const id = slotDndId(player, position);
  // The overlay clone registers under a throwaway, disabled id so it never
  // collides with the real slot's draggable/droppable registration.
  const dndId = overlay ? `overlay:${id}` : id;

  // Only OCCUPIED slots are draggable — there's nothing to drag from an empty slot.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dndId,
    disabled: overlay || !slot?.occupied,
  });
  // Every slot is droppable (empty receives, occupied swaps).
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dndId, disabled: overlay });

  if (!slot) return null;

  const owner = state.playerNames[player]?.trim() || (player === "p1" ? "P1" : "P2");
  const positionLabel = position === "active" ? `${owner} · ${mode.positionLabels.active}` : mode.positionLabels.bench;

  const open = (which: "actions" | "energy" | "counters" | "place") => {
    setNonce((n) => n + 1);
    if (which === "actions") setActionsOpen(true);
    if (which === "energy") setEnergyOpen(true);
    if (which === "counters") setCountersOpen(true);
    if (which === "place") setPlacing(true);
  };

  const handleClick = (e: MouseEvent) => {
    // Drags don't reach here (the sensor starts after a distance threshold).
    if (!slot.occupied) return open("place");
    const target = e.target as HTMLElement;
    if (target.closest?.("[data-counter-trigger]")) return open("counters");
    if (target.closest?.("[data-energy-trigger]")) return open("energy");
    open("actions");
  };

  const setRef = (node: HTMLButtonElement | null) => {
    if (overlay) return; // presentational clone: don't register with dnd-kit
    setDragRef(node);
    setDropRef(node);
  };

  const themed = slot.occupied && isSlotThemed(slot.slotTheme);
  const className = [
    "companion-slot",
    `companion-slot--${emphasis}`,
    slot.occupied ? "companion-slot--occupied" : "companion-slot--empty",
    slot.occupied ? "companion-slot--piece" : "",
    slot.cardImage ? "companion-slot--art" : "",
    isDragging ? "companion-slot--dragging" : "",
    isOver ? "companion-slot--drop-target" : "",
  ].filter(Boolean).join(" ");

  // Stamp the theme only when the slot is occupied and themed (the pattern
  // background on slots without card art).
  const themedAttrs: Record<string, string> | undefined = themed && !slot.cardImage ? { "data-slot-theme": slot.slotTheme } : undefined;

  const energies = mode.energyTypes.map((def) => ({ def, count: slot.energies[def.key] ?? 0 })).filter((e) => e.count > 0);
  const totalEnergy = energies.reduce((sum, e) => sum + e.count, 0);
  const conditions = conditionLooks(mode).filter((c) => (c.key === "a" ? slot.conditionA : c.key === "b" ? slot.conditionB : !!slot.extraConditions[c.key]));
  const hpLeft = slot.maxHp != null ? Math.max(0, slot.maxHp - slot.damage) : null;
  const hpShare = hpLeft != null && slot.maxHp ? Math.round((hpLeft / slot.maxHp) * 100) : null;
  const hpTone = hpShare == null ? "" : hpShare > 50 ? "ok" : hpShare > 25 ? "low" : "danger";
  const isNew = state.turn != null && slot.enteredTurn === state.turn.number;
  const flashKey = flash && flash.player === player && flash.position === position ? flash.at : null;

  // What a screen reader hears (the icons inside are hidden).
  const occupiedLabel = `${positionLabel}: ${slot.name ?? "unnamed"}${hpLeft != null ? `, ${hpLeft} of ${slot.maxHp} HP left` : ""}, ${slot.damage} damage${
    conditions.length ? `, ${conditions.map((c) => c.label).join(", ")}` : ""}${totalEnergy ? `, ${energies.map((e) => `${e.count} ${e.def.label}`).join(", ")} Energy` : ", no Energy"}${isNew ? ", new this turn" : ""}. Tap to manage, drag to move.`;

  return (
    <>
      <button
        ref={setRef}
        type="button"
        className={className}
        onClick={overlay ? undefined : handleClick}
        aria-hidden={overlay ? true : undefined}
        aria-label={slot.occupied ? occupiedLabel : `Empty ${positionLabel.toLowerCase()} slot: tap to place.`}
        {...themedAttrs}
        {...(overlay ? { tabIndex: -1 } : { ...listeners, ...attributes })}
      >
        {slot.occupied ? (
          <span className="companion-piece" aria-hidden="true">
            {slot.cardImage && (
              <span className="companion-piece__art">
                {/* Stored cross-origin Scrydex URLs, rendered as returned. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slot.cardImage} alt="" className="companion-piece__ambient" draggable={false} />
                <span className="companion-piece__window">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.cardImage} alt="" className="companion-piece__crop" draggable={false} />
                </span>
              </span>
            )}
            {flashKey != null && <span key={flashKey} className="companion-piece__flash" />}

            <span className="companion-piece__top">
              {themed ? <EnergyDot type={slot.slotTheme} size={emphasis === "active" ? 26 : 20} decorative /> : <span />}
              <span className="companion-piece__tags">
                {conditions.map((c) => <ConditionTag key={c.key} look={c} size={emphasis === "active" ? 26 : 20} decorative />)}
                {isNew && <span className="companion-piece__new"><TablerIcon name="hourglass" size="12" /></span>}
              </span>
            </span>

            <span className="companion-piece__info">
              {emphasis === "active" && <span className="companion-piece__where">{positionLabel}</span>}
              <span className="companion-piece__row">
                <span className="companion-piece__name">{slot.name ?? "-"}</span>
                {hpLeft != null && (
                  <span className="companion-piece__hp">
                    <TablerIcon name="heart" size={emphasis === "active" ? "16" : "12"} color="#ff8fa3" />
                    {hpLeft}
                    <span className="companion-piece__hp-max">/{slot.maxHp}</span>
                  </span>
                )}
              </span>
              {hpShare != null && (
                <span className={`companion-piece__bar companion-piece__bar--${hpTone}`}><span style={{ width: `${hpShare}%` } as CSSProperties} /></span>
              )}
              <span className="companion-piece__row">
                {/* Attached Energy reads as pills (circle + count) so it never
                    looks like the type circle above; none = a small + to add. */}
                <span className="companion-piece__energies" data-energy-trigger>
                  {energies.length > 0
                    ? energies.map((e) => (
                        <span key={e.def.key} className="companion-piece__energy">
                          <EnergyDot type={e.def.key} size={emphasis === "active" ? 18 : 14} decorative />
                          {e.count}
                        </span>
                      ))
                    : <span className="companion-piece__add-energy"><TablerIcon name="plus" size="12" /></span>}
                </span>
                <span className={`companion-piece__damage${slot.damage === 0 ? " companion-piece__damage--zero" : ""}`} data-counter-trigger>
                  <CounterToken value={10} size={emphasis === "active" ? 16 : 12} label={null} />
                  {slot.damage > 0 ? slot.damage : <TablerIcon name="plus" size="12" />}
                </span>
              </span>
            </span>
          </span>
        ) : (
          <span className="companion-slot__inner">
            <span className="companion-slot__placeholder">+</span>
            <span className="companion-slot__position">{positionLabel}</span>
          </span>
        )}
      </button>

      {!overlay && (
        <>
          {placing && <PlacePieceModal key={`place-${nonce}`} isOpen player={player} position={position} onClose={() => setPlacing(false)} />}
          <SlotActionsModal key={`actions-${nonce}`} isOpen={actionsOpen} player={player} position={position} onClose={() => setActionsOpen(false)} />
          {energyOpen && <EnergyPicker key={`energy-${nonce}`} isOpen player={player} position={position} onClose={() => setEnergyOpen(false)} />}
          {countersOpen && <CountersModal key={`counters-${nonce}`} isOpen player={player} position={position} onClose={() => setCountersOpen(false)} />}
        </>
      )}
    </>
  );
}
