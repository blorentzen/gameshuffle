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

// ─── refunds ────────────────────────────────────────────────────────────────

/** What an order can still give back, per line, from Stripe's own totals (tax included). */
export interface RefundQuote {
  amountTotal: number;
  amountRefunded: number;
  lines: { sku: string; name: string; quantity: number; refundedQuantity: number; lineTotal: number }[];
  shipping: { total: number; refunded: boolean };
}

/** A line's share of its total for `units` units, rounded so all units together add up to the line total exactly. */
const lineShare = (lineTotal: number, quantity: number, units: number) => Math.round((lineTotal * units) / quantity);

/**
 * Cents to refund for these units (and the shipping charge), tax included.
 * Each line is prorated from what's already refunded, so refunding a line one
 * unit at a time adds up to exactly the line's total. Capped at what's left.
 */
export function refundCents(quote: RefundQuote, items: { sku: string; quantity: number }[], shipping: boolean): number {
  let cents = 0;
  for (const want of items) {
    const line = quote.lines.find((l) => l.sku === want.sku);
    if (!line || want.quantity < 1) continue;
    const units = Math.min(want.quantity, line.quantity - line.refundedQuantity);
    if (units < 1) continue;
    cents += lineShare(line.lineTotal, line.quantity, line.refundedQuantity + units) - lineShare(line.lineTotal, line.quantity, line.refundedQuantity);
  }
  if (shipping && !quote.shipping.refunded) cents += quote.shipping.total;
  return Math.min(cents, Math.max(quote.amountTotal - quote.amountRefunded, 0));
}

// ---------------------------------------------------------------------------
// Sales by state (build F): an early warning before a state's sales tax
// threshold. Most states register sellers at $100,000 or 200 orders a year;
// the monitor flags at config.nexus_monitor (150 orders or $75,000), over the
// last 12 months and the calendar year (Pacific), and "getting close" at three
// quarters of either line. Washington is home and already registered.

export interface StateOrder {
  state: string | null;
  createdAt: string;
  status: "paid" | "shipped" | "refunded" | "canceled";
  /** Order total minus tax, in cents (goods + shipping, before refunds). */
  sales: number;
  refunded: number;
}

export type StateStatus = "home" | "over" | "close" | "fine";

export interface StateTotals {
  state: string;
  orders12: number;
  sales12: number;
  ordersYear: number;
  salesYear: number;
  status: StateStatus;
}

export const HOME_STATE = "WA";

/**
 * Totals per state, busiest first. Canceled orders (refused addresses, never
 * shipped) and fully refunded ones don't count; partial refunds come off the
 * sales. `yearStart` and `rollingStart` are the two windows' starts.
 */
export function stateTotals(orders: StateOrder[], windows: { rollingStart: Date; yearStart: Date }, config: ShopConfig = SHOP): StateTotals[] {
  const by = new Map<string, StateTotals>();
  for (const o of orders) {
    if (!o.state || o.status === "canceled" || o.status === "refunded") continue;
    const at = Date.parse(o.createdAt);
    const net = Math.max(0, o.sales - o.refunded);
    const row = by.get(o.state) ?? { state: o.state, orders12: 0, sales12: 0, ordersYear: 0, salesYear: 0, status: "fine" as StateStatus };
    if (at >= windows.rollingStart.getTime()) { row.orders12 += 1; row.sales12 += net; }
    if (at >= windows.yearStart.getTime()) { row.ordersYear += 1; row.salesYear += net; }
    by.set(o.state, row);
  }
  const { warn_orders: warnOrders, warn_revenue_cents: warnRevenue } = config.nexus_monitor;
  const rows = [...by.values()].filter((r) => r.orders12 > 0 || r.ordersYear > 0);
  for (const r of rows) {
    const orders = Math.max(r.orders12, r.ordersYear);
    const sales = Math.max(r.sales12, r.salesYear);
    r.status = r.state === HOME_STATE ? "home"
      : orders >= warnOrders || sales >= warnRevenue ? "over"
      : orders >= warnOrders * 0.75 || sales >= warnRevenue * 0.75 ? "close"
      : "fine";
  }
  return rows.sort((a, b) => b.sales12 - a.sales12 || b.orders12 - a.orders12 || a.state.localeCompare(b.state));
}
