import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/pro/free-trial";
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
      <h1>Pro Free Trial</h1>
      <p>Try GameShuffle Pro free for 14 days. Here&apos;s how it works.</p>

      <h2>Starting your trial</h2>
      <ol>
        <li>Go to <a href="/pricing">gameshuffle.co/pricing</a></li>
        <li>Choose monthly or annual billing</li>
        <li>Click <strong>Start Free Trial</strong></li>
        <li>Enter your payment information</li>
      </ol>
      <p>We require a payment method to start the trial, but <strong>you won&apos;t be charged until day 14</strong>. If you cancel before then, you pay nothing.</p>

      <h2>What you get during the trial</h2>
      <p>You have full access to every Pro feature for 14 days. No restrictions, no &ldquo;trial mode.&rdquo;</p>

      <h2>Trial reminders</h2>
      <p>We send reminder emails at:</p>
      <ul>
        <li><strong>Day 11:</strong> &ldquo;Your trial ends in 3 days&rdquo;</li>
        <li><strong>Day 13:</strong> &ldquo;Your trial ends tomorrow — last chance to cancel&rdquo;</li>
      </ul>

      <h2>Cancelling before you&apos;re charged</h2>
      <ol>
        <li>Go to <strong>Account Settings</strong> → <strong>Plans</strong></li>
        <li>Click <strong>Manage Subscription</strong> to open the Stripe customer portal</li>
        <li>Click <strong>Cancel Subscription</strong></li>
      </ol>
      <p>Your Pro access continues through day 14, then your account converts to free tier. You won&apos;t be charged anything.</p>

      <h2>What happens after 14 days</h2>
      <p>If you don&apos;t cancel, your subscription auto-renews at your chosen billing cycle (monthly or annual). You&apos;ll receive a confirmation email and a receipt.</p>

      <h2>One trial per account</h2>
      <p>We offer one free trial per Stripe customer. If you&apos;ve used a trial before, subsequent subscriptions require immediate payment.</p>

      <h2>Still have questions?</h2>
      <p>Email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a> for billing-specific questions, or <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> for general help.</p>
    </HelpArticle>
  );
}
