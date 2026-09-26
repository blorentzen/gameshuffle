import "server-only";

import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { getBaseUrl } from "@/lib/env";
import { computePlatformFee, feePlanFor, lever, leverText, type PlanId } from "@/lib/pricing/catalog";
import { canManageEvent, getEventMeta, listAttendees, countTaken } from "./attendees";
import type { EventType } from "./calendar";
import { refundTermsText } from "./ticketTerms";

/**
 * Paid events on Stripe Connect Express (events plan, step 6).
 *
 * GameShuffle is the platform, the organizer is the seller: a destination
 * charge on their connected account with `application_fee_amount` from the
 * pricing levers, frozen on the order. Seats are held for the checkout window
 * so capacity can't oversell, then confirmed by the webhook, which also creates
 * the attendee row (the same row the shared attendee base already manages).
 *
 * Free events never touch any of this: an event with no active tier keeps the
 * existing register / RSVP flow.
 */

export interface TicketTier {
  id: string;
  eventType: EventType;
  eventId: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  quantity: number | null;
  perOrderMax: number;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  hasAccessCode: boolean;
  /** The code itself, and only on an organizer read: it is a secret otherwise. */
  accessCode?: string | null;
  sort: number;
  active: boolean;
  /** Seats already sold or held on this tier. */
  sold: number;
}

export interface TicketOrder {
  id: string;
  eventType: EventType;
  eventId: string;
  tierId: string;
  buyerUserId: string | null;
  buyerEmail: string | null;
  buyerName: string | null;
  quantity: number;
  unitAmountCents: number;
  subtotalCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  /** What the card was actually charged (face value plus whatever fees the buyer covers). */
  buyerTotalCents: number;
  currency: string;
  status: "held" | "paid" | "refunded" | "cancelled" | "expired";
  paidAt: string | null;
  refundedAt: string | null;
  attendeeKey: string | null;
  createdAt: string;
}

export interface EventTicketing {
  /** none = free event. */
  refundPolicy: "none" | "until_days_before" | "always";
  refundDaysBefore: number;
  feePayer: "buyer" | "organizer";
  /**
   * Whether a refund also returns the fees. Stripe keeps its processing fee on
   * every refund, so returning fees means the platform pays for the buyer's
   * change of mind. The industry default (Eventbrite included) is to keep them,
   * and to make them refundable only when the organizer cancels the event,
   * which is handled automatically below.
   */
  feeRefund: "never" | "always";
}

/** Stripe's smallest chargeable amount in USD; below it, an order is a comp. */
const MIN_CHARGE_CENTS = 50;

const DEFAULT_TICKETING: EventTicketing = { refundPolicy: "until_days_before", refundDaysBefore: 7, feePayer: "buyer", feeRefund: "never" };

/**
 * The suffix on the buyer's card statement. Stripe shortens our account
 * descriptor to `GSHUFFLE*` and leaves exactly 12 characters, and it rejects a
 * full descriptor override on card payments, so this has to say "ticket" and
 * name the event in very little room: "GSHUFFLE* TIX SATURDAY". An unrecognised
 * line on a statement is the most common reason a ticket turns into a
 * chargeback, which the organizer then pays for.
 */
export function statementSuffix(title: string): string {
  const words = title.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let name = "";
  for (const word of words) {
    const next = name ? `${name} ${word}` : word;
    if (next.length > 8) break;
    name = next;
  }
  if (!name) name = (words[0] ?? "").slice(0, 8);
  return (name ? `TIX ${name}` : "TICKETS").slice(0, 12).trim();
}

// ─── connected accounts ──────────────────────────────────────────────────────

export interface ConnectAccount { userId: string; stripeAccountId: string; transfersEnabled: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[]; disabledReason: string | null }

/** Can this organizer actually be paid for a ticket? (destination charges) */
export function canSell(a: ConnectAccount | null): a is ConnectAccount {
  return !!a && (a.transfersEnabled || a.chargesEnabled);
}

export async function getConnectAccount(userId: string): Promise<ConnectAccount | null> {
  const { data, error } = await createServiceClient().from("gs_connect_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    userId: data.user_id as string, stripeAccountId: data.stripe_account_id as string,
    transfersEnabled: !!data.transfers_enabled, chargesEnabled: !!data.charges_enabled, payoutsEnabled: !!data.payouts_enabled, detailsSubmitted: !!data.details_submitted,
    requirementsDue: ((data.requirements_due as string[] | null) ?? []), disabledReason: (data.disabled_reason as string | null) ?? null,
  };
}

