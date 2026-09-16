import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/creating-a-tournament";
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
      <h1>Creating a Tournament</h1>
      <p>
        GameShuffle tournaments work for a quick Friday-night bracket with friends or a full
        streamed event with sign-ups, live scoring, and an OBS overlay. This walks through
        creating one end to end.
      </p>

      <h2>Before you start</h2>
      <p>
        You need a verified GameShuffle account to create a tournament (verify your email from
        <strong> Account &rsaquo; Security</strong>). Players joining can be signed-in accounts or
        guests you add yourself, so your viewers don&apos;t all need accounts to take part.
      </p>

      <h2>Single event or Championship?</h2>
      <p>
        Open <Link href="/tournament/create">Create a tournament</Link> and pick one:
      </p>
      <ul>
        <li><strong>Single</strong>: one tournament in any format. This is what most people want.</li>
        <li>
          <strong>Championship</strong>: a season made of several Heat &rarr; Mains events with a
          roster and running season standings. See the tournament page for the season view once
          it&apos;s built.
        </li>
      </ul>

      <h2>Set up the event</h2>
      <ol>
        <li><strong>Game</strong>: Mario Kart 8 Deluxe or Mario Kart World.</li>
        <li><strong>Title and description</strong>: what players see at the top of the page.</li>
        <li>
          <strong>Format</strong>: how winners are decided. See
          <a href="/help/tournaments/tournament-formats"> Tournament Formats</a> for a breakdown of
          each one.
        </li>
        <li>
          <strong>Team mode</strong>: free-for-all, or teams (2v2 through 6v6). Team modes let you
          assign players to teams on the manage page.
        </li>
        <li>
          <strong>Date and time</strong>, and whether it&apos;s <strong>online</strong> or
          <strong> in person</strong>. Times show in each viewer&apos;s own timezone automatically.
        </li>
      </ol>

      <h2>Tracks, builds, and rules</h2>
      <ul>
        <li>
          <strong>Track selection</strong>: choose a guided list, a randomized set, a limited pool,
          or leave it open to decide on the day. Drag to reorder your track list.
        </li>
        <li>
          <strong>Build restrictions</strong>: limit weight class, drift type, or ban/allow specific
          characters. You can also set a custom item pool.
        </li>
        <li><strong>Rules</strong>: free-text rules shown to every player.</li>
        <li>
          <strong>Verified only</strong>: require players to have a verified email to join, which
          cuts down on throwaway sign-ups.
        </li>
      </ul>

      <h2>Sign-ups</h2>
      <p>Choose how players get in:</p>
      <ul>
        <li><strong>Open</strong>: anyone with the link joins instantly.</li>
        <li><strong>Approval required</strong>: players request, and you accept them from the manage page.</li>
      </ul>
      <p>
        Set a <strong>max participants</strong> cap if you want to limit the field. You can raise it
        later from Settings. Share the tournament link anywhere, or use
        <strong> Invite</strong> on the manage page to notify your followers.
      </p>

      <h2>Running it</h2>
      <p>
        Move the tournament from <strong>Draft</strong> to <strong>Open for Registration</strong> to
        take sign-ups, then to <strong>In Progress</strong> when you start. On the manage page you
        enter results as you go (per-race finishing order, or final placements), and standings
        update live. Hit <strong>Finalize standings</strong> to lock in the official results, then
        set the tournament to <strong>Complete</strong>.
      </p>
      <p>
        Streaming it? You can drive the current race from chat with <code>!gs-tourney next</code>,
        show a live race card on your overlay, and even run it as a
        <a href="/help/tournaments/multi-crew-tournaments"> multi-crew battle</a>.
      </p>

      <h2>Bring a co-organizer (Circuit)</h2>
      <p>
        Add co-organizers by GameShuffle username from the manage page&apos;s <strong>Team
        access</strong> card. They can edit and run the tournament alongside you, while only you can
        delete it or change the team.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you set it up.</p>
    </HelpArticle>
  );
}
