"use client";

/**
 * The Tier List Maker board. Two ways to place an item, both landing exactly
 * where you meant:
 *   - drag it (mouse: a small move starts it; touch: press and hold, so the
 *     page still scrolls under a finger), dropping it between two items or at
 *     the end of a row, and reorder inside a row the same way;
 *   - tap it (or Enter on a keyboard) to pick it up, then tap a row, or use
 *     the Move to bar, which also removes a single item.
 * Items keep one ordered list; a row shows its items in that order.
 */

import { useEffect, useRef, useState } from "react";
import { IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { AiPackModal } from "@/components/ai/AiPackModal";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Input } from "@empac/cascadeds";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { IconAction } from "@/components/actions/IconAction";
import { EVENTS, track } from "@/lib/analytics/events";

interface Tier {
  id: string;
  label: string;
  color: string;
}
interface Item {
  id: string;
  label?: string;
  image?: string;
  tier: string; // tier id, or "unranked"
}

const UNRANKED = "unranked";
const STORAGE_KEY = "gs-tierlist";
const NEW_TIER_COLORS = ["#b45cb1", "#8b969c", "#c99b2b", "#4ca9cd", "#65b16a", "#e2453f"];
const IMG_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

const DEFAULT_TIERS: Tier[] = [
  { id: "s", label: "S", color: "#e2453f" },
  { id: "a", label: "A", color: "#e2823f" },
  { id: "b", label: "B", color: "#e0bf1f" },
  { id: "c", label: "C", color: "#65b16a" },
  { id: "d", label: "D", color: "#4ca9cd" },
];

/** Move one item into `tier`, just before `beforeId` (or to the end of that row). */
function moveItem(items: Item[], id: string, tier: string, beforeId: string | null): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;
  const rest = items.filter((i) => i.id !== id);
  const moved = { ...item, tier };
  let at = beforeId ? rest.findIndex((i) => i.id === beforeId) : -1;
  if (at < 0) {
    const lastInRow = rest.map((i) => i.tier).lastIndexOf(tier);
    at = lastInRow < 0 ? rest.length : lastInRow + 1;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

function ItemChip({ item }: { item: Item }) {
  return item.image ? (
    // Data URL or external URL — render verbatim (user-provided).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.image} alt="" className="tier-item__img" draggable={false} />
  ) : (
    <span className="tier-item__text">{item.label}</span>
  );
}

function SortableItem({ item, selected, onSelect }: { item: Item; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={item.label || "Image"}
      title={item.label}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`tier-item${item.image ? " tier-item--image" : ""}${isDragging ? " tier-item--dragging" : ""}${selected ? " is-selected" : ""}`}
    >
      <ItemChip item={item} />
    </span>
  );
}

function TierZone({
  tier,
  items,
  selectedId,
  onSelect,
  onPlace,
  onLabel,
  onColor,
  onRemove,
}: {
  tier: Tier | null; // null = the unranked pool
  items: Item[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Tap on the row while an item is picked up: send it here. */
  onPlace: () => void;
  onLabel?: (v: string) => void;
  onColor?: (v: string) => void;
  onRemove?: () => void;
}) {
  const id = tier ? tier.id : UNRANKED;
  const { setNodeRef, isOver } = useDroppable({ id });
  const labelRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the label height to fit wrapped text (width is fixed in CSS).
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [tier?.label]);

  return (
    <div className="tier-row">
      {tier && (
        <span className="tier-row__label" style={{ background: tier.color }}>
          <textarea
            ref={labelRef}
            className="tier-row__label-input"
            value={tier.label}
            onChange={(e) => onLabel?.(e.target.value)}
            aria-label="Tier label"
            maxLength={24}
            rows={1}
          />
        </span>
      )}
      <SortableContext id={id} items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`tier-row__zone${isOver ? " is-over" : ""}${selectedId ? " is-target" : ""}`}
          onClick={() => { if (selectedId) onPlace(); }}
          role="group"
          aria-label={tier ? `${tier.label || "Untitled"} tier` : "Not ranked yet"}
        >
          {items.map((it) => (
            <SortableItem key={it.id} item={it} selected={it.id === selectedId} onSelect={() => onSelect(it.id)} />
          ))}
          {!tier && items.length === 0 && <span className="tier-row__empty">Everything&apos;s ranked. Add more below.</span>}
        </div>
      </SortableContext>
      {tier && (
        <span className="tier-row__ctrls">
          <input
            type="color"
            className="tier-row__color"
            value={tier.color}
            onChange={(e) => onColor?.(e.target.value)}
            aria-label="Tier color"
          />
          {onRemove && <IconAction label={`Remove the ${tier.label || "untitled"} tier`} icon={IconX} onClick={onRemove} />}
        </span>
      )}
    </div>
  );
}

