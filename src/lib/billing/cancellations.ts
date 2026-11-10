/**
 * Why people cancel GS Pro, GS Circuit and monthly support (subscription_cancellations,
 * supabase/leave-reasons-m1.sql). Two ways in:
 *
 *   ours    the "Before you go" window (POST /api/account/leave-feedback) saves the reason and comment
 *           just before Stripe's cancel page opens; cancel_at stays empty until Stripe confirms
 *   stripe  the subscription webhook: when a subscription becomes set to cancel or is deleted, Stripe's
 *           cancellation_details (the portal's own reason question) merge into our row, or make one when
 *           there's no row of ours and the portal had a reason or comment. Our reason and comment always
 *           win; Stripe's comment only fills an empty one.
 *
 * A subscription that stops ending (the person kept their plan) has its cancel_at cleared, so a row with
 * no cancel_at is someone who started to cancel and stayed. Service role only. A missing table is logged
 * once and skipped: nothing here ever fails a webhook.
 */

import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { cancellationOf } from "@/lib/stripe/payload";
import {
  LEAVE_COMMENT_MAX,
  LEAVE_PRODUCT_LABELS,
  cancellationKey,
  leaveReasonLabel,
  type LeaveProduct,
  type LeaveReason,
} from "@/lib/account/leaveReasons";

const TABLE = "subscription_cancellations";
const COLS = "user_id, subscription_id, product, reason, stripe_feedback, comment, source, cancel_at, created_at";
/** Statuses a member can still cancel from. */
const LIVE = ["trialing", "active", "past_due"];

export interface CancellationRow {
  user_id: string | null;
  subscription_id: string;
  product: LeaveProduct;
  reason: string | null;
  stripe_feedback: string | null;
  comment: string | null;
  source: "ours" | "stripe";
  cancel_at: string | null;
  created_at?: string;
}

type DbError = { code?: string; message?: string } | null;

/** The table isn't there yet (before leave-reasons-m1.sql). */
export function cancellationsMissing(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /subscription_cancellations/.test(message) && /does not exist|schema cache/.test(message);
}

let warned = false;
function warnMissing(where: string) {
  if (warned) return;
  warned = true;
  console.warn(`[cancellations] subscription_cancellations is missing (run supabase/leave-reasons-m1.sql); skipping ${where}.`);
}

const iso = (seconds: number | null | undefined) => (seconds && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null);
const cap = (text: string | null | undefined) => (text ? text.trim().slice(0, LEAVE_COMMENT_MAX).trim() || null : null);

// ── The member's side ──────────────────────────────────────────────────────

export interface LiveSubscription {
  id: string;
  customer: string | null;
  /** Already set to end (cancel_at_period_end): Stripe's cancel page would refuse it. */
  ending: boolean;
  /** When the current period (or trial) ends, ISO. */
  endsAt: string | null;
}

/**
 * The account's subscription for a product that can still be cancelled: GS Pro and GS Circuit from the
 * subscriptions mirror, monthly support from support_subscriptions. With `subscriptionId`, only that one
 * (and only if it's this account's). Newest first.
 */
export async function liveSubscriptionFor(userId: string, product: LeaveProduct, subscriptionId?: string | null): Promise<LiveSubscription | null> {
  const admin = createServiceClient();
  if (product === "support") {
    let q = admin.from("support_subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, cancel_at_period_end, current_period_end")
      .eq("user_id", userId).in("status", LIVE);
    if (subscriptionId) q = q.eq("stripe_subscription_id", subscriptionId);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data?.stripe_subscription_id) return null;
    return { id: data.stripe_subscription_id as string, customer: (data.stripe_customer_id as string | null) ?? null, ending: !!data.cancel_at_period_end, endsAt: (data.current_period_end as string | null) ?? null };
  }
  let q = admin.from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, status, cancel_at_period_end, current_period_end, trial_end")
    .eq("user_id", userId).eq("product", product).in("status", LIVE);
  if (subscriptionId) q = q.eq("stripe_subscription_id", subscriptionId);
  const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.stripe_subscription_id) return null;
  const endsAt = data.status === "trialing" ? (data.trial_end as string | null) ?? (data.current_period_end as string | null) : (data.current_period_end as string | null);
  return { id: data.stripe_subscription_id as string, customer: (data.stripe_customer_id as string | null) ?? null, ending: !!data.cancel_at_period_end, endsAt: endsAt ?? null };
}

