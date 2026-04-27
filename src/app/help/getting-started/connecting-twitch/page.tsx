import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/connecting-twitch";
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
      <h1>Connecting Your Twitch Account</h1>
      <p>GameShuffle integrates with Twitch to power overlays, chat bot commands, channel point rewards, and live session coordination. Here&apos;s how to connect.</p>

      <h2>Connect Twitch</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Go to <strong>Account Settings</strong> → <strong>Integrations</strong></li>
        <li>Click <strong>Connect Twitch</strong></li>
        <li>You&apos;ll be redirected to Twitch&apos;s authorization page</li>
        <li>Review the permissions we&apos;re requesting</li>
        <li>Click <strong>Authorize</strong></li>
      </ol>
      <p>You&apos;ll land back on GameShuffle with Twitch connected.</p>

      <h2>What permissions does GameShuffle need?</h2>
      <p>We request permissions to:</p>
      <ul>
        <li>Read your channel information (display name, follower count for context)</li>
        <li>Read chat messages (for <code>!gs-</code> bot commands during sessions)</li>
        <li>Manage channel point rewards (to create the &ldquo;Reroll the Streamer&rsquo;s Combo&rdquo; reward)</li>
        <li>Subscribe to stream events (so we know when you go live)</li>
      </ul>
      <p>We never request permissions to modify your channel, change settings, or post on your behalf without your explicit action.</p>

      <h2>Disconnecting Twitch</h2>
      <p>If you want to disconnect Twitch:</p>
      <ol>
        <li>Go to <strong>Account Settings</strong> → <strong>Integrations</strong></li>
        <li>Click <strong>Disconnect</strong> next to Twitch</li>
      </ol>
      <p>When you disconnect, we:</p>
      <ul>
        <li>Revoke our access tokens</li>
        <li>Delete the channel point reward we created</li>
        <li>Remove our event subscriptions</li>
        <li>Delete any stored Twitch session data</li>
      </ul>
      <p>You can reconnect anytime.</p>

      <h2>Common issues</h2>
      <h3>&ldquo;redirect_uri_mismatch&rdquo; error</h3>
      <p>This means there&apos;s a configuration issue on our end. Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with a screenshot and we&apos;ll fix it.</p>
      <h3>&ldquo;GameShuffle Bot&rdquo; isn&apos;t responding in chat</h3>
      <p>Make sure you&apos;ve connected Twitch within the last 7 days (tokens can expire). If the issue persists, disconnect and reconnect Twitch.</p>
      <h3>Channel point reward isn&apos;t showing up</h3>
      <p>Check that channel points are enabled on your channel — they&apos;re required for some Pro features. You also need to be a Twitch Affiliate or Partner.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with details about the issue.</p>
    </HelpArticle>
  );
}
