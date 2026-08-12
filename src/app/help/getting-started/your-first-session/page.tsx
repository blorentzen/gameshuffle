import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/getting-started/your-first-session";
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
      <h1>Your First Session</h1>
      <p>There are two ways to run a game night on GameShuffle. Pick whichever fits how you play.</p>

      <h2>The quick way (no setup)</h2>
      <p>If you&apos;re playing with family or friends, you don&apos;t need a session at all. Jump straight in:</p>
      <ul>
        <li><a href="/apps">Open a randomizer</a> for Mario Kart 8 Deluxe or Mario Kart World, add your players, and shuffle karts, characters, and tracks.</li>
        <li><Link href="/tournament">Create a tournament or championship</Link>, set your tracks and rules, and share the link so everyone can follow along.</li>
      </ul>
      <p>Sign in if you want to save your setups and results, but it&apos;s optional for casual play.</p>

      <h2>Host a session from the Hub</h2>
      <p>A session is the live, multiplayer version built for streamers. It ties your randomizers, picks and bans, and viewer economy together across Twitch and Discord. You run it from the <strong>Hub</strong>.</p>
      <ol>
        <li>Sign in and open the <a href="/hub">Hub</a>.</li>
        <li>Connect at least one platform first (see <a href="/help/getting-started/connecting-twitch">Connecting Twitch</a> or <a href="/help/getting-started/connecting-discord">Connecting Discord</a>).</li>
        <li>Click <strong>New session</strong>, give it a name, and choose the platforms to fan out to.</li>
        <li>Configure the modules you want (randomizer, picks and bans, prediction markets), then open the session.</li>
      </ol>
      <p>You can also start a quick test session from <strong>Account Settings</strong> &rsaquo; <strong>Integrations</strong> &rsaquo; <strong>Twitch Hub</strong> to check your setup without going live. When you stream a supported game, a session can open automatically too.</p>

      <h2>How viewers join</h2>
      <p>On Twitch, viewers use chat commands:</p>
      <ul>
        <li><code>!gs-join</code>: join the lobby</li>
        <li><code>!gs-shuffle</code>: randomize their combo</li>
        <li><code>!gs-mycombo</code>: recall their current combo</li>
        <li><code>!gs-lobby</code>: get a link to the public lobby viewer</li>
      </ul>
      <p>Paste your overlay URL into OBS as a browser source to show combos, wheels, and events on stream. Viewers on your <code>/live</code> page and in Discord can take part too.</p>

      <h2>During the session</h2>
      <p>As host, you control:</p>
      <ul>
        <li><code>!gs-shuffle</code>: randomize your own combo (the broadcaster bypasses the cooldown)</li>
        <li><code>!gs-kick @user</code>: remove a viewer from the session</li>
        <li><code>!gs-clear</code>: remove everyone except yourself</li>
      </ul>
      <p>Your mods can use the last two commands as well.</p>

      <h2>After the session</h2>
      <p>Sessions close shortly after your stream ends, or you can end a test session manually from the Twitch Hub. A recap of the session stays available, and it shows on your <code>/live</code> page for viewers who missed it.</p>

      <h2>Tips for a smooth first run</h2>
      <ul>
        <li><strong>Test first.</strong> Start a test session before going live to confirm the bot, overlay, and channel-point reward all work.</li>
        <li><strong>Have a backup.</strong> If chat isn&apos;t responding, you can still shuffle manually from the Hub.</li>
        <li><strong>Tell your viewers what to expect,</strong> especially first-timers, so they know which commands to use.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll walk you through it.</p>
    </HelpArticle>
  );
}
