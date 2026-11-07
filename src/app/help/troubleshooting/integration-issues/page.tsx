import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/troubleshooting/integration-issues";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Integration Issues</h1>
      <p>Twitch or Discord integration not working? Here&apos;s how to fix the common problems.</p>

      <h2>Twitch chat bot not responding</h2>
      <ol>
        <li><strong>Check your Twitch connection.</strong> Go to <strong>Streaming</strong> &rsaquo; <strong>Setup</strong> &rsaquo; <strong>Twitch</strong>. If Connection Status says the bot isn&apos;t authorized, or a note offers <strong>Reconnect Twitch</strong>, reconnect and re-authorize.</li>
        <li><strong>Verify the bot is in your chat.</strong> Type <code>!gs-help</code> in your chat. If the bot doesn&apos;t respond, it may have been removed.</li>
        <li><strong>Re-authorize Twitch.</strong> Disconnect and reconnect Twitch to refresh our access tokens.</li>
        <li><strong>Check your channel mode.</strong> If your chat is in subscriber-only or follower-only mode, the bot needs to meet those requirements.</li>
      </ol>

      <h2>Twitch channel-point reward missing</h2>
      <p>We create a &ldquo;Reroll the Streamer&rsquo;s Pick&rdquo; reward when you press <strong>Add the reward</strong> under Channel points on <strong>Streaming</strong> &rsaquo; <strong>Setup</strong> &rsaquo; <strong>Twitch</strong>. If it&apos;s missing:</p>
      <ol>
        <li>Check that you&apos;re an Affiliate or Partner, since channel points require this</li>
        <li>Check that channel points are enabled in your Twitch dashboard</li>
        <li>Press <strong>Remove the reward</strong>, then <strong>Add the reward</strong>, in the same place to make it again</li>
      </ol>
      <p>If the reward keeps disappearing, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>

      <h2>Discord bot offline</h2>
      <ol>
        <li><strong>Check the bot status in your server.</strong> Does the bot appear in the member list?</li>
        <li><strong>If the bot isn&apos;t in your server,</strong> open <strong>Account</strong> &rsaquo; <strong>Discord</strong> and press <strong>Add the bot back</strong>, then pick your server in Discord.</li>
        <li><strong>If the bot is in the server but not responding,</strong> check the bot&apos;s role permissions. It needs at minimum View Channel, Send Messages, and Use Slash Commands.</li>
      </ol>

      <h2>Slash commands not appearing</h2>
      <p>Slash commands take 1 to 5 minutes to register after you add the bot. If they&apos;re still not appearing:</p>
      <ol>
        <li>Refresh Discord (close and reopen the app)</li>
        <li>Try typing <code>/</code> in a channel where the bot has permissions</li>
        <li>If still nothing, kick the bot and re-add it</li>
      </ol>

      <h2>A command says it moved</h2>
      <p>
        <code>/gs-tt</code>, <code>/gs-mmr</code>, <code>/gs-room</code>, <code>/gs-result</code> and the
        {" "}<strong>Save to GameShuffle</strong>{" "}message command moved from the GameShuffle bot to our second bot,
        GameShuffle Competitive. On the GameShuffle bot they only reply with a note saying so. To keep using them:
      </p>
      <ol>
        <li>Press <strong>Add GameShuffle Competitive</strong> on that note, or on <a href="/discord">gameshuffle.co/discord</a>.</li>
        <li>Add it to the server (you need Manage Server), or to your own Discord account if you don&apos;t run the server.</li>
        <li>Use the short names: <code>/tt</code>, <code>/mmr</code>, <code>/room</code> and <code>/result</code>. Save to GameShuffle keeps its name.</li>
      </ol>
      <p>See <a href="/help/competitive/competitive-discord-app">The GameShuffle Competitive Discord app</a> for everything it does.</p>

      <h2>EventSub subscriptions out of sync</h2>
      <p>If the dashboard shows fewer than 4 of 4 EventSub subscriptions active:</p>
      <ol>
        <li>Open <strong>Streaming</strong> &rsaquo; <strong>Setup</strong> &rsaquo; <strong>Twitch</strong> and find <strong>Connection Status</strong></li>
        <li>Click <strong>Sync bot subscriptions</strong></li>
        <li>The page refreshes, and health should now show 4 of 4</li>
      </ol>

      <h2>&ldquo;GameShuffle Bot&rdquo; was banned or timed out</h2>
      <p>If the bot is banned from your channel, unban it from your Twitch dashboard. We don&apos;t currently support self-service unban, so if it&apos;s a recurring issue, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>

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
