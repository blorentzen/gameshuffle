import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { HelpToolLinks } from "@/components/help/HelpToolLinks";
import { findArticle } from "@/lib/help/manifest";
import { MKWII_PUBLIC } from "@/lib/games-visibility";

const HREF = "/help/apps/mario-kart-wii-randomizer";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

/** Hidden in production with the randomizer until the Mario Kart Wii space opens (MKWII_PUBLIC). */
export default function Page() {
  if (!MKWII_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <HelpArticle href={HREF}>
      <h1>How to use the Mario Kart Wii randomizer</h1>
      <HelpToolLinks links={[{ href: "/randomizers/mario-kart-wii", label: "Mario Kart Wii randomizer" }]} />
      <p>Playing Mario Kart World or Mario Kart 8 Deluxe? Use the <Link href="/randomizers/mario-kart-world">Mario Kart World randomizer</Link> or the <Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe randomizer</Link>.</p>
      <p>
        The <Link href="/randomizers/mario-kart-wii">Mario Kart Wii randomizer</Link>{" "}gives up to 12 players a character and a
        vehicle, rolls a race list from all 32 tracks, and picks battle arenas. It follows the game&apos;s size classes: a small
        character always gets a small kart or bike, a large character a large one.
      </p>

      <h2>Roll everyone&apos;s combo</h2>
      <p>
        On the <strong>Kart Randomizer</strong> tab, press <strong>Add Player</strong> for each person, then
        <strong> Randomize Karts</strong>. Each card shows a character and a vehicle, and a line under the vehicle says its size,
        whether it&apos;s a kart or a bike, and which way a bike drifts. <strong>Randomize now</strong> at the top of the page does
        the same roll and scrolls you to the result. Players can get the same character, as they can in the game.
      </p>
      <p>
        The refresh button on a card gives that player a new combo, and the remove button takes the card away. Type in
        <strong> Player name</strong>{" "}so everyone knows which card is theirs.
      </p>
      <p>
        The roster is the game&apos;s 24 characters plus your Mii. A Mii&apos;s size class depends on its height and weight, so
        the card says which size of Mii to race with: <strong>Mii (Small)</strong>, <strong>Mii (Medium)</strong>{" "}or
        <strong> Mii (Large)</strong>.
      </p>

      <h2>Filters</h2>
      <p>
        <strong>Change options</strong> opens two filters. <strong>Size class</strong>{" "}keeps the roll to <strong>Small</strong>,
        <strong> Medium</strong>{" "}or <strong>Large</strong>{" "}characters (pick one or more). <strong>Vehicles</strong>{" "}keeps it to
        <strong> Karts</strong>, <strong>Bikes, outside drift</strong>{" "}or <strong>Bikes, inside drift</strong>. The inside-drift
        bikes are the Bullet Bike, Quacker, Magikruiser, Jet Bubble, Mach Bike, Sneakster, Dolphin Dasher, Flame Runner and Spear;
        every other bike and every kart drifts on the outside. The vehicle always matches the character&apos;s size, even with a
        filter on.
      </p>
      <p>
        The <strong>Rolling animation</strong>{" "}switch turns the spinning reel on or off. This browser remembers your choice.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong>{" "}tab, stay on <strong>Standard Races</strong>, choose 4, 8, 12, 16 or 32 races and
        press <strong>Randomize Races</strong>. Tracks come from all eight cups. The four retro cups (Shell, Banana, Leaf and
        Lightning) carry the console in each name, like GCN Peach Beach or N64 Bowser&apos;s Castle. A track can come up more than
        once; turn on <strong>No Duplicates</strong>{" "}under <strong>Change options</strong>{" "}to stop that. For a war, choose 12
        races with No Duplicates on.
      </p>

      <h2>Pick battle arenas</h2>
      <p>
        On the same tab, switch to <strong>Battle</strong>, choose how many arenas and press
        <strong> Randomize Battle Arenas</strong>. You get arenas from the game&apos;s ten, five new ones and five retro ones,
        never the same one twice.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong>{" "}keeps your players, their combos and your race list together. Name it and press
        <strong> Save Setup</strong>. You need to be signed in. Find them in <strong>Account</strong>{" "}&rsaquo;{" "}
        <strong>Your events</strong>{" "}&rsaquo; <strong>Saved setups</strong>; open one to load it back here. Battle arenas
        aren&apos;t saved.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Mario Kart Wii, viewers can type <code>!gs-shuffle</code>{" "}in chat
        to roll a combo of their own. Add a size or a kind of vehicle to narrow it: <code>!gs-shuffle large bike</code>,
        <code> !gs-shuffle kart</code>, <code>!gs-shuffle inside</code>. The lobby holds 12, like an online room. Mods can roll the
        races with <code>!gs setup</code>{" "}(4 races), <code>!gs setup 12</code>, <code>!gs setup cup</code>{" "}for one cup in
        order, or <code>!gs setup battle</code>{" "}for an arena. See the <a href="/help/streaming/chat-commands">chat command
        reference</a>{" "}for the rest.
      </p>

      <h2>Wars</h2>
      <p>
        The GameShuffle Competitive app scores Mario Kart Wii wars with the game&apos;s own points (15 for first down to 0 for
        twelfth). See <a href="/help/competitive/wars">Wars</a>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
