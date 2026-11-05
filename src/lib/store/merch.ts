/**
 * Merch rules, pure and client-safe (Britton's picks 2026-11-03,
 * https://claude.ai/artifact/7YjTxMDvFCYoA4moMqzCBz).
 *
 * Products are made in Printful. In Printful a logo color needs its own
 * product (the white-logo tee and the blue-logo tee), but a shopper only picks
 * a shirt color, so the sync groups Printful products into one shop product
 * ("listing") per design and item: groupKeyFor. Each size and color is a
 * shop_products row (merchSku), so the cart, Checkout and orders work as they
 * do for card packs.
 *
 *   itemFor          what a Printful product is (Tees, Hoodies, Hats, Phone cases…)
 *   designOf         the design words in its name, without "GS" and logo colors
 *   groupKeyFor      design + item: Printful products with the same key merge
 *   priceForOption   one price per size across a listing's colors: the highest
 *   keepCents        what an order keeps after Printful, shipping and Stripe
 *   orderColors      Black and White first, then Printful's order
 */

export const MERCH_CATEGORY = "merch";
/** Made to order, so there's no real stock; the sync tops rows up to this. */
export const MERCH_STOCK = 100_000;
export const MERCH_MAX_PER_ORDER = 10;
export const merchSku = (syncVariantId: number | string) => `m-${syncVariantId}`;
export const isMerchSku = (sku: string) => /^m-\d+$/.test(sku);

/** The shop's collections, in shelf order (pick 5: six, by what people are into). */
export const COLLECTIONS = [
  { id: "gameshuffle", name: "GameShuffle", line: "The monogram and the shuffle icon." },
  { id: "kart-culture", name: "Kart culture", line: "Words racers use, drawn our way." },
  { id: "card-collectors", name: "Card collectors", line: "For the binder and the table." },
  { id: "game-night", name: "Game night", line: "For the table and the couch." },
  { id: "streams", name: "Streams", line: "Things every stream has." },
  { id: "one-liners", name: "One-liners", line: "One line, one idea." },
] as const;
export type CollectionId = (typeof COLLECTIONS)[number]["id"];
export const collectionOf = (id: string) => COLLECTIONS.find((c) => c.id === id) ?? COLLECTIONS[0];

/**
 * Where a new listing starts (staff move it in Platform): the brand's own
 * designs in GameShuffle, then by the words in the design, else One-liners.
 */
export function collectionFor(printfulName: string): CollectionId {
  const head = printfulName.trim();
  if (/^(GS|GameShuffle)\b/i.test(head)) return "gameshuffle";
  const d = designOf(head).toLowerCase();
  if (/\bkart|drift|inward|outward|bike|blue shell|lap\b/.test(d)) return "kart-culture";
  if (/\brip\b|pack|sealed|scalp|binder|pull|card|tcg|deck/.test(d)) return "card-collectors";
  if (/\bstream|chat|\bmod\b|raid|clip|subs?\b|live\b/.test(d)) return "streams";
  if (/game|night|snack|couch|dice|board/.test(d)) return "game-night";
  return "one-liners";
}

/** Item chips on /shop, in this order (only the ones with products show). */
export const ITEM_TYPES = ["Tees", "Hoodies", "Hats", "Kids and baby", "Phone cases", "Drinkware", "Stickers", "Desk mats", "Posters", "Bags", "Home", "Other"] as const;

/** An item's place in ITEM_TYPES; new products line up on the shelf in this order (unknown ones last). */
export function itemRank(type: string): number {
  const i = (ITEM_TYPES as readonly string[]).indexOf(type);
  return i < 0 ? ITEM_TYPES.length : i;
}

/** Pick 9: tee colors a color dot can't tell apart, hidden when a tee listing is first made (shown again from Platform). */
export const DEFAULT_HIDDEN_COLORS = ["Black Heather", "Vintage Black", "Solid White Blend", "Heather Kelly", "Heather Aqua"];

export type OptionLabel = "Size" | "Phone" | "";

