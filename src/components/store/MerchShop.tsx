"use client";

/**
 * /shop's shelf (shop picks 2026-11-08, all as recommended): a filter bar that sticks under the nav (Category, Color, Collection, Size, then Sort and the cart), the filters that are on as chips
 * to clear, and the shelf in sections by item (Tees, Hoodies, Hats…), each showing its first row or two with "See all"
 * (which filters to that item). Cards under a section name only the design. Color is a family (Blue, Green…) picked
 * from swatches with their names: a popover on desktop, open in the Filter and sort panel on phones. Filters live in
 * the address (?type=&color=&collection=&size=&sort=, rules in merchFilters.ts), so a filtered shelf can be linked;
 * changing one rewrites the address without a reload. Coming soon: no prices or cart.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button, Chip, Drawer, Popover } from "@empac/cascadeds";
import { IconAdjustmentsHorizontal, IconChevronDown, IconShoppingBag } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { merchCopy } from "@/lib/store/copy";
import {
  NO_FILTER, SORTS, activeCount, applyFilter, filterChoices, filterQuery, readFilter, shelfSections,
  type FilterChoices, type MerchFilter, type MerchSort,
} from "@/lib/store/merchFilters";
import type { MerchListing } from "@/lib/store/merchCatalog";
import type { ShopProduct } from "@/lib/store/products";
import { MerchCard } from "./MerchShelf";
import { ShopCartProvider, useShopCart } from "./ShopCart";
import { shopCopy } from "@/lib/store/copy";

const FILTER_KEYS = ["type", "color", "collection", "size", "sort"] as const;
const noop = () => () => {};

/** How many cards a section shows before "See all": two rows at the widest grid (the CSS hides the rest by width). */
const SECTION_MAX = 10;
/** The widest grid a section's cards fit in whole: 4 or fewer fit two rows everywhere, so no "See all". */
const fitClass = (n: number) => (n <= 4 ? null : n <= 6 ? "3" : n <= 8 ? "4" : n <= 10 ? "5" : "none");
const sectionId = (type: string) => `shelf-${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export function MerchShop({ listings, products, soon = false }: { listings: MerchListing[]; products: ShopProduct[]; soon?: boolean }) {
  return (
    <ShopCartProvider products={products}>
      <Shelf listings={listings} soon={soon} />
    </ShopCartProvider>
  );
}

function Shelf({ listings, soon }: { listings: MerchListing[]; soon: boolean }) {
  const copy = merchCopy();
  const params = useSearchParams();
  const pathname = usePathname();
  const cart = useShopCart();
  const choices = useMemo(() => filterChoices(listings), [listings]);
  const filter = useMemo(() => readFilter(new URLSearchParams(params.toString()), choices), [params, choices]);
  const shown = useMemo(() => applyFilter(listings, filter), [listings, filter]);
  const sections = useMemo(() => shelfSections(shown), [shown]);
  const [panel, setPanel] = useState(false);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  const setFilter = (f: MerchFilter) => {
    const q = new URLSearchParams(params.toString());
    for (const k of FILTER_KEYS) q.delete(k);
    for (const [k, v] of new URLSearchParams(filterQuery(f))) q.set(k, v);
    const s = q.toString();
    window.history.replaceState(null, "", `${pathname}${s ? `?${s}` : ""}`);
  };
  const set = (patch: Partial<MerchFilter>) => setFilter({ ...filter, ...patch });
  const toShelf = () => document.getElementById("shelf")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  // The header's bag on another page sends people here with ?cart=1: open the cart, then tidy the address.
  const { open } = cart;
  useEffect(() => {
    if (params.get("cart") !== "1") return;
    open();
    const q = new URLSearchParams(params.toString());
    q.delete("cart");
    const s = q.toString();
    window.history.replaceState(null, "", `${pathname}${s ? `?${s}` : ""}`);
  }, [params, pathname, open]);

  const seeAll = (type: string) => { set({ type }); toShelf(); };

  const on = activeCount(filter);
  const chips = activeChips(filter, choices);

  return (
    <>
      <section id="shelf" className="merch-browse" aria-label={copy.filters.label}>
        <div className="merch-bar">
          <div className="merch-bar__filters">
            <FilterSelects idPrefix="mf" filter={filter} choices={choices} set={set} />
          </div>
          <Button className="merch-bar__open" variant="secondary" iconBefore={IconAdjustmentsHorizontal} onClick={() => setPanel(true)} aria-label={on > 0 ? `${copy.filters.open} (${on} on)` : undefined}>
            {copy.filters.open}{on > 0 && <span className="merch-bar__badge" aria-hidden="true">{on}</span>}
          </Button>
          <span className="merch-bar__sp" />
          <div className="merch-bar__sort">
            <Select id="mf-sort" size="medium" floatingLabel={copy.filters.sort} value={filter.sort} onChange={(v) => set({ sort: String(v) as MerchSort })} options={SORTS.map((s) => ({ value: s.id, label: s.label }))} />
          </div>
          {!soon && (
            <Button className="merch-bar__cart" variant={cart.count > 0 ? "primary" : "secondary"} iconBefore={IconShoppingBag} onClick={cart.open} aria-label={shopCopy().cart.open(cart.count)}>
              {shopCopy().cart.open(0)}{cart.count > 0 && <span className="merch-bar__badge merch-bar__badge--on" aria-hidden="true">{cart.count}</span>}
            </Button>
          )}
        </div>

        <div className="merch-on">
          <span className="merch-on__count" aria-live="polite">{copy.filters.items(shown.length)}</span>
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} variant="primary" removable onRemove={() => set({ [c.key]: null } as Partial<MerchFilter>)} aria-label={copy.filters.remove(c.label)}
              icon={c.swatch ? <FamilyDot swatch={c.swatch} /> : undefined} />
          ))}
          {chips.length > 0 && <Button variant="ghost" size="small" onClick={() => setFilter({ ...NO_FILTER, sort: filter.sort })}>{copy.filters.clear}</Button>}
        </div>

        {shown.length === 0 ? (
          <div className="merch-none">
            <p>{copy.filters.none}</p>
            <Button variant="secondary" onClick={() => setFilter(NO_FILTER)}>{copy.filters.clear}</Button>
          </div>
        ) : (
          <div className="merch-secs">
            {sections.map((s) => {
              // Filtered to one item: every card. Otherwise the first rows, and "See all" when some are left out.
              const whole = !!filter.type;
              const fit = whole ? null : fitClass(s.items.length);
              return (
                <section key={s.type} className="merch-sec" aria-labelledby={sectionId(s.type)}>
                  <div className="merch-sec__head">
                    <h2 id={sectionId(s.type)} className="merch-sec__title">{s.type}</h2>
                    <span className="merch-sec__count">{s.items.length}<span className="sr-only"> {s.items.length === 1 ? "item" : "items"}</span></span>
                  </div>
                  <div className={`merch-grid merch-sec__grid${whole ? "" : " merch-sec__grid--some"}`}>
                    {(whole ? s.items : s.items.slice(0, SECTION_MAX)).map((l) => (
                      <MerchCard key={`${l.id}:${filter.color ?? ""}`} listing={l} soon={soon} family={filter.color} inSection />
                    ))}
                  </div>
                  {fit && (
                    <Button variant="secondary" className={`merch-sec__all merch-sec__all--fit-${fit}`} onClick={() => seeAll(s.type)}>
                      {copy.filters.seeAll(s.items.length, s.type)}
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>

      {hydrated && (
        <Drawer open={panel} onClose={() => setPanel(false)} position="right" title={copy.filters.open}>
          <div className="merch-panel">
            <FilterSelects idPrefix="mfd" filter={filter} choices={choices} set={set} stacked />
            <Select id="mfd-sort" floatingLabel={copy.filters.sort} value={filter.sort} onChange={(v) => set({ sort: String(v) as MerchSort })} options={SORTS.map((s) => ({ value: s.id, label: s.label }))} fullWidth />
            <div className="merch-panel__actions">
              <Button variant="primary" fullWidth onClick={() => setPanel(false)}>{copy.filters.show(shown.length)}</Button>
              {on > 0 && <Button variant="ghost" fullWidth onClick={() => setFilter({ ...NO_FILTER, sort: filter.sort })}>{copy.filters.clear}</Button>}
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}

function FilterSelects({ idPrefix, filter, choices, set, stacked = false }: { idPrefix: string; filter: MerchFilter; choices: FilterChoices; set: (p: Partial<MerchFilter>) => void; stacked?: boolean }) {
  const f = merchCopy().filters;
  const common = { size: "medium" as const, fullWidth: stacked };
  return (
    <>
      {choices.types.length > 1 && (
        <Select id={`${idPrefix}-type`} {...common} floatingLabel={f.category} value={filter.type ?? ""} onChange={(v) => set({ type: String(v) || null })}
          options={[{ value: "", label: f.allCategories }, ...choices.types.map((t) => ({ value: t, label: t }))]} />
      )}
      {choices.colors.length > 1 && (stacked ? (
        <div className="merch-panel__colors">
          <p className="merch-panel__label" id={`${idPrefix}-color-label`}>{f.color}</p>
          <ColorChips choices={choices.colors} value={filter.color} onPick={(color) => set({ color })} labelledBy={`${idPrefix}-color-label`} />
        </div>
      ) : (
        <ColorPopover choices={choices.colors} value={filter.color} onPick={(color) => set({ color })} />
      ))}
      {choices.collections.length > 1 && (
        <Select id={`${idPrefix}-collection`} {...common} floatingLabel={f.collection} value={filter.collection ?? ""} onChange={(v) => set({ collection: String(v) || null })}
          options={[{ value: "", label: f.allCollections }, ...choices.collections.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      {choices.sizes.length > 1 && (
        <Select id={`${idPrefix}-size`} {...common} floatingLabel={f.size} value={filter.size ?? ""} onChange={(v) => set({ size: String(v) || null })}
          options={[{ value: "", label: f.anySize }, ...choices.sizes.map((s) => ({ value: s, label: s }))]} />
      )}
    </>
  );
}

type FamilyChoice = FilterChoices["colors"][number];

/** A family's swatch: its most used shades as slices of one circle (one shade fills it). */
function FamilyDot({ swatch }: { swatch: string[] }) {
  const bg = swatch.length <= 1 ? swatch[0] ?? "#ccc"
    : `conic-gradient(${swatch.map((c, i) => `${c} ${(i * 100) / swatch.length}% ${((i + 1) * 100) / swatch.length}%`).join(", ")})`;
  return <span className="merch-dot merch-dot--family" style={{ background: bg }} aria-hidden="true" />;
}

/** The color families as CDS Chips: a swatch, the name and how many products; "Any color" first. */
function ColorChips({ choices, value, onPick, labelledBy }: { choices: FamilyChoice[]; value: string | null; onPick: (id: string | null) => void; labelledBy?: string }) {
  const f = merchCopy().filters;
  return (
    <div className="merch-colors" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : f.color}>
      <Chip variant="outline" clickable selected={!value} onClick={() => onPick(null)} label={f.anyColor} className="merch-family merch-family--any" />
      {choices.map((c) => (
        <Chip key={c.id} variant="outline" clickable selected={value === c.id} onClick={() => onPick(value === c.id ? null : c.id)}
          label={c.name} icon={<FamilyDot swatch={c.swatch} />} className="merch-family" data-count={c.count} aria-label={f.colorCount(c.name, c.count)} />
      ))}
    </div>
  );
}

/**
 * Desktop: the Color filter is a field like the Selects beside it that opens the swatches in a CDS Popover. The
 * popover lives at the end of the page, so opening it moves focus to the picked swatch, and Escape or a pick brings
 * focus back to the field.
 */
function ColorPopover({ choices, value, onPick }: { choices: FamilyChoice[]; value: string | null; onPick: (id: string | null) => void }) {
  const f = merchCopy().filters;
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLSpanElement>(null);
  const picked = choices.find((c) => c.id === value) ?? null;
  const trigger = () => fieldRef.current?.closest<HTMLElement>(".empac-popover-trigger") ?? null;
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => trigger()?.focus());
  };
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => {
      const pop = document.querySelector<HTMLElement>(".merch-colorpop");
      (pop?.querySelector<HTMLElement>('.merch-family[aria-pressed="true"]') ?? pop?.querySelector<HTMLElement>(".merch-family"))?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [open]);
  // The trigger span CDS draws is the button; name it by what's picked.
  useEffect(() => { trigger()?.setAttribute("aria-label", f.colorButton(picked?.name ?? f.anyColor)); });
  return (
    <Popover open={open} onOpenChange={change} position="bottom" className="merch-colorpop"
      trigger={(
        <span ref={fieldRef} className="merch-colorfield" data-label={f.color}>
          <span className="merch-colorfield__value">{picked && <FamilyDot swatch={picked.swatch} />}{picked?.name ?? f.anyColor}</span>
          <IconChevronDown size={20} aria-hidden />
        </span>
      )}>
      <ColorChips choices={choices} value={value} onPick={(id) => { onPick(id); change(false); }} />
    </Popover>
  );
}

/** The filters that are on, as chips: the category, color (with its swatch), collection (by name) and size. */
function activeChips(f: MerchFilter, choices: FilterChoices): { key: "type" | "color" | "collection" | "size"; label: string; swatch?: string[] }[] {
  const out: { key: "type" | "color" | "collection" | "size"; label: string; swatch?: string[] }[] = [];
  if (f.type) out.push({ key: "type", label: f.type });
  if (f.color) {
    const c = choices.colors.find((x) => x.id === f.color);
    out.push({ key: "color", label: c?.name ?? f.color, swatch: c?.swatch });
  }
  if (f.collection) out.push({ key: "collection", label: choices.collections.find((c) => c.id === f.collection)?.name ?? f.collection });
  if (f.size) out.push({ key: "size", label: `Size ${f.size}` });
  return out;
}
