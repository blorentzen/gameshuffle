/**
 * Support GameShuffle (server only): Stripe Checkout for one-time and monthly
 * support, recording payments, the supporters wall, the monthly goal, and who
 * shows the Supporter badge. Rules in ./rules.ts; tables from
 * supabase/support-m1.sql (missing tables read as "not set up yet").
 *
 * Everything in Stripe carries metadata gs_kind "support" (the session, the
 * one-time payment, the monthly subscription), and the webhook hands those to
 * this module before anything else, so a monthly supporter is never read as
 * a GS Pro subscription. Monthly support needs an account (so it can be
 * managed in Plans & billing through the Customer Portal); one-time support
 * doesn't. US only for now, like GS Pro: the checkout refuses other countries
 * by IP and a non-US billing address is refunded (unwindNonUsSupport).
 *
 * Monthly support comes in three levels (2026-10-19, rules.ts SUPPORT_LEVELS).
 * Backer and Champion include GS Pro: they're sold under their own products
 * with GS Pro's tax code and Stripe Tax, and while one is live the account's
 * subscription_tier is 'pro' (syncSupportPro). The subscription that set it is
 * marked granted_pro, so only a grant made here is taken back when the support
 * ends, and the GS Pro sync (src/lib/stripe/subscriptions.ts) asks
 * supportProGrant before it would downgrade anyone.
 */

import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { isBlockedText } from "@/lib/text/filter";
import { isReservedName } from "@/lib/reservedName";
import { isPaidPlanCountry } from "@/lib/billing/availability";
import { subscriptionIdOf, periodEndOf } from "@/lib/stripe/payload";
import { gsMonthStart, gsDayStart } from "@/lib/time/gsClock";
import { sendSupportThanksEmail } from "@/lib/email/support";
import { resolveStripePriceId } from "@/lib/pricing/catalog";
import { getProAccess } from "@/lib/subscription-server";
import { isStaffRole, normalizeTier } from "@/lib/subscription";
import { disconnectTwitchIntegration } from "@/lib/twitch/disconnect";
import {
  FOUNDING_SUPPORTERS, SUPPORTER_BADGE_DAYS, WALL_NAME_MAX, WALL_NOTE_MAX, amountProblem, dollars, levelRank, supportLevel, tidyWall,
  type SupportCost, type SupportKind, type SupportLevel, type SupportLevelDef,
} from "@/lib/support/rules";

type DbError = { code?: string; message?: string } | null;
export const supportMissing = (e: DbError) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

/**
 * The paying email, hashed (sha256 of the lowercased address). Kept on a gift made while signed out
 * so it counts once someone signs in with the same confirmed email (Britton's pick, 2026-10-19);
 * the address itself is never stored.
 */
export function emailHash(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? createHash("sha256").update(e).digest("hex") : null;
}

/** A wall name or note that passes the word filter and doesn't pass as GameShuffle. */
function wallText(raw: unknown, max: number, name = false): string | null {
  const s = tidyWall(raw, max);
  if (!s || isBlockedText(s) || (name && isReservedName(s))) return null;
  return s;
}

/**
 * One Stripe product holds every support price (one-time and monthly), so gifts roll up
 * under "Support GameShuffle" in Stripe instead of a new product per checkout. Made on first
 * use with a fixed id (like the shop's gs_shop_<sku>); if Stripe can't be reached for it, the
 * checkout falls back to an inline product so giving never breaks.
 */
export const SUPPORT_PRODUCT_ID = "gs_support";
let supportProductReady: Promise<string> | null = null;
function supportProduct(stripe: Stripe): Promise<string> {
  supportProductReady ??= (async () => {
    const existing = await stripe.products.retrieve(SUPPORT_PRODUCT_ID).catch((err: { code?: string }) => {
      if (err?.code === "resource_missing") return null;
      throw err;
    });
    if (!existing) {
      await stripe.products.create({
        id: SUPPORT_PRODUCT_ID,
        name: "Support GameShuffle",
        description: "One-time or monthly support that keeps GameShuffle free. Not tax-deductible.",
        metadata: { gs_kind: "support" },
      }).catch((err: { code?: string }) => {
        // Another server made it a moment ago.
        if (err?.code !== "resource_already_exists") throw err;
      });
    } else if (!existing.active) {
      await stripe.products.update(SUPPORT_PRODUCT_ID, { active: true });
    }
    return SUPPORT_PRODUCT_ID;
  })().catch((err) => { supportProductReady = null; throw err; });
  return supportProductReady;
}

/** GS Pro's tax code, read from the GS Pro price's product, so a level with GS Pro is taxed exactly like GS Pro. */
async function proTaxCode(stripe: Stripe): Promise<string | null> {
  const priceId = await resolveStripePriceId("pro_monthly").catch(() => null);
  if (!priceId) return null;
  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] }).catch(() => null);
  const product = price?.product;
  if (!product || typeof product === "string" || product.deleted) return null;
  return typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id ?? null;
}

