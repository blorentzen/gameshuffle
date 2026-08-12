"use client";

/**
 * Drag-to-reorder grid for a user's favorite cards (My Cards page). Favorites
 * are uncapped; the top MAX_SHOWCASE (by order) render on the public profile,
 * marked by a "cutoff" divider across the grid. Dragging reorders; the ★ on
 * each card removes it from favorites. `row.id` (unique per collection row) is
 * the sortable id.
 */

import { Fragment } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardImage } from "./CardImage";
import { MAX_SHOWCASE, type UserCard } from "@/lib/scrydex/types";

function SortableCard({
  row,
  onRemove,
}: {
  row: UserCard;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const name = row.card?.name ?? row.card_id;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="tcg-card-cell tcg-featured-sortable__cell"
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className="tcg-card-cell__star is-on"
        // Don't let a tap on the star start a drag.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-pressed="true"
        title="Featured. Click to remove from favorites"
      >
        ★
      </button>
      <CardImage images={row.card?.images} name={name} size="medium" />
      <div className="tcg-card-cell__name">{name}</div>
    </div>
  );
}

export function FeaturedShowcaseEditor({
  cards,
  onReorder,
  onRemove,
}: {
  cards: UserCard[];
  onReorder: (orderedIds: string[]) => void;
  onRemove: (row: UserCard) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const ids = cards.map((c) => c.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="tcg-card-grid tcg-featured-sortable">
          {cards.map((row, i) => (
            <Fragment key={row.id}>
              {i === MAX_SHOWCASE && (
                <div className="tcg-featured-sortable__cutoff">
                  <span>On your profile ↑ · private favorites ↓</span>
                </div>
              )}
              <SortableCard row={row} onRemove={() => onRemove(row)} />
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
