import "server-only";

/**
 * Platform ▸ Overview ▸ Revenue: what GameShuffle earns from subscriptions,
 * from the subscriptions mirror the Stripe webhook keeps (src/lib/stripe/
 * subscriptions.ts). Monthly revenue counts paying subscriptions only (active
 * or past due), at their plan's price (annual divided by 12), before tax and
 * Stripe's fees; trials are counted separately with what they'd add if they
 * stay. Stripe stays the source of truth for money actually collected.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { planFromStripePrice, type PlanId } from "@/lib/pricing/catalog";
import { gsAddDays, gsDay, gsDayStart } from "@/lib/time/gsClock";

export type RevenuePlan = "pro" | "pro_addon" | "circuit_64" | "circuit_256";

export const REVENUE_PLAN_LABEL: Record<RevenuePlan, string> = {
  pro: "GS Pro",
  pro_addon: "GS Pro add-on",
  circuit_64: "Circuit 64",
  circuit_256: "Circuit 256",
};

export interface RevenueOverview {
  /** Monthly recurring revenue from paying subscriptions, in cents. */
  mrrCents: number;
  paying: number;
  trialing: number;
  /** What trials add each month if they all stay, in cents. */
  trialMrrCents: number;
  trialsEndingThisWeek: number;
  cancelling: number;
  newPaid30d: number;
  churned30d: number;
  byPlan: { plan: RevenuePlan; label: string; paying: number; trialing: number; mrrCents: number; monthly: number; annual: number }[];
  funnel: { accounts: number; streamers: number; triedPro: number; paying: number };
  recent: { name: string; handle: string | null; plan: string; status: string; label: string; at: string }[];
}

const PAYING = new Set(["active", "past_due"]);
const DAY = 86_400_000;