/**
 * Save the Before you go answer for a subscription (source "ours"). A second try replaces the first;
 * anything Stripe already added (its feedback) stays.
 */
export async function saveLeaveFeedback(args: { userId: string; product: LeaveProduct; subscriptionId: string; reason: LeaveReason | null; comment: string | null }): Promise<{ ok: true } | { ok: false; error: "not_ready" | "save_failed" }> {
  const row = {
    user_id: args.userId,
    subscription_id: args.subscriptionId,
    product: args.product,
    reason: args.reason,
    comment: cap(args.comment),
    source: "ours" as const,
    // Not cancelled until Stripe says so (the webhook sets it).
    cancel_at: null,
  };
  const { error } = await createServiceClient().from(TABLE).upsert(row, { onConflict: "subscription_id" });
  if (!error) return { ok: true };
  if (cancellationsMissing(error)) { warnMissing("the Before you go answer"); return { ok: false, error: "not_ready" }; }
  console.error("[cancellations] save failed:", error);
  return { ok: false, error: "save_failed" };
}

// ── Stripe's side (the webhook) ────────────────────────────────────────────

export interface StripeCancellation {
  subscriptionId: string;
  product: LeaveProduct;
  userId: string | null;
  feedback: string | null;
  comment: string | null;
  /** Unix seconds. */
  cancelAt: number | null;
}

/**
 * The row to save when Stripe says a subscription is ending, merged into what's there: our reason and
 * comment stay, Stripe's feedback is added, Stripe's comment only fills an empty one. Null when there's
 * nothing to save (no row of ours and Stripe had neither a reason nor a comment). Pure.
 */
export function stripeCancellationRow(existing: Omit<CancellationRow, "subscription_id" | "created_at"> | null, incoming: StripeCancellation): CancellationRow | null {
  const feedback = incoming.feedback || null;
  const comment = cap(incoming.comment);
  if (!existing && !feedback && !comment) return null;
  const cancelAt = iso(incoming.cancelAt);
  if (!existing) {
    return { user_id: incoming.userId, subscription_id: incoming.subscriptionId, product: incoming.product, reason: null, stripe_feedback: feedback, comment, source: "stripe", cancel_at: cancelAt };
  }
  return {
    user_id: existing.user_id ?? incoming.userId,
    subscription_id: incoming.subscriptionId,
    product: incoming.product,
    reason: existing.reason,
    stripe_feedback: feedback ?? existing.stripe_feedback,
    comment: existing.comment ?? comment,
    source: existing.source,
    cancel_at: cancelAt ?? existing.cancel_at ?? new Date().toISOString(),
  };
}

/**
 * From the subscription webhook (updated and deleted): note a cancel, with whatever reason Stripe has,
 * or clear cancel_at when the subscription is no longer ending. Never throws.
 */