/** Backer and Champion each have a product of their own (gs_support_backer, gs_support_champion) carrying GS Pro's tax code. */
const levelProducts = new Map<SupportLevel, Promise<string>>();
function levelProduct(stripe: Stripe, level: SupportLevelDef): Promise<string> {
  const id = `gs_support_${level.id}`;
  const ready = levelProducts.get(level.id) ?? (async () => {
    const existing = await stripe.products.retrieve(id).catch((err: { code?: string }) => {
      if (err?.code === "resource_missing") return null;
      throw err;
    });
    if (!existing) {
      const taxCode = await proTaxCode(stripe);
      await stripe.products.create({
        id,
        name: `GameShuffle ${level.name} (includes GS Pro)`,
        description: `Monthly ${level.name} support for GameShuffle, with GS Pro included.`,
        ...(taxCode ? { tax_code: taxCode } : {}),
        metadata: { gs_kind: "support", gs_support_level: level.id },
      }).catch((err: { code?: string }) => {
        if (err?.code !== "resource_already_exists") throw err;
      });
    } else if (!existing.active) {
      await stripe.products.update(id, { active: true });
    }
    return id;
  })().catch((err) => { levelProducts.delete(level.id); throw err; });
  levelProducts.set(level.id, ready);
  return ready;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: "bad_amount" | "sign_in" | "already_pro" | "failed"; message?: string };

/**
 * Opens Stripe Checkout: one-time support (any amount from $3) or a monthly
 * level. A level with GS Pro needs an account that doesn't already pay for
 * GS Pro (never two charges for Pro); it collects tax and the Terms like GS
 * Pro's checkout.
 */
export async function startSupportCheckout(args: {
  kind: SupportKind;
  cents: number;
  level?: SupportLevel | null;
  user: { id: string; email: string | null } | null;
  wallName: unknown;
  wallNote: unknown;
  showOnWall: boolean;
  origin: string;
}): Promise<CheckoutResult> {
  // Monthly support is a level; the level sets the amount.
  const level = args.kind === "monthly" ? supportLevel(args.level ?? "supporter") : null;
  if (args.kind === "monthly" && !level) return { ok: false, error: "bad_amount", message: "Pick a level." };
  const cents = level ? level.cents : args.cents;
  const problem = amountProblem(cents);
  if (problem) return { ok: false, error: "bad_amount", message: problem };
  if (args.kind === "monthly" && !args.user) return { ok: false, error: "sign_in" };
  const stripe = getStripe();
  const admin = createServiceClient();
  if (level?.pro && args.user) {
    // Already paying for GS Pro another way (a GS Pro plan, a trial, Circuit 256): Supporter adds the thanks without a second charge.
    const access = await getProAccess(args.user.id, admin);
    const other = access.sources.filter((src) => src !== "support_level");
    if (other.length) {
      return { ok: false, error: "already_pro", message: other[0] === "circuit_256"
        ? "Your GS Circuit 256 plan already includes GS Pro. Supporter adds the thank-yous without a second charge."
        : "You already have GS Pro. Pick Supporter, or cancel GS Pro in Plans & billing first and back at this level instead." };
    }
  }
  const name = wallText(args.wallName, WALL_NAME_MAX, true);
  const note = wallText(args.wallNote, WALL_NOTE_MAX);
  const metadata: Record<string, string> = {
    gs_kind: "support",
    gs_support_kind: args.kind,
    ...(level ? { gs_support_level: level.id } : {}),
    ...(args.user ? { gs_user_id: args.user.id } : {}),
    ...(name ? { wall_name: name } : {}),
    ...(note ? { wall_note: note } : {}),
    show_on_wall: args.showOnWall && !!name ? "1" : "0",
  };

  // Signed in: reuse (or make) the account's Stripe customer, so monthly support shows in the Customer Portal.
  let customer: string | undefined;
  if (args.user) {
    const { data: row } = await admin.from("users").select("stripe_customer_id, display_name").eq("id", args.user.id).maybeSingle();
    customer = (row?.stripe_customer_id as string | null) ?? undefined;
    if (!customer) {
      const made = await stripe.customers.create({ email: args.user.email ?? undefined, name: (row?.display_name as string | null) ?? undefined, metadata: { gs_user_id: args.user.id } });
      customer = made.id;
      await admin.from("users").update({ stripe_customer_id: customer, updated_at: new Date().toISOString() }).eq("id", args.user.id);
    }
  }

  // A level with GS Pro must be taxed like GS Pro, so it never falls back to an untaxed inline product.
  const product = level?.pro
    ? await levelProduct(stripe, level).catch((err) => { console.error("[support] level product setup failed:", err); return null; })
    : await supportProduct(stripe).catch((err) => { console.error("[support] product setup failed, using an inline product:", err); return null; });
  if (level?.pro && !product) return { ok: false, error: "failed" };
  const productRef = product
    ? { product }
    : { product_data: { name: args.kind === "monthly" ? "Monthly support for GameShuffle" : "Support for GameShuffle", metadata: { gs_kind: "support" } } };
  const description = level ? `${level.name}: monthly support for GameShuffle${level.pro ? ", GS Pro included" : ""}` : "Monthly support for GameShuffle";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: args.kind === "monthly" ? "subscription" : "payment",
      line_items: [{
        quantity: 1,
        price_data: args.kind === "monthly"
          ? { currency: "usd", unit_amount: cents, recurring: { interval: "month" as const }, ...(level?.pro ? { tax_behavior: "exclusive" as const } : {}), ...productRef }
          : { currency: "usd", unit_amount: cents, ...productRef },
      }],
      // A level with GS Pro is a sale: Stripe Tax from the billing address, and the Terms, as on GS Pro's checkout.
      ...(level?.pro ? {
        automatic_tax: { enabled: true },
        consent_collection: { terms_of_service: "required" as const },
        custom_text: { terms_of_service_acceptance: { message: "I agree to the [Terms of Service](https://www.gameshuffle.co/terms) and [Privacy Policy](https://www.gameshuffle.co/privacy)." } },
      } : {}),
      ...(customer ? { customer, customer_update: { address: "auto", name: "auto" } } : args.user?.email ? { customer_email: args.user.email } : {}),
      ...(args.user ? { client_reference_id: args.user.id } : {}),
      billing_address_collection: "required",
      // Cards only (Apple Pay and Google Pay ride on cards): no buy-now-pay-later for a gift, and no
      // bank payments that settle days later.
      payment_method_types: ["card"],
      metadata,
      ...(args.kind === "monthly"
        ? { subscription_data: { metadata, description } }
        : { payment_intent_data: { metadata, description: "Support for GameShuffle", statement_descriptor_suffix: "SUPPORT" }, submit_type: "pay" as const }),
      success_url: `${args.origin}/support/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.origin}/support?canceled=1`,
    });
    return session.url ? { ok: true, url: session.url } : { ok: false, error: "failed" };
  } catch (err) {
    console.error("[support] checkout failed:", err);
    return { ok: false, error: "failed" };
  }
}

