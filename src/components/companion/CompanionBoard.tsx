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
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useSession } from "@/lib/companion/SessionContext";
import { parseSlotDndId } from "./Slot";
import { PlayerHeader } from "./PlayerHeader";
import { PlayerBench } from "./PlayerBench";
import { ActiveBattle } from "./ActiveBattle";

export function CompanionBoard() {
  const { dispatch } = useSession();

  // 8px distance threshold: short taps still route through onClick on
  // the slot, so the action sheet keeps working. Touch needs a brief
  // delay (≤150ms) so scroll gestures aren't hijacked.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="companion-board">
        <PlayerHeader player="p2" rank="secondary" />
        <PlayerBench player="p2" />
        <ActiveBattle />
        <PlayerBench player="p1" />
        <PlayerHeader player="p1" rank="primary" />
      </div>
    </DndContext>
  );
}
