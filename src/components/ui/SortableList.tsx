"use client";

/**
 * The reorder primitive. Any list a person can put in their own order uses this,
 * so reordering behaves the same everywhere on the platform: grab the handle and
 * drag, or focus it and use the arrow keys.
 *
 * CDS has no sortable list — `List` is presentational and `KanbanBoard` is
 * column-shaped, so neither fits a plain reorderable list. This wrapper is the
 * stand-in and should be contributed back to CascadeDS rather than copied again;
 * it is deliberately thin over @dnd-kit so that swap is cheap.
 *
 * Accessibility, which is the reason this is a component and not a snippet:
 *
 *  - Only the handle starts a drag. Dragging from anywhere on the row steals the
 *    touch gesture the page needs to scroll, which strands the list on a phone.
 *  - `KeyboardSensor` makes the handle operable without a pointer at all.
 *  - Call sites keep their Move up / Move down buttons. WCAG 2.2 SC 2.5.7 wants
 *    a single-pointer path that is not a drag, and a handle alone does not give
 *    one — a mouse user who cannot hold and drag is otherwise locked out. Drag is
 *    the fast path, the buttons are the floor; `useListReorder` below drives both
 *    from the same move.
 */

import type { CSSProperties, ReactNode } from "react";
import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** The six-dot grip. One drawing, so every draggable row reads the same. */
export function DragGrip({ label, ...rest }: { label: string } & Record<string, unknown>) {
  return (
    <button type="button" className="gs-drag" aria-label={label} {...rest}>
      <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" focusable="false">
        {[4, 9, 14].map((cy) =>
          [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="currentColor" />),
        )}
      </svg>
    </button>
  );
}

function SortableRow<T>({
  id,
  item,
  index,
  children,
  handleLabel,
  disabled,
}: {
  id: string;
  item: T;
  index: number;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
  handleLabel: (item: T) => string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  // A pinned row keeps the grip in place so the rows stay aligned, but it is
  // inert and skipped by the keyboard rather than being a dead tab stop.
  const handle = disabled ? (
    <span className="gs-drag gs-drag--disabled" aria-hidden="true">
      <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" focusable="false">
        {[4, 9, 14].map((cy) =>
          [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="currentColor" />),
        )}
      </svg>
    </span>
  ) : (
    <DragGrip label={handleLabel(item)} {...attributes} {...listeners} />
  );
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "is-dragging" : undefined}>
      {children(item, handle, index)}
    </div>
  );
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
  handleLabel = () => "Reorder item",
  isPinned,
  layout = "vertical",
  className,
  style,
}: {
  items: T[];
  /** Stable identity per item. Index-as-id breaks mid-drag, so it is required. */
  getId: (item: T) => string;
  /** Called with the whole list in its new order. */
  onReorder: (next: T[]) => void;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
  /** Announced to screen readers on the grip, e.g. `Reorder ${name}`. */
  handleLabel?: (item: T) => string;
  /** Rows that cannot be moved (a DQ'd driver, a locked block). */
  isPinned?: (item: T) => boolean;
  layout?: "vertical" | "grid";
  className?: string;
  style?: CSSProperties;
}) {
  const sensors = useSensors(
    // A few pixels of travel first, so a tap on the handle is still a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = items.findIndex((i) => getId(i) === active.id);
      const to = items.findIndex((i) => getId(i) === over.id);
      if (from < 0 || to < 0) return;
      onReorder(arrayMove(items, from, to));
    },
    [items, getId, onReorder],
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={items.map(getId)}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div className={className} style={style}>
          {items.map((item, i) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
              item={item}
              index={i}
              handleLabel={handleLabel}
              disabled={isPinned?.(item) ?? false}
            >
              {children}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * The keyboard/pointer fallback that pairs with the drag handle: one `move`
 * both the arrow buttons and any other nudge can call, so a list never has two
 * reorder code paths that can drift apart.
 */
export function moveWithin<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  return arrayMove(items, index, target);
}