export function TierListTool({
  storageKey = STORAGE_KEY,
  seedItems,
  defaultTitle = "My tier list",
}: {
  /** Per-board localStorage key (templates get their own). */
  storageKey?: string;
  /** Items to pre-load into the pool when there's no saved progress. */
  seedItems?: { label: string; image?: string }[];
  defaultTitle?: string;
} = {}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(defaultTitle);
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracked = useRef(false);
  // Skip the very first persist so mount doesn't overwrite storage with the
  // empty initial state before the load/seed effect runs. Reset per storageKey.
  const firstPersist = useRef(true);

  // Mouse starts a drag after a small move; touch after a short press-and-hold,
  // so a finger can still scroll the page across the items.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  useEffect(() => {
    firstPersist.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as { title?: string; tiers?: Tier[]; items?: Item[] };
        if (d.title) setTitle(d.title);
        if (d.tiers?.length) setTiers(d.tiers);
        // A real saved board (has items) wins; an empty saved board falls
        // through to (re)seed the template so it never comes up blank.
        if (d.items?.length) {
          setItems(d.items);
          return;
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setItems(
      (seedItems ?? []).map((s) => ({
        id: crypto.randomUUID(),
        tier: UNRANKED,
        label: s.label,
        image: s.image,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    // Don't write the empty pre-load state; only persist real changes.
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ title, tiers, items }));
    } catch {
      // storage blocked or full (data-URL images) — no-op
    }
  }, [storageKey, title, tiers, items]);

  // Escape puts a picked-up item back down.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const used = () => {
    if (tracked.current) return;
    tracked.current = true;
    track(EVENTS.toolUsed, { tool: "tier-list" });
  };

  function addItem() {
    const v = input.trim();
    if (!v) return;
    const isImg = IMG_URL_RE.test(v);
    setItems((a) => [
      ...a,
      { id: crypto.randomUUID(), tier: UNRANKED, ...(isImg ? { image: v } : { label: v }) },
    ]);
    setInput("");
  }

  function addImageFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        setItems((a) => [...a, { id: crypto.randomUUID(), tier: UNRANKED, image: src, label: file.name.replace(/\.[a-z0-9]+$/i, "") }]);
      };
      reader.readAsDataURL(file);
    });
  }

  const isRow = (id: string) => id === UNRANKED || tiers.some((t) => t.id === id);
  const rowOf = (id: string) => (isRow(id) ? id : items.find((i) => i.id === id)?.tier ?? null);

  // Crossing into another row while dragging: move there now, so the row opens a gap where it'll land.
  function onDragOver(e: DragOverEvent) {
    const over = e.over?.id;
    if (over == null) return;
    const from = rowOf(String(e.active.id));
    const to = rowOf(String(over));
    if (!from || !to || from === to) return;
    setItems((a) => moveItem(a, String(e.active.id), to, isRow(String(over)) ? null : String(over)));
  }

  // Dropping inside a row: settle the order where it was let go.
  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const over = e.over?.id;
    if (over == null) return;
    used();
    const id = String(e.active.id);
    if (isRow(String(over)) || over === id) return;
    setItems((a) => {
      const from = a.findIndex((i) => i.id === id);
      const to = a.findIndex((i) => i.id === over);
      if (from < 0 || to < 0 || a[from].tier !== a[to].tier) return a;
      return arrayMove(a, from, to);
    });
  }

  function place(tier: string) {
    if (!selectedId) return;
    used();
    setItems((a) => moveItem(a, selectedId, tier, null));
    setSelectedId(null);
  }

  function removeSelected() {
    if (!selectedId) return;
    setItems((a) => a.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  }

  function addTier() {
    const color = NEW_TIER_COLORS[tiers.length % NEW_TIER_COLORS.length];
    setTiers((t) => [...t, { id: crypto.randomUUID(), label: "New", color }]);
  }
  function removeTier(id: string) {
    setTiers((t) => t.filter((x) => x.id !== id));
    setItems((a) => a.map((i) => (i.tier === id ? { ...i, tier: UNRANKED } : i)));
  }
  const patchTier = (id: string, patch: Partial<Tier>) =>
    setTiers((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const byTier = (t: string) => items.filter((i) => i.tier === t);
  const active = items.find((i) => i.id === dragId) ?? null;
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const toggle = (id: string) => setSelectedId((s) => (s === id ? null : id));
  const zoneProps = { selectedId, onSelect: toggle };

  return (
    <div className="tier-tool">
      <Input floatingLabel="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
      <p className="tier-tool__hint">Drag items into the tiers, or tap one and then tap a tier. Drop between two items to put it right there.</p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => { setSelectedId(null); setDragId(String(e.active.id)); }}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <div className="tier-board">
          {tiers.map((tier) => (
            <TierZone
              key={tier.id}
              tier={tier}
              items={byTier(tier.id)}
              {...zoneProps}
              onPlace={() => place(tier.id)}
              onLabel={(v) => patchTier(tier.id, { label: v })}
              onColor={(v) => patchTier(tier.id, { color: v })}
              onRemove={() => removeTier(tier.id)}
            />
          ))}
        </div>

        {selected && (
          <div className="tier-move" role="group" aria-label={`Move ${selected.label || "this item"}`}>
            <span className="tier-move__what">
              {selected.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image} alt="" />
              )}
              <strong>{selected.label || "Image"}</strong>
            </span>
            <span className="tier-move__to">
              {tiers.map((t) => (
                <Button key={t.id} size="small" variant="secondary" className="tier-move__tier" style={{ background: t.color, borderColor: t.color }} disabled={selected.tier === t.id} onClick={() => place(t.id)}>
                  {t.label || "Untitled"}
                </Button>
              ))}
              <Button variant="secondary" size="small" disabled={selected.tier === UNRANKED} onClick={() => place(UNRANKED)}>Unrank</Button>
            </span>
            <span className="tier-move__end">
              <IconAction label="Remove this item" icon={IconTrash} onClick={removeSelected} />
              <IconAction label="Put it back down" icon={IconX} onClick={() => setSelectedId(null)} />
            </span>
          </div>
        )}

        <Button variant="secondary" size="small" onClick={addTier}>
          + Add tier
        </Button>

        <div className="tier-pool">
          <div className="tier-add">
            <Input
              floatingLabel="Add an item (text or image URL)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              fullWidth
            />
            <Button variant="secondary" onClick={addItem}>Add</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>Add image</Button>
            <Button variant="secondary" iconBefore={IconSparkles} onClick={() => setAiOpen(true)}>Fill with AI</Button>
            <AiPackModal
              kind="tierlist"
              isOpen={aiOpen}
              onClose={() => setAiOpen(false)}
              avoid={items.map((i) => i.label ?? "").filter(Boolean)}
              applyLabel="Add to the board"
              onApply={(picked) => setItems((a) => [...a, ...picked.map((label) => ({ id: crypto.randomUUID(), tier: UNRANKED, label }))])}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addImageFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <p className="tier-pool__label">Not ranked yet <span>({byTier(UNRANKED).length})</span></p>
          <TierZone tier={null} items={byTier(UNRANKED)} {...zoneProps} onPlace={() => place(UNRANKED)} />
        </div>

        <DragOverlay>
          {active ? (
            <span className={`tier-item${active.image ? " tier-item--image" : ""} tier-item--overlay`}>
              <ItemChip item={active} />
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>

      {items.length > 0 && (
        <div className="tier-actions">
          <Button
            variant="secondary"
            size="small"
            onClick={() => { setSelectedId(null); setItems((a) => a.map((i) => ({ ...i, tier: UNRANKED }))); }}
          >
            Reset ranking
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={async () => {
              if (await confirm({ title: "Remove every item from this board?", confirmLabel: "Remove all" })) { setSelectedId(null); setItems([]); }
            }}
          >
            Clear items
          </Button>
        </div>
      )}
    </div>
  );
}
