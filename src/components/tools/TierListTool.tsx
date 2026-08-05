"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button, Input } from "@empac/cascadeds";

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

function ItemChip({ item }: { item: Item }) {
  return item.image ? (
    // Data URL or external URL — render verbatim (user-provided).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.image} alt={item.label ?? ""} className="tier-item__img" draggable={false} />
  ) : (
    <span className="tier-item__text">{item.label}</span>
  );
}

function DraggableItem({ item }: { item: Item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <span
      ref={setNodeRef}
      className={`tier-item${item.image ? " tier-item--image" : ""}${isDragging ? " tier-item--dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      <ItemChip item={item} />
    </span>
  );
}

function TierZone({
  tier,
  items,
  onLabel,
  onColor,
  onRemove,
}: {
  tier: Tier | null; // null = the unranked pool
  items: Item[];
  onLabel?: (v: string) => void;
  onColor?: (v: string) => void;
  onRemove?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier ? tier.id : UNRANKED });
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
      <div ref={setNodeRef} className={`tier-row__zone${isOver ? " is-over" : ""}`}>
        {items.map((it) => (
          <DraggableItem key={it.id} item={it} />
        ))}
      </div>
      {tier && (
        <span className="tier-row__ctrls">
          <input
            type="color"
            className="tier-row__color"
            value={tier.color}
            onChange={(e) => onColor?.(e.target.value)}
            aria-label="Tier color"
          />
          <button type="button" className="tier-row__remove" onClick={onRemove} aria-label="Remove tier">
            ×
          </button>
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
  seedItems?: { label: string; image: string }[];
  defaultTitle?: string;
} = {}) {
  const [title, setTitle] = useState(defaultTitle);
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Skip the very first persist so mount doesn't overwrite storage with the
  // empty initial state before the load/seed effect runs. Reset per storageKey.
  const firstPersist = useRef(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
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
        setItems((a) => [...a, { id: crypto.randomUUID(), tier: UNRANKED, image: src, label: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const over = e.over?.id;
    if (!over) return;
    if (typeof window !== "undefined") window.plausible?.("Tool Used", { props: { tool: "tier-list" } });
    setItems((a) => a.map((i) => (i.id === e.active.id ? { ...i, tier: String(over) } : i)));
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

  return (
    <div className="tier-tool">
      <Input floatingLabel="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        <div className="tier-board">
          {tiers.map((tier) => (
            <TierZone
              key={tier.id}
              tier={tier}
              items={byTier(tier.id)}
              onLabel={(v) => patchTier(tier.id, { label: v })}
              onColor={(v) => patchTier(tier.id, { color: v })}
              onRemove={() => removeTier(tier.id)}
            />
          ))}
        </div>
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
          <TierZone tier={null} items={byTier(UNRANKED)} />
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
            onClick={() => setItems((a) => a.map((i) => ({ ...i, tier: UNRANKED })))}
          >
            Reset ranking
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              if (window.confirm("Remove all items from this board?")) setItems([]);
            }}
          >
            Clear items
          </Button>
        </div>
      )}
    </div>
  );
}
