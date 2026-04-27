import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/pro/managing-subscription";
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
      <h1>Managing Your Subscription</h1>
      <p>Update your payment method, view invoices, or change billing details from your account.</p>

      <h2>Access the Stripe Customer Portal</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Go to <strong>Account Settings</strong> → <strong>Plans</strong></li>
        <li>Click <strong>Manage Subscription</strong></li>
      </ol>
      <p>This opens the Stripe Customer Portal where you can manage your billing securely.</p>

      <h2>What you can do in the portal</h2>
      <p><strong>Update payment method</strong> — change your card on file or add a new one.</p>
      <p><strong>View invoice history</strong> — download invoices for any past billing period.</p>
      <p><strong>Update billing address</strong> — useful if you&apos;ve moved or your tax situation changed.</p>
      <p><strong>Update tax IDs</strong> — if you&apos;re a business customer, add your tax ID for invoicing.</p>
      <p><strong>Cancel subscription</strong> — see <a href="/help/pro/cancelling">Cancelling Pro</a>.</p>

      <h2>Payment methods we accept</h2>
      <ul>
        <li>Visa</li>
        <li>Mastercard</li>
        <li>American Express</li>
        <li>Discover</li>
        <li>Apple Pay</li>
        <li>Google Pay</li>
      </ul>

      <h2>Failed payments</h2>
      <p>If a payment fails (expired card, insufficient funds, etc.):</p>
      <ol>
        <li>We automatically retry over about two weeks</li>
        <li>You&apos;ll receive emails for each failed attempt</li>
        <li>If all retries fail, your account moves to free tier (your data is preserved)</li>
      </ol>
      <p>To fix a failed payment, update your payment method in the customer portal — we&apos;ll retry automatically.</p>

      <h2>Statement descriptor</h2>
      <p>Charges appear on your statement as <strong>GAMESHUFFLE</strong>.</p>

      <h2>Still have questions?</h2>
      <p>Email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