export interface MerchItem {
  /** The chip it sits under. */
  type: (typeof ITEM_TYPES)[number];
  /** The word in the product's name: "Tee", "Full-Zip Hoodie", "Phone Case". */
  noun: string;
  optionLabel: OptionLabel;
}

/** The part of a Printful name after " - " ("GS White Monogram - Unisex Tee" → "Unisex Tee"). */
const tailOf = (name: string) => {
  const i = name.indexOf(" - ");
  return (i >= 0 ? name.slice(i + 3) : name).trim();
};

/** Baby, toddler and youth blanks (and the coloring book): the Kids and baby chip, one noun per cut. */
function kidItem(t: string): MerchItem | null {
  if (/coloring book/.test(t)) return { type: "Kids and baby", noun: "Coloring Book", optionLabel: "" };
  const age = /\bbaby\b|infant/.test(t) ? "Baby" : /toddler/.test(t) ? "Toddler" : /\byouth\b|\bkids?\b/.test(t) ? (/youth/.test(t) ? "Youth" : "Kids") : null;
  if (!age) return null;
  const cut = /one piece|bodysuit/.test(t) ? "Bodysuit" : /hoodie/.test(t) ? "Hoodie" : /sweatshirt|crew neck|crewneck/.test(t) ? "Sweatshirt"
    : /long sleeve/.test(t) ? "Long Sleeve Tee" : /\bcap\b|\bhat\b/.test(t) ? "Cap" : "Tee";
  return { type: cut === "Cap" ? "Hats" : "Kids and baby", noun: `${age} ${cut}`, optionLabel: cut === "Cap" ? "" : "Size" };
}

/**
 * Where a size sits, smallest first: baby months (NB, 3-6M, 12M…), toddler (2T…5T, 5/6, 7), then XXS to 6XL, then
 * measured sizes (11 oz, 12″×18″). Printful lists a product's variants in the order they were made, which for
 * products made through the API isn't size order. Unknown sizes go last, keeping their order.
 */
export function sizeRank(size: string | null | undefined): number {
  if (!size) return 0;
  const s = size.trim().toUpperCase();
  if (s === "NB" || s === "NEWBORN") return 0;
  let m = s.match(/^(\d+)(?:-(\d+))?\s*M$/); if (m) return Number(m[2] ?? m[1]);
  m = s.match(/^(\d+)T$/); if (m) return 30 + Number(m[1]);
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return 30 + Number(m[1]) + 0.5;
  m = s.match(/^(\d+)$/); if (m && Number(m[1]) <= 20) return 30 + Number(m[1]);
  const adult = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const i = adult.indexOf(s.replace(/^XXL$/, "2XL").replace(/^XXXL$/, "3XL"));
  if (i >= 0) return 100 + i;
  m = s.match(/^(\d+(?:\.\d+)?)/); if (m) return 200 + Number(m[1]);
  return 1000;
}

