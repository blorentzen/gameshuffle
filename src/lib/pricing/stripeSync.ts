import "server-only";

import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { bustPricingCache, getCatalog, type PlanId, type PriceInterval } from "./catalog";

/**
 * Pricing catalog ↔ Stripe, both directions.
 *
 *   GS → Stripe   changePrice(): Stripe prices are immutable, so a new Price is
 *                 created on the same Product, the lookup key is transferred to
 *                 it, the old one is archived. Existing subscribers keep their
 *                 old price until staff explicitly migrates (policy decided
 *                 2026-09-21).
 *   Stripe → GS   mirrorStripeEvent(): product.* / price.* webhooks keep the
 *                 table honest when someone edits in the Stripe dashboard.
 *                 reconcile(): full pass, also flags unmapped active prices.
 */

async function audit(actorId: string | null, action: string, target: string, before: unknown, after: unknown) {
  await createServiceClient().from("gs_pricing_audit").insert({ actor_id: actorId, action, target, before: before ?? null, after: after ?? null });
}

/** Ensure the plan has a Stripe Product (creates one if the environment lacks it). */
async function ensureProduct(planId: PlanId): Promise<string> {
  const c = await getCatalog();
  const plan = c.plans.find((p) => p.id === planId);
  if (!plan) throw new Error(`Unknown plan ${planId}`);
  if (plan.stripeProductId) return plan.stripeProductId;
  // A sibling price may already know the product.
  const sibling = c.prices.find((p) => p.planId === planId && p.stripePriceId);
  const stripe = getStripe();
  let productId: string | null = null;
  if (sibling?.stripePriceId) {
    const pr = await stripe.prices.retrieve(sibling.stripePriceId);
    productId = typeof pr.product === "string" ? pr.product : pr.product.id;
  }
  if (!productId) {
    const created = await stripe.products.create({ name: plan.name, description: plan.blurb ?? undefined, metadata: { gs_plan_id: planId } });
    productId = created.id;
  }
  await createServiceClient().from("gs_pricing_plans").update({ stripe_product_id: productId }).eq("id", planId);
  bustPricingCache();
  return productId;
}

/**
 * Change what a plan sells for. Creates the new Stripe Price, moves the lookup
 * key onto it, archives the old one, records both in the table. Returns the
 * new row id.
 */
export async function changePrice(args: { planId: PlanId; interval: PriceInterval; amountCents: number; currency?: string; actorId: string | null }): Promise<{ priceId: string; stripePriceId: string }> {
  if (!Number.isInteger(args.amountCents) || args.amountCents < 0) throw new Error("amount must be a non-negative integer (cents)");
  const c = await getCatalog();
  const current = c.prices.find((p) => p.planId === args.planId && p.interval === args.interval && p.active && !p.supersededBy);
  if (!current) throw new Error(`No active ${args.interval} price for ${args.planId}`);
  if (current.amountCents === args.amountCents) return { priceId: current.id, stripePriceId: current.stripePriceId ?? "" };

  const stripe = getStripe();
  const productId = await ensureProduct(args.planId);
  const created = await stripe.prices.create({
    product: productId,
    currency: args.currency ?? current.currency ?? "usd",
    unit_amount: args.amountCents,
    ...(args.interval === "once" ? {} : { recurring: { interval: args.interval } }),
    lookup_key: current.lookupKey,
    transfer_lookup_key: true, // the old price loses the key; checkout follows the key
    metadata: { gs_plan_id: args.planId, gs_interval: args.interval },
  });
  if (current.stripePriceId) {
    await stripe.prices.update(current.stripePriceId, { active: false }).catch(() => {});
  }

  const svc = createServiceClient();
  // The old row gives up the unique lookup key first (the new row needs it), then
  // the new row lands, then the old row is pointed at its successor.
  const retiredKey = `${current.lookupKey}__v${Date.now()}`;
  const { error: retireErr } = await svc.from("gs_pricing_prices").update({ active: false, lookup_key: retiredKey }).eq("id", current.id);
  if (retireErr) throw new Error(retireErr.message);
  const { data: row, error } = await svc.from("gs_pricing_prices").insert({
    plan_id: args.planId, interval: args.interval, amount_cents: args.amountCents, currency: created.currency, lookup_key: current.lookupKey,
    stripe_price_id: created.id, active: true, created_by: args.actorId,
  }).select("id").single();
  if (error) {
    // Roll the key back so the catalog isn't left without a sellable price.
    await svc.from("gs_pricing_prices").update({ active: true, lookup_key: current.lookupKey }).eq("id", current.id);
    throw new Error(error.message);
  }
  await svc.from("gs_pricing_prices").update({ superseded_by: row.id }).eq("id", current.id);
  await audit(args.actorId, "price.change", current.lookupKey, { amount_cents: current.amountCents, stripe_price_id: current.stripePriceId }, { amount_cents: args.amountCents, stripe_price_id: created.id });
  bustPricingCache();
  return { priceId: row.id as string, stripePriceId: created.id };
}

