import "server-only";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { subscriptionIdOf } from "@/lib/stripe/payload";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

/**
 * Stripe's fraud warnings and disputes, from the webhook
 * (radar.early_fraud_warning.created, charge.dispute.created, charge.dispute.closed).
 *
 * A fraud warning means the card's bank says the payment was made with a stolen
 * card. We refund it straight away (reason "fraudulent", which also teaches
 * Radar), because a refund now costs nothing and a dispute later costs $15 even
 * when we win, and we cancel any subscription that charge paid for so the card
 * isn't billed again. A dispute can't be refunded away: we tell Britton (email +
 * Sentry) with the deadline, and cancel the subscription when the reason is
 * fraud. The refund and cancel fire the usual charge.refunded and
 * customer.subscription.deleted events, so shop orders, support and GS Pro update
 * themselves through their existing handlers.
 */

const ALERT_TO = "support@gameshuffle.co";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dashboard = (livemode: boolean, path: string) => `https://dashboard.stripe.com/${livemode ? "" : "test/"}${path}`;
const idOf = (x: string | { id: string } | null | undefined): string | null => (typeof x === "string" ? x : x?.id ?? null);
const pacific = (unix: number) => new Date(unix * 1000).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " Pacific";

/** Subscription states that can still charge the card. */
const LIVE_SUB = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

/** The subscription a charge paid for, if any (through its invoice: charges no longer carry the invoice since Stripe's 2025 API). */
async function subscriptionForCharge(charge: Stripe.Charge): Promise<Stripe.Subscription | null> {
  const intent = idOf(charge.payment_intent);
  if (!intent) return null;
  const stripe = getStripe();
  const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intent }, limit: 1 }).catch(() => null);
  const invoiceId = idOf(payments?.data[0]?.invoice as string | { id: string } | undefined);
  if (!invoiceId) return null;
  const invoice = await stripe.invoices.retrieve(invoiceId).catch(() => null);
  const subId = invoice ? subscriptionIdOf(invoice) : null;
  return subId ? stripe.subscriptions.retrieve(subId).catch(() => null) : null;
}

/** Cancels a subscription that can still charge; true when it did. */
async function stopSubscription(sub: Stripe.Subscription | null): Promise<boolean> {
  if (!sub || !LIVE_SUB.has(sub.status)) return false;
  try {
    await getStripe().subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
    return true;
  } catch (err) {
    console.error("[stripe-fraud] couldn't cancel subscription", sub.id, err);
    return false;
  }
}

/** What the payment was for, in words. */
function whatFor(charge: Stripe.Charge | null, sub: Stripe.Subscription | null): string {
  const kind = charge?.metadata?.gs_kind ?? sub?.metadata?.gs_kind ?? null;
  if (kind === "support") return sub ? "Monthly support" : "One-time support";
  if (kind === "shop") return "A shop order";
  if (kind === "ticket") return "An event ticket";
  if (sub) return "A subscription (GS Pro or Circuit)";
  return charge?.description || "A payment";
}

function payerLine(charge: Stripe.Charge | null): string {
  const d = charge?.billing_details;
  const where = [d?.address?.state, d?.address?.country].filter(Boolean).join(", ");
  return [d?.email, where].filter(Boolean).join(" · ") || "unknown";
}

function report(message: string, tags: Record<string, string>) {
  try {
    Sentry.captureMessage(message, { level: "warning", tags: { area: "payments", ...tags } });
  } catch {
    /* reporting must never break the webhook */
  }
}

async function alert(subject: string, lines: string[]) {
  const res = await sendTransactionalEmail({ to: ALERT_TO, subject, text: lines.join("\n") });
  if (!res.ok) console.error("[stripe-fraud] alert email failed:", res.error, subject);
}

