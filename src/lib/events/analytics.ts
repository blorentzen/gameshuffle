import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { getConnectAccount, toOrder, type TicketOrder } from "./tickets";
import type { EventType } from "./calendar";

/**
 * Ticket sales analytics: the organizer's view of their own events, and the
 * platform's view of every organizer.
 *
 * Money is read back off `gs_ticket_orders`, where each order froze its own
 * fees at purchase time, so later lever edits never rewrite history. Stripe is
 * asked only about things it alone knows: the connected account's balance and
 * its actual payouts.
 */

const DAY = 86_400_000;

/**
 * The window starts at the beginning of the day `days - 1` ago, so the buckets
 * run up to and including TODAY. Anchoring it to "now minus N days" instead
 * puts today's sales past the last bucket: they land in the totals but vanish
 * from the chart, and the two stop agreeing.
 *
 * UTC, because the buckets are keyed by the UTC date in `paid_at`.
 */
function windowFrom(days: number): number {
  return Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - (days - 1) * DAY;
}

export interface SalesPoint { date: string; grossCents: number; netCents: number; feesCents: number; tickets: number }
export interface SalesTotals {
  orders: number; tickets: number;
  grossCents: number; feesCents: number; netCents: number; refundedCents: number;
  avgOrderCents: number; refundRate: number;
}
export interface EventSales { type: EventType; id: string; title: string; href: string; startsAt: string | null; tickets: number; grossCents: number; netCents: number; refundedCents: number }

export interface OrganizerAnalytics {
  days: number;
  totals: SalesTotals;
  /** The same window immediately before, for period-on-period change. */
  previous: { grossCents: number; netCents: number; tickets: number };
  series: SalesPoint[];
  byEvent: EventSales[];
  byTier: { name: string; tickets: number; grossCents: number }[];
  payouts: {
    availableCents: number; pendingCents: number; currency: string;
    recent: { id: string; amountCents: number; status: string; arrivalDate: string | null }[];
  } | null;
}

function emptyTotals(): SalesTotals {
  return { orders: 0, tickets: 0, grossCents: 0, feesCents: 0, netCents: 0, refundedCents: 0, avgOrderCents: 0, refundRate: 0 };
}

function summarise(orders: TicketOrder[]): SalesTotals {
  const paid = orders.filter((o) => o.status === "paid");
  const refunded = orders.filter((o) => o.status === "refunded");
  const grossCents = paid.reduce((n, o) => n + o.buyerTotalCents, 0);
  const feesCents = paid.reduce((n, o) => n + o.platformFeeCents + o.processingFeeCents, 0);
  const refundedCents = refunded.reduce((n, o) => n + o.buyerTotalCents, 0);
  return {
    orders: paid.length,
    tickets: paid.reduce((n, o) => n + o.quantity, 0),
    grossCents, feesCents, netCents: grossCents - feesCents, refundedCents,
    avgOrderCents: paid.length > 0 ? Math.round(grossCents / paid.length) : 0,
    refundRate: paid.length + refunded.length > 0 ? refunded.length / (paid.length + refunded.length) : 0,
  };
}

/** One bucket per day across the whole window, so a quiet day is a zero, not a gap. */
function daily(orders: TicketOrder[], from: number, days: number): SalesPoint[] {
  const buckets = new Map<string, SalesPoint>();
  for (let i = 0; i < days; i++) {
    const date = new Date(from + i * DAY).toISOString().slice(0, 10);
    buckets.set(date, { date, grossCents: 0, netCents: 0, feesCents: 0, tickets: 0 });
  }
  for (const o of orders) {
    if (o.status !== "paid" || !o.paidAt) continue;
    const b = buckets.get(o.paidAt.slice(0, 10));
    if (!b) continue;
    b.grossCents += o.buyerTotalCents;
    b.feesCents += o.platformFeeCents + o.processingFeeCents;
    b.netCents += o.buyerTotalCents - o.platformFeeCents - o.processingFeeCents;
    b.tickets += o.quantity;
  }
  return [...buckets.values()];
}

