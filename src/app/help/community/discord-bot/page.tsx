import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/discord-bot";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>The Discord Bot</h1>
      <p>
        The GameShuffle Discord bot brings your game nights into your server: announcements, self-serve
        roles, moderation, a daily question, and randomizer slash commands. Configure it under
        <strong> Account</strong> &rsaquo; <strong>Stream Setup</strong> &rsaquo;
        <strong> Discord Bot</strong>.
      </p>

      <h2>Getting the bot in your server</h2>
      <ol>
        <li>
          <a href="/help/getting-started/connecting-discord">Connect Discord</a> from
          <strong> Account</strong> &rsaquo; <strong>Stream Setup</strong> &rsaquo;
          <strong> Integrations</strong> and add the bot to a server where you have Manage Server.
        </li>
        <li>Open the <strong>Discord Bot</strong> tab to configure it.</li>
      </ol>

      <h2>Slash commands</h2>
      <ul>
        <li><code>/gs-randomize</code>: kart randomizer for MK8DX and Mario Kart World, with user tagging and per-player re-rolls. <strong>Free for everyone.</strong></li>
        <li><code>/gs-result</code>: post a competitive lounge result. <strong>GameShuffle Pro.</strong></li>
        <li><code>/gs-poll</code>: open or close a <a href="/help/streaming/polls">live poll</a> for your community, with button voting. <strong>GameShuffle Pro, Manage Server permission.</strong></li>
      </ul>
      <p>Slash commands can take a few minutes to appear after the bot joins.</p>

      <h2>What the bot can do</h2>
      <p>
        On the free tier, the bot posts to a single default channel. GameShuffle Pro adds the full
        toolkit:
      </p>
      <ul>
        <li><strong>Channel routing</strong>: send each type of GameShuffle post to the channel you choose, by drag and drop.</li>
        <li><strong>Announcements</strong>: post now or schedule ahead, with optional follow-up reminders.</li>
        <li><strong>Self-assign roles</strong>: reaction, button, or dropdown role pickers your members use themselves.</li>
        <li><strong>Auto-roles</strong>: give new members a role on join, and auto-grant a role to your linked GS Pro members.</li>
        <li><strong>AutoMod</strong>: block words and switch on preset filters (profanity, sexual content, slurs).</li>
        <li><strong>Server logging</strong>: record edits and deletes, joins and leaves, and role changes to a channel.</li>
        <li><strong>Question of the Day</strong>: a daily prompt from a pool you manage, posted on your schedule.</li>
      </ul>

      <h2>Free vs Pro</h2>
      <p>
        Free accounts can connect the bot and post to one default channel. Everything above, routing,
        announcements, roles, AutoMod, logging, and QOTD, is a GameShuffle Pro feature. On a free
        account those cards appear locked with a GS Pro label.
      </p>

      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>Bot not responding:</strong> confirm it&apos;s still in the server and Discord is connected under Integrations. See <a href="/help/troubleshooting/integration-issues">Integration Issues</a>.</li>
        <li><strong>Slash commands missing:</strong> wait a few minutes after adding the bot; if they still don&apos;t show, remove and re-add it.</li>
        <li><strong>&ldquo;Missing Permissions&rdquo;:</strong> the bot needs permission to post and manage roles in the channels you&apos;ve pointed it at.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you set up the bot.</p>
    </HelpArticle>
  );
}
