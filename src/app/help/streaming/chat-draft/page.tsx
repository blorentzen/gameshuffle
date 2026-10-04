import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/chat-draft";
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
      <h1>Chat Draft</h1>
      <p>
        Chat Draft lets your chat build something for you one pick at a time: your Pokémon team, your Mario Kart combo, or
        your track list. Each pick is a vote between a few random options, and the winner goes in the next slot. It&apos;s a
        GameShuffle Pro feature; your viewers vote for free.
      </p>

      <h2>What chat can draft</h2>
      <ul>
        <li><strong>A Pokémon team of six</strong> for Scarlet and Violet (with both DLCs) or Pokémon Champions.</li>
        <li><strong>A kart combo</strong> for Mario Kart 8 Deluxe (character, vehicle, wheels, glider) or Mario Kart World (character, vehicle).</li>
        <li><strong>A track list</strong> of four or eight races for either Mario Kart.</li>
      </ul>

      <h2>Start a draft</h2>
      <p>
        Use <strong>Account &gt; Community &amp; Chat &gt; Chat Draft</strong>, or type <code>!draft start pokemon</code> in chat (or
        <code>champions</code>, <code>kart</code>, <code>mkw</code>, <code>tracks</code>, <code>mkwtracks</code>). From the dashboard you can
        also set how long each vote lasts and how many options chat gets.
      </p>
      <p>Pokémon drafts have three rules, each on by default and each a switch: fully evolved only, no legendary or mythical Pokémon, and no repeated type across the team.</p>

      <h2>How chat votes</h2>
      <ul>
        <li>Each pick is a poll: chat types <code>!vote 1</code> to <code>!vote 4</code>, or taps on your live page.</li>
        <li>When the timer runs out, the most votes wins. A tie is settled at random; with no votes, one option is picked at random.</li>
        <li><code>!draft</code> shows the picks so far. You and your mods can close a pick early with <code>!draft next</code> or stop with <code>!draft end</code>.</li>
      </ul>

      <h2>Team drafts with captains</h2>
      <p>
        Switch the Chat Draft tab to <strong>Captains</strong> to split your players into teams. Captains take turns picking
        from everyone who signed up, like picking teams at recess.
      </p>
      <ul>
        <li><strong>Sign-ups:</strong> open them from the dashboard or with <code>!draft teams</code>. Everyone in your session lobby is in automatically, chat joins with <code>!draft in</code> (or leaves with <code>!draft out</code>), and you can add names yourself.</li>
        <li><strong>Captains:</strong> tap players to make them captains, or roll captains at random. Two teams by default, up to four, and you can name them. From chat: <code>!draft captains @name @name</code>.</li>
        <li><strong>Order:</strong> snake (1-2-2-1) by default, so the second captain gets two picks in a row to even things out. Alternating (1-2-1-2) is an option.</li>
        <li><strong>Picking:</strong> the captain on the clock picks on your live page (signed in with Twitch) or types <code>!pick name</code> in chat. Names match loosely, so <code>!pick harp</code> finds Harper. You can pick for them from the dashboard.</li>
        <li><strong>Timer:</strong> 30 seconds a pick by default; when time runs out a random player is picked for them. You can turn the timer off.</li>
      </ul>
      <p>When one player is left they go to the next team automatically, and the final teams are posted to chat and stay on your overlay.</p>

      <h2>Show it on stream</h2>
      <p>
        Add the <strong>Chat Draft</strong> piece in Overlay Layout (see <Link href="/help/streaming/obs-overlay">the OBS overlay</Link>). It shows the
        slots filling in and the current vote with a countdown, or, for a team draft, the teams side by side, who&apos;s on the clock and who&apos;s left. Starting another poll during a draft closes the current pick.
      </p>
      <p>Pokémon appear by name and type only. Chat Draft is an unofficial fan tool, not made by or affiliated with Nintendo or The Pokémon Company.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}

