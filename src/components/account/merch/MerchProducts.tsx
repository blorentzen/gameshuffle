"use client";

/**
 * Platform ▸ Shop ▸ Merch ▸ Products (admin picks 2026-11-05, https://claude.ai/artifact/J7AvZoRgrdPAaSArCydztB, all 7
 * as recommended). Every product sat in one long list (about 9,500px with 118 products), so now: search, collection,
 * item and status filters (All, Live, Hidden, Needs a look, with counts); products grouped by collection in the shop's
 * own order, each group folding to one line; compact rows; tick rows (or a whole group, or everything shown) to make
 * them live, hide them or move them to another collection; a Reorder button per collection shows the drag handles
 * for that collection only. Filters and open groups are kept in this browser.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Checkbox, Chip, FormField, Input, Switch } from "@empac/cascadeds";
import { IconChevronDown, IconChevronRight, IconSearch } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { SortableList } from "@/components/ui/SortableList";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { COLLECTIONS, ITEM_TYPES, collectionOf } from "@/lib/store/merch";
import { formatPrice } from "@/lib/store/copy";
import type { AdminListing } from "@/lib/store/merchCatalog";

type Status = "all" | "live" | "hidden" | "check";
interface Saved { q: string; collection: string; item: string; status: Status; open: string[] }
const KEY = "gs-merch-admin";
const DEFAULTS: Saved = { q: "", collection: "", item: "", status: "all", open: [COLLECTIONS[0].id] };

function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    return raw ? { ...DEFAULTS, ...raw, open: Array.isArray(raw.open) ? raw.open : DEFAULTS.open } : DEFAULTS;
  } catch { return DEFAULTS; }
}
function writeSaved(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: filters just aren't kept */ }
}

const range = (a: number, b: number) => (a === b ? formatPrice(a) : `${formatPrice(a)} to ${formatPrice(b)}`);
const STATUS: { id: Status; label: string }[] = [
  { id: "all", label: "All" }, { id: "live", label: "Live" }, { id: "hidden", label: "Hidden" }, { id: "check", label: "Needs a look" },
];
const matchesStatus = (l: AdminListing, s: Status) => s === "all" || (s === "live" ? l.live : s === "hidden" ? !l.live : l.warnings.length > 0);

