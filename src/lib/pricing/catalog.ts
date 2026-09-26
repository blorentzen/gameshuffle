import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

/**
 * Pricing catalog — the read side of the lever model.
 *
 *   gs_pricing_plans   what a plan is (capabilities, limits)
 *   gs_pricing_prices  what we sell it for (lookup_key ↔ Stripe Price)
 *   gs_pricing_levers  numbers that aren't plans (platform fee, SMS allowances)
 *
 * Stripe price ids are resolved by lookup key per environment and backfilled
 * into the table the first time they're needed, so dev (test catalog) and prod
 * (live catalog) share one seed with no env vars. Reads are cached in-process
 * for 60s; writes go through `stripeSync.ts` which busts the cache.
 */

export type PlanId = "free" | "pro" | "pro_addon" | "circuit_64" | "circuit_256" | "circuit_events";
export type PriceInterval = "month" | "year" | "once";

export interface PricingPlan {
  id: PlanId;
  line: "core" | "pro" | "circuit";
  kind: "tier" | "subscription" | "addon" | "pass";
  name: string;
  blurb: string | null;
  stripeProductId: string | null;
  capabilities: string[];
  limits: Record<string, unknown>;
  sort: number;
  active: boolean;
}

export interface PricingPrice {
  id: string;
  planId: PlanId;
  interval: PriceInterval;
  amountCents: number;
  currency: string;
  lookupKey: string;
  stripePriceId: string | null;
  active: boolean;
  supersededBy: string | null;
}

export interface Lever { key: string; valueNum: number | null; valueText: string | null; description: string | null; updatedAt: string }

interface Snapshot { plans: PricingPlan[]; prices: PricingPrice[]; levers: Map<string, Lever>; loadedAt: number }

const TTL_MS = 60_000;
let snap: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

export function bustPricingCache(): void { snap = null; }

async function load(): Promise<Snapshot> {
  const svc = createServiceClient();
  const [{ data: plans }, { data: prices }, { data: levers }] = await Promise.all([
    svc.from("gs_pricing_plans").select("*").order("sort"),
    svc.from("gs_pricing_prices").select("*").order("created_at"),
    svc.from("gs_pricing_levers").select("*"),
  ]);
  const s: Snapshot = {
    plans: ((plans ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as PlanId, line: r.line as PricingPlan["line"], kind: r.kind as PricingPlan["kind"], name: r.name as string, blurb: (r.blurb as string | null) ?? null,
      stripeProductId: (r.stripe_product_id as string | null) ?? null, capabilities: (r.capabilities as string[]) ?? [], limits: (r.limits as Record<string, unknown>) ?? {}, sort: (r.sort as number) ?? 0, active: !!r.active,
    })),
    prices: ((prices ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string, planId: r.plan_id as PlanId, interval: r.interval as PriceInterval, amountCents: r.amount_cents as number, currency: r.currency as string,
      lookupKey: r.lookup_key as string, stripePriceId: (r.stripe_price_id as string | null) ?? null, active: !!r.active, supersededBy: (r.superseded_by as string | null) ?? null,
    })),
    levers: new Map(((levers ?? []) as Record<string, unknown>[]).map((r) => [r.key as string, { key: r.key as string, valueNum: r.value_num == null ? null : Number(r.value_num), valueText: (r.value_text as string | null) ?? null, description: (r.description as string | null) ?? null, updatedAt: r.updated_at as string }])),
    loadedAt: Date.now(),
  };
  return s;
}

export async function getCatalog(): Promise<Snapshot> {
  if (snap && Date.now() - snap.loadedAt < TTL_MS) return snap;
  if (!inflight) inflight = load().then((s) => { snap = s; inflight = null; return s; }).catch((e) => { inflight = null; throw e; });
  return inflight;
}

/** Table present? (pre-migration environments fall back to code constants). */
export async function pricingTablesReady(): Promise<boolean> {
  try { const c = await getCatalog(); return c.plans.length > 0; } catch { return false; }
}

// ─── plans ───────────────────────────────────────────────────────────────────

export async function getPlan(id: PlanId): Promise<PricingPlan | null> {
  return (await getCatalog()).plans.find((p) => p.id === id) ?? null;
}

export async function listPlans(): Promise<PricingPlan[]> {
  return (await getCatalog()).plans.filter((p) => p.active);
}

/** Active sell prices for a plan, by interval. */
export async function pricesFor(planId: PlanId): Promise<Partial<Record<PriceInterval, PricingPrice>>> {
  const c = await getCatalog();
  const out: Partial<Record<PriceInterval, PricingPrice>> = {};
  for (const p of c.prices) if (p.planId === planId && p.active && !p.supersededBy) out[p.interval] = p;
  return out;
}