export function itemFor(printfulName: string, catalogType?: string | null): MerchItem {
  const t = `${tailOf(printfulName)} ${catalogType ?? ""}`.toLowerCase();
  if (/phone|iphone|samsung|galaxy|pixel/.test(t) && /case/.test(t)) return { type: "Phone cases", noun: "Phone Case", optionLabel: "Phone" };
  // Bottles and tumblers before mugs: Printful files some drinkware under its mug type.
  if (/bottle/.test(t)) return { type: "Drinkware", noun: "Water Bottle", optionLabel: "Size" };
  if (/tumbler/.test(t)) return { type: "Drinkware", noun: "Tumbler", optionLabel: "Size" };
  // Kids' and women's cuts are their own blanks, so each gets its own noun and stays out of the adult listing.
  const kid = kidItem(t);
  if (kid) return kid;
  if (/puzzle/.test(t)) return { type: "Home", noun: "Puzzle", optionLabel: "" };
  if (/blanket/.test(t)) return { type: "Home", noun: "Blanket", optionLabel: "Size" };
  if (/hoodie|sweatshirt|crewneck/.test(t)) {
    if (/hoodie/.test(t)) return { type: "Hoodies", noun: /zip/.test(t) ? "Full-Zip Hoodie" : /cropped/.test(t) ? "Cropped Hoodie" : "Hoodie", optionLabel: "Size" };
    return { type: "Hoodies", noun: "Sweatshirt", optionLabel: "Size" };
  }
  if (/long sleeve/.test(t)) return { type: "Tees", noun: "Long Sleeve Tee", optionLabel: "Size" };
  if (/racerback|tank/.test(t)) return { type: "Tees", noun: /racerback/.test(t) ? "Racerback Tank" : "Tank", optionLabel: "Size" };
  if (/crop top/.test(t)) return { type: "Tees", noun: "Crop Top", optionLabel: "Size" };
  if (/women.?s relaxed/.test(t)) return { type: "Tees", noun: "Relaxed Tee", optionLabel: "Size" };
  if (/\btee\b|t-shirt|shirt/.test(t)) return { type: "Tees", noun: "Tee", optionLabel: "Size" };
  if (/beanie/.test(t)) return { type: "Hats", noun: /fisherman/.test(t) ? "Fisherman Beanie" : /waffle/.test(t) ? "Waffle Beanie" : "Beanie", optionLabel: "" };
  if (/trucker/.test(t)) return { type: "Hats", noun: "Trucker Hat", optionLabel: "" };
  if (/snapback/.test(t)) return { type: "Hats", noun: "Snapback", optionLabel: "" };
  if (/flat bill/.test(t)) return { type: "Hats", noun: "Flat Bill Cap", optionLabel: "" };
  if (/dad hat/.test(t)) return { type: "Hats", noun: "Dad Hat", optionLabel: "" };
  if (/\bcap\b|\bhat\b/.test(t)) return { type: "Hats", noun: "Cap", optionLabel: "" };
  if (/\bmug\b/.test(t)) return { type: "Drinkware", noun: "Mug", optionLabel: "Size" };
  if (/sticker/.test(t)) return { type: "Stickers", noun: /sheet/.test(t) ? "Sticker Sheet" : "Sticker", optionLabel: "Size" };
  if (/desk mat|mouse pad|mousepad/.test(t)) return { type: "Desk mats", noun: "Desk Mat", optionLabel: "Size" };
  if (/poster|print/.test(t)) return { type: "Posters", noun: "Poster", optionLabel: "Size" };
  if (/drawstring/.test(t)) return { type: "Bags", noun: "Drawstring Bag", optionLabel: "" };
  if (/backpack/.test(t)) return { type: "Bags", noun: "Backpack", optionLabel: "" };
  if (/tote/.test(t)) return { type: "Bags", noun: "Tote Bag", optionLabel: "" };
  if (/\bbag\b/.test(t)) return { type: "Bags", noun: "Bag", optionLabel: "" };
  const words = tailOf(printfulName).replace(/®|™/g, "").replace(/\b(unisex|embroidered|premium|classic)\b/gi, "").replace(/\s+/g, " ").trim();
  return { type: "Other", noun: titleCase(words || "Item"), optionLabel: "Size" };
}

const LOGO_COLORS = new Set(["white", "black", "colored", "coloured", "color", "colour", "blue", "red", "navy", "grey", "gray", "light", "dark", "pink", "green", "gold", "silver", "cream"]);

/** The design words: "GS White Monogram - Unisex Tee" → "Monogram", "GS Icon Shuffle - …" → "Icon Shuffle". */
export function designOf(printfulName: string): string {
  const i = printfulName.indexOf(" - ");
  const head = (i >= 0 ? printfulName.slice(0, i) : printfulName).trim();
  const words = head.split(/\s+/).filter((w) => w && w.toUpperCase() !== "GS" && !LOGO_COLORS.has(w.toLowerCase()));
  return words.join(" ").trim() || head.replace(/^GS\s+/i, "").trim() || "GameShuffle";
}

