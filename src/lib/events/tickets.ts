import "server-only";

import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { getBaseUrl } from "@/lib/env";
import { computePlatformFee, feePlanFor, lever, leverText, type PlanId } from "@/lib/pricing/catalog";
import { canManageEvent, getEventMeta, listAttendees, countTaken } from "./attendees";
import type { EventType } from "./calendar";

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
}

const DEFAULT_TICKETING: EventTicketing = { refundPolicy: "until_days_before", refundDaysBefore: 7, feePayer: "buyer" };

// ─── connected accounts ──────────────────────────────────────────────────────

export interface ConnectAccount { userId: string; stripeAccountId: string; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[]; disabledReason: string | null }

export async function getConnectAccount(userId: string): Promise<ConnectAccount | null> {
  const { data, error } = await createServiceClient().from("gs_connect_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    userId: data.user_id as string, stripeAccountId: data.stripe_account_id as string,
    chargesEnabled: !!data.charges_enabled, payoutsEnabled: !!data.payouts_enabled, detailsSubmitted: !!data.details_submitted,
    requirementsDue: ((data.requirements_due as string[] | null) ?? []), disabledReason: (data.disabled_reason as string | null) ?? null,
  };
}

/** Create the connected account if needed, then a fresh onboarding link. */
export async function startConnectOnboarding(userId: string, email: string | null): Promise<{ url: string }> {
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
    account = { userId, stripeAccountId: created.id, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null };
  }
  const base = getBaseUrl();
  const link = await stripe.accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${base}/account/stuff?tab=payouts&refresh=1`,
    return_url: `${base}/account/stuff?tab=payouts&done=1`,
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
    charges_enabled: !!acct.charges_enabled,
    payouts_enabled: !!acct.payouts_enabled,
    details_submitted: !!acct.details_submitted,
    requirements_due: acct.requirements?.currently_due ?? [],
    disabled_reason: acct.requirements?.disabled_reason ?? null,
    updated_at: new Date().toISOString(),
  }).eq("stripe_account_id", stripeAccountId);
}

// ─── tiers ───────────────────────────────────────────────────────────────────

function tierRow(r: Record<string, unknown>, sold: number): TicketTier {
  return {
    id: r.id as string, eventType: r.event_type as EventType, eventId: r.event_id as string, name: r.name as string,
    description: (r.description as string | null) ?? null, amountCents: r.amount_cents as number, currency: r.currency as string,
    quantity: (r.quantity as number | null) ?? null, perOrderMax: (r.per_order_max as number) ?? 4,
    salesOpenAt: (r.sales_open_at as string | null) ?? null, salesCloseAt: (r.sales_close_at as string | null) ?? null,
    hasAccessCode: !!r.access_code, sort: (r.sort as number) ?? 0, active: !!r.active, sold,
  };
}

/** Tiers for an event with their sold/held counts. Empty ⇒ the event is free. */
export async function listTiers(type: EventType, eventId: string, opts: { includeInactive?: boolean } = {}): Promise<TicketTier[]> {
  const svc = createServiceClient();
  let q = svc.from("gs_ticket_tiers").select("*").eq("event_type", type).eq("event_id", eventId).order("sort");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) return []; // pre-migration → treat as a free event
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const { data: orders } = await svc.from("gs_ticket_orders").select("tier_id, quantity, status, expires_at").eq("event_type", type).eq("event_id", eventId);
  const now = Date.now();
  const sold = new Map<string, number>();
  for (const o of (orders ?? []) as { tier_id: string; quantity: number; status: string; expires_at: string | null }[]) {
    const counts = o.status === "paid" || (o.status === "held" && o.expires_at && Date.parse(o.expires_at) > now);
    if (counts) sold.set(o.tier_id, (sold.get(o.tier_id) ?? 0) + o.quantity);
  }
  return rows.map((r) => tierRow(r, sold.get(r.id as string) ?? 0));
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
  subtotalCents: number; platformFeeCents: number; processingFeeCents: number;
  buyerTotalCents: number; organizerNetCents: number;
  feePayer: "buyer" | "organizer"; feePlanId: PlanId; feeBps: number; feeFixedCents: number;
}

/** What the buyer pays and the organizer nets, from the organizer's plan levers. */
export async function quoteTickets(type: EventType, eventId: string, tierId: string, quantity: number): Promise<TicketQuote> {
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
  const subtotalCents = tier.amountCents * qty;
  const fee = await computePlatformFee(tier.amountCents, feePlanId);
  const platformFeeCents = fee.feeCents * qty;
  const procBps = await lever("processing_fee_bps", 290);
  const procFixed = await lever("processing_fee_fixed_cents", 30);
  const ticketing = await getTicketing(type, eventId);

  // Buyer-pays: fees ride on top of face value. Organizer-pays: they come out of it.
  const processingBase = ticketing.feePayer === "buyer" ? subtotalCents + platformFeeCents : subtotalCents;
  const processingFeeCents = subtotalCents === 0 ? 0 : Math.round((processingBase * procBps) / 10_000) + procFixed;
  const buyerTotalCents = ticketing.feePayer === "buyer" ? subtotalCents + platformFeeCents + processingFeeCents : subtotalCents;
  const organizerNetCents = buyerTotalCents - platformFeeCents - processingFeeCents;

  return { tierId: tier.id, quantity: qty, currency: tier.currency, subtotalCents, platformFeeCents, processingFeeCents, buyerTotalCents, organizerNetCents, feePayer: ticketing.feePayer, feePlanId, feeBps: fee.bps, feeFixedCents: fee.fixedCents };
}

export interface CheckoutArgs { type: EventType; eventId: string; tierId: string; quantity: number; buyerUserId: string | null; buyerEmail: string | null; buyerName: string | null; accessCode?: string | null }

/** Hold the seats and open a Stripe Checkout on the organizer's account. */
export async function createTicketCheckout(args: CheckoutArgs): Promise<{ url: string; orderId: string }> {
  const svc = createServiceClient();
  const meta = await getEventMeta(args.type, args.eventId);
  if (!meta) throw new Error("event_not_found");
  const account = await getConnectAccount(meta.ownerId);
  if (!account?.chargesEnabled) throw new Error("organizer_not_ready");

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

  const quote = await quoteTickets(args.type, args.eventId, args.tierId, args.quantity);
  // Capacity: tier quantity AND the event's own seat count (held seats included).
  if (tier.quantity != null && tier.sold + quote.quantity > tier.quantity) throw new Error("tier_sold_out");
  if (meta.capacity != null) {
    const taken = countTaken(args.type, await listAttendees(args.type, args.eventId));
    const heldElsewhere = tiers.reduce((n, t) => n + t.sold, 0);
    if (taken + heldElsewhere + quote.quantity > meta.capacity) throw new Error("event_full");
  }

  const holdMinutes = await lever("ticket_hold_minutes", 10);
  const expiresAt = new Date(now + holdMinutes * 60_000);
  const { data: order, error } = await svc.from("gs_ticket_orders").insert({
    event_type: args.type, event_id: args.eventId, tier_id: tier.id,
    buyer_user_id: args.buyerUserId, buyer_email: args.buyerEmail, buyer_name: args.buyerName,
    quantity: quote.quantity, unit_amount_cents: tier.amountCents, subtotal_cents: quote.subtotalCents,
    platform_fee_cents: quote.platformFeeCents, fee_plan_id: quote.feePlanId, fee_bps: quote.feeBps, fee_fixed_cents: quote.feeFixedCents,
    currency: tier.currency, status: "held", expires_at: expiresAt.toISOString(), stripe_account_id: account.stripeAccountId,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const base = getBaseUrl();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Stripe's own expiry keeps the session in step with our hold.
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    customer_email: args.buyerEmail ?? undefined,
    line_items: [{
      quantity: quote.quantity,
      price_data: {
        currency: tier.currency,
        unit_amount: quote.feePayer === "buyer" ? tier.amountCents + Math.round(quote.platformFeeCents / quote.quantity) : tier.amountCents,
        product_data: { name: `${meta.title} — ${tier.name}`, description: tier.description ?? undefined },
      },
    }],
    payment_intent_data: {
      application_fee_amount: quote.platformFeeCents,
      transfer_data: { destination: account.stripeAccountId },
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
  const svc = createServiceClient();
  const { data: order } = await svc.from("gs_ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status === "paid") return { ok: true }; // replayed webhook

  const type = order.event_type as EventType;
  const eventId = order.event_id as string;
  const attendeeKey = await seatBuyer(type, eventId, order as Record<string, unknown>);
  await svc.from("gs_ticket_orders").update({
    status: "paid", paid_at: new Date().toISOString(), attendee_key: attendeeKey,
    stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  return { ok: true };
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
export async function refundOrder(orderId: string, actorId: string | null, byOrganizer: boolean): Promise<{ ok: boolean; reason?: string }> {
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

  const pi = row.stripe_payment_intent_id as string | null;
  if (pi) {
    // Money first: if Stripe won't refund, the order stays paid and the seat stays
    // taken rather than the two going out of sync.
    try {
      await getStripe().refunds.create({ payment_intent: pi, refund_application_fee: true, reverse_transfer: true });
    } catch (e) {
      console.error("[tickets] Stripe refund failed:", e instanceof Error ? e.message : e);
      return { ok: false, reason: "stripe_refund_failed" };
    }
  }
  await svc.from("gs_ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString(), refund_amount_cents: row.subtotal_cents as number, updated_at: new Date().toISOString() }).eq("id", orderId);
  // Free the seat: drop the attendee row the order created.
  const key = row.attendee_key as string | null;
  if (key) {
    if (type === "tournament") await svc.from("tournament_participants").update({ status: "dropped" }).eq("id", key);
    else {
      const [, userId] = key.split(":");
      if (userId) await svc.from("board_game_night_rsvps").update({ status: "declined" }).eq("night_id", eventId).eq("user_id", userId);
    }
  }
  return { ok: true };
}

export function toOrder(r: Record<string, unknown>): TicketOrder {
  return {
    id: r.id as string, eventType: r.event_type as EventType, eventId: r.event_id as string, tierId: r.tier_id as string,
    buyerUserId: (r.buyer_user_id as string | null) ?? null, buyerEmail: (r.buyer_email as string | null) ?? null, buyerName: (r.buyer_name as string | null) ?? null,
    quantity: r.quantity as number, unitAmountCents: r.unit_amount_cents as number, subtotalCents: r.subtotal_cents as number,
    platformFeeCents: (r.platform_fee_cents as number) ?? 0, currency: (r.currency as string) ?? "usd",
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