export async function recordStripeCancellation(args: { sub: Stripe.Subscription; product: LeaveProduct; userId: string | null }): Promise<"saved" | "cleared" | "skipped"> {
  try {
    const { sub, product } = args;
    const c = cancellationOf(sub);
    const admin = createServiceClient();
    if (!c.ending) {
      // Kept their plan (reactivated before it ended): no longer a cancellation.
      const { data, error } = await admin.from(TABLE).update({ cancel_at: null }).eq("subscription_id", sub.id).not("cancel_at", "is", null).select("subscription_id");
      if (error) { if (cancellationsMissing(error)) warnMissing("cancellations"); else console.error("[cancellations] clear failed:", error); return "skipped"; }
      return data?.length ? "cleared" : "skipped";
    }
    const { data: existing, error: readError } = await admin.from(TABLE).select(COLS).eq("subscription_id", sub.id).maybeSingle();
    if (readError) { if (cancellationsMissing(readError)) warnMissing("cancellations"); else console.error("[cancellations] read failed:", readError); return "skipped"; }
    const row = stripeCancellationRow((existing as CancellationRow | null) ?? null, {
      subscriptionId: sub.id, product, userId: args.userId, feedback: c.feedback, comment: c.comment, cancelAt: c.cancelAt,
    });
    if (!row) return "skipped";
    const save = (r: CancellationRow) => admin.from(TABLE).upsert(r, { onConflict: "subscription_id" });
    let { error } = await save(row);
    // The account is gone (deleted before Stripe's event arrived): keep the reason without the link.
    if (error?.code === "23503") ({ error } = await save({ ...row, user_id: null }));
    if (error) { if (cancellationsMissing(error)) warnMissing("cancellations"); else console.error("[cancellations] save failed:", error); return "skipped"; }
    return "saved";
  } catch (err) {
    console.error("[cancellations] record failed:", err);
    return "skipped";
  }
}

// ── Staff (Platform ▸ Overview ▸ Revenue) ─────────────────────────────────

export interface CancellationTallyRow { key: string; label: string; pro: number; circuit: number; support: number; total: number }
export interface CancellationComment { at: string; product: LeaveProduct; plan: string; reason: string; comment: string; status: "ending" | "ended" | "stayed"; cancelAt: string | null }
export interface CancellationSummary {
  ready: boolean;
  /** Confirmed by Stripe (cancel_at set). */
  cancelled: number;
  /** Opened Before you go (or the portal) and kept their plan. */
  stayed: number;
  tally: CancellationTallyRow[];
  latest: CancellationComment[];
}

const ORDER = ["not_using", "missing_features", "too_expensive", "found_alternative", "just_testing", "other"];

export function summarizeCancellations(rows: CancellationRow[], now = Date.now()): Omit<CancellationSummary, "ready"> {
  const tally = new Map<string, CancellationTallyRow>();
  let cancelled = 0;
  let stayed = 0;
  for (const r of rows) {
    if (!r.cancel_at) { stayed += 1; continue; }
    cancelled += 1;
    const key = cancellationKey(r.reason, r.stripe_feedback);
    const t = tally.get(key) ?? { key, label: key === "unspecified" ? "Not specified" : leaveReasonLabel(r.reason, r.stripe_feedback), pro: 0, circuit: 0, support: 0, total: 0 };
    if (r.product in LEAVE_PRODUCT_LABELS) t[r.product] += 1;
    t.total += 1;
    tally.set(key, t);
  }
  const rank = (key: string) => { const i = ORDER.indexOf(key.split(":")[0]); return i < 0 ? ORDER.length : i; };
  const latest = rows
    .filter((r) => !!r.comment)
    .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
    .slice(0, 20)
    .map((r): CancellationComment => ({
      at: r.created_at ?? "",
      product: r.product,
      plan: LEAVE_PRODUCT_LABELS[r.product] ?? r.product,
      reason: leaveReasonLabel(r.reason, r.stripe_feedback),
      comment: r.comment ?? "",
      status: !r.cancel_at ? "stayed" : Date.parse(r.cancel_at) > now ? "ending" : "ended",
      cancelAt: r.cancel_at,
    }));
  return {
    cancelled,
    stayed,
    tally: [...tally.values()].sort((a, b) => b.total - a.total || rank(a.key) - rank(b.key)),
    latest,
  };
}

export async function cancellationSummary(): Promise<CancellationSummary> {
  const admin = createServiceClient();
  const { data, error } = await readAllPages<CancellationRow>((from, to) =>
    admin.from(TABLE).select(COLS).order("created_at", { ascending: false }).order("subscription_id").range(from, to) as unknown as PromiseLike<{ data: CancellationRow[] | null; error: DbError & { message: string } }>,
  );
  if (error) {
    if (cancellationsMissing(error)) return { ready: false, cancelled: 0, stayed: 0, tally: [], latest: [] };
    throw new Error(error.message);
  }
  return { ready: true, ...summarizeCancellations(data) };
}