// ─── prices ↔ Stripe ─────────────────────────────────────────────────────────

/**
 * Stripe Price id for a lookup key in THIS environment's Stripe account.
 * Table first; else ask Stripe by lookup key and backfill the table.
 */
export async function resolveStripePriceId(lookupKey: string): Promise<string> {
  const c = await getCatalog();
  const row = c.prices.find((p) => p.lookupKey === lookupKey && p.active);
  if (row?.stripePriceId) return row.stripePriceId;
  const stripe = getStripe();
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = found.data[0];
  if (!price) throw new Error(`No active Stripe price with lookup key "${lookupKey}" in this environment`);
  const svc = createServiceClient();
  if (row) {
    await svc.from("gs_pricing_prices").update({ stripe_price_id: price.id }).eq("id", row.id);
    const plan = c.plans.find((p) => p.id === row.planId);
    if (plan && !plan.stripeProductId && typeof price.product === "string") await svc.from("gs_pricing_plans").update({ stripe_product_id: price.product }).eq("id", plan.id);
    bustPricingCache();
  }
  return price.id;
}

export interface ResolvedPrice { planId: PlanId; interval: PriceInterval; lookupKey: string; amountCents: number }

/**
 * Which plan / interval a Stripe price belongs to (webhooks, plan state).
 * Table by id, then by lookup key fetched from Stripe (backfilled), else null.
 */
export async function planFromStripePrice(priceId: string | null | undefined, lookupKey?: string | null): Promise<ResolvedPrice | null> {
  if (!priceId && !lookupKey) return null;
  const c = await getCatalog();
  const byId = priceId ? c.prices.find((p) => p.stripePriceId === priceId) : undefined;
  if (byId) return { planId: byId.planId, interval: byId.interval, lookupKey: byId.lookupKey, amountCents: byId.amountCents };
  let key = lookupKey ?? null;
  if (!key && priceId) {
    try { key = (await getStripe().prices.retrieve(priceId)).lookup_key ?? null; } catch { key = null; }
  }
  if (!key) return null;
  const byKey = c.prices.find((p) => p.lookupKey === key);
  if (!byKey) return null;
  if (priceId && !byKey.stripePriceId) {
    await createServiceClient().from("gs_pricing_prices").update({ stripe_price_id: priceId }).eq("id", byKey.id);
    bustPricingCache();
  }
  return { planId: byKey.planId, interval: byKey.interval, lookupKey: byKey.lookupKey, amountCents: byKey.amountCents };
}

// ─── levers ──────────────────────────────────────────────────────────────────

export async function lever(key: string, fallback: number): Promise<number> {
  const c = await getCatalog();
  const v = c.levers.get(key)?.valueNum;
  return v == null || Number.isNaN(v) ? fallback : v;
}

export async function leverText(key: string, fallback: string): Promise<string> {
  const c = await getCatalog();
  return c.levers.get(key)?.valueText ?? fallback;
}

/** Plan whose levers govern an organizer's fees (Circuit line first, then Pro, else Free). */
export function feePlanFor(user: { circuitTier?: string | null; circuitStatus?: string | null; subscriptionTier?: string | null }): PlanId {
  const circuitActive = user.circuitStatus === "active" || user.circuitStatus === "trialing";
  if (circuitActive && (user.circuitTier === "circuit_256" || user.circuitTier === "circuit_64" || user.circuitTier === "circuit_events")) return user.circuitTier;
  if (user.subscriptionTier === "pro") return "pro";
  return "free";
}

export interface PlatformFee { bps: number; fixedCents: number; feeCents: number; planId: PlanId }

/** Platform fee for one ticket at `amountCents`, from the organizer's plan levers. */
export async function computePlatformFee(amountCents: number, planId: PlanId): Promise<PlatformFee> {
  const bps = await lever(`platform_fee_bps.${planId}`, planId === "free" || planId === "pro" ? 500 : 0);
  const fixedCents = await lever(`platform_fee_fixed_cents.${planId}`, planId === "free" || planId === "pro" ? 25 : 0);
  const min = await lever("connect_min_fee_cents", 0);
  const feeCents = amountCents <= 0 ? 0 : Math.max(min, Math.round((amountCents * bps) / 10_000) + fixedCents);
  return { bps, fixedCents, feeCents, planId };
}

/** Monthly SMS segment allowance for a plan (0 = feature off). */
export async function smsAllowance(planId: PlanId): Promise<number> {
  return lever(`sms_segments.${planId}`, planId === "circuit_64" ? 500 : planId === "circuit_256" ? 2000 : 0);
}