/** The payment behind an invoice (Stripe keeps it in the invoice's expandable `payments` list since 2025). */
async function invoicePaymentIntent(invoiceId: string): Promise<string | null> {
  const inv = await getStripe().invoices.retrieve(invoiceId, { expand: ["payments"] }).catch(() => null);
  const pi = inv?.payments?.data?.[0]?.payment?.payment_intent;
  return typeof pi === "string" ? pi : pi?.id ?? null;
}

/** Refunds a support payment whose billing address is outside the US (support is US only for now). */
async function unwindNonUsSupport(session: Stripe.Checkout.Session): Promise<boolean> {
  const country = session.customer_details?.address?.country ?? null;
  if (isPaidPlanCountry(country)) return false;
  const stripe = getStripe();
  try {
    if (session.subscription) {
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await stripe.subscriptions.cancel(id).catch(() => null);
    }
    const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (intent) await stripe.refunds.create({ payment_intent: intent, reason: "requested_by_customer", metadata: { gs_reason: "support_us_only" } }).catch(() => null);
    if (session.invoice) {
      const pi = await invoicePaymentIntent(typeof session.invoice === "string" ? session.invoice : session.invoice.id);
      if (pi) await stripe.refunds.create({ payment_intent: pi, reason: "requested_by_customer", metadata: { gs_reason: "support_us_only" } }).catch(() => null);
    }
  } catch (err) {
    console.error("[support] non-US unwind failed:", err);
  }
  console.warn(`[support] refunded non-US support ${session.id} (billing country ${country})`);
  return true;
}

const meta = (m: Stripe.Metadata | null | undefined) => ({
  userId: m?.gs_user_id || null,
  // Monthly support from before the levels has no level: it was thanks only, so it reads as Supporter.
  level: (supportLevel(m?.gs_support_level)?.id ?? null) as SupportLevel | null,
  wallName: m?.wall_name || null,
  wallNote: m?.wall_note || null,
  showOnWall: m?.show_on_wall === "1",
});

async function thank(userId: string | null, email: string | null, name: string | null, cents: number, monthly: boolean, onWall: boolean, sessionId: string, level: SupportLevel | null = null) {
  let to = email;
  let greet = name;
  if (userId) {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
    to = data?.user?.email ?? to;
    const { data: row } = await admin.from("users").select("display_name").eq("id", userId).maybeSingle();
    greet = (row?.display_name as string | null) ?? greet;
  }
  const shareUrl = userId ? "https://www.gameshuffle.co/account?tab=support" : `https://www.gameshuffle.co/support/thanks?session_id=${encodeURIComponent(sessionId)}`;
  const def = supportLevel(level);
  if (to) await sendSupportThanksEmail({ to, name: greet, amount: dollars(cents), monthly, onWall, shareUrl, levelName: def?.name ?? null, pro: !!def?.pro }).catch((e) => console.error("[support] thanks email failed:", e));
}

/**
 * A finished support Checkout (the webhook, or the thanks page if it lands
 * first). One-time: records the gift once. Monthly: records the supporter;
 * each month's payment is recorded from its invoice. Returns what happened
 * for the thanks page.
 */
