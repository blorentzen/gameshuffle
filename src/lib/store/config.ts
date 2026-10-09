/**
 * The GameShuffle shop's catalog and rules, typed, from
 * src/data/store/shop-seed.json (the source of truth: products, prices,
 * limits, weights, shipping, postage, cutoffs, the tax monitor and UTM tags).
 * Nothing here is hardcoded; change the JSON. Client-safe.
 *
 * The shop sells curated packs and themes. Singles stay on TCGplayer
 * (TCG_SHOP_URL in src/data/shop.ts); the two are linked from each other.
 */

import seed from "@/data/store/shop-seed.json";

export type ProductKind = "bundle" | "single";
export type ShipMethod = "parcel" | "letter" | "flat";

export interface SeedProduct {
  sku: string;
  kind: ProductKind;
  category: string;
  name: string;
  price_cents: number;
  max_per_order: number;
  ship_weight_oz: number;
  sort_order: number;
  active: boolean;
  inactive_after?: string;
  stock_available: number;
  stripe_description: string;
  blurb: string;
  contents: string[];
  image_url: string | null;
}

export interface ShopConfig {
  version: number;
  currency: string;
  products: SeedProduct[];
  checkout: {
    session_minutes: number;
    hold_sweep_minutes: number;
    allowed_countries: string[];
    blocked_states: string[];
    shipping_rate_display_name: string;
    shipping_estimate_business_days: { min: number; max: number };
    automatic_tax: boolean;
    allow_promotion_codes: boolean;
  };
  shipping: {
    flat_max_singles: number;
    ship_within_business_days: number;
    timezone: string;
    packaging_oz: Record<ShipMethod, number>;
    postage_cents: {
      letter_first_oz: number;
      letter_additional_oz: number;
      letter_max_oz: number;
      nonmachinable_surcharge: number;
      flat_first_oz: number;
      flat_additional_oz: number;
      flat_max_oz: number;
    };
    parcel_carrier: string;
    reship_after_days: number;
  };
  holiday: { banner_start: string; cutoff_lower48: string; cutoff_ak_hi: string; banner_end: string };
  nexus_monitor: { warn_orders: number; warn_revenue_cents: number; windows: string[] };
  utm: { source: string; medium: string; campaign: string; placements: string[] };
  contact: { support_email: string; return_address: string | null };
}

export const SHOP: ShopConfig = seed as ShopConfig;

/** Stripe objects the seed owns: product ids are fixed so re-running finds them. */
export const stripeProductId = (sku: string) => `gs_shop_${sku}`;
export const stripeLookupKey = (sku: string) => `shop_${sku}`;
/** Every shop Stripe object carries this, so other code (Pricing sync, the webhook) can tell it apart. */
export const SHOP_METADATA_KIND = "shop";
/** Stripe Tax code for sealed packs and accessories: general tangible goods. */
export const SHOP_TAX_CODE = "txcd_99999999";

/** Whether a product can be sold right now: switched on and not past its end date. */
export function isOnSale(p: { active: boolean; inactive_after?: string | null }, now: Date = new Date()): boolean {
  if (!p.active) return false;
  return !p.inactive_after || new Date(p.inactive_after).getTime() > now.getTime();
}
