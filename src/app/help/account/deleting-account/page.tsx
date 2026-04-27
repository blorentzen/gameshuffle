import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/account/deleting-account";
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
      <h1>Deleting Your Account</h1>
      <p>You can permanently delete your GameShuffle account at any time. Here&apos;s what to know.</p>

      <h2>How to delete your account</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Go to <strong>Account Settings</strong> → <strong>Security</strong></li>
        <li>Scroll to <strong>Delete Account</strong></li>
        <li>Click <strong>Delete Account</strong>, then type DELETE to confirm</li>
        <li>Click <strong>Permanently Delete</strong></li>
      </ol>
      <p>The deletion happens immediately.</p>

      <h2>What gets deleted</h2>
      <p>When you delete your account, we permanently remove:</p>
      <ul>
        <li>Your profile information (display name, email, gamertags)</li>
        <li>Your saved randomizer configurations</li>
        <li>Your tournament data (you created)</li>
        <li>Your session history</li>
        <li>Your Twitch and Discord OAuth tokens</li>
        <li>Your stored avatar preferences</li>
      </ul>
      <p>We also:</p>
      <ul>
        <li>Cancel any active Pro subscription</li>
        <li>Disconnect Twitch and Discord (revoke our access tokens)</li>
        <li>Delete the Twitch channel point reward we created</li>
        <li>Cancel our Twitch event subscriptions</li>
      </ul>

      <h2>What persists</h2>
      <p>A few things may remain:</p>
      <p><strong>Tournament data</strong> — if you organized a tournament that other people participated in, the tournament data persists for those participants. Your name as the organizer becomes anonymized.</p>
      <p><strong>Stripe records</strong> — Stripe retains transaction records for 7 years per their data retention policy and US tax requirements. We don&apos;t control this.</p>
      <p><strong>Backups</strong> — our database backups may contain your data for up to 7 days, then are permanently purged.</p>

      <h2>This action is permanent</h2>
      <p>Once you delete your account:</p>
      <ul>
        <li>We cannot recover any data</li>
        <li>You&apos;ll need to create a new account if you want to use GameShuffle again</li>
        <li>Your username may not be available anymore (someone else can register it)</li>
      </ul>

      <h2>Alternative to deletion</h2>
      <p>If you just want to stop using GameShuffle for now without deleting:</p>
      <ul>
        <li>Cancel your Pro subscription (your data stays)</li>
        <li>Disconnect integrations</li>
        <li>Update email preferences to stop notifications</li>
      </ul>

      <h2>Privacy requests</h2>
      <p>If you want a copy of your data before deleting (data portability), submit a request via our <a href="/data-request">data request form</a> before deleting your account.</p>

      <h2>Still have questions?</h2>
      <p>Email <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a> for privacy-related questions.</p>
    </HelpArticle>
  );
}