/** Create the connected account if needed, then a fresh onboarding link. */
export async function startConnectOnboarding(userId: string, email: string | null, returnTo?: string | null): Promise<{ url: string }> {
  const stripe = getStripe();
  const svc = createServiceClient();
  let account = await getConnectAccount(userId);
  if (!account) {
    const created = await stripe.accounts.create({
      type: "express",
      email: email ?? undefined,
      business_profile: { product_description: "Game night and tournament tickets on GameShuffle" },
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { gs_user_id: userId },
    });
    await svc.from("gs_connect_accounts").insert({ user_id: userId, stripe_account_id: created.id });
    account = { userId, stripeAccountId: created.id, transfersEnabled: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null };
  }
  const base = getBaseUrl();
  // Stripe sends the organizer back here, so it has to be the page they left
  // (their event's manage tab), not a generic account route.
  const safe = returnTo && /^\/[A-Za-z0-9\-._~/?=&%#]*$/.test(returnTo) ? returnTo : "/account/stuff?tab=payouts";
  const join = safe.includes("?") ? "&" : "?";
  const link = await stripe.accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${base}${safe}${join}payouts=refresh`,
    return_url: `${base}${safe}${join}payouts=done`,
  });
  return { url: link.url };
}

/** Express dashboard link for an onboarded organizer. */
export async function connectDashboardLink(userId: string): Promise<string | null> {
  const account = await getConnectAccount(userId);
  if (!account) return null;
  const login = await getStripe().accounts.createLoginLink(account.stripeAccountId);
  return login.url;
}

/** Mirror account state from Stripe (called by the webhook and on demand). */
export async function syncConnectAccount(stripeAccountId: string): Promise<void> {
  const stripe = getStripe();
  const acct = await stripe.accounts.retrieve(stripeAccountId);
  await createServiceClient().from("gs_connect_accounts").update({
    transfers_enabled: acct.capabilities?.transfers === "active",
    charges_enabled: !!acct.charges_enabled,
    payouts_enabled: !!acct.payouts_enabled,
    details_submitted: !!acct.details_submitted,
    requirements_due: acct.requirements?.currently_due ?? [],
    disabled_reason: acct.requirements?.disabled_reason ?? null,
    updated_at: new Date().toISOString(),
  }).eq("stripe_account_id", stripeAccountId);
}

// ─── tiers ───────────────────────────────────────────────────────────────────

function tierRow(r: Record<string, unknown>, sold: number, withSecrets = false): TicketTier {
  return {
    id: r.id as string, eventType: r.event_type as EventType, eventId: r.event_id as string, name: r.name as string,
    description: (r.description as string | null) ?? null, amountCents: r.amount_cents as number, currency: r.currency as string,
    quantity: (r.quantity as number | null) ?? null, perOrderMax: (r.per_order_max as number) ?? 4,
    salesOpenAt: (r.sales_open_at as string | null) ?? null, salesCloseAt: (r.sales_close_at as string | null) ?? null,
    hasAccessCode: !!r.access_code, accessCode: withSecrets ? ((r.access_code as string | null) ?? null) : undefined,
    sort: (r.sort as number) ?? 0, active: !!r.active, sold,
  };
}

/** Tiers for an event with their sold/held counts. Empty ⇒ the event is free. */
export async function listTiers(type: EventType, eventId: string, opts: { includeInactive?: boolean; accessCode?: string | null; withSecrets?: boolean } = {}): Promise<TicketTier[]> {
  const svc = createServiceClient();
  let q = svc.from("gs_ticket_tiers").select("*").eq("event_type", type).eq("event_id", eventId).order("sort");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) return []; // pre-migration → treat as a free event
  let rows = (data ?? []) as Record<string, unknown>[];
  if (!opts.includeInactive) {
    // A tier behind an access code is invisible until the code is supplied;
    // rendering it as "locked" would tell everyone it exists.
    const code = opts.accessCode?.trim() || null;
    rows = rows.filter((r) => !r.access_code || (code !== null && r.access_code === code));
  }
  if (rows.length === 0) return [];
  const { data: orders } = await svc.from("gs_ticket_orders").select("tier_id, quantity, status, expires_at").eq("event_type", type).eq("event_id", eventId);
  const now = Date.now();
  const sold = new Map<string, number>();
  for (const o of (orders ?? []) as { tier_id: string; quantity: number; status: string; expires_at: string | null }[]) {
    const counts = o.status === "paid" || (o.status === "held" && o.expires_at && Date.parse(o.expires_at) > now);
    if (counts) sold.set(o.tier_id, (sold.get(o.tier_id) ?? 0) + o.quantity);
  }
  return rows.map((r) => tierRow(r, sold.get(r.id as string) ?? 0, !!opts.withSecrets));
}

export async function isPaidEvent(type: EventType, eventId: string): Promise<boolean> {
  return (await listTiers(type, eventId)).some((t) => t.amountCents > 0);
}

export async function upsertTier(args: { type: EventType; eventId: string; actorId: string; tier: Partial<TicketTier> & { id?: string; name: string; amountCents: number } }): Promise<{ id: string }> {
  if (!(await canManageEvent(args.type, args.eventId, args.actorId))) throw new Error("forbidden");
  const svc = createServiceClient();
  const payload: Record<string, unknown> = {
    event_type: args.type, event_id: args.eventId, name: args.tier.name.slice(0, 80),
    description: args.tier.description?.slice(0, 300) ?? null,
    amount_cents: Math.max(0, Math.round(args.tier.amountCents)),
    quantity: args.tier.quantity ?? null, per_order_max: Math.min(20, Math.max(1, args.tier.perOrderMax ?? 4)),
    sales_open_at: args.tier.salesOpenAt ?? null, sales_close_at: args.tier.salesCloseAt ?? null,
    sort: args.tier.sort ?? 0, active: args.tier.active ?? true,
  };
  // Only touched when the caller actually sent the field, so saving a tier from
  // a form that never loaded the code can't silently unlock it.
  if ("accessCode" in args.tier) payload.access_code = args.tier.accessCode?.trim() || null;
  if (args.tier.id) {
    const { error } = await svc.from("gs_ticket_tiers").update(payload).eq("id", args.tier.id).eq("event_id", args.eventId);
    if (error) throw new Error(error.message);
    return { id: args.tier.id };
  }
  payload.created_by = args.actorId;
  const { data, error } = await svc.from("gs_ticket_tiers").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function setTierActive(args: { type: EventType; eventId: string; tierId: string; active: boolean; actorId: string }): Promise<void> {
  if (!(await canManageEvent(args.type, args.eventId, args.actorId))) throw new Error("forbidden");
  await createServiceClient().from("gs_ticket_tiers").update({ active: args.active }).eq("id", args.tierId).eq("event_id", args.eventId);
}

// ─── event ticketing settings ────────────────────────────────────────────────

export async function getTicketing(type: EventType, eventId: string): Promise<EventTicketing> {
  const svc = createServiceClient();
  const table = type === "tournament" ? "tournaments" : "board_game_nights";
  const { data, error } = await svc.from(table).select("ticketing").eq("id", eventId).maybeSingle();
  if (error || !data) return DEFAULT_TICKETING;
  const t = (data.ticketing ?? {}) as Partial<EventTicketing>;
  return {
    refundPolicy: t.refundPolicy ?? DEFAULT_TICKETING.refundPolicy,
    refundDaysBefore: t.refundDaysBefore ?? (await lever("refund_window_days_default", 7)),
    feePayer: t.feePayer ?? ((await leverText("fee_payer_default", "buyer")) === "organizer" ? "organizer" : "buyer"),
    feeRefund: t.feeRefund ?? DEFAULT_TICKETING.feeRefund,
  };
}

export async function setTicketing(args: { type: EventType; eventId: string; actorId: string; ticketing: Partial<EventTicketing> }): Promise<void> {
  if (!(await canManageEvent(args.type, args.eventId, args.actorId))) throw new Error("forbidden");
  const current = await getTicketing(args.type, args.eventId);
  const next: EventTicketing = { ...current, ...args.ticketing };
  const table = args.type === "tournament" ? "tournaments" : "board_game_nights";
  await createServiceClient().from(table).update({ ticketing: next }).eq("id", args.eventId);
}

// ─── quote + checkout ────────────────────────────────────────────────────────

export interface TicketQuote {
  tierId: string; quantity: number; currency: string;
  /** List price before any discount. */
  faceSubtotalCents: number;
  discountCents: number;
  /** The code that was actually applied, uppercased. */
  promoCode: string | null;
  /** Why a supplied code was not applied, for the buyer-facing message. */
  promoError: PromoRejection | null;
  /** What the buyer pays for the tickets themselves, after any discount. */
  subtotalCents: number;
  platformFeeCents: number; processingFeeCents: number;
  buyerTotalCents: number; organizerNetCents: number;
  feePayer: "buyer" | "organizer"; feePlanId: PlanId; feeBps: number; feeFixedCents: number;
  /** The refund terms in force, so the buyer sees them before paying. */
  refundPolicy: EventTicketing["refundPolicy"]; refundDaysBefore: number; feesRefundable: boolean;
}

/** What the buyer pays and the organizer nets, from the organizer's plan levers. */
export async function quoteTickets(type: EventType, eventId: string, tierId: string, quantity: number, promoCode?: string | null): Promise<TicketQuote> {
  const svc = createServiceClient();
  const meta = await getEventMeta(type, eventId);
  if (!meta) throw new Error("event_not_found");
  const tiers = await listTiers(type, eventId);
  const tier = tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error("tier_not_found");
  const qty = Math.max(1, Math.min(tier.perOrderMax, Math.round(quantity)));

  const { data: owner } = await svc.from("users").select("subscription_tier, circuit_tier, circuit_status").eq("id", meta.ownerId).maybeSingle();
  const feePlanId = feePlanFor({
    subscriptionTier: (owner?.subscription_tier as string | null) ?? null,
    circuitTier: (owner?.circuit_tier as string | null) ?? null,
    circuitStatus: (owner?.circuit_status as string | null) ?? null,
  });
  const faceSubtotalCents = tier.amountCents * qty;

  // A discount comes off the ticket price only. Fees are then charged on what
  // the buyer actually pays, so the discount costs the organizer their own
  // revenue and never costs the platform its fee.
  let discountCents = 0;
  let appliedCode: string | null = null;
  let promoError: PromoRejection | null = null;
  if (promoCode && promoCode.trim()) {
    const res = await applyPromo({ type, eventId, code: promoCode, tierId: tier.id, subtotalCents: faceSubtotalCents });
    if (res.ok) { discountCents = res.discountCents; appliedCode = res.promo.code; }
    else promoError = res.reason;
  }
  const subtotalCents = faceSubtotalCents - discountCents;

  const fee = await computePlatformFee(tier.amountCents, feePlanId);
  const minFeeCents = await lever("connect_min_fee_cents", 0);
  // Charged on the discounted total rather than per full-price ticket.
  const platformFeeCents = subtotalCents <= 0
    ? 0
    : Math.max(minFeeCents * qty, Math.round((subtotalCents * fee.bps) / 10_000) + fee.fixedCents * qty);
  const procBps = await lever("processing_fee_bps", 290);
  const procFixed = await lever("processing_fee_fixed_cents", 30);
  const ticketing = await getTicketing(type, eventId);

  // Buyer-pays: fees ride on top of face value. Organizer-pays: they come out of it.
  const rate = Math.min(0.5, Math.max(0, procBps / 10_000));
  let processingFeeCents = 0;
  let buyerTotalCents = subtotalCents;
  if (subtotalCents > 0) {
    if (ticketing.feePayer === "buyer") {
      // Stripe charges its percentage on the FINAL total, which includes this
      // fee, so the total has to be solved for rather than estimated off the
      // subtotal. Estimating leaves the platform quietly short a few cents on
      // every order.
      buyerTotalCents = Math.ceil((subtotalCents + platformFeeCents + procFixed) / (1 - rate));
      processingFeeCents = buyerTotalCents - subtotalCents - platformFeeCents;
    } else {
      processingFeeCents = Math.round(subtotalCents * rate) + procFixed;
    }
  }
  const organizerNetCents = buyerTotalCents - platformFeeCents - processingFeeCents;

  return {
    tierId: tier.id, quantity: qty, currency: tier.currency,
    faceSubtotalCents, discountCents, promoCode: appliedCode, promoError,
    subtotalCents, platformFeeCents, processingFeeCents,
    buyerTotalCents, organizerNetCents, feePayer: ticketing.feePayer, feePlanId, feeBps: fee.bps, feeFixedCents: fee.fixedCents,
    refundPolicy: ticketing.refundPolicy, refundDaysBefore: ticketing.refundDaysBefore,
    feesRefundable: ticketing.feeRefund === "always",
  };
}

export interface CheckoutArgs { type: EventType; eventId: string; tierId: string; quantity: number; buyerUserId: string | null; buyerEmail: string | null; buyerName: string | null; accessCode?: string | null; promoCode?: string | null }

/** Hold the seats and open a Stripe Checkout on the organizer's account. */
export async function createTicketCheckout(args: CheckoutArgs): Promise<{ url: string; orderId: string }> {
  const svc = createServiceClient();
  const meta = await getEventMeta(args.type, args.eventId);
  if (!meta) throw new Error("event_not_found");
  const account = await getConnectAccount(meta.ownerId);
  if (!canSell(account)) throw new Error("organizer_not_ready");

  const tiers = await listTiers(args.type, args.eventId);
  const tier = tiers.find((t) => t.id === args.tierId);
  if (!tier) throw new Error("tier_not_found");
  const now = Date.now();
  if (tier.salesOpenAt && Date.parse(tier.salesOpenAt) > now) throw new Error("sales_not_open");
  if (tier.salesCloseAt && Date.parse(tier.salesCloseAt) < now) throw new Error("sales_closed");
  if (tier.hasAccessCode) {
    const { data: row } = await svc.from("gs_ticket_tiers").select("access_code").eq("id", tier.id).maybeSingle();
    if ((row?.access_code as string | null) !== (args.accessCode ?? null)) throw new Error("access_code_required");
  }

  const quote = await quoteTickets(args.type, args.eventId, args.tierId, args.quantity, args.promoCode ?? null);
  // A code that was typed but can't be used must stop the sale, not silently
  // charge full price to someone who thought they had a discount.
  if (args.promoCode && args.promoCode.trim() && quote.promoError) throw new Error(`promo_${quote.promoError}`);
  const promo = quote.promoCode
    ? await applyPromo({ type: args.type, eventId: args.eventId, code: quote.promoCode, tierId: args.tierId, subtotalCents: quote.faceSubtotalCents })
    : null;
  // Capacity: tier quantity AND the event's own seat count (held seats included).
  if (tier.quantity != null && tier.sold + quote.quantity > tier.quantity) throw new Error("tier_sold_out");
  if (meta.capacity != null) {
    const taken = countTaken(args.type, await listAttendees(args.type, args.eventId));
    const heldElsewhere = tiers.reduce((n, t) => n + t.sold, 0);
    if (taken + heldElsewhere + quote.quantity > meta.capacity) throw new Error("event_full");
  }

  // Stripe requires a hosted Checkout session to live at least 30 minutes, so
  // the seat hold matches it exactly — a shorter hold could release a seat that
  // a still-open Checkout then pays for, overselling the event.
  const holdMinutes = Math.max(30, await lever("ticket_hold_minutes", 30));
  const expiresAt = new Date(now + holdMinutes * 60_000);
  const { data: order, error } = await svc.from("gs_ticket_orders").insert({
    event_type: args.type, event_id: args.eventId, tier_id: tier.id,
    buyer_user_id: args.buyerUserId, buyer_email: args.buyerEmail, buyer_name: args.buyerName,
    quantity: quote.quantity, unit_amount_cents: tier.amountCents, subtotal_cents: quote.subtotalCents,
    platform_fee_cents: quote.platformFeeCents, processing_fee_cents: quote.processingFeeCents, buyer_total_cents: quote.buyerTotalCents,
    promo_code_id: promo?.ok ? promo.promo.id : null, discount_cents: quote.discountCents,
    fee_plan_id: quote.feePlanId, fee_bps: quote.feeBps, fee_fixed_cents: quote.feeFixedCents,
    currency: tier.currency, status: "held", expires_at: expiresAt.toISOString(), stripe_account_id: account.stripeAccountId,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const base = getBaseUrl();

  // A 100%-off code (or a discount that lands under Stripe's 50c minimum
  // charge) leaves nothing to charge. Stripe won't create that session, so the
  // order is completed here as a comp: seated, emailed, no payment.
  if (quote.buyerTotalCents < MIN_CHARGE_CENTS) {
    const res = await finaliseOrder(order.id as string, null);
    if (!res.ok) throw new Error(res.reason ?? "comp_failed");
    return { url: `${base}${meta.href}?ticket=success&order=${order.id}`, orderId: order.id as string };
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Stripe's own expiry keeps the session in step with our hold.
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    customer_email: args.buyerEmail ?? undefined,
    // Face value and fees are separate lines so the receipt reads the way the
    // ticket picker did, and so an odd fee split across several tickets can't
    // be lost to per-unit rounding.
    line_items: [
      quote.discountCents > 0
        ? {
            quantity: 1,
            price_data: {
              currency: tier.currency,
              unit_amount: quote.subtotalCents,
              product_data: {
                name: `${meta.title} — ${tier.name} × ${quote.quantity}`,
                description: `Includes ${quote.promoCode} discount of $${(quote.discountCents / 100).toFixed(2)}`,
              },
            },
          }
        : {
            quantity: quote.quantity,
            price_data: {
              currency: tier.currency,
              unit_amount: tier.amountCents,
              product_data: { name: `${meta.title} — ${tier.name}`, description: tier.description ?? undefined },
            },
          },
      ...(quote.buyerTotalCents > quote.subtotalCents ? [{
        quantity: 1,
        price_data: {
          currency: tier.currency,
          unit_amount: quote.buyerTotalCents - quote.subtotalCents,
          product_data: { name: "Service fee" },
        },
      }] : []),
    ],
    payment_intent_data: {
      // GameShuffle is the merchant of record here, so Stripe's processing fee
      // lands on the platform. Collecting it as part of the application fee is
      // what leaves the organizer with exactly the net the quote promised.
      application_fee_amount: Math.min(quote.platformFeeCents + quote.processingFeeCents, Math.max(0, quote.buyerTotalCents - 1)),
      transfer_data: { destination: account.stripeAccountId },
      statement_descriptor_suffix: statementSuffix(meta.title),
      metadata: { gs_order_id: order.id as string, gs_event_type: args.type, gs_event_id: args.eventId },
    },
    metadata: { gs_order_id: order.id as string, gs_event_type: args.type, gs_event_id: args.eventId, gs_kind: "ticket" },
    success_url: `${base}${meta.href}?ticket=success&order=${order.id}`,
    cancel_url: `${base}${meta.href}?ticket=cancelled`,
  });

  await svc.from("gs_ticket_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  if (!session.url) throw new Error("no_checkout_url");
  return { url: session.url, orderId: order.id as string };
}

// ─── fulfilment (webhook) ────────────────────────────────────────────────────

/** Mark an order paid and seat the buyer. Idempotent on the order row. */
export async function fulfilTicketOrder(session: Stripe.Checkout.Session): Promise<{ ok: boolean; reason?: string }> {
  const orderId = session.metadata?.gs_order_id;
  if (!orderId) return { ok: false, reason: "no_order_metadata" };
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  return finaliseOrder(orderId, paymentIntentId);
}

/**
 * Turn a held order into a seated, emailed ticket. Shared by the Stripe
 * fulfilment path and by fully-discounted orders, which never reach Stripe at
 * all because a zero-amount Checkout is not a thing it will create.
 */
async function finaliseOrder(orderId: string, paymentIntentId: string | null): Promise<{ ok: boolean; reason?: string }> {
  const svc = createServiceClient();
  const { data: order } = await svc.from("gs_ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, reason: "order_not_found" };
  // Paid AND seated is the only genuinely finished state; paid without a seat
  // means a previous attempt died after taking the money, and must be retried.
  if (order.status === "paid" && order.attendee_key) return { ok: true };

  const type = order.event_type as EventType;
  const eventId = order.event_id as string;

  // The webhook and the buyer's return from Checkout both land here, so claim
  // the order first: whoever flips it out of held does the seating and sends
  // the one confirmation email. An expired hold still counts, because the money
  // moved and the buyer is owed their seat.
  const { data: claimed } = await svc.from("gs_ticket_orders").update({
    status: "paid", paid_at: new Date().toISOString(),
    stripe_payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).in("status", ["held", "expired"]).select("id");
  const wonClaim = !!claimed && claimed.length > 0;
  if (!wonClaim) {
    // Either a concurrent caller claimed it, or an earlier attempt took the
    // money and then failed. Re-read before deciding which.
    const { data: now } = await svc.from("gs_ticket_orders").select("status, attendee_key").eq("id", orderId).maybeSingle();
    if (now?.status !== "paid" || now?.attendee_key) return { ok: true };
  }

  const attendeeKey = await seatBuyer(type, eventId, order as Record<string, unknown>);
  await svc.from("gs_ticket_orders").update({ attendee_key: attendeeKey }).eq("id", orderId);

  if (!wonClaim) return { ok: true }; // recovered a half-finished order; it was emailed already
  await sendTicketReceipt(type, eventId, order as Record<string, unknown>).catch((e) => {
    console.error("[tickets] confirmation email failed:", e instanceof Error ? e.message : e);
  });
  return { ok: true };
}

/** The "you're in" email. Never throws: a failed send must not unseat a buyer. */
async function sendTicketReceipt(type: EventType, eventId: string, order: Record<string, unknown>): Promise<void> {
  const to = order.buyer_email as string | null;
  if (!to) return;
  const [meta, ticketing, tiers] = await Promise.all([
    getEventMeta(type, eventId),
    getTicketing(type, eventId),
    listTiers(type, eventId, { includeInactive: true }),
  ]);
  if (!meta) return;
  const tier = tiers.find((t) => t.id === order.tier_id);
  const feeCents = ((order.platform_fee_cents as number) ?? 0) + ((order.processing_fee_cents as number) ?? 0);
  const base = getBaseUrl();
  const { sendTicketConfirmationEmail } = await import("@/lib/email/tickets");
  await sendTicketConfirmationEmail({
    to,
    toName: (order.buyer_name as string | null) ?? null,
    eventTitle: meta.title,
    startIso: meta.startsAt,
    quantity: (order.quantity as number) ?? 1,
    tierName: tier?.name ?? "Ticket",
    paidCents: (order.buyer_total_cents as number | null) ?? (order.subtotal_cents as number),
    eventUrl: `${base}${meta.href}`,
    calendarUrl: `${base}/api/events/${type}/${eventId}/ics`,
    refundTerms: refundTermsText({
      refundPolicy: ticketing.refundPolicy, refundDaysBefore: ticketing.refundDaysBefore,
      feePayer: ticketing.feePayer, feesRefundable: ticketing.feeRefund === "always", feeCents,
    }),
  });
}

/** Create (or confirm) the attendee row a paid order entitles the buyer to. */
async function seatBuyer(type: EventType, eventId: string, order: Record<string, unknown>): Promise<string | null> {
  const svc = createServiceClient();
  const userId = (order.buyer_user_id as string | null) ?? null;
  const name = (order.buyer_name as string | null) || (order.buyer_email as string | null) || "Ticket holder";
  if (type === "tournament") {
    if (userId) {
      const { data: existing } = await svc.from("tournament_participants").select("id").eq("tournament_id", eventId).eq("user_id", userId).maybeSingle();
      if (existing) {
        await svc.from("tournament_participants").update({ status: "confirmed" }).eq("id", existing.id);
        return existing.id as string;
      }
    }
    const { data } = await svc.from("tournament_participants").insert({ tournament_id: eventId, user_id: userId, display_name: name, status: "confirmed" }).select("id").single();
    const participantId = (data?.id as string | undefined) ?? null;
    // Guests get a claim row so the ticket can be attached to an account later.
    if (participantId && !userId && order.buyer_email) {
      await svc.from("tournament_guest_claims").insert({ tournament_id: eventId, participant_id: participantId, email: order.buyer_email as string }).then(() => {}, () => {});
    }
    return participantId;
  }
  if (!userId) return null; // nights require an account to RSVP
  await svc.from("board_game_night_rsvps").upsert({ night_id: eventId, user_id: userId, status: "going", waitlisted_at: null }, { onConflict: "night_id,user_id" });
  return `${eventId}:${userId}`;
}

/** Cancelling an event makes its fees refundable, whatever the event's policy says. */
async function isEventCancelled(type: EventType, eventId: string): Promise<boolean> {
  const table = type === "tournament" ? "tournaments" : "board_game_nights";
  const { data } = await createServiceClient().from(table).select("status").eq("id", eventId).maybeSingle();
  return data?.status === "cancelled";
}

/**
 * What a refund actually returns. Fees are kept unless the organizer opted to
 * return them or the event was cancelled; in organizer-pays mode the buyer only
 * ever paid face value, so they get all of it back either way.
 */
export function refundAmountFor(order: TicketOrder, feesRefundable: boolean): number {
  return feesRefundable ? order.buyerTotalCents : Math.min(order.subtotalCents, order.buyerTotalCents);
}

/** Release a held order (checkout expired or was abandoned). */
export async function expireHeldOrders(): Promise<number> {
  const svc = createServiceClient();
  const { data } = await svc.from("gs_ticket_orders").update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "held").lt("expires_at", new Date().toISOString()).select("id");
  return (data ?? []).length;
}

// ─── refunds ─────────────────────────────────────────────────────────────────

export async function canRefund(order: TicketOrder, ticketing: EventTicketing, startsAt: string | null, byOrganizer: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (order.status !== "paid") return { ok: false, reason: "not_paid" };
  if (byOrganizer) return { ok: true };
  if (ticketing.refundPolicy === "none") return { ok: false, reason: "no_refunds" };
  if (ticketing.refundPolicy === "always") return { ok: true };
  if (!startsAt) return { ok: true };
  const cutoff = Date.parse(startsAt) - ticketing.refundDaysBefore * 86_400_000;
  return Date.now() < cutoff ? { ok: true } : { ok: false, reason: "window_closed" };
}

/** Refund a paid order; the platform fee is reversed proportionally. */
export async function refundOrder(orderId: string, actorId: string | null, byOrganizer: boolean): Promise<{ ok: boolean; reason?: string; refundedCents?: number }> {
  const svc = createServiceClient();
  const { data: row } = await svc.from("gs_ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };
  const type = row.event_type as EventType;
  const eventId = row.event_id as string;
  if (byOrganizer) {
    if (!(await canManageEvent(type, eventId, actorId))) return { ok: false, reason: "forbidden" };
  } else if (!actorId || row.buyer_user_id !== actorId) {
    return { ok: false, reason: "forbidden" };
  }
  const meta = await getEventMeta(type, eventId);
  const ticketing = await getTicketing(type, eventId);
  const order = toOrder(row as Record<string, unknown>);
  const allowed = await canRefund(order, ticketing, meta?.startsAt ?? null, byOrganizer);
  if (!allowed.ok) return allowed;

  const feesRefundable = ticketing.feeRefund === "always" || (await isEventCancelled(type, eventId));
  const refundCents = refundAmountFor(order, feesRefundable);

  const pi = row.stripe_payment_intent_id as string | null;
  if (pi) {
    // Money first: if Stripe won't refund, the order stays paid and the seat stays
    // taken rather than the two going out of sync.
    try {
      // The transfer reverses in proportion to the refund, so the organizer
      // gives back exactly what they netted and the platform keeps the fee it
      // already paid Stripe out of.
      await getStripe().refunds.create({ payment_intent: pi, amount: refundCents, refund_application_fee: feesRefundable, reverse_transfer: true });
    } catch (e) {
      console.error("[tickets] Stripe refund failed:", e instanceof Error ? e.message : e);
      return { ok: false, reason: "stripe_refund_failed" };
    }
  }
  await svc.from("gs_ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString(), refund_amount_cents: refundCents, updated_at: new Date().toISOString() }).eq("id", orderId);
  // Free the seat: drop the attendee row the order created.
  const key = row.attendee_key as string | null;
  if (key) {
    if (type === "tournament") await svc.from("tournament_participants").update({ status: "dropped" }).eq("id", key);
    else {
      const [, userId] = key.split(":");
      if (userId) await svc.from("board_game_night_rsvps").update({ status: "declined" }).eq("night_id", eventId).eq("user_id", userId);
    }
  }
  return { ok: true, refundedCents: refundCents };
}

export function toOrder(r: Record<string, unknown>): TicketOrder {
  return {
    id: r.id as string, eventType: r.event_type as EventType, eventId: r.event_id as string, tierId: r.tier_id as string,
    buyerUserId: (r.buyer_user_id as string | null) ?? null, buyerEmail: (r.buyer_email as string | null) ?? null, buyerName: (r.buyer_name as string | null) ?? null,
    quantity: r.quantity as number, unitAmountCents: r.unit_amount_cents as number, subtotalCents: r.subtotal_cents as number,
    platformFeeCents: (r.platform_fee_cents as number) ?? 0, processingFeeCents: (r.processing_fee_cents as number) ?? 0,
    buyerTotalCents: (r.buyer_total_cents as number | null) ?? ((r.subtotal_cents as number) + ((r.platform_fee_cents as number) ?? 0)),
    currency: (r.currency as string) ?? "usd",
    status: r.status as TicketOrder["status"], paidAt: (r.paid_at as string | null) ?? null, refundedAt: (r.refunded_at as string | null) ?? null,
    attendeeKey: (r.attendee_key as string | null) ?? null, createdAt: r.created_at as string,
  };
}

export async function listOrders(type: EventType, eventId: string): Promise<TicketOrder[]> {
  const { data, error } = await createServiceClient().from("gs_ticket_orders").select("*").eq("event_type", type).eq("event_id", eventId).order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toOrder);
}

export async function myOrders(userId: string): Promise<TicketOrder[]> {
  const { data, error } = await createServiceClient().from("gs_ticket_orders").select("*").eq("buyer_user_id", userId).in("status", ["paid", "refunded"]).order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toOrder);
}

// ─── promo codes ─────────────────────────────────────────────────────────────

export interface PromoCode {
  id: string;
  eventType: EventType;
  eventId: string;
  code: string;
  kind: "percent" | "amount";
  /** percent: 1-100. amount: cents off each ticket. */
  value: number;
  maxRedemptions: number | null;
  tierId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  /** Paid orders plus live holds, counted from the ledger rather than stored. */
  redeemed: number;
}

function promoRow(r: Record<string, unknown>, redeemed: number): PromoCode {
  return {
    id: r.id as string, eventType: r.event_type as EventType, eventId: r.event_id as string,
    code: r.code as string, kind: r.kind as PromoCode["kind"], value: r.value as number,
    maxRedemptions: (r.max_redemptions as number | null) ?? null, tierId: (r.tier_id as string | null) ?? null,
    startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null,
    active: !!r.active, redeemed,
  };
}

/** Organizer view: every code on an event with its live redemption count. */
export async function listPromoCodes(type: EventType, eventId: string): Promise<PromoCode[]> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("gs_promo_codes").select("*").eq("event_type", type).eq("event_id", eventId).order("created_at", { ascending: false });
  if (error) return []; // pre-migration
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const counts = await redemptionCounts(rows.map((r) => r.id as string));
  return rows.map((r) => promoRow(r, counts.get(r.id as string) ?? 0));
}

/** A held order reserves its redemption the same way it reserves its seat. */
async function redemptionCounts(promoIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (promoIds.length === 0) return out;
  const { data } = await createServiceClient()
    .from("gs_ticket_orders").select("promo_code_id, status, expires_at").in("promo_code_id", promoIds);
  const now = Date.now();
  for (const o of (data ?? []) as { promo_code_id: string; status: string; expires_at: string | null }[]) {
    const live = o.status === "paid" || (o.status === "held" && o.expires_at && Date.parse(o.expires_at) > now);
    if (live) out.set(o.promo_code_id, (out.get(o.promo_code_id) ?? 0) + 1);
  }
  return out;
}

export async function upsertPromoCode(args: {
  type: EventType; eventId: string; actorId: string;
  promo: { id?: string; code: string; kind: "percent" | "amount"; value: number; maxRedemptions?: number | null; tierId?: string | null; startsAt?: string | null; endsAt?: string | null };
}): Promise<{ id: string }> {
  if (!(await canManageEvent(args.type, args.eventId, args.actorId))) throw new Error("forbidden");
  const code = args.promo.code.trim().toUpperCase();
  if (code.length < 2) throw new Error("code_too_short");
  const value = Math.round(args.promo.value);
  if (args.promo.kind === "percent" && (value < 1 || value > 100)) throw new Error("percent_out_of_range");
  if (value <= 0) throw new Error("value_required");

  const svc = createServiceClient();
  const row = {
    event_type: args.type, event_id: args.eventId, code, kind: args.promo.kind, value,
    max_redemptions: args.promo.maxRedemptions ?? null, tier_id: args.promo.tierId ?? null,
    starts_at: args.promo.startsAt ?? null, ends_at: args.promo.endsAt ?? null,
  };
  if (args.promo.id) {
    const { error } = await svc.from("gs_promo_codes").update(row).eq("id", args.promo.id).eq("event_id", args.eventId);
    if (error) throw new Error(error.message.includes("uq_gs_promo_codes") ? "code_taken" : error.message);
    return { id: args.promo.id };
  }
  const { data, error } = await svc.from("gs_promo_codes").insert({ ...row, created_by: args.actorId }).select("id").single();
  if (error) throw new Error(error.message.includes("uq_gs_promo_codes") ? "code_taken" : error.message);
  return { id: data.id as string };
}

export async function setPromoActive(args: { type: EventType; eventId: string; actorId: string; promoId: string; active: boolean }): Promise<void> {
  if (!(await canManageEvent(args.type, args.eventId, args.actorId))) throw new Error("forbidden");
  await createServiceClient().from("gs_promo_codes").update({ active: args.active }).eq("id", args.promoId).eq("event_id", args.eventId);
}

export type PromoRejection = "not_found" | "inactive" | "not_started" | "expired" | "used_up" | "wrong_tier";

/**
 * Resolve a typed code to a discount on this order. Rejections are specific so
 * the buyer is told why ("that code has expired"), never just "invalid".
 */
export async function applyPromo(args: {
  type: EventType; eventId: string; code: string; tierId: string; subtotalCents: number;
}): Promise<{ ok: true; promo: PromoCode; discountCents: number } | { ok: false; reason: PromoRejection }> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("gs_promo_codes").select("*")
    .eq("event_type", args.type).eq("event_id", args.eventId)
    .eq("code", args.code.trim().toUpperCase()).maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found" };

  const counts = await redemptionCounts([data.id as string]);
  const promo = promoRow(data as Record<string, unknown>, counts.get(data.id as string) ?? 0);
  const now = Date.now();
  if (!promo.active) return { ok: false, reason: "inactive" };
  if (promo.startsAt && Date.parse(promo.startsAt) > now) return { ok: false, reason: "not_started" };
  if (promo.endsAt && Date.parse(promo.endsAt) < now) return { ok: false, reason: "expired" };
  if (promo.maxRedemptions != null && promo.redeemed >= promo.maxRedemptions) return { ok: false, reason: "used_up" };
  if (promo.tierId && promo.tierId !== args.tierId) return { ok: false, reason: "wrong_tier" };

  return { ok: true, promo, discountCents: discountFor(promo, args.subtotalCents) };
}

/** Never more than the tickets are worth: a discount cannot make an order negative. */
export function discountFor(promo: Pick<PromoCode, "kind" | "value">, subtotalCents: number): number {
  const raw = promo.kind === "percent" ? Math.round((subtotalCents * promo.value) / 100) : promo.value;
  return Math.max(0, Math.min(subtotalCents, raw));
}

// ─── personal + organizer views ──────────────────────────────────────────────

export interface MyTicket {
  orderId: string;
  eventType: EventType;
  eventId: string;
  title: string;
  href: string;
  startsAt: string | null;
  quantity: number;
  tierName: string;
  paidCents: number;
  status: TicketOrder["status"];
  purchasedAt: string;
  /** Whether the buyer can refund this themselves right now, and why not. */
  refundable: { ok: boolean; reason?: string };
  refundAmountCents: number;
  refundTerms: string;
}

/** Everything a buyer has bought, with the event details and their refund rights. */
export async function listMyTickets(userId: string): Promise<MyTicket[]> {
  const orders = await myOrders(userId);
  const keys = Array.from(new Set(orders.map((o) => `${o.eventType}:${o.eventId}`)));
  const events = new Map(await Promise.all(keys.map(async (k) => {
    const [type, id] = k.split(":") as [EventType, string];
    const [meta, ticketing, tiers] = await Promise.all([getEventMeta(type, id), getTicketing(type, id), listTiers(type, id, { includeInactive: true })]);
    return [k, { meta, ticketing, tiers }] as const;
  })));

  const out: MyTicket[] = [];
  for (const o of orders) {
    const ctx = events.get(`${o.eventType}:${o.eventId}`);
    if (!ctx?.meta) continue;
    const feesRefundable = ctx.ticketing.feeRefund === "always";
    out.push({
      orderId: o.id, eventType: o.eventType, eventId: o.eventId,
      title: ctx.meta.title, href: ctx.meta.href, startsAt: ctx.meta.startsAt,
      quantity: o.quantity, tierName: ctx.tiers.find((t) => t.id === o.tierId)?.name ?? "Ticket",
      paidCents: o.buyerTotalCents, status: o.status, purchasedAt: o.createdAt,
      refundable: await canRefund(o, ctx.ticketing, ctx.meta.startsAt, false),
      refundAmountCents: refundAmountFor(o, feesRefundable),
      refundTerms: refundTermsText({
        refundPolicy: ctx.ticketing.refundPolicy, refundDaysBefore: ctx.ticketing.refundDaysBefore,
        feePayer: ctx.ticketing.feePayer, feesRefundable, feeCents: o.platformFeeCents + o.processingFeeCents,
      }),
    });
  }
  return out;
}
