import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/account/email-preferences";
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
      <h1>Email Preferences</h1>
      <p>Control which emails GameShuffle sends you.</p>

      <h2>Types of emails we send</h2>
      <p><strong>Transactional emails</strong> (always sent — required for service):</p>
      <ul>
        <li>Account verification</li>
        <li>Password resets</li>
        <li>Subscription confirmations</li>
        <li>Payment receipts</li>
        <li>Trial reminders</li>
        <li>Account changes</li>
      </ul>

      <p><strong>Notification emails</strong> (optional, on by default):</p>
      <ul>
        <li>Session reminders</li>
        <li>Tournament updates you&apos;re participating in</li>
      </ul>

      <p><strong>Marketing emails</strong> (opt-in, off by default):</p>
      <ul>
        <li>New feature announcements</li>
        <li>Tips and tutorials</li>
        <li>Product updates</li>
      </ul>

      <h2>Managing your preferences</h2>
      <p>You can also unsubscribe from any marketing email by clicking the unsubscribe link at the bottom of the email, or visit our <a href="/unsubscribe">unsubscribe page</a> directly.</p>

      <h2>Transactional emails</h2>
      <p>We can&apos;t disable transactional emails because they&apos;re required for the service to function. Things like:</p>
      <ul>
        <li>Confirming you signed up</li>
        <li>Letting you know about billing</li>
        <li>Notifying you of security issues</li>
      </ul>
      <p>If you don&apos;t want any emails from us at all, the only option is to delete your account.</p>

      <h2>Marketing emails</h2>
      <p>Marketing emails are off by default. You opted in (or didn&apos;t) when you signed up. To change your preference, contact us at <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> or use the <a href="/unsubscribe">unsubscribe page</a>.</p>

      <h2>Discord and Twitch communications</h2>
      <p>Connecting Twitch or Discord doesn&apos;t sign you up for any communications from those platforms via GameShuffle. We only message you via email when needed.</p>

      <h2>Still have questions?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
