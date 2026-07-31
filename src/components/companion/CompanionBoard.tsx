"use client";

/**
 * Companion board — side-by-side layout (v2).
 *
 * Five horizontal rows stacked top-to-bottom, no rotation:
 *
 *   1. P2 header  — name + checkup + prize counter
 *   2. P2 bench   — 5 slots
 *   3. Active battle — P2 active | coin+dice | P1 active
 *   4. P1 bench   — 5 slots
 *   5. P1 header  — name + checkup + prize counter
 *
 * The active-battle row is the "battle line" — both actives share
 * the screen's optical center with the shared utilities between
 * them. This collapses the wasted vertical space from the original
 * vertical-orientation layout and reads cleanly on desktop, tablet,
 * and landscape phone.
 *
 * Mobile portrait (narrow viewports) gets a TODO follow-up: instead
 * of mass-rotation, we'll add a "view as P1 / view as P2" flip so
 * each player can switch to their own side without cramming
 * everything onto a 320px width.
 */

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useState } from "react";

// Cap the floating card width so a wide active slot doesn't drag a giant card.
const MAX_DRAG_WIDTH = 150;

// Drop where the FINGER is, not where the source card's translated rect lands —
// the default rectIntersection made distant rows (the bottom bench) require
// overshooting. pointerWithin resolves to the slot under the pointer; fall back
// to rect overlap for the rare frame the pointer sits in a gap.
const dropWherePointerIs: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

// Center the overlay on the cursor/finger. With the card capped narrower than
// its source, aligning corners would offset it — centering keeps it under the
// pointer regardless of size. (Inline port of dnd-kit's snapCenterToCursor so
// we don't pull in @dnd-kit/modifiers.)
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + (coords.x - draggingNodeRect.left) - draggingNodeRect.width / 2,
    y: transform.y + (coords.y - draggingNodeRect.top) - draggingNodeRect.height / 2,
  };
};
import { useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { Slot, parseSlotDndId } from "./Slot";
import { PlayerHeader } from "./PlayerHeader";
import { PlayerBench } from "./PlayerBench";
import { ActiveBattle } from "./ActiveBattle";

export function CompanionBoard() {
  const { state, dispatch } = useSession();
  // The slot currently being dragged — `null` when no drag is in
  // progress. DragOverlay renders a floating ghost slot that follows
  // the cursor so players get the tactile "I'm carrying this card
  // up to the active spot" feedback they expect from a TCG.
  const [activeDrag, setActiveDrag] = useState<ReturnType<typeof parseSlotDndId> | null>(null);
  // Real pixel size of the slot being dragged, captured at drag start so the
  // floating overlay matches the source exactly — otherwise a fixed-width
  // overlay sits offset from the cursor/finger (active slots are much larger
  // than bench slots).
  const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null);
  const activeSlot = activeDrag
    ? findSlot(state, activeDrag.player, activeDrag.position)
    : null;

  // 8px distance threshold: short taps still route through onClick on
  // the slot, so the action sheet keeps working. Touch needs a brief
  // delay (≤150ms) so scroll gestures aren't hijacked.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const rect = event.active.rect.current.initial;
    if (rect) {
      // Cap the width; scale height proportionally so the card keeps its shape.
      const width = Math.min(rect.width, MAX_DRAG_WIDTH);
      setDragSize({ width, height: rect.height * (width / rect.width) });
    } else {
      setDragSize(null);
    }
    setActiveDrag(parseSlotDndId(String(event.active.id)));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    setDragSize(null);
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const from = parseSlotDndId(String(active.id));
    const to = parseSlotDndId(String(over.id));
    if (!from || !to) return;
    // Cross-player drags are silently rejected — you can't move your
    // opponent's pieces around.
    if (from.player !== to.player) return;

    dispatch({
      type: "MOVE_PIECE",
      player: from.player,
      from: from.position,
      to: to.position,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dropWherePointerIs}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDrag(null);
        setDragSize(null);
      }}
    >
      <div className={`companion-board${activeDrag ? " companion-board--dragging" : ""}`}>
        <PlayerHeader player="p2" rank="secondary" />
        <PlayerBench player="p2" />
        <ActiveBattle />
        <PlayerBench player="p1" />
        <PlayerHeader player="p1" rank="primary" />
      </div>
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeDrag && activeSlot?.occupied ? (
          <div
            className="companion-drag-overlay"
            style={dragSize ? { width: dragSize.width, height: dragSize.height } : undefined}
          >
            <Slot
              player={activeDrag.player}
              position={activeDrag.position}
              emphasis={activeDrag.position === "active" ? "active" : "bench"}
              overlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
