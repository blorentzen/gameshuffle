"use client";

/**
 * /shop's shelf (shop picks 2026-11-08, all as recommended): the collections as colored tiles, then a filter bar
 * that sticks under the nav (Category, Color, Collection, Size, then the count, Sort and the cart), the filters
 * that are on as chips to clear, and one grid. On phones the bar is a "Filter and sort" button that opens a panel,
 * with the cart beside it. Filters live in the address (?type=&color=&collection=&size=&sort=, rules in
 * merchFilters.ts), so a filtered shelf can be linked; changing one rewrites the address without a reload.
 * Coming soon: no prices or cart.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button, Chip, Drawer } from "@empac/cascadeds";
import { IconAdjustmentsHorizontal, IconShoppingBag } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { COLLECTIONS } from "@/lib/store/merch";
import { merchCopy } from "@/lib/store/copy";
import {
  NO_FILTER, SORTS, activeCount, applyFilter, coverImage, filterChoices, filterQuery, readFilter, tileCovers, toneOf,
  type FilterChoices, type MerchFilter, type MerchSort,
} from "@/lib/store/merchFilters";
import type { MerchListing } from "@/lib/store/merchCatalog";
import type { ShopProduct } from "@/lib/store/products";
import { MerchCard } from "./MerchShelf";
import { ShopCartProvider, useShopCart } from "./ShopCart";
import { shopCopy } from "@/lib/store/copy";

const FILTER_KEYS = ["type", "color", "collection", "size", "sort"] as const;
const noop = () => () => {};

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

  const pickCollection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setFilter({ ...NO_FILTER, collection: id });
    document.getElementById("shelf")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const covers = useMemo(() => tileCovers(listings, COLLECTIONS.map((c) => c.id)), [listings]);
  const tiles = COLLECTIONS.map((c) => ({ ...c, cover: covers.get(c.id) ?? null, count: listings.filter((l) => l.collection === c.id).length }))
    .filter((c) => c.count > 0);
  const on = activeCount(filter);
  const chips = activeChips(filter, choices);

  return (
    <>
      {tiles.length > 1 && (
        <section className="merch-colls" aria-labelledby="merch-colls-h">
          <h2 id="merch-colls-h" className="shop-h2">{copy.collections}</h2>
          <div className="merch-colls__row">
            {tiles.map((t) => {
              const img = t.cover ? coverImage(t.cover) : null;
              return (
                <a key={t.id} href={`/shop?collection=${t.id}#shelf`} className={`merch-coll merch-coll--${toneOf(t.id)}`} onClick={(e) => pickCollection(e, t.id)} aria-current={filter.collection === t.id ? "true" : undefined}>
                  <span className="merch-coll__text">
                    <b>{t.name}</b>
                    <span>{t.line}</span>
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                  {img && <img className="merch-coll__pic" src={img} alt="" loading="lazy" width={160} height={160} />}
                </a>
              );
            })}
          </div>
        </section>
      )}

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
            <Chip key={c.key} label={c.label} variant="primary" removable onRemove={() => set({ [c.key]: null } as Partial<MerchFilter>)} aria-label={copy.filters.remove(c.label)} />
          ))}
          {chips.length > 0 && <Button variant="ghost" size="small" onClick={() => setFilter({ ...NO_FILTER, sort: filter.sort })}>{copy.filters.clear}</Button>}
        </div>

        {shown.length === 0 ? (
          <div className="merch-none">
            <p>{copy.filters.none}</p>
            <Button variant="secondary" onClick={() => setFilter(NO_FILTER)}>{copy.filters.clear}</Button>
          </div>
        ) : (
          <div className="merch-grid">
            {shown.map((l) => <MerchCard key={`${l.id}:${filter.color ?? ""}`} listing={l} soon={soon} color={filter.color} />)}
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
      {choices.colors.length > 1 && (
        <Select id={`${idPrefix}-color`} {...common} floatingLabel={f.color} value={filter.color ?? ""} onChange={(v) => set({ color: String(v) || null })}
          options={[{ value: "", label: f.anyColor }, ...choices.colors.map((c) => ({ value: c.name, label: c.name }))]} />
      )}
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

/** The filters that are on, as chips: the category, color, collection (by name) and size. */
function activeChips(f: MerchFilter, choices: FilterChoices): { key: "type" | "color" | "collection" | "size"; label: string }[] {
  const out: { key: "type" | "color" | "collection" | "size"; label: string }[] = [];
  if (f.type) out.push({ key: "type", label: f.type });
  if (f.color) out.push({ key: "color", label: f.color });
  if (f.collection) out.push({ key: "collection", label: choices.collections.find((c) => c.id === f.collection)?.name ?? f.collection });
  if (f.size) out.push({ key: "size", label: `Size ${f.size}` });
  return out;
}