export function MerchProducts({ listings, post, onEdit, onReordered }: {
  /** Products not archived, in shelf order. */
  listings: AdminListing[];
  post: (body: Record<string, unknown>) => Promise<unknown>;
  onEdit: (id: string) => void;
  /** Puts a collection's new order on screen before the save comes back. */
  onReordered: (ids: string[]) => void;
}) {
  const confirm = useConfirm();
  const [saved, setSavedState] = useState<Saved>(readSaved);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reordering, setReordering] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Saved>) => setSavedState((s) => { const next = { ...s, ...patch }; writeSaved(next); return next; });

  const q = saved.q.trim().toLowerCase();
  // Search, collection and item narrow everything; the status chips count within that.
  const narrowed = useMemo(() => listings.filter((l) =>
    (!q || `${l.name} ${l.series ?? ""} ${l.itemType}`.toLowerCase().includes(q))
    && (!saved.collection || collectionOf(l.collection).id === saved.collection)
    && (!saved.item || l.itemType === saved.item)), [listings, q, saved.collection, saved.item]);
  const shown = narrowed.filter((l) => matchesStatus(l, saved.status));
  const filtering = !!q || !!saved.collection || !!saved.item || saved.status !== "all";
  const groups = COLLECTIONS.map((c) => ({ ...c, items: shown.filter((l) => collectionOf(l.collection).id === c.id) })).filter((g) => g.items.length);
  const isOpen = (id: string) => filtering || saved.open.includes(id);
  const toggleOpen = (id: string) => set({ open: saved.open.includes(id) ? saved.open.filter((x) => x !== id) : [...saved.open, id] });

  const toggle = (ids: string[], on: boolean) => setPicked((p) => { const next = new Set(p); for (const id of ids) { if (on) next.add(id); else next.delete(id); } return next; });
  const chosen = listings.filter((l) => picked.has(l.id));

  async function bulk(patch: { live?: boolean; collection?: string }) {
    if (!chosen.length) return;
    if (patch.live && chosen.length >= 10 && !(await confirm({ title: `Make ${chosen.length} products live?`, body: "They show on /shop as soon as the shop is open.", confirmLabel: `Make ${chosen.length} live` }))) return;
    setBusy(true);
    const ok = await post({ action: "bulk", ids: chosen.map((l) => l.id), patch });
    setBusy(false);
    if (ok) { setPicked(new Set()); if (patch.collection) setMoveTo(""); }
  }

  return (
    <div className="merch-products">
      <div className="merch-products__filters">
        <FormField label="Find a product" htmlFor="merch-q">
          <Input id="merch-q" value={saved.q} onChange={(e) => set({ q: e.target.value })} placeholder="A name, series or item" iconBefore={IconSearch} fullWidth />
        </FormField>
        <FormField label="Collection" htmlFor="merch-col">
          <Select id="merch-col" value={saved.collection} onChange={(v) => set({ collection: String(v) })} options={[{ value: "", label: "All collections" }, ...COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))]} fullWidth />
        </FormField>
        <FormField label="Item" htmlFor="merch-item">
          <Select id="merch-item" value={saved.item} onChange={(v) => set({ item: String(v) })} options={[{ value: "", label: "All items" }, ...ITEM_TYPES.filter((t) => listings.some((l) => l.itemType === t)).map((t) => ({ value: t, label: t }))]} fullWidth />
        </FormField>
      </div>
      <div className="merch-products__status" role="group" aria-label="Show">
        {STATUS.map((s) => (
          <Chip key={s.id} clickable selected={saved.status === s.id} onClick={() => set({ status: s.id })} label={`${s.label} ${narrowed.filter((l) => matchesStatus(l, s.id)).length}`} />
        ))}
        {shown.length > 0 && <Button variant="ghost" size="small" onClick={() => toggle(shown.map((l) => l.id), true)}>Select all shown ({shown.length})</Button>}
        {filtering && <Button variant="ghost" size="small" onClick={() => set({ q: "", collection: "", item: "", status: "all" })}>Clear filters</Button>}
      </div>

      {chosen.length > 0 && (
        <div className="merch-products__bulk" role="region" aria-label="Selected products">
          <strong>{chosen.length} selected</strong>
          <Button variant="primary" size="small" loading={busy} onClick={() => void bulk({ live: true })}>Make live</Button>
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void bulk({ live: false })}>Hide</Button>
          <span className="merch-products__move">
            <Select id="merch-move" className="merch-products__move-select" aria-label="Collection to move them to" value={moveTo} onChange={(v) => setMoveTo(String(v))} options={[{ value: "", label: "Move to collection" }, ...COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))]} size="small" />
            <Button variant="secondary" size="small" disabled={!moveTo || busy} onClick={() => void bulk({ collection: moveTo })}>Move</Button>
          </span>
          <Button variant="ghost" size="small" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="merch-products__none">Nothing matches. <Button variant="ghost" size="small" onClick={() => set({ q: "", collection: "", item: "", status: "all" })}>Clear filters</Button></p>
      ) : groups.map((g) => {
        const open = isOpen(g.id);
        const ids = g.items.map((l) => l.id);
        const all = ids.every((id) => picked.has(id));
        const some = !all && ids.some((id) => picked.has(id));
        const liveCount = g.items.filter((l) => l.live).length;
        const dragging = reordering === g.id && !filtering;
        const row = (l: AdminListing, handle?: ReactNode) => (
          <div className={`merch-products__row${picked.has(l.id) ? " is-picked" : ""}${handle ? " merch-products__row--drag" : ""}`}>
            {handle ?? <Checkbox checked={picked.has(l.id)} onChange={(e) => toggle([l.id], e.target.checked)} aria-label={`Select ${l.name}`} />}
            {(() => {
              // The first shown color with a picture, else any; none yet (a new product) gets the empty square, never src="".
              const pic = l.colors.find((c) => !c.hidden && c.image)?.image || l.colors.find((c) => c.image)?.image;
              // eslint-disable-next-line @next/next/no-img-element
              return pic ? <img className="merch-products__pic" src={pic} alt="" width={40} height={40} /> : <span className="merch-products__pic" aria-hidden="true" />;
            })()}
            <span className="merch-products__name">
              <strong>{l.name}</strong>
              <span>
                {l.itemType}{l.series ? ` · ${l.series}` : ""} · {l.optionLabel === "Phone" ? `${l.sizes.length} phones` : l.colors.length === 1 ? "1 color" : l.colors.length ? `${l.colors.filter((c) => !c.hidden).length} of ${l.colors.length} colors` : l.sizes.length > 1 ? `${l.sizes.length} sizes` : "One version"}
                {l.warnings.length > 0 && <> <Badge variant="warning" size="small">{l.warnings.length} to check</Badge></>}
              </span>
            </span>
            <span className="merch-products__price">{l.sizes.length > 0 ? range(Math.min(...l.sizes.map((s) => s.priceCents)), Math.max(...l.sizes.map((s) => s.priceCents))) : ""}</span>
            <Switch label={<>Live<span className="sr-only">: {l.name}</span></>} checked={l.live} onChange={(e) => void post({ action: "update", id: l.id, patch: { live: e.target.checked } })} />
            <Button variant="secondary" size="small" onClick={() => onEdit(l.id)}>Edit</Button>
          </div>
        );
        return (
          <section key={g.id} className="merch-products__group" aria-labelledby={`merch-g-${g.id}`}>
            <div className="merch-products__ghead">
              <Checkbox checked={all} indeterminate={some} onChange={(e) => toggle(ids, e.target.checked)} aria-label={`Select every product shown in ${g.name}`} />
              <button type="button" className="merch-products__fold" aria-expanded={open} disabled={filtering} onClick={() => toggleOpen(g.id)} id={`merch-g-${g.id}`}>
                {open ? <IconChevronDown size={18} aria-hidden="true" /> : <IconChevronRight size={18} aria-hidden="true" />}
                <span className="merch-products__gname">{g.name}</span>
                <span className="merch-products__gcount">{g.items.length} · {liveCount} live</span>
              </button>
              {open && !filtering && g.items.length > 1 && (
                <Button variant="ghost" size="small" onClick={() => setReordering(dragging ? null : g.id)}>{dragging ? "Done" : "Reorder"}</Button>
              )}
            </div>
            {open && (dragging ? (
              <SortableList
                items={g.items}
                getId={(l) => l.id}
                handleLabel={(l) => `Move ${l.name}`}
                onReorder={(next) => { const order = next.map((l) => l.id); onReordered(order); void post({ action: "reorder", ids: order }); }}
                className="merch-products__rows"
              >
                {(l, handle) => row(l, handle)}
              </SortableList>
            ) : (
              <div className="merch-products__rows">{g.items.map((l) => <div key={l.id}>{row(l)}</div>)}</div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
