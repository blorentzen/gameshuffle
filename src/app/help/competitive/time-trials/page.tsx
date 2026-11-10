import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/time-trials";
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
      <h1>Time trials</h1>
      <p>
        <Link href="/time-trials">Time trials</Link>{" "}keeps every player&apos;s best time on every Mario Kart 8
        Deluxe and Mario Kart World track, and every Kirby Air Riders Air Ride course, fastest first. You add
        times on GameShuffle or in Discord, and the community checks the fastest ones.
      </p>

      <h2>The boards</h2>
      <ul>
        <li><strong>Mario Kart 8 Deluxe:</strong> all 96 tracks, at 150cc and 200cc.</li>
        <li><strong>Mario Kart World:</strong> the 40 Time Trials courses, including the ten Super Mario Kart courses, at 150cc.</li>
      </ul>
      <p>
        Every track has a Mushrooms board and a No mushrooms board at each speed. Vehicle boards show
        only times set with that vehicle: Inside drift, Teddy Buggy, Biddybuggy and Mr. Scooty in Mario
        Kart 8 Deluxe, and Swoop, R.O.B.-HOG in Mario Kart World. A time on a vehicle board also counts on
        the open board. Pick a board with the filters above the tracks: <strong>Items</strong>,{" "}
        <strong>Speed class</strong>{" "}and <strong>Vehicle board</strong>.
      </p>

      <h3>Kirby Air Riders</h3>
      <p>
        <Link href="/time-trials/kirby-air-riders">Kirby Air Riders</Link>{" "}has a board for each of its 18
        Air Ride courses. The game keeps no online rankings for Time Attack, so these boards are where
        players compare. A time is one Time Attack run of the course at its default number of laps: three on
        Floria Fields and Fantasy Meadows, one on Mount Amberfalls and Galactic Nova, two on the rest. The
        game keeps its records per machine, so every Kirby time names the machine it was set on.
      </p>
      <ul>
        <li><strong>Any machine:</strong> every time on the course.</li>
        <li><strong>No Legendaries:</strong> every machine except Dragoon, Hydra and Leo.</li>
        <li><strong>One board per machine</strong>, from the Warp Star to the Bull Tank.</li>
      </ul>
      <p>
        There are no speed classes or items. Time Attack always runs at the normal tempo (with Game Tempo on
        Slow the game records nothing). Kirby times are added on the site only, not in Discord or by import,
        and we don&apos;t read Kirby screenshots yet: add the result screenshot as proof, then type the
        course, time and machine. Top Ride isn&apos;t on the boards.
      </p>

      <h3>Narrowing a board</h3>
      <p>On a track&apos;s board, two menus sit beside the filters:</p>
      <ul>
        <li><strong>Whose times:</strong> Everyone, Friends (you and the people you follow), My crew (anyone on a crew with you), or a Discord server where you&apos;ve used the bot.</li>
        <li><strong>Country:</strong> only players from one country.</li>
      </ul>
      <p>
        Under each board, <strong>National records</strong>{" "}lists each country&apos;s best. On the time
        trials page, the Country filter swaps each track&apos;s record for that country&apos;s best.
      </p>

      <h2>Adding a time on the site</h2>
      <ol>
        <li>Press <strong>Add a time</strong>{" "}on the time trials page or a track&apos;s board, and pick the game.</li>
        <li>Press <strong>Add your screenshot</strong>{" "}and choose a picture of the result screen. We read the track, time and laps from it, and the vehicle when the screen shows it.</li>
        <li>Check what we read, fix anything that&apos;s wrong, and press <strong>Add time</strong>.</li>
      </ol>
      <p>
        If the picture can&apos;t be read, or you&apos;ve used the day&apos;s reads, type the time yourself.
        The screenshot still counts as proof. Laps are optional; laps that don&apos;t add up to the time go
        to an updater to look at. A time faster than the track&apos;s world record can&apos;t be saved.
      </p>

      <h2>Adding a time in Discord</h2>
      <p>
        With the <Link href="/help/competitive/competitive-discord-app">GameShuffle Competitive app</Link>,
        use <code>/tt add</code>: pick the track and attach the result screenshot. Leave the time out and
        the bot reads it, then press <strong>Add it</strong>. Options set the speed class, mushrooms, the
        vehicle board and a clip link. A new best is posted in the channel with Verify, Vouch and Report
        buttons.
      </p>
      <p>
        Connect Discord in <strong>Account &rsaquo; Settings &rsaquo; Sign-in &amp; security</strong>{" "}and
        the times you add in Discord move onto your GameShuffle account.
      </p>

      <h2>Proof and clips</h2>
      <p>
        Every new time needs its result screenshot. Times in a board&apos;s top ten also need a clip of
        the run&apos;s last 30 seconds, on YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram. When you save a top-ten
        time we ask for the link. Add it then, or later with <strong>Add clip</strong>{" "}on your row of the
        board or on the bot&apos;s reply in Discord. If your time moves up into a top ten later, you get a
        notification asking for one.
      </p>
      <p>
        Your own time trials page lists everything waiting on you at the top, under <strong>Needs your attention</strong>:
        times a reviewer asked you to update, top-ten times still missing a clip, and reports to answer. Typed a
        time wrong? Open it and press <strong>Fix the time</strong>{" "}to change the time, laps or category. You can until
        it&apos;s verified; a reviewer checks it again, and vouches for the old time are cleared.
      </p>

      <h2>What the labels mean</h2>
      <p>Most labels show only on times in a board&apos;s top ten. Under review and Community verified can show on any time.</p>
      <ul>
        <li><strong>Unverified:</strong> no one has checked a clip of the run yet.</li>
        <li><strong>Clip in review:</strong> you added a clip and it&apos;s waiting for a reviewer.</li>
        <li><strong>Verified:</strong> a reviewer or updater checked the clip and it shows the run.</li>
        <li><strong>Update asked:</strong> only you (and reviewers) see this. A reviewer asked you to update the time: open it to see what they asked, then send a new clip, add a picture, fix the time or reply. It goes back to them when you do.</li>
        <li><strong>Community verified:</strong> ten players vouched for it.</li>
        <li><strong>Under review:</strong> someone reported it and a reviewer hasn&apos;t decided yet.</li>
        <li><strong>Trusted:</strong> the player has ten checked clips, none turned down, no time removed after a report and nothing under review. Their top-ten times don&apos;t need a clip.</li>
      </ul>
      <p>
        &ldquo;Vouched for in&rdquo; and a server&apos;s name under a player means someone who manages that
        Discord server pressed Verify on the bot&apos;s post.
      </p>

      <h2>Vouching</h2>
      <p>
        Anyone signed in can vouch for someone else&apos;s time: press the time on the board and choose{" "}
        <strong>Vouch for this time</strong>, or press Vouch on the bot&apos;s record posts in Discord.
        Updaters see vouched-for clips first. You can take a vouch back from the same window.
      </p>

      <h2>Your country</h2>
      <p>
        Your account has one country. It shows as a flag beside your name and puts your times on your
        country&apos;s records. Set it in <strong>Account &rsaquo; Profile &rsaquo; About you</strong>, on
        your own time trials page, in the Add a time window, or with <code>/tt country</code>{" "}in Discord.
        If you haven&apos;t picked one, we may fill it in from your confirmed lounge name or your MKCentral
        profile. One you pick always wins.
      </p>

      <h2>Importing a list</h2>
      <p>
        On the <Link href="/time-trials/import">import page</Link>{" "}(sign in first), bring the times you
        already have:
      </p>
      <ul>
        <li><strong>From Quaxly:</strong> run <code>/dx display_time</code>{" "}(or <code>/display_time</code>{" "}for Mario Kart World) with yourself as the player. Press and hold Quaxly&apos;s reply (right-click on a computer), tap Apps and pick <strong>Save to GameShuffle</strong>. <strong>Add to my apps</strong>{" "}on the import page adds GameShuffle Competitive to your Discord account so this works in any server.</li>
        <li><strong>From MKCentral:</strong> for Mario Kart World, <strong>Bring my MKCentral times</strong>{" "}finds you by your connected Discord account.</li>
        <li><strong>Paste a list</strong>, <strong>Screenshots</strong>{" "}of Quaxly&apos;s reply, or <strong>Type them in</strong>.</li>
      </ul>
      <p>
        You check every row under <strong>Check what we read</strong>{" "}before pressing Save. Shrooms lists go
        on the mushrooms boards and No-items lists on the no mushrooms boards. Only times faster than your
        saved best are kept.
      </p>
      <p>
        Imported times show as Imported until they have a screenshot. Add one with{" "}
        <strong>Add a screenshot</strong>{" "}in the time&apos;s window, or <code>/tt proof</code>{" "}in Discord.
        If the screenshot shows a different time, an updater checks it.
      </p>

      <h2>Older times and your name</h2>
      <p>
        Some times were set before players came to GameShuffle, brought over from the community&apos;s
        existing Mario Kart 8 Deluxe records so the boards start complete. If one of those names is you, open
        its player page and press <strong>This is me</strong>. Add a link that shows the name is yours
        (your MKCentral page, a channel or post under that name, or a clip of one of the runs) and an
        optional note. An updater checks it, and you get a notification either way. Once approved, the
        times move to your account and any new ones for that name come straight to you. One of these times
        shows as Verified once its picture or clip is checked.
      </p>

      <h2>Reporting a time</h2>
      <p>
        If a time looks wrong, sign in and press the flag on its row or <strong>Report this time</strong>{" "}in
        its window. Say what&apos;s wrong and add a link if you have one. In Discord, press Report on the
        bot&apos;s post.
      </p>
      <p>
        A report opens a ticket. The time&apos;s owner gets a notification and can answer with proof on the
        ticket&apos;s page. A reviewer then keeps or removes the time, with a reason everyone in the ticket
        sees. A removed time comes off every board.
      </p>

      <h2>Your player page and Compare</h2>
      <p>
        <strong>Your times</strong>{" "}opens your player page: how many tracks you have times on, your
        records, top tens and verified times, then every best with its place and label. Names on the boards
        open each player&apos;s page.
      </p>
      <ul>
        <li><strong>Compare</strong>{" "}on a player&apos;s page asks for a second player&apos;s username and shows both players&apos; times side by side, with the gaps.</li>
        <li>Press any time on a board for its window: the proof, the laps (beside the record&apos;s when it has them), the combo, vouches and history, with <strong>Compare with mine</strong>{" "}and <strong>Copy link</strong>.</li>
        <li>To take one of your times down, press the trash icon on your row. Your next best takes its place.</li>
      </ul>

      <p>
        Reviewers and updaters check the clips, reports and name claims. How that works is in{" "}
        <Link href="/help/competitive/reviewing-times">Reviewing time trials</Link>.
      </p>
    </HelpArticle>
  );
}