export async function fulfilSupportSession(sessionId: string): Promise<{ ok: boolean; kind?: SupportKind; cents?: number; onWall?: boolean; refunded?: boolean; level?: SupportLevel | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.gs_kind !== "support") return { ok: false };
  const kind: SupportKind = session.mode === "subscription" ? "monthly" : "once";
  const m = meta(session.metadata);
  const cents = session.amount_total ?? 0;
  if (session.payment_status !== "paid") return { ok: false, kind, cents };
  if (await unwindNonUsSupport(session)) return { ok: true, kind, cents, refunded: true };
  const admin = createServiceClient();
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (kind === "once") {
    const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const row = {
      kind, amount_cents: cents, currency: session.currency ?? "usd", user_id: m.userId, checkout_session_id: session.id,
      stripe_payment_intent: intent, stripe_customer_id: customerId, country: session.customer_details?.address?.country ?? null,
      wall_name: m.wallName, wall_note: m.wallNote, show_on_wall: m.showOnWall,
    };
    const save = (r: Record<string, unknown>) => admin.from("support_gifts").upsert(r, { onConflict: "checkout_session_id", ignoreDuplicates: true }).select("id");
    let { data, error } = await save(m.userId ? row : { ...row, email_hash: emailHash(session.customer_details?.email) });
    // Before support-m2.sql there's no email_hash column: save the gift without it rather than fail the webhook.
    if (error && ["PGRST204", "42703"].includes(error.code ?? "")) ({ data, error } = await save(row));
    // A failed save throws so Stripe retries the webhook; before the migration there's nowhere to save.
    if (error) { if (supportMissing(error)) return { ok: true, kind, cents }; throw new Error(`support gift save failed: ${error.message}`); }
    if (data?.length) await thank(m.userId, session.customer_details?.email ?? null, session.customer_details?.name ?? null, cents, false, m.showOnWall, session.id);
    return { ok: true, kind, cents, onWall: m.showOnWall };
  }

  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    const created = await recordSupportSubscription(sub);
    if (created) await thank(m.userId, session.customer_details?.email ?? null, session.customer_details?.name ?? null, cents, true, m.showOnWall, session.id, m.level);
  }
  return { ok: true, kind, cents, onWall: m.showOnWall, level: m.level };
}

/**
 * Mirrors a monthly supporter from Stripe, then keeps the account's GS Pro in
 * step with a Backer or Champion level. A new subscription replaces any other
 * monthly support on the account (changing level is a new checkout). Returns
 * true the first time it's seen.
 */
export async function recordSupportSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const m = meta(sub.metadata);
  const item = sub.items?.data?.[0];
  const end = periodEndOf(sub);
  const admin = createServiceClient();
  const { data: before } = await admin.from("support_subscriptions").select("stripe_subscription_id").eq("stripe_subscription_id", sub.id).maybeSingle();
  const row = {
    stripe_subscription_id: sub.id,
    user_id: m.userId,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    amount_cents: (item?.price?.unit_amount as number | null) ?? 0,
    status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    wall_name: m.wallName, wall_note: m.wallNote, show_on_wall: m.showOnWall,
    updated_at: new Date().toISOString(),
  };
  const save = (r: Record<string, unknown>) => admin.from("support_subscriptions").upsert(r, { onConflict: "stripe_subscription_id" });
  let { error } = await save({ ...row, level: m.level });
  // Before support-m3.sql there's no level column: keep the supporter without it.
  if (error && ["PGRST204", "42703"].includes(error.code ?? "")) ({ error } = await save(row));
  if (error) { if (!supportMissing(error)) console.error("[support] subscription save failed:", error); return false; }
  const created = !before;
  if (m.userId) {
    if (created && LIVE_MONTHLY.includes(sub.status)) await endOtherMonthly(m.userId, sub.id);
    await syncSupportPro(m.userId).catch((err) => console.error("[support] GS Pro sync failed:", err));
  }
  return created;
}

/** A new level replaces the old one: other live monthly support on the account ends now, with the unused time credited. */
async function endOtherMonthly(userId: string, keepId: string): Promise<void> {
  const { data } = await createServiceClient().from("support_subscriptions").select("stripe_subscription_id")
    .eq("user_id", userId).in("status", LIVE_MONTHLY).neq("stripe_subscription_id", keepId);
  for (const r of (data ?? []) as { stripe_subscription_id: string }[]) {
    await getStripe().subscriptions.cancel(r.stripe_subscription_id, { prorate: true })
      .catch((err) => console.error("[support] couldn't end the old level:", r.stripe_subscription_id, err));
  }
}

const PRO_LIVE = ["trialing", "active", "past_due"];

