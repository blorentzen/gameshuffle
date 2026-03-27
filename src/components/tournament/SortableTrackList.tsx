"use client";

import { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getImagePath } from "@/lib/images";

interface Track {
  id: string;
  name: string;
  img: string;
}

interface SortableTrackListProps {
  tracks: Track[];
  showNumbers: boolean;
  onReorder: (tracks: Track[]) => void;
  onRemove: (index: number) => void;
}

function SortableTrackItem({
  id,
  track,
  index,
  showNumber,
  onRemove,
  isDragActive,
}: {
  id: string;
  track: Track;
  index: number;
  showNumber: boolean;
  onRemove: () => void;
  isDragActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id,
      transition: null, // disable dnd-kit's built-in transition
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    // Only animate other items while a drag is active
    transition: !isDragging && isDragActive ? "transform 200ms ease" : "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="tournament-track-item"
      {...attributes}
      {...listeners}
    >
      {showNumber && <span className="tournament-track-item__num">{index + 1}</span>}
      <button
        className="tournament-track-item__remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
      <img src={getImagePath(track.img)} alt={track.name} className="tournament-track-item__img" />
      <span className="tournament-track-item__name">{track.name}</span>
    </div>
  );
}

export function SortableTrackList({
  tracks,
  showNumbers,
  onReorder,
  onRemove,
}: SortableTrackListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Stable ID map — persists across re-renders
  const idMapRef = useRef<Map<string, string>>(new Map());
  const nextIdRef = useRef(0);

  // Build stable IDs using the track's unique id + occurrence index (for duplicates when allowed)
  const getStableIds = (trackList: Track[]): string[] => {
    const occurrences: Record<string, number> = {};
    return trackList.map((t) => {
      const occ = occurrences[t.id] || 0;
      occurrences[t.id] = occ + 1;
      const key = `${t.id}|${occ}`;
      if (!idMapRef.current.has(key)) {
        idMapRef.current.set(key, `sortable-${nextIdRef.current++}`);
      }
      return idMapRef.current.get(key)!;
    });
  };

  const ids = getStableIds(tracks);

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const isDragActive = activeIdx !== null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIdx(null);

    if (!over || active.id === over.id) return;

    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(tracks, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => {
        setActiveIdx(ids.indexOf(event.active.id as string));
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveIdx(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="tournament-track-list">
          {tracks.map((track, i) => (
            <SortableTrackItem
              key={ids[i]}
              id={ids[i]}
              track={track}
              index={i}
              showNumber={showNumbers}
              onRemove={() => onRemove(i)}
              isDragActive={isDragActive}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeIdx !== null && tracks[activeIdx] && (
          <div className="tournament-track-item tournament-track-item--dragging">
            {showNumbers && <span className="tournament-track-item__num">{activeIdx + 1}</span>}
            <img src={getImagePath(tracks[activeIdx].img)} alt={tracks[activeIdx].name} className="tournament-track-item__img" />
            <span className="tournament-track-item__name">{tracks[activeIdx].name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
