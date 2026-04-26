/**
 * Subscription lifecycle transactional emails.
 *
 * Three messages tied to the GameShuffle Pro subscription state machine:
 *
 *   1. Trial started      → welcome + setup pointers (sent on subscription.created
 *                           when status === 'trialing')
 *   2. Trial ending soon  → 3-day reminder (sent on customer.subscription.trial_will_end)
 *   3. Trial converted    → paid-subscription welcome (sent when status flips
 *                           trialing → active)
 *
 * Empac branding clarity is consistent across all three: every email closes
 * with the EMPAC* GS PRO statement-descriptor disclosure plus contact info.
 * That's per gs-empac-branding-clarity.md to prevent "what's Empac on my
 * statement" chargebacks.
 */

import "server-only";
import { sendTransactionalEmail } from "./mailersend";

const FROM_NAME = "GameShuffle";
const SUPPORT_INBOX = "support@gameshuffle.co";
const BILLING_INBOX = "billing@gameshuffle.co";

/** Standard "billed by Empac" footer block reused across billing emails. */
function brandingFooter(): string {
  return [
    "",
    "—",
    "Billing & support",
    "Your subscription is billed by Empac, the product studio behind",
    "GameShuffle. Charges appear as EMPAC* GS PRO on your statement.",
    "",
    `Questions? Reply to this email or write to ${SUPPORT_INBOX}.`,
  ].join("\n");
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export async function sendTrialStartedEmail({
  to,
  name,
  trialEndsAt,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  trialEndsAt: Date;
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "Welcome to GameShuffle Pro! Your 14-day trial is active and you've got",
    "full access to:",
    "",
    "  • Live GameShuffle sessions for game nights and streams",
    "  • Twitch integration with overlay, chat commands, and channel point redemptions",
    "  • Discord bot tied directly to your active session",
    "  • Picks and Bans modules for participant-driven drafts",
    "  • Cross-platform coordination between Discord and Twitch",
    "",
    `Your trial converts to a paid subscription on ${formatDate(trialEndsAt)}.`,
    "Cancel anytime before that date and you won't be charged.",
    "",
    `Manage your plan: ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Welcome to GameShuffle Pro — your 14-day trial is active",
    text,
    fromName: FROM_NAME,
    replyTo: SUPPORT_INBOX,
  });
}

export async function sendTrialEndingEmail({
  to,
  name,
  trialEndsAt,
  amount,
  interval,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  trialEndsAt: Date;
  /** Charge amount in dollars, e.g. "9.00" or "99.00". */
  amount?: string;
  /** "monthly" | "annual" — for the reminder body. */
  interval?: "monthly" | "annual";
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const amountLine = amount && interval
    ? `On ${formatDate(trialEndsAt)} we'll charge $${amount} for your ${interval} GameShuffle Pro subscription.`
    : `On ${formatDate(trialEndsAt)} your GameShuffle Pro subscription will renew automatically.`;

  const text = [
    `Hi ${greetingName},`,
    "",
    "Quick reminder — your GameShuffle Pro free trial ends in 3 days.",
    "",
    amountLine,
    "",
    "If GameShuffle Pro isn't a fit, no worries — you can cancel anytime",
    "before then and you won't be charged. You'll keep Pro access through",
    "the end of the trial period.",
    "",
    `Manage your plan: ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle Pro trial ends in 3 days",
    text,
    fromName: FROM_NAME,
    replyTo: BILLING_INBOX,
  });
}

/**
 * Day-13 reminder ("trial ends tomorrow"). Distinct from sendTrialEndingEmail
 * because the urgency and the time-to-act framing are different — one day
 * out is the last realistic cancel window. Fired by the daily Vercel Cron
 * sweep at /api/cron/trial-reminder.
 */
export async function sendTrialEndingTomorrowEmail({
  to,
  name,
  trialEndsAt,
  amount,
  interval,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  trialEndsAt: Date;
  amount?: string;
  interval?: "monthly" | "annual";
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const amountLine = amount && interval
    ? `On ${formatDate(trialEndsAt)} we'll charge $${amount} for your ${interval} GameShuffle Pro subscription.`
    : `On ${formatDate(trialEndsAt)} your GameShuffle Pro subscription will renew automatically.`;

  const text = [
    `Hi ${greetingName},`,
    "",
    "Last chance — your GameShuffle Pro free trial ends tomorrow.",
    "",
    amountLine,
    "",
    "If you'd like to keep going, no action needed; the subscription kicks",
    "in automatically. If GameShuffle Pro isn't a fit, cancel from your",
    "account before then and you won't be charged.",
    "",
    `Manage your plan: ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle Pro trial ends tomorrow",
    text,
    fromName: FROM_NAME,
    replyTo: BILLING_INBOX,
  });
}

/**
 * Recurring payment failed. Stripe automatically retries over a 2-week
 * window per Smart Retries; this email tells the user up front that
 * payment failed and points them at the billing portal to fix the card
 * before access drops.
 */
export async function sendPaymentFailedEmail({
  to,
  name,
  amount,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  amount?: string;
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const amountLine = amount
    ? `We tried to charge $${amount} for your GameShuffle Pro subscription and it didn't go through.`
    : `We tried to renew your GameShuffle Pro subscription and the payment didn't go through.`;

  const text = [
    `Hi ${greetingName},`,
    "",
    amountLine,
    "",
    "What happens next:",
    "  • We'll automatically retry the charge over the next two weeks",
    "  • Your Pro access continues during this retry window",
    "  • If all retries fail, your account will revert to the free tier",
    "    (your data and connections stay intact — you can resubscribe",
    "    anytime to restore Pro)",
    "",
    "Most often this is an expired card or a daily-limit issue. The",
    "fastest fix is updating your payment method now:",
    "",
    `  ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Payment failed — update your card to keep GameShuffle Pro",
    text,
    fromName: FROM_NAME,
    replyTo: BILLING_INBOX,
  });
}

/**
 * Subscription cancelled (cancel_at_period_end transitioning true). User
 * keeps Pro access through current_period_end; this email confirms the
 * cancellation and gives them a one-click reactivate path in case it
 * was a mistake.
 */
export async function sendSubscriptionCancelledEmail({
  to,
  name,
  accessEndsAt,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  accessEndsAt: Date;
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "We've cancelled your GameShuffle Pro subscription as you requested.",
    "",
    `You'll keep Pro access through ${formatDate(accessEndsAt)}, then your`,
    "account will revert to the free tier. Your data, saved configs, and",
    "connections all stay intact — you can resubscribe anytime to restore",
    "Pro features.",
    "",
    "If this was an accident, you can reactivate from your account before",
    `${formatDate(accessEndsAt)} and nothing changes:`,
    "",
    `  ${manageUrl}`,
    "",
    "If there's anything we could have done better, just reply — I read",
    "every response.",
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle Pro subscription is cancelled",
    text,
    fromName: FROM_NAME,
    replyTo: SUPPORT_INBOX,
  });
}

/**
 * Subscription reactivated (cancel_at_period_end flipping back to false
 * during the grace period). Confirms the user is back on Pro with no
 * gap in service.
 */
export async function sendSubscriptionReactivatedEmail({
  to,
  name,
  nextRenewalAt,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  nextRenewalAt?: Date;
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const renewalLine = nextRenewalAt
    ? `Next charge: ${formatDate(nextRenewalAt)}.`
    : "";

  const text = [
    `Hi ${greetingName},`,
    "",
    "Your GameShuffle Pro subscription is reactivated — welcome back.",
    "Your Pro access continues without interruption.",
    "",
    renewalLine,
    "",
    `Manage your plan: ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].filter(Boolean).join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "You're back on GameShuffle Pro",
    text,
    fromName: FROM_NAME,
    replyTo: BILLING_INBOX,
  });
}

export async function sendTrialConvertedEmail({
  to,
  name,
  amount,
  interval,
  nextRenewalAt,
  manageUrl = "https://gameshuffle.co/account?tab=plans",
}: {
  to: string;
  name?: string | null;
  amount?: string;
  interval?: "monthly" | "annual";
  nextRenewalAt?: Date;
  manageUrl?: string;
}) {
  const greetingName = name?.trim() || "there";
  const chargedLine = amount && interval
    ? `Your ${interval} subscription is active at $${amount}.`
    : `Your GameShuffle Pro subscription is now active.`;
  const renewalLine = nextRenewalAt
    ? `Next charge: ${formatDate(nextRenewalAt)}.`
    : "";

  const text = [
    `Hi ${greetingName},`,
    "",
    "Your GameShuffle Pro trial has converted to a paid subscription.",
    "Thanks for sticking with us!",
    "",
    chargedLine,
    renewalLine,
    "",
    "Cancel anytime from your account settings — you'll keep Pro access",
    "through the end of your current billing period.",
    "",
    `Manage your plan: ${manageUrl}`,
    brandingFooter(),
    "",
    "— The GameShuffle team",
  ].filter(Boolean).join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "You're now on GameShuffle Pro",
    text,
    fromName: FROM_NAME,
    replyTo: BILLING_INBOX,
  });
}
