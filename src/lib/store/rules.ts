/**
 * Shop rules, pure and client-safe. Every number comes from the config
 * (src/data/store/shop-seed.json), so prices, weights and postage change there.
 *
 *   shipMethodFor   any bundle, or more singles than fit a large envelope,
 *                   ships as a tracked parcel; 1 single goes as a letter;
 *                   2 up to the flat limit go as a large envelope
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

export function shipMethodFor(lines: CartLine[], opts: { catalog?: Map<string, CatalogEntry>; config?: ShopConfig } = {}): ShipMethod {
  const config = opts.config ?? SHOP;
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

/** The order number buyers see. */
export const orderCode = (orderNumber: number | string) => `GS-${orderNumber}`;
