import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/time-trial-tournaments";
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
      <h1>Time trial tournaments</h1>
      <p>
        A time trial tournament ranks players by their times on the tracks you pick, for Mario Kart 8 Deluxe and Mario Kart
        World. Run it as its own event (one leaderboard, or rounds of groups with a cut), or use times to decide the matches
        of a Swiss event or a single or double elimination bracket. It works online over days, or in one evening at a venue.
        Every time also goes on the{" "}<Link href="/help/competitive/time-trials">time trial boards</Link>.
      </p>

      <h2>Set up a time trial event</h2>
      <p>Pick <strong>Time trial</strong>{" "}as the format when you{" "}<Link href="/help/tournaments/creating-a-tournament">create a tournament</Link>. Then choose:</p>
      <ul>
        <li><strong>The board:</strong> speed (150cc or 200cc on Mario Kart 8 Deluxe), Mushrooms or No mushrooms, and a vehicle if you want one.</li>
        <li><strong>Tracks:</strong> one track, a cup, your own list (up to 16), or roll them. Rolled tracks can stay hidden until the event opens, so nobody practices ahead.</li>
        <li><strong>The shape:</strong> one leaderboard with a single window (a live hour, a weekend, a week, or anything from 30 minutes to four weeks), or groups (below).</li>
        <li><strong>Scoring:</strong> total time (each track&apos;s best added together) or points by place (15 for 1st, 12, 10, then down by one).</li>
        <li><strong>Clips:</strong> who adds a clip of the run&apos;s last 30 seconds before the results are final: the top three on each track, the fastest, everyone, or nobody.</li>
      </ul>
      <p>
        With groups, each round has a group size from 2 to 12 and how many move on from each group. The last round is the
        final, one group. Groups of 2 with one moving on make a 1v1 knockout. The form shows what your plan does with the
        players you have.
      </p>

      <h2>Add a time</h2>
      <p>
        Players press <strong>Add my time</strong>{" "}on the tournament page and add a screenshot of the result screen. We read
        the time from it. Players can add as many times as they like while the window is open, and their best counts. A time
        that needs a clip asks for it right away, or later from the same page.
      </p>
      <p>
        In Discord, <strong>/tt add</strong>{" "}with the Competitive app saves a time to the boards and offers a{" "}
        <strong>Count it in</strong>{" "}button for each tournament it fits, so nobody adds the same run twice.
      </p>

      <h2>Run the event</h2>
      <p>The manage page&apos;s <strong>Run</strong>{" "}tab has one main button for the next step:</p>
      <ol>
        <li><strong>Start</strong>{" "}opens the leaderboard, or round 1. Groups are spread by everyone&apos;s best times on these tracks, and each player hears when their round opens.</li>
        <li>While it runs you can add time to everyone&apos;s window or to one group, close early, or type a time in for a player (it counts as checked).</li>
        <li>After a round closes, the cut decides who moves on. A tie at the cut line goes to the better single-track place, then to a run-off on one track.</li>
        <li><strong>Finish</strong>{" "}saves the results once the clips you asked for are checked.</li>
      </ol>

      <h3>Verifiers</h3>
      <p>
        You and your co-organizers check times on the Run tab. To share the work, add <strong>verifiers</strong>{" "}by username.
        They see the times to check on the tournament page, with each screenshot and clip, and mark each one Counts or
        Doesn&apos;t count. A time that doesn&apos;t count stops counting, and the player gets a notification with your note.
      </p>

      <h2>Swiss and brackets decided by time trial</h2>
      <p>
        In{" "}<Link href="/help/tournaments/swiss-and-deck-lists">Swiss</Link>{" "}or elimination, set{" "}
        <strong>Decide matches by</strong>{" "}to <strong>Time trial</strong>. Each match is best of 1 track or best of
        3 (first to two), and each round races the next tracks on your list. Both players add their times, the faster time takes
        each track, and the match settles itself once the times decide it. Every open bracket match runs at the same time, and
        both players hear when theirs opens.
      </p>
      <p>
        When players run out of time, settle a match on the times so far: a track with one time goes to that player. A level
        Swiss match is a tie; a level bracket match waits for you to pick the winner.
      </p>
      <h3>Clips for matches</h3>
      <p>
        Under <strong>Proof</strong>, pick who adds a clip before a match counts: nobody (screenshots only), the faster time on
        each track, or both players. A match the times have decided waits until its clips are checked, and nobody can add more
        times to it meanwhile. Once the clips are checked, it counts and the bracket moves on. If a check rejects a time, the
        match opens again. Settling a match yourself skips the check.
      </p>

      <h2>In person</h2>
      <p>
        When the tournament&apos;s location is in person, a time trial event runs at stations instead of windows. Set how many
        consoles you have, and only players checked in at the venue go in the groups.
      </p>
      <ul>
        <li>Groups are called to free stations in order, and each player gets a notification: &ldquo;Go to Station 3: Group C is up.&rdquo;</li>
        <li>Give each station&apos;s runner its link from the Run tab. It opens a page where they type in the times, with no account and no screenshots. Anyone with a link can add times there, so share it only with your runner; <strong>Make new runner links</strong>{" "}turns the old ones off.</li>
        <li>The runner presses Done to call the next group to that station.</li>
        <li><strong>Display mode</strong>{" "}shows the stations, the latest times and each group&apos;s standings on a TV at the venue.</li>
      </ul>

      <h2>On stream</h2>
      <p>
        If you stream with the{" "}<Link href="/help/streaming/obs-overlay">GameShuffle overlay</Link>, the <strong>Time trial</strong>{" "}piece
        (<strong>Streaming</strong> &rsaquo; <strong>Overlay</strong> &rsaquo; <strong>Layout</strong>) shows
        the track or round, the time left and the standings with your own row lit up. In Swiss or a bracket it shows your
        match. It appears while you play in or run a time trial tournament, and stays up for 20 minutes after an event
        finishes. A tournament you play in comes first.
      </p>

      <h2>Still need help?</h2>
      <p>
        <Link href="/contact-us">Contact us</Link>{" "}and tell us which tournament it is.
      </p>
    </HelpArticle>
  );
}