/** radar.early_fraud_warning.created: refund, stop any subscription, tell Britton (once per warning). */
export async function handleEarlyFraudWarning(efw: Stripe.Radar.EarlyFraudWarning): Promise<void> {
  const stripe = getStripe();
  const chargeId = idOf(efw.charge);
  if (!chargeId) return;
  const charge = await stripe.charges.retrieve(chargeId);
  const sub = await subscriptionForCharge(charge);
  const done: string[] = [];
  let firstTime = true;

  if (efw.actionable && !charge.refunded && !charge.disputed) {
    const refund = await stripe.refunds.create(
      { charge: chargeId, reason: "fraudulent", metadata: { gs_reason: "early_fraud_warning", gs_efw: efw.id } },
      { idempotencyKey: `efw-refund-${efw.id}` },
    );
    // A retried webhook replays the same refund: everything below already happened once.
    firstTime = refund.lastResponse?.headers?.["idempotent-replayed"] !== "true";
    done.push(`Refunded ${money(charge.amount - charge.amount_refunded)} in full, so it can't turn into a dispute.`);
  } else {
    done.push(charge.disputed ? "Not refunded: it's already disputed, so answer the dispute instead." : "Not refunded: it had already been refunded.");
  }
  if (await stopSubscription(sub)) done.push("Canceled the subscription it paid for, so the card isn't charged again.");
  if (!firstTime) return;

  report("Stripe fraud warning", { stripe_event: "early_fraud_warning", fraud_type: efw.fraud_type });
  await alert(`Fraud warning on a ${money(charge.amount)} payment`, [
    `The card's bank says this payment was made with a stolen card (${efw.fraud_type.replace(/_/g, " ")}).`,
    "",
    `What it was for: ${whatFor(charge, sub)}`,
    `Payer: ${payerLine(charge)}`,
    "",
    "What happened automatically:",
    ...done.map((d) => `- ${d}`),
    "",
    `In Stripe: ${dashboard(efw.livemode, `payments/${idOf(charge.payment_intent) ?? chargeId}`)}`,
  ]);
}

/** charge.dispute.created: tell Britton with the deadline; a fraud dispute also stops any subscription. */
export async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const stripe = getStripe();
  const chargeId = idOf(dispute.charge);
  const charge = chargeId ? await stripe.charges.retrieve(chargeId).catch(() => null) : null;
  const sub = charge ? await subscriptionForCharge(charge) : null;
  const stopped = dispute.reason === "fraudulent" ? await stopSubscription(sub) : false;
  const due = dispute.evidence_details?.due_by ?? null;

  report("Stripe dispute opened", { stripe_event: "dispute_created", dispute_reason: dispute.reason });
  await alert(`Dispute: ${money(dispute.amount)} (${dispute.reason.replace(/_/g, " ")})${due ? `, respond by ${pacific(due)}` : ""}`, [
    `A customer disputed a ${money(dispute.amount)} payment with their bank. Reason: ${dispute.reason.replace(/_/g, " ")}.`,
    "",
    `What it was for: ${whatFor(charge, sub)}`,
    `Payer: ${payerLine(charge)}`,
    ...(stopped ? ["", "Canceled the subscription it paid for, so the card isn't charged again."] : []),
    "",
    due ? `Send evidence in Stripe before ${pacific(due)}, or it's lost automatically.` : "Check Stripe for what's needed.",
    `In Stripe: ${dashboard(dispute.livemode, `disputes/${dispute.id}`)}`,
  ]);
}

/** charge.dispute.closed: the outcome. */
export async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const outcome = dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : dispute.status.replace(/_/g, " ");
  report(`Stripe dispute ${outcome}`, { stripe_event: "dispute_closed", dispute_status: dispute.status });
  await alert(`Dispute ${outcome}: ${money(dispute.amount)}`, [
    `The ${money(dispute.amount)} dispute (${dispute.reason.replace(/_/g, " ")}) is closed: ${outcome}.`,
    "",
    `In Stripe: ${dashboard(dispute.livemode, `disputes/${dispute.id}`)}`,
  ]);
}