export async function setLever(args: { key: string; valueNum?: number | null; valueText?: string | null; actorId: string | null }): Promise<void> {
  const svc = createServiceClient();
  const { data: before } = await svc.from("gs_pricing_levers").select("value_num, value_text").eq("key", args.key).maybeSingle();
  const patch: Record<string, unknown> = { key: args.key, updated_at: new Date().toISOString(), updated_by: args.actorId };
  if (args.valueNum !== undefined) patch.value_num = args.valueNum;
  if (args.valueText !== undefined) patch.value_text = args.valueText;
  const { error } = await svc.from("gs_pricing_levers").upsert(patch, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await audit(args.actorId, "lever.set", args.key, before ?? null, { value_num: args.valueNum, value_text: args.valueText });
  bustPricingCache();
}

export async function updatePlan(args: { planId: PlanId; name?: string; blurb?: string | null; capabilities?: string[]; limits?: Record<string, unknown>; active?: boolean; actorId: string | null }): Promise<void> {
  const svc = createServiceClient();
  const { data: before } = await svc.from("gs_pricing_plans").select("name, blurb, capabilities, limits, active").eq("id", args.planId).maybeSingle();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: args.actorId };
  for (const k of ["name", "blurb", "capabilities", "limits", "active"] as const) if (args[k] !== undefined) patch[k] = args[k];
  const { error } = await svc.from("gs_pricing_plans").update(patch).eq("id", args.planId);
  if (error) throw new Error(error.message);
  // Keep the Stripe product's display name in step (best effort).
  const c = await getCatalog();
  const plan = c.plans.find((p) => p.id === args.planId);
  if (plan?.stripeProductId && (args.name || args.blurb !== undefined)) {
    await getStripe().products.update(plan.stripeProductId, { ...(args.name ? { name: args.name } : {}), ...(args.blurb !== undefined ? { description: args.blurb ?? "" } : {}) }).catch(() => {});
  }
  await audit(args.actorId, "plan.update", args.planId, before ?? null, patch);
  bustPricingCache();
}

/** Mirror a Stripe dashboard change into the table. Called from the webhook. */
export async function mirrorStripeEvent(event: Stripe.Event): Promise<{ changed: boolean; note?: string }> {
  const svc = createServiceClient();
  if (event.type === "price.created" || event.type === "price.updated") {
    const price = event.data.object as Stripe.Price;
    const key = price.lookup_key;
    if (!key) return { changed: false, note: "price without lookup key ignored" };
    const c = await getCatalog();
    const row = c.prices.find((p) => p.lookupKey === key);
    if (!row) return { changed: false, note: `unmapped lookup key ${key}` };
    const patch: Record<string, unknown> = {};
    if (row.stripePriceId !== price.id) patch.stripe_price_id = price.id;
    if (price.unit_amount != null && price.unit_amount !== row.amountCents) patch.amount_cents = price.unit_amount;
    if (price.active === false && row.active && !row.supersededBy) patch.active = false;
    if (Object.keys(patch).length === 0) return { changed: false };
    await svc.from("gs_pricing_prices").update(patch).eq("id", row.id);
    await audit(null, "sync.webhook", key, { amount_cents: row.amountCents, stripe_price_id: row.stripePriceId, active: row.active }, patch);
    bustPricingCache();
    return { changed: true };
  }
  if (event.type === "product.updated") {
    const product = event.data.object as Stripe.Product;
    const c = await getCatalog();
    const plan = c.plans.find((p) => p.stripeProductId === product.id) ?? c.plans.find((p) => p.id === product.metadata?.gs_plan_id);
    if (!plan) return { changed: false, note: "product not mapped to a plan" };
    const patch: Record<string, unknown> = {};
    if (product.name && product.name !== plan.name) patch.name = product.name;
    if (!plan.stripeProductId) patch.stripe_product_id = product.id;
    if (Object.keys(patch).length === 0) return { changed: false };
    await svc.from("gs_pricing_plans").update(patch).eq("id", plan.id);
    await audit(null, "sync.webhook", plan.id, { name: plan.name }, patch);
    bustPricingCache();
    return { changed: true };
  }
  return { changed: false };
}

export interface ReconcileResult { backfilled: string[]; amountDrift: { lookupKey: string; table: number; stripe: number }[]; unmapped: { id: string; lookupKey: string | null; amount: number | null; product: string | null }[] }

/** Full pass: backfill ids by lookup key, report amount drift and unmapped active prices. */
export async function reconcile(actorId: string | null): Promise<ReconcileResult> {
  const stripe = getStripe();
  const svc = createServiceClient();
  const c = await getCatalog();
  const out: ReconcileResult = { backfilled: [], amountDrift: [], unmapped: [] };
  const known = new Map(c.prices.filter((p) => p.active).map((p) => [p.lookupKey, p]));
  const seen = new Set<string>();
  for await (const price of stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] })) {
    const key = price.lookup_key;
    const row = key ? known.get(key) : undefined;
    if (!row) {
      const prod = typeof price.product === "string" ? price.product : (price.product as Stripe.Product).name;
      if (!(typeof price.product !== "string" && (price.product as Stripe.Product).deleted)) out.unmapped.push({ id: price.id, lookupKey: key ?? null, amount: price.unit_amount, product: prod ?? null });
      continue;
    }
    seen.add(row.lookupKey);
    const patch: Record<string, unknown> = {};
    if (row.stripePriceId !== price.id) { patch.stripe_price_id = price.id; out.backfilled.push(row.lookupKey); }
    if (price.unit_amount != null && price.unit_amount !== row.amountCents) out.amountDrift.push({ lookupKey: row.lookupKey, table: row.amountCents, stripe: price.unit_amount });
    const productId = typeof price.product === "string" ? price.product : (price.product as Stripe.Product).id;
    const plan = c.plans.find((p) => p.id === row.planId);
    if (plan && !plan.stripeProductId && productId) await svc.from("gs_pricing_plans").update({ stripe_product_id: productId }).eq("id", plan.id);
    if (Object.keys(patch).length) await svc.from("gs_pricing_prices").update(patch).eq("id", row.id);
  }
  await audit(actorId, "sync.stripe", "reconcile", null, { backfilled: out.backfilled, drift: out.amountDrift.length, unmapped: out.unmapped.length });
  bustPricingCache();
  return out;
}
