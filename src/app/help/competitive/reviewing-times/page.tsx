import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/reviewing-times";
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
      <h1>Reviewing time trials</h1>
      <p>
        Community reviewers and updaters keep the <Link href="/time-trials">time trial</Link>{" "}boards honest.
        They check clips of top-ten runs, settle reported times and match listed names to accounts. This
        page is for them. Players can read <Link href="/help/competitive/time-trials">Time trials</Link>{" "}for
        how adding and proving times works.
      </p>

      <h2>The two roles</h2>
      <ul>
        <li><strong>Reviewer:</strong> checks clips, reports, name claims and imported proof in every game.</li>
        <li><strong>Updater:</strong> checks clips and reports for one game and items, such as Mario Kart 8 Deluxe with no mushrooms. Someone can look after more than one. Every Monday at 9am Pacific, each updater gets a notification with what waits in their list.</li>
      </ul>
      <p>
        The imported times are Mario Kart 8 Deluxe times with mushrooms, so the updaters for that game and items
        also settle name claims and check imported proof. Staff and admins see everything. Someone can be a
        reviewer and an updater at once.
      </p>

      <h2>Finding the queue</h2>
      <p>The review queue opens from two places, each with a count of what&apos;s waiting:</p>
      <ul>
        <li><strong>Reviews</strong>{" "}at the top of the time trials page.</li>
        <li><strong>Time trial reviews</strong>{" "}in the account menu, under Activity.</li>
      </ul>
      <p>
        It opens on the first tab with something waiting. Updaters see a line naming the game and items
        they check, and only those clips and reports.
      </p>

      <h2>Clips to check</h2>
      <p>
        Top-ten times with a clip waiting, the most vouched-for first, then the oldest. Each shows the
        player, track, board and time, with links to the screenshot and the clip. Watch the clip and check it
        shows the run.
      </p>
      <ul>
        <li><strong>Clip checks out:</strong> the time shows as Verified, and the player gets a notification.</li>
        <li><strong>Fix the time:</strong> when the clip or screenshot shows the run but the time, laps or category were typed wrong, correct them yourself. Add a note if it helps (like Your screenshot shows 1:38.040), then press <strong>Save and verify</strong>, or <strong>Save only</strong> to leave it unverified. The player gets a message with the old and new numbers and your note, and the change shows in the time&apos;s history.</li>
        <li><strong>Ask for an update:</strong> tap a quick ask (like Show the timer at the finish) or write your own, then press Send the ask. The player gets a notification (a message from the competitive bot if they play from Discord without an account) and your message on the time. The time stays on the board, unverified, and only the player and reviewers see the ask.</li>
      </ul>
      <p>
        When the player answers (a new clip, a picture, a fixed time or a reply), the time comes back to the top
        of this list marked <strong>Updated</strong>, with what you asked and what they said. If they haven&apos;t
        answered after a week, they get one reminder. An ask never removes a time: a time that shouldn&apos;t be
        on the board goes through a report.
      </p>
      <p>
        After you fix a time, the player can reply for 30 days if the fix is wrong. Their reply brings the time
        back here, marked <strong>Updated</strong>, with your fix and what they said.
      </p>

      <h2>Reports</h2>
      <p>
        Every open ticket on a time, with the reason and where it stands: New, Owner answered, or Waiting on
        the owner. Rows marked <strong>Flag</strong>{" "}come from GameShuffle&apos;s own proof checks: the
        same screenshot used for another time, a saved time that differs from what the screenshot showed,
        laps that don&apos;t add up, or a vehicle board the screenshot&apos;s vehicle doesn&apos;t belong to.
        Flags never show on the boards.
      </p>
      <p>Press <strong>Open the ticket</strong>{" "}to read the thread. On the ticket you can:</p>
      <ul>
        <li>Write in <strong>Ask or add a note</strong>{" "}and press Send. The owner gets a notification and the ticket waits on them until they answer.</li>
        <li>Fill in <strong>Reason</strong>{" "}and press <strong>Keep the time</strong>{" "}or <strong>Remove the time</strong>. Everyone in the ticket sees the reason, and the owner and the reporter get a notification.</li>
      </ul>
      <p>
        Your decision closes every open ticket on that time. A removed time comes off every board, and
        anyone who moves up into a top ten because of it is asked for a clip.
      </p>

      <h2>Name claims</h2>
      <p>
        When someone presses This is me on a listed player&apos;s page, the claim shows here: who asked,
        the name they claimed, how many times it has, their link and note, and any other claims on the same
        name. Check that the link shows the name is theirs, such as an MKCentral page, a channel or post
        under that name, or a clip of one of the runs.
      </p>
      <ul>
        <li><strong>It&apos;s them:</strong> the name&apos;s times and country move to their account, and later times for that name go straight there. Any other claims on the name are turned down automatically.</li>
        <li><strong>Not them:</strong> write why, then press Turn down. They see your reason and can ask again with a different link.</li>
      </ul>
      <p>Staff can undo an approved claim, which sends the times back to the listed player.</p>

      <h2>Imported proof</h2>
      <p>
        Imported times whose record came with a clip or a post, each board&apos;s record first, 100 at a time.
        Press <strong>Open the proof</strong>{" "}to watch it, or <strong>On the board</strong>{" "}to see the time in
        place.
      </p>
      <ul>
        <li><strong>It shows this run:</strong> the time shows as Verified.</li>
        <li><strong>It doesn&apos;t:</strong> write why, then press Turn down. The time leaves the list and stays unverified. If the name already belongs to an account, its owner gets a notification with your reason.</li>
      </ul>

      <h2>Verifying from a time&apos;s window</h2>
      <p>
        Press any time on a board to open its window. If you check that game and items, it has a{" "}
        <strong>Verify this time</strong>{" "}section. Check the player&apos;s clip or the imported proof, or paste
        a clip link that shows the run (YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or
        Instagram), then press <strong>Verify</strong>. A clip you paste is saved with the time. A time with
        no clip or imported proof can&apos;t be verified until you paste one. The owner gets a notification.
      </p>
      <p>
        The same section has <strong>Fix the time</strong>, for any time in your game and items, verified times
        and imported records included. It works as it does in the queue. You can&apos;t fix your own times as a
        reviewer: fix them as their player, before they&apos;re verified.
      </p>

      <h2>Team</h2>
      <p>
        Staff, admins and reviewers have a <strong>Team</strong>{" "}tab: everyone with access (staff first, then
        reviewers, then updaters) and a search to add more. Staff also see the recent changes and who made
        them.
      </p>

      <h2>Giving access</h2>
      <ul>
        <li><strong>Staff and admins</strong>{" "}can make anyone a reviewer or an updater, and take it away.</li>
        <li><strong>Reviewers</strong>{" "}can give and take away updater access. Only staff make reviewers.</li>
        <li>Nobody can change their own access. Staff and admins already see everything, so their access isn&apos;t changed here.</li>
      </ul>
      <p>There are two ways in, and both open the same window:</p>
      <ul>
        <li><strong>Review access</strong>{" "}on a player&apos;s time trials page.</li>
        <li>On the Team tab, type a name, @username or Discord name in <strong>Find someone</strong>, then press <strong>Give access</strong>{" "}or <strong>Change</strong>.</li>
      </ul>
      <p>
        In the window, tick <strong>Reviewer</strong>{" "}or <strong>Updater</strong>. For an updater, tick at
        least one game and items: Mario Kart 8 Deluxe or Mario Kart World, each with mushrooms or no
        mushrooms. Mario Kart 8 Deluxe with mushrooms is marked &ldquo;Also settles name claims&rdquo;. Press{" "}
        <strong>Save</strong>.
      </p>
      <p>
        The person needs a GameShuffle account. When you save, they get a notification and an email saying
        what they check now and how the queue works, including when access ends.
      </p>
    </HelpArticle>
  );
}
