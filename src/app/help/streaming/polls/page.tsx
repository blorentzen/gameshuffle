import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/polls";
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
      <h1>Live Polls</h1>
      <p>
        GameShuffle polls are cross-platform: you run <strong>one</strong> poll at a time for your
        community, and every place people can vote feeds the same tally. Open it from your dashboard,
        from Twitch chat, or from Discord, and it&apos;s the same poll everywhere. Polls are a
        GameShuffle Pro feature.
      </p>

      <h2>Where a poll shows up</h2>
      <ul>
        <li>Your <strong>OBS overlay</strong> (a positionable Poll piece).</li>
        <li>Your <code>/live</code> page, where viewers can tap to vote.</li>
        <li>Twitch chat, via <code>!vote</code>.</li>
        <li>Discord, via the poll message buttons.</li>
      </ul>
      <p>Everyone&apos;s votes roll into one result, so the number on your overlay is the real total across platforms.</p>

      <h2>Create a poll from the dashboard</h2>
      <ol>
        <li>Go to <strong>Account</strong> &rsaquo; <strong>Community &amp; Chat</strong> &rsaquo; <strong>Polls</strong>.</li>
        <li>Write your question and add options.</li>
        <li>Open it. Opening a poll automatically closes any other open poll in your community (only one runs at a time).</li>
        <li>Optionally set an auto-close timer; otherwise close it yourself when you&apos;re done.</li>
      </ol>

      <h2>Run a poll from Twitch chat</h2>
      <ul>
        <li>
          <strong>Open:</strong> <code>!poll &lt;question&gt; | option 1 | option 2</code> (2 to 8
          options, separated by <code>|</code>). Broadcaster and mods.
        </li>
        <li><strong>Vote:</strong> <code>!vote &lt;number&gt;</code>. Anyone in chat.</li>
        <li><strong>Close:</strong> <code>!poll close</code> ends it and announces the winner.</li>
      </ul>
      <p>Example: <code>!poll Which track next? | Rainbow Road | Baby Park | Coconut Mall</code></p>

      <h2>Run a poll from Discord</h2>
      <p>
        Use <code>/gs-poll</code> to open or close a poll for your community, then viewers vote with
        the buttons on the poll message. Requires GameShuffle Pro and the Manage Server permission.
        (If the slash command isn&apos;t showing, the bot may need a moment to register it.)
      </p>

      <h2>Placing the overlay poll</h2>
      <p>
        The poll is a positionable piece under <strong>Tools</strong> in the
        <a href="/help/streaming/obs-overlay"> Overlay Layout</a> editor. Position or hide it per
        format like any other tool. It appears automatically while a poll is open and clears when you
        close it.
      </p>

      <h2>Tips</h2>
      <ul>
        <li><strong>Keep options short</strong> so they read on the overlay and in chat.</li>
        <li><strong>Use the auto-close timer</strong> for quick &ldquo;pick the next track&rdquo; votes so you don&apos;t have to remember to close it.</li>
        <li><strong>One poll at a time</strong> is by design; opening a new one replaces the old.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any poll questions.</p>
    </HelpArticle>
  );
}
