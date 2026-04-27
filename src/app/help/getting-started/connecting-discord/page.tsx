import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/connecting-discord";
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
      <h1>Connecting Your Discord Account</h1>
      <p>GameShuffle integrates with Discord for bot commands, slash commands, and community coordination.</p>

      <h2>Connect Discord</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Go to <strong>Account Settings</strong> → <strong>Integrations</strong></li>
        <li>Click <strong>Connect Discord</strong></li>
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
      <p>Once added to your server, the bot supports:</p>
      <ul>
        <li><code>/gs-randomize</code> — quick randomizer commands for MK8DX and MKWorld</li>
        <li><code>/gs-result</code> — post a competitive lounge result (Pro feature)</li>
      </ul>

      <h2>Disconnecting Discord</h2>
      <ol>
        <li>Go to <strong>Account Settings</strong> → <strong>Integrations</strong></li>
        <li>Click <strong>Disconnect</strong> next to Discord</li>
      </ol>
      <p>The bot will remain in your servers but won&apos;t respond to commands until you reconnect or remove the bot manually via Discord&apos;s server settings.</p>

      <h2>Common issues</h2>
      <h3>Bot isn&apos;t responding to slash commands</h3>
      <p>Slash commands take a few minutes to register after the bot is added. If commands aren&apos;t appearing after 5 minutes, kick the bot from the server and re-add it.</p>
      <h3>&ldquo;Missing Permissions&rdquo; error</h3>
      <p>The bot needs basic permissions to send messages and read commands. Check your server&apos;s role permissions for the GameShuffle role.</p>
      <h3>Wrong server</h3>
      <p>If you accidentally added the bot to the wrong server, you can remove it from that server&apos;s settings and re-add it via the GameShuffle integrations page.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and tell us what&apos;s going wrong.</p>
    </HelpArticle>
  );
}