/**
 * The series a design belongs to: every sentence but the last, when there are
 * three or more ("Eat. Sleep. Kart." and "Eat. Sleep. Fight" → "Eat. Sleep.").
 * Staff can set or clear it in Platform; this is only where a new listing starts.
 */
export function seriesOf(printfulName: string): string | null {
  const parts = designOf(printfulName).split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const series = parts.slice(0, -1).map((p) => `${p}.`).join(" ");
  return series.length <= 40 ? series : null;
}

/** A series' listings share one collection: the first of theirs in shelf order. */
export function seriesCollection(collections: string[]): CollectionId {
  const order = COLLECTIONS.map((c) => c.id as string);
  const known = collections.filter((c) => order.includes(c)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (known[0] ?? "one-liners") as CollectionId;
}

export type ShelfSection<T> = { id: string; name: string; line: string | null; listings: T[] };

/**
 * The shelf's sections, in collection order: each collection's own products,
 * then any series of two or more that sits in it, as its own section. A series
 * of one is just a product in its collection. Expects listings in shelf order.
 */
export function shelfSections<T extends { collection: string; series?: string | null }>(listings: T[]): ShelfSection<T>[] {
  const counts = new Map<string, number>();
  for (const l of listings) if (l.series) counts.set(l.series, (counts.get(l.series) ?? 0) + 1);
  const grouped = (l: T) => !!l.series && (counts.get(l.series) ?? 0) > 1;
  const anchor = new Map<string, string>();
  for (const l of listings) if (grouped(l) && !anchor.has(l.series!)) anchor.set(l.series!, l.collection);
  const out: ShelfSection<T>[] = [];
  for (const c of COLLECTIONS) {
    const own = listings.filter((l) => l.collection === c.id && !grouped(l));
    if (own.length) out.push({ id: c.id, name: c.name, line: c.line, listings: own });
    for (const [series, at] of anchor) {
      if (at !== c.id) continue;
      out.push({ id: `series-${slugify(series)}`, name: series, line: null, listings: listings.filter((l) => l.series === series) });
    }
  }
  return out;
}

export const slugify = (s: string) => s.toLowerCase().replace(/®|™/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";

export function groupKeyFor(printfulName: string, catalogType?: string | null): string {
  return `${slugify(designOf(printfulName))}:${slugify(itemFor(printfulName, catalogType).noun)}`;
}

export function listingNameFor(printfulName: string, catalogType?: string | null): string {
  return `${designOf(printfulName)} ${itemFor(printfulName, catalogType).noun}`.replace(/\s+/g, " ").trim().slice(0, 60);
}

function titleCase(s: string) {
  return s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/** Pick 8: a listing charges one price per size; where its Printful products differ, the highest. */
export function priceForOption(prices: number[]): number {
  return prices.length ? Math.max(...prices) : 0;
}

export interface KeepRule { freeFromCents: number; shippingCents: number; stripePercent: number; stripeFixedCents: number }
export const DEFAULT_KEEP: KeepRule = { freeFromCents: 5000, shippingCents: 499, stripePercent: 0.029, stripeFixedCents: 30 };

/**
 * What one item keeps at this price: price plus the shipping charge (none
 * from the free-shipping line), minus Printful's cost, Printful's shipping for
 * one item and Stripe's fee. Before the sales tax Printful charges until a
 * resale certificate is on file.
 */
export function keepCents(priceCents: number, costCents: number, printfulShipCents: number, rule: KeepRule = DEFAULT_KEEP): number {
  const revenue = priceCents + (priceCents >= rule.freeFromCents ? 0 : rule.shippingCents);
  const stripe = Math.round(revenue * rule.stripePercent + rule.stripeFixedCents);
  return revenue - costCents - printfulShipCents - stripe;
}

/** Black and White lead the color dots; the rest keep Printful's order. */
export function orderColors<T extends { color: string | null; order: number }>(rows: T[]): string[] {
  const first = ["Black", "White"];
  const seen = new Map<string, number>();
  for (const r of rows) if (r.color && !seen.has(r.color)) seen.set(r.color, r.order);
  return [...seen.keys()].sort((a, b) => {
    const fa = first.indexOf(a), fb = first.indexOf(b);
    if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
    return (seen.get(a) ?? 0) - (seen.get(b) ?? 0);
  });
}

/** Which brand a phone belongs to, for the grouped phone list. */
export function phoneGroup(model: string): string {
  if (/iphone/i.test(model)) return "iPhone";
  if (/samsung|galaxy/i.test(model)) return "Samsung";
  if (/pixel/i.test(model)) return "Google Pixel";
  return "Other";
}

/** Whether a Printful picture file is the back view (Solid White Blend's was): Platform warns. */
export const pictureView = (filename: string | null | undefined): "front" | "back" | null =>
  !filename ? null : /[-_]back[-_.]/i.test(filename) ? "back" : /[-_]front[-_.]/i.test(filename) ? "front" : null;

/**
 * "Flat Rate (Estimated delivery: Nov 9⁠–10)" → days from `from` to the first
 * and last day (Pacific calendar), or null when Printful's wording changes.
 */
export function deliveryDays(rateName: string, from: Date): { min: number; max: number } | null {
  const m = rateName.replace(/⁠/g, "").match(/Estimated delivery:\s*([A-Z][a-z]{2})\s+(\d{1,2})\s*[–-]\s*(?:([A-Z][a-z]{2})\s+)?(\d{1,2})/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day0 = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const at = (mon: string, d: number) => {
    const mi = months.indexOf(mon);
    if (mi < 0) return null;
    let t = Date.UTC(from.getUTCFullYear(), mi, d);
    if (t < day0 - 31 * 86_400_000) t = Date.UTC(from.getUTCFullYear() + 1, mi, d);
    return Math.round((t - day0) / 86_400_000);
  };
  const a = at(m[1], Number(m[2]));
  const b = at(m[3] ?? m[1], Number(m[4]));
  if (a === null || b === null || a < 0 || b < a) return null;
  return { min: a, max: b };
}

/** Plain-language details for the blanks we sell; others fall back to Printful's own bullets. */
export const CURATED_FACTS: Record<string, string[]> = {
  "catalog:71": ["Soft, lightweight cotton (heather colors add polyester)", "Pre-shrunk, side seams, taped shoulders", "Our label is printed inside; the tag tears off", "Light colors can be a little see-through"],
  "catalog:1629": ["Heavyweight 10 oz fleece, relaxed fit", "Silver metal zip, no drawcord", "Logo stitched on the left chest"],
  "catalog:81": ["Cotton and acrylic knit with a cuff", "Snug fit, one size fits most", "Logo stitched on the cuff"],
  "catalog:380": ["Runs small: order one size up", "Soft cotton outside, cotton and polyester fleece inside", "Front pouch pocket and flat drawstrings"],
  "catalog:388": ["Printed all over, inside the hood too", "Soft outside, brushed fleece inside", "Recycled polyester with a little stretch, relaxed fit"],
  "catalog:262": ["Printed all over, 15 by 17 inches", "Drawstring top that wears as a backpack", "Holds up to 33 lbs"],
  "catalog:358": ["Vinyl that goes on without bubbles", "Opaque, so it covers whatever is under it", "Clean the surface before you stick it"],
  "catalog:788": ["32 oz, double-walled insulated steel", "Foldable straw lid and a carrying handle", "Hand-wash only: not for the dishwasher or microwave"],
  "noun:phone-case": ["Two layers: a hard shell and a soft liner", "iPhone cases are MagSafe; both charge wirelessly", "Matte finish, cut-outs lined up to your ports"],
};

/** Printful's own bullets ("• 100% cotton • …"), minus sourcing lines, at most five. */
export function factsFromDescription(description: string | null | undefined): string[] {
  if (!description) return [];
  return description
    .split("•")
    .slice(1)
    .map((s) => s.replace(/\s+/g, " ").replace(/Disclaimer:.*$/i, "").replace(/Important:.*$/i, "").trim())
    .filter((s) => s && !/sourced from/i.test(s))
    .slice(0, 5);
}