interface SubRow {
  user_id: string;
  status: string;
  tier: string | null;
  product: string | null;
  price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Plan and monthly amount for a subscription: the pricing table by price, else its tier and period length. */
async function priceInfo(
  row: SubRow,
  cache: Map<string, { planId: PlanId; interval: string; amountCents: number } | null>,
  fallbackAmounts: Map<string, number>,
): Promise<{ plan: RevenuePlan; annual: boolean; monthlyCents: number }> {
  let resolved = row.price_id ? cache.get(row.price_id) : undefined;
  if (row.price_id && resolved === undefined) {
    resolved = await planFromStripePrice(row.price_id).catch(() => null);
    cache.set(row.price_id, resolved ?? null);
  }
  const tierPlan: RevenuePlan = row.tier === "circuit_64" || row.tier === "circuit_256" ? row.tier : "pro";
  const plan: RevenuePlan = resolved && (["pro", "pro_addon", "circuit_64", "circuit_256"] as string[]).includes(resolved.planId)
    ? (resolved.planId as RevenuePlan)
    : tierPlan;
  const periodDays = row.current_period_start && row.current_period_end
    ? (Date.parse(row.current_period_end) - Date.parse(row.current_period_start)) / DAY
    : 30;
  const annual = resolved ? resolved.interval === "year" : periodDays > 60;
  const amount = resolved?.amountCents ?? fallbackAmounts.get(`${plan}:${annual ? "year" : "month"}`) ?? 0;
  return { plan, annual, monthlyCents: annual ? Math.round(amount / 12) : amount };
}

export async function revenueOverview(): Promise<RevenueOverview> {
  const svc = createServiceClient();
  const [subsRes, pricesRes, accountsRes, streamersRes, triedRes] = await Promise.all([
    svc.from("subscriptions")
      .select("user_id, status, tier, product, price_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    svc.from("gs_pricing_prices").select("plan_id, interval, amount_cents").eq("active", true),
    svc.from("users").select("id", { count: "exact", head: true }),
    svc.from("twitch_connections").select("user_id", { count: "exact", head: true }),
    svc.from("users").select("id", { count: "exact", head: true }).eq("has_used_trial", true),
  ]);
  const subs = (subsRes.data ?? []) as SubRow[];
  const fallbackAmounts = new Map<string, number>();
  for (const p of (pricesRes.data ?? []) as { plan_id: string; interval: string; amount_cents: number }[]) {
    fallbackAmounts.set(`${p.plan_id}:${p.interval}`, p.amount_cents);
  }

  const cache = new Map<string, { planId: PlanId; interval: string; amountCents: number } | null>();
  const now = Date.now();
  const monthAgo = now - 30 * DAY;
  // Trials ending before the end of the seventh Pacific day from today.
  const weekAhead = gsDayStart(gsAddDays(gsDay(), 8)).getTime();
  const plans: RevenuePlan[] = ["pro", "pro_addon", "circuit_64", "circuit_256"];
  const byPlan = new Map(plans.map((p) => [p, { plan: p, label: REVENUE_PLAN_LABEL[p], paying: 0, trialing: 0, mrrCents: 0, monthly: 0, annual: 0 }]));

  let mrrCents = 0, paying = 0, trialing = 0, trialMrrCents = 0, trialsEndingThisWeek = 0, cancelling = 0, newPaid30d = 0, churned30d = 0;
  const infos = new Map<SubRow, Awaited<ReturnType<typeof priceInfo>>>();
  for (const row of subs) {
    const info = await priceInfo(row, cache, fallbackAmounts);
    infos.set(row, info);
    const bucket = byPlan.get(info.plan)!;
    if (PAYING.has(row.status)) {
      paying += 1;
      mrrCents += info.monthlyCents;
      bucket.paying += 1;
      bucket.mrrCents += info.monthlyCents;
      if (info.annual) bucket.annual += 1; else bucket.monthly += 1;
      if (row.cancel_at_period_end) cancelling += 1;
      if (Date.parse(row.created_at) >= monthAgo) newPaid30d += 1;
    } else if (row.status === "trialing") {
      trialing += 1;
      trialMrrCents += info.monthlyCents;
      bucket.trialing += 1;
      if (row.trial_end && Date.parse(row.trial_end) < weekAhead) trialsEndingThisWeek += 1;
      if (row.cancel_at_period_end) cancelling += 1;
    }
    if (row.canceled_at && Date.parse(row.canceled_at) >= monthAgo && !PAYING.has(row.status) && row.status !== "trialing") churned30d += 1;
  }

  const recentRows = subs.slice(0, 20);
  const ids = [...new Set(recentRows.map((r) => r.user_id))];
  const names = new Map<string, { name: string; handle: string | null }>();
  if (ids.length) {
    const { data } = await svc.from("users").select("id, display_name, username").in("id", ids);
    for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null }[]) {
      names.set(u.id, { name: u.display_name || u.username || "An account", handle: u.username });
    }
  }
  const STATUS: Record<string, string> = {
    active: "Paying", trialing: "On a trial", past_due: "Payment failed, retrying", canceled: "Cancelled",
    unpaid: "Unpaid", incomplete: "Checkout not finished", incomplete_expired: "Checkout expired", paused: "Paused",
  };
  const recent = recentRows.map((r) => {
    const info = infos.get(r)!;
    const who = names.get(r.user_id) ?? { name: "An account", handle: null };
    const label = r.cancel_at_period_end && (PAYING.has(r.status) || r.status === "trialing") ? "Cancels at the end of the period" : STATUS[r.status] ?? r.status;
    return { name: who.name, handle: who.handle, plan: `${REVENUE_PLAN_LABEL[info.plan]}${info.annual ? ", yearly" : ", monthly"}`, status: r.status, label, at: r.updated_at ?? r.created_at };
  });

  return {
    mrrCents, paying, trialing, trialMrrCents, trialsEndingThisWeek, cancelling, newPaid30d, churned30d,
    byPlan: plans.map((p) => byPlan.get(p)!),
    funnel: { accounts: accountsRes.count ?? 0, streamers: streamersRes.count ?? 0, triedPro: triedRes.count ?? 0, paying },
    recent,
  };
}
