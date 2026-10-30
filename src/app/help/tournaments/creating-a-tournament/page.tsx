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
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
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
        <li><strong>Game</strong>: Mario Kart 8 Deluxe, Mario Kart World, Mario Party Jamboree, Mario Party Superstars, or <strong>Other game</strong> with any name. Mario Kart adds track and build settings; every game gets the brackets, points and Heat &rarr; Mains formats.</li>
        <li>
          <strong>Not sure how to run it?</strong> <strong>Draft it with AI</strong> asks roughly how many players and how
          long you have, then suggests a format and drafts the description, rules and an announcement. Use any part with its
          own button and edit it from there. See <a href="/help/apps/ai-tools">AI tools</a>.
        </li>
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
        later from Settings. Use <strong> Invite</strong> on the manage page to notify your followers.
      </p>

      <h2>Sharing it</h2>
      <p>
        The <strong>Share</strong>{" "}button on the tournament page copies the link or posts it to X or Facebook. Wherever you
        paste it, the preview shows the tournament&apos;s own card: its name, date, game art (or your banner) and how many spots
        are filled. <strong>Copy for Discord</strong>{" "}copies the name, the start time and the link, and Discord shows the time in
        each reader&apos;s own timezone.
      </p>

      <h2>Running it</h2>
      <p>
        A new tournament starts as a <strong>Draft</strong>: only you and your co-organizers can see it, and a draft nobody has
        joined can be deleted from the manage page. Move it to <strong>Open for Registration</strong> to
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

      <h2>When it&apos;s over, or never happens</h2>
      <ul>
        <li><strong>Archive</strong> (on the manage page) takes a tournament off browse, your profile and every list. The page still works for anyone with the link, with an &ldquo;Archived&rdquo; note, and you can unarchive it any time. Cancelled tournaments leave the lists the same way.</li>
        <li>If an open tournament&apos;s date passes by two days and it never started, it leaves browse on its own and you get one notification to finish or cancel it. On a free account it also stops counting as your one active tournament.</li>
        <li>In <strong>My Stuff</strong> &rsaquo; <strong>Tournaments</strong>, archived and cancelled tournaments sit in a collapsed <strong>Archived</strong> section at the bottom, under Draft, Registration, In Progress and Complete.</li>
      </ul>

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
