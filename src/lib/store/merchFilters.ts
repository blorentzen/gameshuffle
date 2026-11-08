/**
 * The shop's filters (shop picks 2026-11-08, all as recommended): category, color, collection, size and sort,
 * read from and written to the address (?type=&color=&collection=&size=&sort=) so a filtered shelf can be linked.
 * Pure and client-safe; MerchShop draws the bar.
 */

import { COLLECTIONS, ITEM_TYPES } from "./merch";
import type { MerchListing } from "./merchCatalog";

export type MerchSort = "featured" | "price-low" | "price-high";
export const SORTS: { id: MerchSort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
];

export interface MerchFilter { type: string | null; color: string | null; collection: string | null; size: string | null; sort: MerchSort }
export const NO_FILTER: MerchFilter = { type: null, color: null, collection: null, size: null, sort: "featured" };

/** Clothing sizes in the order people expect; anything else (youth, toddler, baby) keeps its own order after. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

export interface FilterChoices {
  types: string[];
  collections: { id: string; name: string }[];
  /** Colors on at least two products, most common first (a color on one product is a filter of one). */
  colors: { name: string; hex: string | null; count: number }[];
  sizes: string[];
}

export function filterChoices(listings: MerchListing[]): FilterChoices {
  const types = ITEM_TYPES.filter((t) => listings.some((l) => l.itemType === t));
  const collections = COLLECTIONS.filter((c) => listings.some((l) => l.collection === c.id)).map((c) => ({ id: c.id, name: c.name }));
  const colorCount = new Map<string, { hex: string | null; count: number }>();
  for (const l of listings) for (const c of l.colors) {
    const had = colorCount.get(c.name);
    colorCount.set(c.name, { hex: had?.hex ?? c.hex, count: (had?.count ?? 0) + 1 });
  }
  const colors = [...colorCount.entries()].filter(([, v]) => v.count >= 2).map(([name, v]) => ({ name, hex: v.hex, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  for (const l of listings) if (l.optionLabel === "Size") for (const o of l.options) seen.add(o);
  const sizes = [...SIZE_ORDER.filter((s) => seen.has(s)), ...[...seen].filter((s) => !SIZE_ORDER.includes(s))];
  return { types, collections, colors, sizes };
}

/** The filter in an address, keeping only values the shelf has. */
export function readFilter(params: URLSearchParams, choices: FilterChoices): MerchFilter {
  const pick = (key: string, ok: (v: string) => boolean) => { const v = params.get(key); return v && ok(v) ? v : null; };
  const sort = params.get("sort");
  return {
    type: pick("type", (v) => choices.types.includes(v)),
    color: pick("color", (v) => choices.colors.some((c) => c.name === v)),
    collection: pick("collection", (v) => choices.collections.some((c) => c.id === v)),
    size: pick("size", (v) => choices.sizes.includes(v)),
    sort: SORTS.some((s) => s.id === sort) ? (sort as MerchSort) : "featured",
  };
}

/** The address's query for a filter (empty values and the default sort left out). */
export function filterQuery(f: MerchFilter): string {
  const q = new URLSearchParams();
  if (f.type) q.set("type", f.type);
  if (f.color) q.set("color", f.color);
  if (f.collection) q.set("collection", f.collection);
  if (f.size) q.set("size", f.size);
  if (f.sort !== "featured") q.set("sort", f.sort);
  return q.toString();
}

export function applyFilter(listings: MerchListing[], f: MerchFilter): MerchListing[] {
  const out = listings.filter((l) =>
    (!f.type || l.itemType === f.type)
    && (!f.collection || l.collection === f.collection)
    && (!f.color || l.colors.some((c) => c.name === f.color))
    && (!f.size || (l.optionLabel === "Size" && l.options.includes(f.size))));
  if (f.sort === "price-low") return [...out].sort((a, b) => a.fromCents - b.fromCents || a.sortOrder - b.sortOrder);
  if (f.sort === "price-high") return [...out].sort((a, b) => b.fromCents - a.fromCents || a.sortOrder - b.sortOrder);
  return out;
}

/** How many filters are on (the sort doesn't count). */
export const activeCount = (f: MerchFilter) => [f.type, f.color, f.collection, f.size].filter(Boolean).length;

/** Each collection's color on the shop (its tile and the header frames): the site's icon tile tones. */
export const COLLECTION_TONES: Record<string, string> = {
  gameshuffle: "blue", "kart-culture": "violet", "card-collectors": "green", "game-night": "orange", streams: "teal", "one-liners": "magenta",
};
export const toneOf = (collection: string) => COLLECTION_TONES[collection] ?? "blue";

/** A listing's picture: the color asked for (a color filter), else its first color, else its first photo. */
export function coverImage(l: MerchListing, color?: string | null): string | null {
  if (l.optionLabel === "Phone") return l.variants[0]?.image ?? l.photos[0]?.url ?? null;
  const c = (color && l.colors.find((x) => x.name === color)) || l.colors[0];
  return c?.image ?? l.photos[0]?.url ?? null;
}

/**
 * The shop header's three pictures: a tee, a hat, a mug… (one per item type) from different collections where the
 * shelf allows, so the three frames wear three colors.
 */
export function heroPicks(listings: MerchListing[], n = 3): MerchListing[] {
  const order = ["Tees", "Hats", "Drinkware", "Hoodies", "Stickers", "Desk mats", "Phone cases"];
  const types = [...order, ...ITEM_TYPES.filter((t) => !order.includes(t))];
  const out: MerchListing[] = [];
  for (const strict of [true, false]) {
    for (const t of types) {
      if (out.length >= n) break;
      if (out.some((x) => x.itemType === t)) continue;
      const l = listings.find((x) => x.itemType === t && coverImage(x) && (!strict || !out.some((o) => o.collection === x.collection)));
      if (l) out.push(l);
    }
  }
  return out;
}

/** Each collection's tile picture: its first product with a picture, trying for a different item on each tile. */
export function tileCovers(listings: MerchListing[], collections: readonly string[]): Map<string, MerchListing> {
  const out = new Map<string, MerchListing>();
  const used = new Set<string>();
  for (const id of collections) {
    const mine = listings.filter((l) => l.collection === id && coverImage(l));
    const pick = mine.find((l) => !used.has(l.itemType)) ?? mine[0];
    if (pick) { out.set(id, pick); used.add(pick.itemType); }
  }
  return out;
}

/** What goes with each item, most fitting first (a tee: a hat, a sticker, a mug…). */
const GOES_WITH: Record<string, string[]> = {
  Tees: ["Hats", "Stickers", "Drinkware", "Desk mats", "Hoodies"],
  Hoodies: ["Hats", "Stickers", "Drinkware", "Tees"],
  Hats: ["Tees", "Hoodies", "Stickers", "Drinkware"],
  "Kids and baby": ["Tees", "Stickers", "Drinkware", "Hats"],
  "Phone cases": ["Stickers", "Drinkware", "Tees", "Hats"],
  Drinkware: ["Stickers", "Desk mats", "Tees", "Hats"],
  Stickers: ["Drinkware", "Tees", "Desk mats", "Hats"],
  "Desk mats": ["Drinkware", "Stickers", "Tees", "Hoodies"],
};
const GOES_WITH_ANY = ["Tees", "Stickers", "Drinkware", "Hats", "Hoodies", "Desk mats"];

/**
 * "Pair it with" on a product page (shop picks 2026-11-08): three products of other kinds, one of each, from the
 * same series or collection first, then the brand's own (the GameShuffle collection), then anything.
 */
export function pairsFor(listing: MerchListing, all: MerchListing[], n = 3): MerchListing[] {
  const order = [...(GOES_WITH[listing.itemType] ?? GOES_WITH_ANY), ...ITEM_TYPES];
  const rank = (t: string) => { const i = order.indexOf(t); return i < 0 ? order.length : i; };
  const others = all.filter((l) => l.id !== listing.id && l.itemType !== listing.itemType && coverImage(l));
  const tiers = [
    (l: MerchListing) => !!listing.series && l.series === listing.series,
    (l: MerchListing) => l.collection === listing.collection,
    (l: MerchListing) => l.collection === "gameshuffle",
    () => true,
  ];
  const out: MerchListing[] = [];
  for (const inTier of tiers) {
    const pool = others.filter((l) => inTier(l) && !out.includes(l) && !out.some((o) => o.itemType === l.itemType))
      .sort((a, b) => rank(a.itemType) - rank(b.itemType) || a.sortOrder - b.sortOrder);
    for (const l of pool) {
      if (out.length >= n) break;
      if (!out.some((o) => o.itemType === l.itemType)) out.push(l);
    }
    if (out.length >= n) break;
  }
  return out;
}
