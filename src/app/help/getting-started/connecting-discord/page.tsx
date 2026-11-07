import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/connecting-discord";
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
      <h1>Connecting Your Discord Account</h1>
      <p>GameShuffle integrates with Discord for bot commands, slash commands, and community coordination.</p>

      <h2>Connect Discord</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Press <strong>Add to Discord</strong> on <a href="/discord">gameshuffle.co/discord</a>, or <strong>Install in your Discord</strong> on <strong>Account</strong> → <strong>Discord</strong> → <strong>Servers</strong></li>
        <li>You&apos;ll be redirected to Discord&apos;s authorization page</li>
        <li>Choose which Discord server to add the GameShuffle bot to (if you&apos;re a server admin)</li>
        <li>Authorize the requested permissions</li>
        <li>You&apos;ll land back on GameShuffle with Discord connected</li>
      </ol>

      <h2>What permissions does GameShuffle need?</h2>
      <ul>
        <li>Identify your Discord account (username, avatar)</li>
        <li>Add the bot to servers you choose (only servers where you have admin or manage-server permissions)</li>
        <li>Send messages in channels where the bot is added</li>
        <li>Respond to slash commands</li>
      </ul>
      <p>The bot only operates in servers where you&apos;ve explicitly added it.</p>

      <h2>Using the GameShuffle bot</h2>
      <p>Once added to your server, the two commands most servers start with are:</p>
      <ul>
        <li><code>/gs-randomize</code>: a quick roll for any game GameShuffle has a randomizer for (Mario Kart, Mario Party, Smash, Overwatch, Splatoon and more), free for everyone</li>
        <li><code>/gs-poll</code>: open or close a live poll for your community (GameShuffle Pro, Manage Server permission)</li>
      </ul>
      <p>Every other command is listed in <Link href="/help/community/discord-bot">The Discord Bot</Link>.</p>
      <p>Competitive Mario Kart commands are on our second bot, <Link href="/help/competitive/competitive-discord-app">GameShuffle Competitive</Link>: <code>/tt</code>, <code>/mmr</code>, <code>/room</code>, <code>/result</code>, <code>/war</code>, <code>/table</code>, <code>/cans</code>, <code>/logo</code>, <code>/flag</code> and the <strong>Save to GameShuffle</strong> message command.</p>

      <h2>Disconnecting Discord</h2>
      <ol>
        <li>Go to <strong>Account</strong> → <strong>Discord</strong> → <strong>Servers</strong></li>
        <li>Click <strong>Remove</strong> next to the server</li>
      </ol>
      <p>GameShuffle stops posting there, but the bot stays in the server until you remove it in Discord&apos;s server settings.</p>

      <h2>Common issues</h2>
      <h3>Bot isn&apos;t responding to slash commands</h3>
      <p>Slash commands take a few minutes to register after the bot is added. If commands aren&apos;t appearing after 5 minutes, kick the bot from the server and re-add it.</p>
      <h3>&ldquo;Missing Permissions&rdquo; error</h3>
      <p>The bot needs basic permissions to send messages and read commands. Check your server&apos;s role permissions for the GameShuffle role.</p>
      <h3>Wrong server</h3>
      <p>If you accidentally added the bot to the wrong server, remove it in that server&apos;s settings, press <strong>Forget this server</strong> on <strong>Account</strong> → <strong>Discord</strong>, then add it to the right one.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and tell us what&apos;s going wrong.</p>
    </HelpArticle>
  );
}