/** The events this user runs, either type. */
async function ownedEvents(userId: string) {
  const svc = createServiceClient();
  const [tournaments, nights] = await Promise.all([
    svc.from("tournaments").select("id, title, date_time").eq("organizer_id", userId),
    svc.from("board_game_nights").select("id, title, starts_at").eq("host_id", userId),
  ]);
  return [
    ...((tournaments.data ?? []) as Record<string, unknown>[]).map((r) => ({ type: "tournament" as EventType, id: r.id as string, title: r.title as string, startsAt: (r.date_time as string | null) ?? null, href: `/tournament/${r.id}` })),
    ...((nights.data ?? []) as Record<string, unknown>[]).map((r) => ({ type: "game-night" as EventType, id: r.id as string, title: r.title as string, startsAt: (r.starts_at as string | null) ?? null, href: `/game-nights/${r.id}` })),
  ];
}

export async function organizerAnalytics(userId: string, days = 30): Promise<OrganizerAnalytics> {
  const svc = createServiceClient();
  const owned = await ownedEvents(userId);
  const from = windowFrom(days);
  const windowStart = new Date(from).toISOString();
  const prevStart = new Date(from - days * DAY).toISOString();

  if (owned.length === 0) {
    return { days, totals: emptyTotals(), previous: { grossCents: 0, netCents: 0, tickets: 0 }, series: daily([], from, days), byEvent: [], byTier: [], payouts: await payoutStatus(userId) };
  }

  const ids = owned.map((e) => e.id);
  const { data } = await svc.from("gs_ticket_orders").select("*").in("event_id", ids).in("status", ["paid", "refunded"]).gte("created_at", prevStart);
  const all = ((data ?? []) as Record<string, unknown>[]).map(toOrder);
  const inWindow = all.filter((o) => (o.paidAt ?? o.createdAt) >= windowStart);
  const inPrevious = all.filter((o) => (o.paidAt ?? o.createdAt) < windowStart);

  // Tier names, for the mix breakdown.
  const { data: tierRows } = await svc.from("gs_ticket_tiers").select("id, name").in("event_id", ids);
  const tierNames = new Map(((tierRows ?? []) as Record<string, unknown>[]).map((t) => [t.id as string, t.name as string]));
  const byTier = new Map<string, { name: string; tickets: number; grossCents: number }>();
  for (const o of inWindow.filter((x) => x.status === "paid")) {
    const name = tierNames.get(o.tierId) ?? "Ticket";
    const row = byTier.get(name) ?? { name, tickets: 0, grossCents: 0 };
    row.tickets += o.quantity;
    row.grossCents += o.buyerTotalCents;
    byTier.set(name, row);
  }

  const byEvent = owned.map((e) => {
    const mine = inWindow.filter((o) => o.eventId === e.id && o.eventType === e.type);
    const t = summarise(mine);
    return { ...e, tickets: t.tickets, grossCents: t.grossCents, netCents: t.netCents, refundedCents: t.refundedCents };
  }).filter((e) => e.tickets > 0 || e.refundedCents > 0)
    .sort((a, b) => b.grossCents - a.grossCents);

  const prev = summarise(inPrevious);
  return {
    days,
    totals: summarise(inWindow),
    previous: { grossCents: prev.grossCents, netCents: prev.netCents, tickets: prev.tickets },
    series: daily(inWindow, from, days),
    byEvent,
    byTier: [...byTier.values()].sort((a, b) => b.grossCents - a.grossCents),
    payouts: await payoutStatus(userId),
  };
}