/** The live Backer or Champion subscription giving this account GS Pro, if any. Null before support-m3.sql. */
export async function supportProGrant(userId: string): Promise<{ id: string; status: string; level: SupportLevel; renewsAt: string | null } | null> {
  const { data, error } = await createServiceClient().from("support_subscriptions").select("stripe_subscription_id, status, level, current_period_end")
    .eq("user_id", userId).in("status", LIVE_MONTHLY).in("level", ["backer", "champion"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const r = data as { stripe_subscription_id: string; status: string; level: SupportLevel; current_period_end: string | null };
  return { id: r.stripe_subscription_id, status: r.status, level: r.level, renewsAt: r.current_period_end };
}

/** Marks the support subscription that's giving GS Pro, so ending it takes back only what support gave. */
export async function markSupportGrant(subscriptionId: string): Promise<void> {
  await createServiceClient().from("support_subscriptions").update({ granted_pro: true, updated_at: new Date().toISOString() }).eq("stripe_subscription_id", subscriptionId);
}

/**
 * Keeps subscription_tier in step with a Backer or Champion level. Live level
 * and no GS Pro plan: the account is Pro (status from the support). No live
 * level: if support gave the account Pro and nothing else does, it goes back
 * to Free with GS Pro's downgrade cleanup (the Twitch disconnect). Staff and
 * accounts with their own GS Pro plan are left alone.
 */
export async function syncSupportPro(userId: string): Promise<void> {
  const admin = createServiceClient();
  const [grant, userRes, proRes, grantedRes] = await Promise.all([
    supportProGrant(userId),
    admin.from("users").select("subscription_tier, subscription_status, role").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("product, status").eq("user_id", userId).in("status", PRO_LIVE),
    admin.from("support_subscriptions").select("stripe_subscription_id").eq("user_id", userId).eq("granted_pro", true),
  ]);
  if (grantedRes.error) return; // before support-m3.sql: levels don't exist yet
  const u = userRes.data as { subscription_tier: string | null; subscription_status: string | null; role: string | null } | null;
  if (!u) return;
  const ownPro = ((proRes.data ?? []) as { product: string | null }[]).some((r) => (r.product ?? "pro") === "pro");
  const granted = ((grantedRes.data ?? []) as { stripe_subscription_id: string }[]).map((r) => r.stripe_subscription_id);
  const now = new Date().toISOString();
  if (grant) {
    if (ownPro) return; // their GS Pro plan already gives Pro; the level is thanks on top
    if (normalizeTier(u.subscription_tier) !== "pro" || u.subscription_status !== grant.status) {
      await admin.from("users").update({ subscription_tier: "pro", subscription_status: grant.status, updated_at: now }).eq("id", userId);
    }
    if (!granted.includes(grant.id)) await markSupportGrant(grant.id);
    return;
  }
  if (!granted.length) return;
  await admin.from("support_subscriptions").update({ granted_pro: false, updated_at: now }).in("stripe_subscription_id", granted);
  if (ownPro || normalizeTier(u.subscription_tier) !== "pro") return;
  await admin.from("users").update({ subscription_tier: "free", subscription_status: "canceled", updated_at: now }).eq("id", userId);
  if (!isStaffRole(u.role)) {
    await disconnectTwitchIntegration(userId).catch((err) => console.error(`[support] Twitch disconnect after the level ended failed for ${userId}:`, err));
  }
}

/** One month of a monthly supporter, from its paid invoice (once per invoice). */
export async function recordSupportInvoice(invoice: Stripe.Invoice, sub: Stripe.Subscription): Promise<void> {
  if (!invoice.amount_paid || !invoice.id) return;
  const m = meta(sub.metadata);
  const pi = await invoicePaymentIntent(invoice.id);
  const { error } = await createServiceClient().from("support_gifts").upsert({
    kind: "monthly", amount_cents: invoice.amount_paid, currency: invoice.currency ?? "usd", user_id: m.userId,
    stripe_invoice_id: invoice.id, stripe_subscription_id: subscriptionIdOf(invoice), stripe_payment_intent: pi,
    stripe_customer_id: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
    country: invoice.customer_address?.country ?? null,
    wall_name: m.wallName, wall_note: m.wallNote, show_on_wall: m.showOnWall,
    paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString(),
  }, { onConflict: "stripe_invoice_id", ignoreDuplicates: true });
  if (error && !supportMissing(error)) throw new Error(`support monthly payment save failed: ${error.message}`);
}

/** A refund in Stripe (full) marks the support payment refunded, so it leaves the goal bar and the wall. */
export async function markSupportRefund(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return;
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intent) return;
  const { error } = await createServiceClient().from("support_gifts").update({ status: "refunded" }).eq("stripe_payment_intent", intent);
  if (error && !supportMissing(error)) console.error("[support] refund mark failed:", error);
}

/** Whether a Stripe subscription is monthly support (not GS Pro or Circuit). */
export const isSupportSubscription = (sub: Stripe.Subscription) => sub.metadata?.gs_kind === "support";

// ── Reads ──────────────────────────────────────────────────────────────────

export interface SupportSettings { goalCents: number; costs: SupportCost[] }

export async function supportSettings(): Promise<SupportSettings | null> {
  const { data, error } = await createServiceClient().from("support_settings").select("goal_cents, costs").eq("id", 1).maybeSingle();
  if (error) return supportMissing(error) ? null : { goalCents: 0, costs: [] };
  const costs = Array.isArray(data?.costs) ? (data!.costs as SupportCost[]).filter((c) => c && typeof c.label === "string" && Number.isFinite(c.cents)) : [];
  return { goalCents: Number(data?.goal_cents ?? 0), costs };
}

export async function saveSupportSettings(next: SupportSettings, by: string): Promise<boolean> {
  const costs = next.costs.map((c) => ({ label: String(c.label).slice(0, 60), cents: Math.max(0, Math.round(Number(c.cents) || 0)) })).filter((c) => c.label.trim()).slice(0, 12);
  const { error } = await createServiceClient().from("support_settings").upsert({ id: 1, goal_cents: Math.max(0, Math.round(next.goalCents)), costs, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: "id" });
  return !error;
}

/** This Pacific month's support: total paid and how many people gave. */
export async function monthProgress(now = Date.now()): Promise<{ raisedCents: number; supporters: number } | null> {
  const from = gsDayStart(gsMonthStart(now)).toISOString();
  const { data, error } = await createServiceClient().from("support_gifts").select("amount_cents, user_id, stripe_customer_id, checkout_session_id").eq("status", "paid").gte("paid_at", from).limit(10_000);
  if (error) return supportMissing(error) ? null : { raisedCents: 0, supporters: 0 };
  const rows = (data ?? []) as { amount_cents: number; user_id: string | null; stripe_customer_id: string | null; checkout_session_id: string | null }[];
  const people = new Set(rows.map((r) => r.user_id ?? r.stripe_customer_id ?? r.checkout_session_id));
  return { raisedCents: rows.reduce((s, r) => s + r.amount_cents, 0), supporters: people.size };
}

export interface WallEntry { name: string; note: string | null; monthly: boolean; level: SupportLevel | null }

/** Live monthly levels by account and by Stripe customer (one read, before support-m3.sql: everyone a Supporter). */
async function liveLevels(): Promise<Map<string, SupportLevel>> {
  const admin = createServiceClient();
  const read = (cols: string) => admin.from("support_subscriptions").select(cols).in("status", LIVE_MONTHLY);
  let { data, error } = await read("user_id, stripe_customer_id, level");
  if (error && ["PGRST204", "42703"].includes(error.code ?? "")) ({ data, error } = await read("user_id, stripe_customer_id"));
  const out = new Map<string, SupportLevel>();
  for (const r of (data ?? []) as unknown as { user_id: string | null; stripe_customer_id: string | null; level?: SupportLevel | null }[]) {
    const level = r.level ?? "supporter";
    for (const k of [r.user_id, r.stripe_customer_id]) if (k && (!out.has(k) || levelRank(level) < levelRank(out.get(k)))) out.set(k, level);
  }
  return out;
}

/** Everyone who asked to be on the wall, each once, newest first, with their live monthly level. */
async function wallPeople(scan: number): Promise<WallEntry[]> {
  const admin = createServiceClient();
  const [gifts, levels] = await Promise.all([
    admin.from("support_gifts").select("wall_name, wall_note, user_id, stripe_customer_id, paid_at").eq("status", "paid").eq("show_on_wall", true).eq("hidden", false).not("wall_name", "is", null).order("paid_at", { ascending: false }).limit(scan),
    liveLevels(),
  ]);
  if (gifts.error) return [];
  const seen = new Set<string>();
  const out: WallEntry[] = [];
  for (const g of (gifts.data ?? []) as { wall_name: string; wall_note: string | null; user_id: string | null; stripe_customer_id: string | null }[]) {
    const who = g.user_id ?? g.stripe_customer_id ?? g.wall_name;
    if (seen.has(who)) continue;
    seen.add(who);
    const level = levels.get(g.user_id ?? "") ?? levels.get(g.stripe_customer_id ?? "") ?? null;
    out.push({ name: g.wall_name, note: g.wall_note, monthly: !!level, level });
  }
  return out;
}

/** The supporters wall: Champions first (Britton's pick), then Backers, then everyone else, newest first within each. */
export async function supportersWall(limit = 60): Promise<WallEntry[]> {
  const people = await wallPeople(limit * 4);
  return people.map((p, i) => ({ p, i })).sort((a, b) => levelRank(a.p.level) - levelRank(b.p.level) || a.i - b.i).slice(0, limit).map((x) => x.p);
}

/** The credits page: every supporter who asked to be named, grouped Champions, Backers, then everyone else. */
export async function supportCredits(): Promise<{ champions: string[]; backers: string[]; supporters: string[] }> {
  const people = await wallPeople(5000);
  const names = (pick: (p: WallEntry) => boolean) => people.filter(pick).map((p) => p.name).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return {
    champions: names((p) => p.level === "champion"),
    backers: names((p) => p.level === "backer"),
    supporters: names((p) => p.level !== "champion" && p.level !== "backer"),
  };
}

/**
 * The Founding supporters: the first FOUNDING_SUPPORTERS people to support (any level, any
 * amount), by their first paid gift. Worked out from the gifts each time (a refunded gift
 * doesn't count). Map of person key (account id, else Stripe customer, else session) to number.
 */
let foundingCache: { at: number; keys: Map<string, number> } | null = null;
export async function foundingSupporters(): Promise<Map<string, number>> {
  if (foundingCache && Date.now() - foundingCache.at < 60_000) return foundingCache.keys;
  const { data, error } = await createServiceClient().from("support_gifts").select("user_id, stripe_customer_id, checkout_session_id, paid_at")
    .eq("status", "paid").order("paid_at", { ascending: true }).limit(FOUNDING_SUPPORTERS * 20);
  const keys = new Map<string, number>();
  if (!error) {
    for (const r of (data ?? []) as { user_id: string | null; stripe_customer_id: string | null; checkout_session_id: string | null }[]) {
      const who = r.user_id ?? r.stripe_customer_id ?? r.checkout_session_id;
      if (!who || keys.has(who)) continue;
      keys.set(who, keys.size + 1);
      if (keys.size >= FOUNDING_SUPPORTERS) break;
    }
  }
  foundingCache = { at: Date.now(), keys };
  return keys;
}

/** An account's Founding number, or null. */
export async function foundingNumber(userId: string): Promise<number | null> {
  return (await foundingSupporters()).get(userId) ?? null;
}

/** How many Founding places are taken (for "N of 100" on /support). */
export async function foundingTaken(): Promise<number> {
  return (await foundingSupporters()).size;
}

/** Live monthly supporters by level (Platform ▸ Support). */
export async function levelCounts(): Promise<Record<SupportLevel, number>> {
  const levels = await liveLevels();
  // liveLevels keys each subscription by account and by customer: count each customer once.
  const { data } = await createServiceClient().from("support_subscriptions").select("stripe_customer_id").in("status", LIVE_MONTHLY);
  const out: Record<SupportLevel, number> = { supporter: 0, backer: 0, champion: 0 };
  for (const c of new Set(((data ?? []) as { stripe_customer_id: string | null }[]).map((r) => r.stripe_customer_id).filter((x): x is string => !!x))) {
    out[levels.get(c) ?? "supporter"] += 1;
  }
  return out;
}

export interface SupportUpdate { id: string; body: string; postedAt: string }

/** Staff's short posts on what support paid for, newest first. Empty before support-m3.sql. */
export async function supportUpdates(limit = 5): Promise<SupportUpdate[]> {
  const { data, error } = await createServiceClient().from("support_updates").select("id, body, posted_at").order("posted_at", { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as { id: string; body: string; posted_at: string }[]).map((r) => ({ id: r.id, body: r.body, postedAt: r.posted_at }));
}

export async function addSupportUpdate(body: string, by: string): Promise<{ ok: true } | { ok: false; error: "empty" | "not_allowed" | "failed" }> {
  const text = body.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return { ok: false, error: "empty" };
  if (isBlockedText(text)) return { ok: false, error: "not_allowed" };
  const { error } = await createServiceClient().from("support_updates").insert({ body: text, posted_by: by });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function removeSupportUpdate(id: string): Promise<boolean> {
  const { error } = await createServiceClient().from("support_updates").delete().eq("id", id);
  return !error;
}

/** The Supporter badge: a one-time gift in the last year, or monthly support that's still on. */
export async function isSupporter(userId: string): Promise<boolean> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - SUPPORTER_BADGE_DAYS * 86_400_000).toISOString();
  const [g, s] = await Promise.all([
    admin.from("support_gifts").select("id").eq("user_id", userId).eq("status", "paid").gte("paid_at", since).limit(1),
    admin.from("support_subscriptions").select("stripe_subscription_id").eq("user_id", userId).in("status", ["active", "trialing", "past_due"]).limit(1),
  ]);
  return !!(g.data?.length || s.data?.length);
}

/**
 * Gifts made while signed out with this account's confirmed email become the account's, so the
 * badge, Account ▸ Support and the asks know about them. Returns how many were claimed.
 */
export async function claimSupportGifts(userId: string, email: string | null | undefined): Promise<number> {
  const hash = emailHash(email);
  if (!hash) return 0;
  const { data, error } = await createServiceClient().from("support_gifts").update({ user_id: userId }).is("user_id", null).eq("email_hash", hash).select("id");
  if (error) { if (!supportMissing(error) && error.code !== "42703") console.error("[support] claim failed:", error); return 0; }
  return data?.length ?? 0;
}

const LIVE_MONTHLY = ["active", "trialing", "past_due"];

/** Which of these accounts are supporters right now (for the heart on leaderboards). */
export async function supportersAmong(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const admin = createServiceClient();
  const since = new Date(Date.now() - SUPPORTER_BADGE_DAYS * 86_400_000).toISOString();
  const [g, s] = await Promise.all([
    admin.from("support_gifts").select("user_id").in("user_id", ids).eq("status", "paid").gte("paid_at", since),
    admin.from("support_subscriptions").select("user_id").in("user_id", ids).in("status", LIVE_MONTHLY),
  ]);
  return new Set([...(g.data ?? []), ...(s.data ?? [])].map((r) => (r as { user_id: string | null }).user_id).filter((x): x is string => !!x));
}

export interface MyGift { kind: SupportKind; cents: number; paidAt: string; refunded: boolean }
export interface SupporterInfo {
  supporter: boolean;
  /** The live monthly level (monthly support from before the levels reads as Supporter). */
  level: SupportLevel | null;
  /** Their Founding supporter number (1 to 100), or null. */
  founding: number | null;
  /** The first time they gave (ISO), for "Supporter since". */
  since: string | null;
  /** When a one-time supporter's badge ends (null while monthly support is on). */
  badgeUntil: string | null;
  monthly: { amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null; level: SupportLevel } | null;
  gifts: MyGift[];
  wall: { name: string | null; note: string | null; show: boolean };
}

/** Everything Account ▸ Support shows about an account's support. */
export async function supporterInfo(userId: string): Promise<SupporterInfo | null> {
  const admin = createServiceClient();
  const subCols = "amount_cents, status, cancel_at_period_end, current_period_end, created_at, wall_name, wall_note, show_on_wall";
  const [g, s0, founding] = await Promise.all([
    admin.from("support_gifts").select("kind, amount_cents, paid_at, status, wall_name, wall_note, show_on_wall").eq("user_id", userId).order("paid_at", { ascending: false }).limit(200),
    admin.from("support_subscriptions").select(`${subCols}, level`).eq("user_id", userId).order("created_at", { ascending: false }),
    foundingNumber(userId),
  ]);
  // Before support-m3.sql there's no level column.
  const s = s0.error && ["PGRST204", "42703"].includes(s0.error.code ?? "")
    ? await admin.from("support_subscriptions").select(subCols).eq("user_id", userId).order("created_at", { ascending: false })
    : s0;
  if (g.error && supportMissing(g.error)) return null;
  type G = { kind: SupportKind; amount_cents: number; paid_at: string; status: string; wall_name: string | null; wall_note: string | null; show_on_wall: boolean };
  type S = { amount_cents: number; status: string; cancel_at_period_end: boolean; current_period_end: string | null; created_at: string; wall_name: string | null; wall_note: string | null; show_on_wall: boolean; level?: SupportLevel | null };
  const gifts = (g.data ?? []) as G[];
  const subs = (s.data ?? []) as S[];
  const paid = gifts.filter((x) => x.status === "paid");
  const live = subs.find((x) => LIVE_MONTHLY.includes(x.status)) ?? null;
  // The badge lasts a year from the last payment (one-time, or a month of support that has since stopped).
  const lastPaid = paid[0] ?? null;
  const yearAgo = Date.now() - SUPPORTER_BADGE_DAYS * 86_400_000;
  const recent = paid.some((x) => Date.parse(x.paid_at) >= yearAgo);
  const firsts = [...paid.map((x) => x.paid_at), ...subs.map((x) => x.created_at)].sort();
  const latestWall = [...gifts, ...subs].find((x) => x.wall_name) ?? null;
  return {
    supporter: !!live || recent,
    level: live ? live.level ?? "supporter" : null,
    founding,
    since: firsts[0] ?? null,
    badgeUntil: live || !lastPaid ? null : new Date(Date.parse(lastPaid.paid_at) + SUPPORTER_BADGE_DAYS * 86_400_000).toISOString(),
    monthly: live ? { amountCents: live.amount_cents, status: live.status, cancelAtPeriodEnd: live.cancel_at_period_end, renewsAt: live.current_period_end, level: live.level ?? "supporter" } : null,
    gifts: gifts.map((x) => ({ kind: x.kind, cents: x.amount_cents, paidAt: x.paid_at, refunded: x.status !== "paid" })),
    wall: { name: latestWall?.wall_name ?? null, note: latestWall?.wall_note ?? null, show: [...gifts, ...subs].some((x) => x.show_on_wall && x.wall_name) },
  };
}

export type WallSave = { ok: true } | { ok: false; error: "name_needed" | "not_allowed" | "failed" };

/** An account's place on the wall: one name and note across all their support, shown or not. */
export async function saveMyWall(userId: string, input: { name: unknown; note: unknown; show: boolean }): Promise<WallSave> {
  const rawName = tidyWall(input.name, WALL_NAME_MAX);
  const name = wallText(input.name, WALL_NAME_MAX, true);
  if (rawName && !name) return { ok: false, error: "not_allowed" };
  const rawNote = tidyWall(input.note, WALL_NOTE_MAX);
  const note = wallText(input.note, WALL_NOTE_MAX);
  if (rawNote && !note) return { ok: false, error: "not_allowed" };
  if (input.show && !name) return { ok: false, error: "name_needed" };
  const row = { wall_name: name, wall_note: note, show_on_wall: input.show && !!name };
  const admin = createServiceClient();
  const [a, b] = await Promise.all([
    admin.from("support_gifts").update(row).eq("user_id", userId),
    admin.from("support_subscriptions").update({ ...row, updated_at: new Date().toISOString() }).eq("user_id", userId),
  ]);
  return a.error || b.error ? { ok: false, error: "failed" } : { ok: true };
}

/** An account's monthly support, for Plans & billing. */
export async function myMonthlySupport(userId: string): Promise<{ amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null; level: SupportLevel } | null> {
  const admin = createServiceClient();
  const cols = "amount_cents, status, cancel_at_period_end, current_period_end";
  const read = (c: string) => admin.from("support_subscriptions").select(c).eq("user_id", userId).in("status", LIVE_MONTHLY).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const first = await read(`${cols}, level`);
  const data = first.error && ["PGRST204", "42703"].includes(first.error.code ?? "") ? (await read(cols)).data : first.data;
  if (!data) return null;
  const r = data as unknown as { amount_cents: number; status: string; cancel_at_period_end: boolean; current_period_end: string | null; level?: SupportLevel | null };
  return { amountCents: r.amount_cents, status: r.status, cancelAtPeriodEnd: r.cancel_at_period_end, renewsAt: r.current_period_end, level: r.level ?? "supporter" };
}

export interface AdminGift { id: string; kind: SupportKind; cents: number; name: string | null; note: string | null; onWall: boolean; hidden: boolean; status: string; paidAt: string; account: boolean }

/** Staff: recent payments, with the wall controls. */
export async function recentGifts(limit = 50): Promise<AdminGift[]> {
  const { data } = await createServiceClient().from("support_gifts").select("id, kind, amount_cents, wall_name, wall_note, show_on_wall, hidden, status, paid_at, user_id").order("paid_at", { ascending: false }).limit(limit);
  return ((data ?? []) as { id: string; kind: SupportKind; amount_cents: number; wall_name: string | null; wall_note: string | null; show_on_wall: boolean; hidden: boolean; status: string; paid_at: string; user_id: string | null }[])
    .map((r) => ({ id: r.id, kind: r.kind, cents: r.amount_cents, name: r.wall_name, note: r.wall_note, onWall: r.show_on_wall, hidden: r.hidden, status: r.status, paidAt: r.paid_at, account: !!r.user_id }));
}

/** Staff: take a name or note off the wall, or put it back. */
export async function setGiftHidden(id: string, hidden: boolean): Promise<boolean> {
  const { error } = await createServiceClient().from("support_gifts").update({ hidden }).eq("id", id);
  return !error;
}
