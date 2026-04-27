import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/troubleshooting/integration-issues";
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
      <h1>Integration Issues</h1>
      <p>Twitch or Discord integration not working? Here&apos;s how to fix common problems.</p>

      <h2>Twitch chat bot not responding</h2>
      <ol>
        <li><strong>Check your Twitch connection</strong> — go to <strong>Account Settings</strong> → <strong>Integrations</strong>. If Twitch shows &ldquo;Reconnect needed,&rdquo; click it and re-authorize.</li>
        <li><strong>Verify the bot is in your chat</strong> — type <code>!gs-help</code> in your chat. If the bot doesn&apos;t respond, it may have been removed.</li>
        <li><strong>Re-authorize Twitch</strong> — disconnect and reconnect Twitch. This refreshes our access tokens.</li>
        <li><strong>Check your channel mode</strong> — if your chat is in subscriber-only or follower-only mode, the bot needs to meet those requirements.</li>
      </ol>

      <h2>Twitch channel point reward missing</h2>
      <p>We create a &ldquo;Reroll the Streamer&rsquo;s Combo&rdquo; reward when you enable channel points in the Twitch Hub. If it&apos;s missing:</p>
      <ol>
        <li>Check that you&apos;re an Affiliate or Partner — channel points require this</li>
        <li>Check that channel points are enabled in your Twitch dashboard</li>
        <li>Disable and re-enable channel points in the Twitch Hub — sometimes the reward needs to be recreated</li>
      </ol>
      <p>If the reward keeps disappearing, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>

      <h2>Discord bot offline</h2>
      <ol>
        <li><strong>Check the bot status in your server</strong> — does the bot appear in the member list?</li>
        <li><strong>If the bot isn&apos;t in your server</strong> — go to <strong>Account Settings</strong> → <strong>Integrations</strong>, disconnect Discord, then reconnect and re-add to your server.</li>
        <li><strong>If the bot is in the server but not responding</strong> — check the bot&apos;s role permissions. It needs at minimum: View Channel, Send Messages, Use Slash Commands.</li>
      </ol>

      <h2>Slash commands not appearing</h2>
      <p>Slash commands take 1–5 minutes to register after adding the bot. If they&apos;re still not appearing:</p>
      <ol>
        <li>Refresh Discord (close and reopen the app)</li>
        <li>Try typing <code>/</code> in a channel where the bot has permissions</li>
        <li>If still nothing, kick the bot and re-add it</li>
      </ol>

      <h2>EventSub subscriptions out of sync</h2>
      <p>If the dashboard shows fewer than 4 of 4 EventSub subscriptions active:</p>
      <ol>
        <li>Open <strong>Twitch Hub</strong> → <strong>Connection Status</strong></li>
        <li>Click <strong>Sync bot subscriptions</strong></li>
        <li>The page will refresh — health should now show 4 of 4</li>
      </ol>

      <h2>&ldquo;GameShuffle Bot&rdquo; was banned/timed out</h2>
      <p>If the bot is banned from your channel, unban it from your Twitch dashboard. We don&apos;t currently support self-service unban — if it&apos;s an issue, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>

      <h2>Still having integration issues?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with:</p>
      <ul>
        <li>Which integration is having issues (Twitch or Discord)</li>
        <li>Specific error messages or behavior</li>
        <li>Your Twitch username or Discord server name</li>
        <li>When the issue started</li>
      </ul>
      <p>The more details you give us, the faster we can fix it.</p>
    </HelpArticle>
  );
}
