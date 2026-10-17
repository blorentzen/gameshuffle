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
 */

import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { isBlockedText } from "@/lib/text/filter";
import { isReservedName } from "@/lib/reservedName";
import { isPaidPlanCountry } from "@/lib/billing/availability";
import { subscriptionIdOf, periodEndOf } from "@/lib/stripe/payload";
import { gsMonthStart, gsDayStart } from "@/lib/time/gsClock";
import { sendSupportThanksEmail } from "@/lib/email/support";
import { SUPPORTER_BADGE_DAYS, WALL_NAME_MAX, WALL_NOTE_MAX, amountProblem, dollars, tidyWall, type SupportCost, type SupportKind } from "@/lib/support/rules";

type DbError = { code?: string; message?: string } | null;
export const supportMissing = (e: DbError) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

/** A wall name or note that passes the word filter and doesn't pass as GameShuffle. */
function wallText(raw: unknown, max: number, name = false): string | null {
  const s = tidyWall(raw, max);
  if (!s || isBlockedText(s) || (name && isReservedName(s))) return null;
  return s;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: "bad_amount" | "sign_in" | "failed"; message?: string };

/** Opens Stripe Checkout for one-time or monthly support. */
export async function startSupportCheckout(args: {
  kind: SupportKind;
  cents: number;
  user: { id: string; email: string | null } | null;
  wallName: unknown;
  wallNote: unknown;
  showOnWall: boolean;
  origin: string;
}): Promise<CheckoutResult> {
  const problem = amountProblem(args.cents);
  if (problem) return { ok: false, error: "bad_amount", message: problem };
  if (args.kind === "monthly" && !args.user) return { ok: false, error: "sign_in" };
  const stripe = getStripe();
  const admin = createServiceClient();
  const name = wallText(args.wallName, WALL_NAME_MAX, true);
  const note = wallText(args.wallNote, WALL_NOTE_MAX);
  const metadata: Record<string, string> = {
    gs_kind: "support",
    gs_support_kind: args.kind,
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

  const product_data = { name: args.kind === "monthly" ? "Monthly support for GameShuffle" : "Support for GameShuffle", metadata: { gs_kind: "support" } };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: args.kind === "monthly" ? "subscription" : "payment",
      line_items: [{
        quantity: 1,
        price_data: args.kind === "monthly"
          ? { currency: "usd", unit_amount: args.cents, recurring: { interval: "month" }, product_data }
          : { currency: "usd", unit_amount: args.cents, product_data },
      }],
      ...(customer ? { customer, customer_update: { address: "auto", name: "auto" } } : args.user?.email ? { customer_email: args.user.email } : {}),
      ...(args.user ? { client_reference_id: args.user.id } : {}),
      billing_address_collection: "required",
      // Cards only (Apple Pay and Google Pay ride on cards): no buy-now-pay-later for a gift, and no
      // bank payments that settle days later.
      payment_method_types: ["card"],
      metadata,
      ...(args.kind === "monthly"
        ? { subscription_data: { metadata, description: "Monthly support for GameShuffle" } }
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
  wallName: m?.wall_name || null,
  wallNote: m?.wall_note || null,
  showOnWall: m?.show_on_wall === "1",
});

async function thank(userId: string | null, email: string | null, name: string | null, cents: number, monthly: boolean, onWall: boolean) {
  let to = email;
  let greet = name;
  if (userId) {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
    to = data?.user?.email ?? to;
    const { data: row } = await admin.from("users").select("display_name").eq("id", userId).maybeSingle();
    greet = (row?.display_name as string | null) ?? greet;
  }
  if (to) await sendSupportThanksEmail({ to, name: greet, amount: dollars(cents), monthly, onWall }).catch((e) => console.error("[support] thanks email failed:", e));
}

/**
 * A finished support Checkout (the webhook, or the thanks page if it lands
 * first). One-time: records the gift once. Monthly: records the supporter;
 * each month's payment is recorded from its invoice. Returns what happened
 * for the thanks page.
 */
export async function fulfilSupportSession(sessionId: string): Promise<{ ok: boolean; kind?: SupportKind; cents?: number; onWall?: boolean; refunded?: boolean }> {
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
    const { data, error } = await admin.from("support_gifts").upsert({
      kind, amount_cents: cents, currency: session.currency ?? "usd", user_id: m.userId, checkout_session_id: session.id,
      stripe_payment_intent: intent, stripe_customer_id: customerId, country: session.customer_details?.address?.country ?? null,
      wall_name: m.wallName, wall_note: m.wallNote, show_on_wall: m.showOnWall,
    }, { onConflict: "checkout_session_id", ignoreDuplicates: true }).select("id");
    // A failed save throws so Stripe retries the webhook; before the migration there's nowhere to save.
    if (error) { if (supportMissing(error)) return { ok: true, kind, cents }; throw new Error(`support gift save failed: ${error.message}`); }
    if (data?.length) await thank(m.userId, session.customer_details?.email ?? null, session.customer_details?.name ?? null, cents, false, m.showOnWall);
    return { ok: true, kind, cents, onWall: m.showOnWall };
  }

  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    const created = await recordSupportSubscription(sub);
    if (created) await thank(m.userId, session.customer_details?.email ?? null, session.customer_details?.name ?? null, cents, true, m.showOnWall);
  }
  return { ok: true, kind, cents, onWall: m.showOnWall };
}

