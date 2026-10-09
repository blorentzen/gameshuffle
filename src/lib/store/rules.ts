/**
 * Shop rules, pure and client-safe. Every number comes from the config
 * (src/data/store/shop-seed.json), so prices, weights and postage change there.
 *
 *   shippingCents   $4.99 under the free-shipping threshold, free from it
 *   shipMethodFor   every order is a tracked parcel (USPS Ground Advantage)
 *                   while stamped_mail is off; with it on, 1 single goes as a
 *                   letter and 2 up to the flat limit as a large envelope
 *   shipWeightOz    contents plus the packaging for that method
 *   postageCents    stamps for a letter or large envelope (parcels are
 *                   labelled in Rollo, so null)
 */

import { SHOP, type ProductKind, type ShipMethod, type ShopConfig } from "./config";

export interface CartLine { sku: string; quantity: number }
interface CatalogEntry { kind: ProductKind; ship_weight_oz: number }

function lookup(catalog: Map<string, CatalogEntry> | undefined, sku: string, config: ShopConfig): CatalogEntry {
  const fromCatalog = catalog?.get(sku);
  if (fromCatalog) return fromCatalog;
  const p = config.products.find((x) => x.sku === sku);
  if (!p) throw new Error(`unknown sku: ${sku}`);
  return { kind: p.kind, ship_weight_oz: p.ship_weight_oz };
}

/** What shipping costs for an order with this subtotal (before tax). */
export function shippingCents(subtotalCents: number, config: ShopConfig = SHOP): number {
  const r = config.shipping.rate;
  return subtotalCents >= r.free_threshold_cents ? 0 : r.standard_cents;
}

/** How far an order is from free shipping (0 once it's there). */
export function toFreeShippingCents(subtotalCents: number, config: ShopConfig = SHOP): number {
  return Math.max(0, config.shipping.rate.free_threshold_cents - subtotalCents);
}

export function shipMethodFor(lines: CartLine[], opts: { catalog?: Map<string, CatalogEntry>; config?: ShopConfig } = {}): ShipMethod {
  const config = opts.config ?? SHOP;
  if (!config.shipping.stamped_mail) return "parcel";
  let singles = 0;
  for (const l of lines) {
    if (l.quantity < 1) continue;
    const p = lookup(opts.catalog, l.sku, config);
    if (p.kind === "bundle") return "parcel";
    singles += l.quantity;
  }
  if (singles <= 1) return "letter";
  return singles <= config.shipping.flat_max_singles ? "flat" : "parcel";
}

export function shipWeightOz(lines: CartLine[], method: ShipMethod, opts: { catalog?: Map<string, CatalogEntry>; config?: ShopConfig } = {}): number {
  const config = opts.config ?? SHOP;
  const contents = lines.reduce((sum, l) => sum + (l.quantity > 0 ? lookup(opts.catalog, l.sku, config).ship_weight_oz * l.quantity : 0), 0);
  return Math.round((contents + config.shipping.packaging_oz[method]) * 100) / 100;
}

/** Stamps needed, in cents. Letters with a stiffener are rigid, so they pay the nonmachinable surcharge. */
export function postageCents(method: ShipMethod, weightOz: number, config: ShopConfig = SHOP): number | null {
  const p = config.shipping.postage_cents;
  const extraOunces = Math.max(0, Math.ceil(weightOz) - 1);
  if (method === "letter") return p.letter_first_oz + extraOunces * p.letter_additional_oz + p.nonmachinable_surcharge;
  if (method === "flat") return p.flat_first_oz + extraOunces * p.flat_additional_oz;
  return null;
}

export type HolidayState = "none" | "before_cutoff" | "after_cutoff";

/** Which Christmas banner the shop shows: from banner_start until the lower-48 cutoff, then the after-cutoff line until banner_end. */
export function holidayState(now: Date = new Date(), config: ShopConfig = SHOP): HolidayState {
  const t = now.getTime();
  const h = config.holiday;
  if (t < Date.parse(h.banner_start) || t >= Date.parse(h.banner_end)) return "none";
  return t <= Date.parse(h.cutoff_lower48) ? "before_cutoff" : "after_cutoff";
}

/** Whether an order placed now misses Christmas delivery: Alaska and Hawaii use the earlier cutoff. */
export function missesChristmas(shipState: string | null | undefined, now: Date = new Date(), config: ShopConfig = SHOP): boolean {
  const h = config.holiday;
  const t = now.getTime();
  if (t < Date.parse(h.banner_start) || t >= Date.parse(h.banner_end)) return false;
  const cutoff = shipState === "AK" || shipState === "HI" ? h.cutoff_ak_hi : h.cutoff_lower48;
  return t > Date.parse(cutoff);
}

/**
 * The day an order ships by: ship_within_business_days after the order's
 * Pacific date, skipping weekends and no_ship_days. YYYY-MM-DD.
 */
export function shipByDay(orderedAt: Date, config: ShopConfig = SHOP): string {
  const tz = config.shipping.timezone;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(orderedAt);
  const skip = new Set(config.shipping.no_ship_days);
  // Walk calendar days at UTC noon so DST never shifts the date.
  const d = new Date(`${day}T12:00:00Z`);
  let left = config.shipping.ship_within_business_days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !skip.has(iso)) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

/** The order number buyers see. */
export const orderCode = (orderNumber: number | string) => `GS-${orderNumber}`;
