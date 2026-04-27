import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/your-first-session";
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
      <h1>Your First Session</h1>
      <p>GameShuffle sessions coordinate game nights, tournaments, and streaming events. Here&apos;s how to host your first one.</p>

      <h2>Start a session</h2>
      <ol>
        <li>Sign in to GameShuffle</li>
        <li>Open <strong>Account Settings</strong> → <strong>Integrations</strong> → <strong>Twitch Hub</strong></li>
        <li>Connect Twitch (if you haven&apos;t already)</li>
        <li>Click <strong>Start test session</strong> to spin up a session without going live, or just start streaming in a supported game (Mario Kart 8 Deluxe, Mario Kart World) and we&apos;ll auto-open one</li>
      </ol>
      <p>Your session is now live and viewers in your Twitch chat can interact with it.</p>

      <h2>Invite participants</h2>
      <p>Viewers join from your Twitch chat:</p>
      <ul>
        <li><code>!gs-join</code> — join the lobby</li>
        <li><code>!gs-shuffle</code> — randomize their kart combo</li>
        <li><code>!gs-mycombo</code> — recall their current combo</li>
        <li><code>!gs-lobby</code> — get a link to the public lobby viewer</li>
      </ul>
      <p>You can also paste your overlay URL into OBS as a browser source to show combos on your stream.</p>

      <h2>During the session</h2>
      <p>As host, you control:</p>
      <ul>
        <li><code>!gs-shuffle</code> — randomize your own combo (broadcaster bypass cooldown)</li>
        <li><code>!gs-kick @user</code> — remove a viewer from the session</li>
        <li><code>!gs-clear</code> — kick everyone except yourself</li>
      </ul>
      <p>Mods can use those last two commands too.</p>

      <h2>After the session</h2>
      <p>Sessions auto-close shortly after your stream ends. If you started a test session, end it manually from the Twitch Hub. Recent shuffle history stays available in the dashboard.</p>

      <h2>Tips for great sessions</h2>
      <ul>
        <li><strong>Test your setup first</strong> — start a test session before going live to verify the bot, overlay, and channel point reward all work</li>
        <li><strong>Have a backup plan</strong> — if Twitch chat isn&apos;t responding, you can still randomize manually from the dashboard</li>
        <li><strong>Communicate with viewers</strong> — let them know what to expect, especially first-timers</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll walk you through it.</p>
    </HelpArticle>
  );
}
