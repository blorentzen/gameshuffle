/**
 * Sync the shop catalog from src/data/store/shop-seed.json into Stripe (test
 * mode only) and shop_products. Safe to re-run: a second run changes nothing.
 *
 *   NODE_PATH=<server-only stub> DOTENV_CONFIG_PATH=.env.local \
 *     npx tsx -r dotenv/config scripts/seed-shop.ts [--skip-db] [--wa-tax] [--dry-run]
 *
 *   Stripe   one Product per SKU with a fixed id (gs_shop_<sku>), the general
 *            tangible goods tax code and metadata { sku, kind, category,
 *            gs_kind: "shop" }; one active Price per SKU found by lookup key
 *            shop_<sku>, tax exclusive. A price change makes a new Price,
 *            moves the lookup key and archives the old one.
 *   Database catalog fields are kept in step with the seed. Stock and the
 *            active switch are only set when a row is first created: after
 *            that they belong to Platform admin. An image set in admin is
 *            never cleared by a seed without one.
 *   --wa-tax adds a Washington sales tax registration in test mode if there
 *            isn't one (needed for WA orders to show tax). Account-wide: it
 *            also applies to the other products' test prices.
 *
 * Refuses a live key: running against live mode is a separate decision.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { SHOP, SHOP_METADATA_KIND, SHOP_TAX_CODE, stripeLookupKey, stripeProductId, type SeedProduct } from "@/lib/store/config";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const SKIP_DB = args.has("--skip-db");
const WA_TAX = args.has("--wa-tax");

type Change = "created" | "updated" | "unchanged";
const tally: Record<string, Change[]> = { product: [], price: [], row: [] };

function sameMetadata(a: Stripe.Metadata | null | undefined, b: Record<string, string>): boolean {
  const ka = Object.keys(a ?? {}).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && kb.every((k, i) => ka[i] === k && (a ?? {})[k] === b[k]);
}

async function syncProduct(stripe: Stripe, p: SeedProduct): Promise<string> {
  const id = stripeProductId(p.sku);
  const metadata = { sku: p.sku, kind: p.kind, category: p.category, gs_kind: SHOP_METADATA_KIND };
  const want = { name: p.name, description: p.stripe_description, tax_code: SHOP_TAX_CODE, metadata, active: true };
  let existing: Stripe.Product | null = null;
  try {
    existing = await stripe.products.retrieve(id);
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }
  if (!existing) {
    if (!DRY) await stripe.products.create({ id, ...want });
    tally.product.push("created");
    console.log(`  product ${id}: created`);
    return id;
  }
  const taxCode = typeof existing.tax_code === "string" ? existing.tax_code : existing.tax_code?.id ?? null;
  const differs = existing.name !== want.name || existing.description !== want.description || taxCode !== want.tax_code || !existing.active || !sameMetadata(existing.metadata, metadata);
  if (differs) {
    if (!DRY) await stripe.products.update(id, want);
    tally.product.push("updated");
    console.log(`  product ${id}: updated`);
  } else tally.product.push("unchanged");
  return id;
}

async function syncPrice(stripe: Stripe, p: SeedProduct, productId: string): Promise<string> {
  const lookupKey = stripeLookupKey(p.sku);
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const current = found.data[0] ?? null;
  const currentProduct = current ? (typeof current.product === "string" ? current.product : current.product.id) : null;
  if (current && current.unit_amount === p.price_cents && current.currency === SHOP.currency && current.tax_behavior === "exclusive" && currentProduct === productId && current.type === "one_time") {
    tally.price.push("unchanged");
    return current.id;
  }
  let priceId = current?.id ?? "(dry run)";
  if (!DRY) {
    const created = await stripe.prices.create({
      product: productId, unit_amount: p.price_cents, currency: SHOP.currency, tax_behavior: "exclusive",
      lookup_key: lookupKey, transfer_lookup_key: true, metadata: { sku: p.sku, gs_kind: SHOP_METADATA_KIND },
    });
    priceId = created.id;
    if (current) await stripe.prices.update(current.id, { active: false });
    await stripe.products.update(productId, { default_price: priceId });
  }
  tally.price.push(current ? "updated" : "created");
  console.log(`  price ${lookupKey}: ${current ? `replaced (${current.unit_amount} -> ${p.price_cents})` : `created (${p.price_cents})`}`);
  return priceId;
}

async function syncRows(rows: { p: SeedProduct; productId: string; priceId: string }[]) {
  const svc = createServiceClient();
  const { data, error } = await svc.from("shop_products").select("sku, kind, category, name, blurb, description, contents, stripe_product_id, stripe_price_id, price_cents, inactive_after, max_per_order, ship_weight_oz, image_url, sort_order");
  if (error) throw new Error(`shop_products: ${error.message} (has supabase/shop-m1.sql been run?)`);
  const have = new Map((data ?? []).map((r) => [r.sku as string, r as Record<string, unknown>]));
  for (const { p, productId, priceId } of rows) {
    const catalog: Record<string, unknown> = {
      kind: p.kind, category: p.category, name: p.name, blurb: p.blurb, description: p.stripe_description, contents: p.contents,
      stripe_product_id: productId, stripe_price_id: priceId, price_cents: p.price_cents, inactive_after: p.inactive_after ?? null,
      max_per_order: p.max_per_order, ship_weight_oz: p.ship_weight_oz, sort_order: p.sort_order,
      ...(p.image_url ? { image_url: p.image_url } : {}),
    };
    const row = have.get(p.sku);
    if (!row) {
      if (!DRY) {
        const { error: e } = await svc.from("shop_products").insert({ sku: p.sku, ...catalog, active: p.active, stock_available: p.stock_available });
        if (e) throw new Error(`insert ${p.sku}: ${e.message}`);
      }
      tally.row.push("created");
      console.log(`  row ${p.sku}: created`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(catalog)) {
      const cur = row[k];
      const same = k === "inactive_after"
        ? (cur ? new Date(cur as string).getTime() : null) === (v ? new Date(v as string).getTime() : null)
        : k === "ship_weight_oz" ? Number(cur) === Number(v)
        : JSON.stringify(cur ?? null) === JSON.stringify(v ?? null);
      if (!same) patch[k] = v;
    }
    if (Object.keys(patch).length) {
      if (!DRY) {
        const { error: e } = await svc.from("shop_products").update({ ...patch, updated_at: new Date().toISOString() }).eq("sku", p.sku);
        if (e) throw new Error(`update ${p.sku}: ${e.message}`);
      }
      tally.row.push("updated");
      console.log(`  row ${p.sku}: updated ${Object.keys(patch).join(", ")}`);
    } else tally.row.push("unchanged");
  }
}

async function ensureWaRegistration(stripe: Stripe) {
  const regs = await stripe.tax.registrations.list({ limit: 100 });
  const wa = regs.data.find((r) => r.country === "US" && r.country_options?.us?.state === "WA" && r.status !== "expired");
  if (wa) { console.log(`  WA tax registration: already ${wa.status}`); return; }
  if (!DRY) await stripe.tax.registrations.create({ country: "US", country_options: { us: { state: "WA", type: "state_sales_tax" } }, active_from: "now" });
  console.log("  WA tax registration: created");
}

(async () => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    console.error("Refusing: STRIPE_SECRET_KEY isn't a test key. Seeding live mode is a separate decision.");
    process.exit(1);
  }
  const stripe = getStripe();
  console.log(`Shop seed v${SHOP.version}: ${SHOP.products.length} products${DRY ? " (dry run)" : ""}`);
  const rows: { p: SeedProduct; productId: string; priceId: string }[] = [];
  for (const p of SHOP.products) {
    const productId = await syncProduct(stripe, p);
    const priceId = await syncPrice(stripe, p, productId);
    rows.push({ p, productId, priceId });
  }
  if (WA_TAX) await ensureWaRegistration(stripe);
  if (!SKIP_DB) await syncRows(rows);
  const sum = (xs: Change[]) => `${xs.filter((x) => x === "created").length} created, ${xs.filter((x) => x === "updated").length} updated, ${xs.filter((x) => x === "unchanged").length} unchanged`;
  console.log(`Stripe products: ${sum(tally.product)}\nStripe prices: ${sum(tally.price)}${SKIP_DB ? "\nDatabase: skipped" : `\nDatabase rows: ${sum(tally.row)}`}`);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
