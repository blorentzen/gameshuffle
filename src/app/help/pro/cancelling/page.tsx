import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/pro/cancelling";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Cancelling Your Pro Subscription</h1>
      <p>You can cancel anytime. Here&apos;s how.</p>

      <h2>How to cancel</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Go to <strong>Account Settings</strong> → <strong>Plans</strong></li>
        <li>Click <strong>Manage Subscription</strong></li>
        <li>In the Stripe Customer Portal, click <strong>Cancel Subscription</strong></li>
        <li>Optionally tell us why (helps us improve)</li>
        <li>Confirm cancellation</li>
      </ol>
      <p>You&apos;ll receive a confirmation email immediately.</p>

      <h2>What happens when you cancel</h2>
      <p>Your subscription remains active through the end of your current billing period. You keep full Pro access until that date.</p>
      <p>After your billing period ends:</p>
      <ul>
        <li>Your account moves to the free tier</li>
        <li>Your account data and settings are preserved</li>
        <li>You can resubscribe anytime to restore Pro access</li>
      </ul>

      <h2>Refund policy</h2>
      <p><strong>Monthly subscribers:</strong> request a prorated refund within 7 days of payment.</p>
      <p><strong>Annual subscribers:</strong> request a prorated refund within 30 days of payment.</p>
      <p>After these windows, your subscription continues until the end of the current billing period.</p>
      <p>To request a refund, email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a> with your account email and reason.</p>

      <h2>Won&apos;t be charged again</h2>
      <p>Once cancelled, you won&apos;t be charged for future periods. The cancellation takes effect at your next renewal date.</p>

      <h2>Resubscribing</h2>
      <p>You can resubscribe anytime from the <a href="/pricing">pricing page</a> or your account settings. Your previous data, integrations, and settings are still there waiting.</p>

      <h2>Still have questions?</h2>
      <p>Email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
