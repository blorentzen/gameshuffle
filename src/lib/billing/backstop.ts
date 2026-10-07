import "server-only";

/**
 * The US-only backstop (specs/international-payments-plan.md). The checkout
 * gate reads the visitor's IP country, which a VPN or travel can get wrong;
 * the billing address Stripe collected is the evidence. When a paid-plan
 * checkout completes with a non-US billing address: cancel the subscription
 * at once, refund anything charged (a trial charges nothing), tell the
 * customer, and put them on the waitlist.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { isPaidPlanCountry } from "./availability";
import { joinPaidPlansWaitlist } from "./waitlist";

/** True when the session was outside the US and has been unwound (the caller then skips its normal sync). */
export async function unwindNonUsCheckout(session: Stripe.Checkout.Session): Promise<boolean> {
  const country = session.customer_details?.address?.country ?? null;
  if (isPaidPlanCountry(country)) return false;
  const stripe = getStripe();
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const product = session.metadata?.product === "circuit" ? "circuit" : "pro";

  if (subscriptionId) {
    await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false }).catch((e) => console.error("[us-backstop] cancel failed:", subscriptionId, e));
  }
  // Refund what this checkout charged (charges on the customer since the session started).
  let refunded = 0;
  if (customerId) {
    const charges = await stripe.charges.list({ customer: customerId, created: { gte: session.created - 60 }, limit: 10 }).catch(() => null);
    for (const c of charges?.data ?? []) {
      if (c.status !== "succeeded" || c.refunded || c.amount_refunded >= c.amount) continue;
      const r = await stripe.refunds.create({ charge: c.id, reason: "requested_by_customer", metadata: { gs_reason: "us_only_backstop" } }).catch((e) => { console.error("[us-backstop] refund failed:", c.id, e); return null; });
      if (r) refunded += c.amount - c.amount_refunded;
    }
  }
  console.warn(`[us-backstop] unwound ${product} checkout ${session.id} (billing country ${country}); refunded ${refunded}`);

  const email = session.customer_details?.email ?? null;
  const name = session.customer_details?.name ?? null;
  if (email) {
    const label = product === "circuit" ? "GameShuffle Circuit" : "GS Pro";
    await sendTransactionalEmail({
      to: email,
      toName: name ?? undefined,
      subject: `About your ${label} subscription`,
      text:
        `Hi${name ? ` ${name}` : ""},\n\n` +
        `Thanks for subscribing to ${label}. Paid plans are only available in the US for now, and your billing address is outside it, so we've cancelled the subscription` +
        (refunded > 0 ? ` and refunded the $${(refunded / 100).toFixed(2)} you were charged. It can take 5 to 10 business days to appear.` : ". You haven't been charged.") +
        `\n\nWe've added you to the waitlist and will email you when paid plans open where you are. Everything free on GameShuffle stays yours in the meantime.\n\nGameShuffle`,
    }).catch((e) => console.error("[us-backstop] email failed:", e));
    await joinPaidPlansWaitlist({ email, name, country, product, origin: "checkout-backstop" }).catch(() => false);
  }
  return true;
}