/** Balance and recent payouts, straight from the organizer's connected account. */
async function payoutStatus(userId: string): Promise<OrganizerAnalytics["payouts"]> {
  const account = await getConnectAccount(userId);
  if (!account) return null;
  try {
    const stripe = getStripe();
    const opts = { stripeAccount: account.stripeAccountId };
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve(undefined, opts),
      stripe.payouts.list({ limit: 5 }, opts),
    ]);
    return {
      availableCents: balance.available.reduce((n, b) => n + b.amount, 0),
      pendingCents: balance.pending.reduce((n, b) => n + b.amount, 0),
      currency: balance.available[0]?.currency ?? "usd",
      recent: payouts.data.map((p) => ({
        id: p.id, amountCents: p.amount, status: p.status,
        arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
      })),
    };
  } catch (e) {
    console.error("[analytics] payout status unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── platform view (staff) ───────────────────────────────────────────────────

export interface PlatformTicketing {
  days: number;
  totals: SalesTotals & { organizers: number; events: number };
  previous: { grossCents: number; feesCents: number; tickets: number };
  series: SalesPoint[];
  topOrganizers: { userId: string; name: string; tickets: number; grossCents: number; feesCents: number }[];
  topEvents: { title: string; href: string; tickets: number; grossCents: number }[];
  connect: { accounts: number; ready: number; pending: number };
}

/** GMV, the fees GameShuffle actually earned, and who is driving them. */
export async function platformTicketing(days = 30): Promise<PlatformTicketing> {
  const svc = createServiceClient();
  const from = windowFrom(days);
  const windowStart = new Date(from).toISOString();
  const prevStart = new Date(from - days * DAY).toISOString();

  const [{ data: orderRows }, { data: accountRows }] = await Promise.all([
    svc.from("gs_ticket_orders").select("*").in("status", ["paid", "refunded"]).gte("created_at", prevStart),
    svc.from("gs_connect_accounts").select("user_id, transfers_enabled, charges_enabled"),
  ]);
  const all = ((orderRows ?? []) as Record<string, unknown>[]).map(toOrder);
  const inWindow = all.filter((o) => (o.paidAt ?? o.createdAt) >= windowStart);
  const prev = summarise(all.filter((o) => (o.paidAt ?? o.createdAt) < windowStart));

  // Resolve each event to its title and owner in two reads, not one per order.
  const tournamentIds = [...new Set(inWindow.filter((o) => o.eventType === "tournament").map((o) => o.eventId))];
  const nightIds = [...new Set(inWindow.filter((o) => o.eventType === "game-night").map((o) => o.eventId))];
  const [tournaments, nights] = await Promise.all([
    tournamentIds.length ? svc.from("tournaments").select("id, title, organizer_id").in("id", tournamentIds) : Promise.resolve({ data: [] }),
    nightIds.length ? svc.from("board_game_nights").select("id, title, host_id").in("id", nightIds) : Promise.resolve({ data: [] }),
  ]);
  const meta = new Map<string, { title: string; owner: string; href: string }>();
  for (const r of (tournaments.data ?? []) as Record<string, unknown>[]) meta.set(`tournament:${r.id}`, { title: r.title as string, owner: r.organizer_id as string, href: `/tournament/${r.id}` });
  for (const r of (nights.data ?? []) as Record<string, unknown>[]) meta.set(`game-night:${r.id}`, { title: r.title as string, owner: r.host_id as string, href: `/game-nights/${r.id}` });

  const paid = inWindow.filter((o) => o.status === "paid");
  const byOrganizer = new Map<string, { tickets: number; grossCents: number; feesCents: number }>();
  const byEvent = new Map<string, { title: string; href: string; tickets: number; grossCents: number }>();
  for (const o of paid) {
    const m = meta.get(`${o.eventType}:${o.eventId}`);
    if (!m) continue;
    const org = byOrganizer.get(m.owner) ?? { tickets: 0, grossCents: 0, feesCents: 0 };
    org.tickets += o.quantity; org.grossCents += o.buyerTotalCents; org.feesCents += o.platformFeeCents + o.processingFeeCents;
    byOrganizer.set(m.owner, org);
    const ev = byEvent.get(`${o.eventType}:${o.eventId}`) ?? { title: m.title, href: m.href, tickets: 0, grossCents: 0 };
    ev.tickets += o.quantity; ev.grossCents += o.buyerTotalCents;
    byEvent.set(`${o.eventType}:${o.eventId}`, ev);
  }

  const organizerIds = [...byOrganizer.keys()];
  const { data: users } = organizerIds.length
    ? await svc.from("users").select("id, display_name, username").in("id", organizerIds)
    : { data: [] };
  const names = new Map(((users ?? []) as Record<string, unknown>[]).map((u) => [u.id as string, (u.display_name as string | null) || (u.username as string | null) || "Organizer"]));

  const totals = summarise(inWindow);
  const accounts = (accountRows ?? []) as Record<string, unknown>[];
  const ready = accounts.filter((a) => a.transfers_enabled || a.charges_enabled).length;

  return {
    days,
    totals: { ...totals, organizers: byOrganizer.size, events: byEvent.size },
    previous: { grossCents: prev.grossCents, feesCents: prev.feesCents, tickets: prev.tickets },
    series: daily(inWindow, from, days),
    topOrganizers: [...byOrganizer.entries()]
      .map(([userId, v]) => ({ userId, name: names.get(userId) ?? "Organizer", ...v }))
      .sort((a, b) => b.grossCents - a.grossCents).slice(0, 10),
    topEvents: [...byEvent.values()].sort((a, b) => b.grossCents - a.grossCents).slice(0, 10),
    connect: { accounts: accounts.length, ready, pending: accounts.length - ready },
  };
}
