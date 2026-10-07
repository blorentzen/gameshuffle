import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/kirby-air-riders-randomizer";
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
      <h1>The Kirby Air Riders randomizer</h1>
      <p>
        The <Link href="/randomizers/kirby-air-riders">Kirby Air Riders randomizer</Link>{" "}puts up to eight players on a random
        rider and machine, rolls an Air Ride or Top Ride course and picks the City Trial Stadium. It&apos;s new, so some parts
        may still change.
      </p>
      <p>
        It has three tabs: <strong>Rider &amp; Machine</strong>, <strong>Courses</strong> and <strong>City Trial</strong>.
      </p>

      <h2>Riders and machines</h2>
      <p>
        On <strong>Rider &amp; Machine</strong>, press <strong>Add Player</strong> until everyone has a card (up to eight), type
        names if you like, then press <strong>Randomize Riders</strong>. Each player gets a rider and a machine, and the card
        shows the machine&apos;s type underneath. Riders are all different, picked from all 21. Machines can repeat, just like
        in the game.
      </p>
      <p>
        <strong>Refresh Rider</strong> rolls a new rider and machine for one player, still keeping their rider different from
        everyone else&apos;s. <strong>Remove Player</strong> takes a card away. Switch off <strong>Rolling animation</strong>{" "}if you&apos;d rather see results straight away.
      </p>

      <h2>Options</h2>
      <p>Press <strong>Change options</strong> beside the Options line, pick what you want, then press <strong>Done</strong>:</p>
      <ul>
        <li>
          <strong>Machines:</strong> pick from <strong>Stars</strong>, <strong>Bikes</strong>, <strong>Chariots</strong>, <strong>Tanks</strong>{" "}and <strong>Legendary</strong>. Picking none means every type except Legendary (23 machines),
          because Legendary machines aren&apos;t allowed in every mode. To add them, pick Legendary along with the other types
          you want; Legendary on its own rolls only the four Legendary machines.
        </li>
        <li>
          <strong>New save (starters only):</strong> just what&apos;s open at the start. That&apos;s Kirby, King Dedede, Meta
          Knight and Waddle Dee, the Warp Star and Compact Star, and the eight Air Ride courses open on a new save. Both starting
          machines are Stars, so the machine types don&apos;t change anything here. With only four riders, a group bigger than
          four will see some riders twice.
        </li>
      </ul>
      <p>The Flight Warp Star is never rolled, since it&apos;s only for Free Run.</p>

      <h2>Courses</h2>
      <p>
        On <strong>Courses</strong>, press <strong>Roll an Air Ride course</strong> for one of the 18 Air Ride courses, or <strong>Roll a Top Ride course</strong>{" "}for one of the 9 Top Ride courses. With New save on (it&apos;s in the
        Rider &amp; Machine options), Air Ride only picks from the eight courses open at the start.
      </p>

      <h2>City Trial Stadiums</h2>
      <p>
        City Trial ends in a Stadium. On <strong>City Trial</strong>, press <strong>Roll a Stadium</strong>{" "}(then <strong>Roll again</strong>) to pick one of the 16, either to play it or to call it before the timer runs out. A
        tag shows what kind of Stadium it is.
      </p>
      <p>
        <strong>Change options</strong> on this tab picks the kinds: <strong>Battle</strong>, <strong>Race</strong>, <strong>Gliding</strong>, <strong>Collecting</strong>{" "}and <strong>Boss</strong>. Boss is off to start with, and one kind always
        stays on. City Trial events happen on their own in the game, so they aren&apos;t rolled.
      </p>

      <h2>Saving and sharing a setup</h2>
      <p>
        <strong>Save Complete Setup</strong>, at the top beside the tabs, keeps everyone&apos;s name, rider and machine, the
        course and the Stadium together. Name it and press <strong>Save setup</strong>. Signed out, it takes you to create a
        free account first.
      </p>
      <p>
        Find it later in <strong>Account</strong> &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong>. The <strong>Open in Randomizer</strong> button loads it back, and <strong>Copy share link</strong> gives you
        a link to send to everyone playing.
      </p>

      <h2>On stream</h2>
      <p>
        Streaming on Twitch with GS Pro? While your Twitch category is Kirby Air Riders, viewers join your lobby with <code>!gs-join</code>{" "}and type <code>!gs-shuffle</code> to roll their own rider and machine (Legendary machines left
        out). The lobby holds 16, the same as an online City Trial. Your own rolls show on your <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the <a href="/help/streaming/chat-commands">chat command reference</a>{" "}for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
