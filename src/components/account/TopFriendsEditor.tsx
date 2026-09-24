"use client";

/**
 * Top Friends editor (account → Profile). Pick up to MAX people you follow to
 * feature on your public profile, in order. Auto-saves each change.
 *
 * Ordering is drag-and-drop, the same interaction as the card showcase. Nudging
 * a friend from 8th to 2nd used to mean six clicks on an arrow, each one firing
 * its own save.
 */

import { useCallback, useEffect, useState } from "react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FriendTile } from "@/components/social/FriendTile";
import { useToast } from "@/components/toast/ToastProvider";
import type { FriendProfile } from "@/lib/social/topFriends";

/** One draggable slot. The remove button must not start a drag. */
function SortableFriend({
  friend,
  position,
  onRemove,
}: {
  friend: FriendProfile;
  position: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: friend.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`tf-selected__item${isDragging ? " is-dragging" : ""}`}
    >
      {/* Only the handle starts a drag, so the list still scrolls on a phone. */}
      <button
        type="button"
        className="tf-drag"
        aria-label={`Reorder ${friend.displayName ?? friend.username ?? "friend"}`}
        {...attributes}
        {...listeners}
      >
        <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" focusable="false">
          <g fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" />
            <circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" />
          </g>
        </svg>
      </button>
      <span className="tf-pos">{position}</span>
      <FriendTile friend={friend} size={48} linked={false} />
      <button
        type="button"
        className="tf-remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Remove ${friend.displayName ?? friend.username ?? "friend"} from top friends`}
      >
        ×
      </button>
    </div>
  );
}

const MAX = 12;

export function TopFriendsEditor() {
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [topIds, setTopIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/account/top-friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) {
          setFollowing(b.following ?? []);
          setTopIds(((b.topFriends ?? []) as FriendProfile[]).map((f) => f.id));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async (ids: string[], what: string) => {
    setSaving(true);
    try {
      const r = await fetch("/api/account/top-friends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendIds: ids }),
      });
      if (r.ok) toast.success(what);
      else toast.error("Couldn't save your top friends. Try again.");
    } catch {
      toast.error("Couldn't save your top friends. Try again.");
    } finally {
      setSaving(false);
    }
  }, [toast]);

  function update(ids: string[], what: string) {
    setTopIds(ids);
    void save(ids, what);
  }
  const add = (id: string) => {
    if (topIds.length >= MAX || topIds.includes(id)) return;
    update([...topIds, id], "Added to top friends");
  };
  const remove = (id: string) => update(topIds.filter((x) => x !== id), "Removed from top friends");

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = topIds.indexOf(active.id as string);
    const to = topIds.indexOf(over.id as string);
    if (from === -1 || to === -1) return;
    update(arrayMove(topIds, from, to), "Order saved");
  };

  const byId = new Map(following.map((f) => [f.id, f]));
  const top = topIds.map((id) => byId.get(id)).filter((f): f is FriendProfile => !!f);
  const available = following.filter((f) => !topIds.includes(f.id));

  return (
    <div className="account-card">
      <h2>Top Friends</h2>
      <p style={{ marginBottom: "var(--spacing-20)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
        Feature up to {MAX} people you follow on your profile. Drag to reorder.
        {saving ? " · Saving…" : ""}
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          {top.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={top.map((f) => f.id)} strategy={rectSortingStrategy}>
                <div className="tf-selected">
                  {top.map((f, i) => (
                    <SortableFriend key={f.id} friend={f} position={i + 1} onRemove={() => remove(f.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>No top friends yet. Add some below.</p>
          )}

          <h3 style={{ margin: "var(--spacing-24) 0 var(--spacing-12)", fontSize: "var(--font-size-16)" }}>
            Add from people you follow
          </h3>
          {available.length > 0 ? (
            <div className="friend-grid">
              {available.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="tf-add"
                  disabled={topIds.length >= MAX}
                  onClick={() => add(f.id)}
                >
                  <FriendTile friend={f} size={48} linked={false} />
                  <span className="tf-add__plus">＋</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              {following.length
                ? "Everyone you follow is already featured."
                : "Follow people to feature them here."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