/** Mirrors a monthly supporter from Stripe. Returns true the first time it's seen. */
export async function recordSupportSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const m = meta(sub.metadata);
  const item = sub.items?.data?.[0];
  const end = periodEndOf(sub);
  const admin = createServiceClient();
  const { data: before } = await admin.from("support_subscriptions").select("stripe_subscription_id").eq("stripe_subscription_id", sub.id).maybeSingle();
  const { error } = await admin.from("support_subscriptions").upsert({
    stripe_subscription_id: sub.id,
    user_id: m.userId,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    amount_cents: (item?.price?.unit_amount as number | null) ?? 0,
    status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    wall_name: m.wallName, wall_note: m.wallNote, show_on_wall: m.showOnWall,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) { if (!supportMissing(error)) console.error("[support] subscription save failed:", error); return false; }
  return !before;
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

export interface WallEntry { name: string; note: string | null; monthly: boolean }

/** The supporters wall: people who asked to be on it, newest first, each once. */
export async function supportersWall(limit = 60): Promise<WallEntry[]> {
  const admin = createServiceClient();
  const [gifts, subs] = await Promise.all([
    admin.from("support_gifts").select("wall_name, wall_note, user_id, stripe_customer_id, paid_at").eq("status", "paid").eq("show_on_wall", true).eq("hidden", false).not("wall_name", "is", null).order("paid_at", { ascending: false }).limit(limit * 3),
    admin.from("support_subscriptions").select("user_id, stripe_customer_id").in("status", ["active", "trialing", "past_due"]),
  ]);
  if (gifts.error) return [];
  const monthly = new Set(((subs.data ?? []) as { user_id: string | null; stripe_customer_id: string | null }[]).flatMap((s) => [s.user_id, s.stripe_customer_id].filter(Boolean) as string[]));
  const seen = new Set<string>();
  const out: WallEntry[] = [];
  for (const g of (gifts.data ?? []) as { wall_name: string; wall_note: string | null; user_id: string | null; stripe_customer_id: string | null }[]) {
    const who = g.user_id ?? g.stripe_customer_id ?? g.wall_name;
    if (seen.has(who)) continue;
    seen.add(who);
    out.push({ name: g.wall_name, note: g.wall_note, monthly: monthly.has(g.user_id ?? "") || monthly.has(g.stripe_customer_id ?? "") });
    if (out.length >= limit) break;
  }
  return out;
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

/** An account's monthly support, for Plans & billing. */
export async function myMonthlySupport(userId: string): Promise<{ amountCents: number; status: string; cancelAtPeriodEnd: boolean; renewsAt: string | null } | null> {
  const { data } = await createServiceClient().from("support_subscriptions").select("amount_cents, status, cancel_at_period_end, current_period_end")
    .eq("user_id", userId).in("status", ["active", "trialing", "past_due"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const r = data as { amount_cents: number; status: string; cancel_at_period_end: boolean; current_period_end: string | null };
  return { amountCents: r.amount_cents, status: r.status, cancelAtPeriodEnd: r.cancel_at_period_end, renewsAt: r.current_period_end };
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
