import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/mario-kart-64-randomizer";
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
      <h1>The Mario Kart 64 randomizer</h1>
      <p>
        The <Link href="/randomizers/mario-kart-64">Mario Kart 64 randomizer</Link>{" "}picks a character for up to four players,
        a race list from all 16 tracks, battle courses for Battle mode and an item set. It follows the N64 game: there are no
        karts or parts to pick, and every player gets a different character. It&apos;s new, so some parts may still change.
      </p>

      <h2>Pick everyone&apos;s character</h2>
      <p>
        On the <strong>Character Randomizer</strong> tab, press <strong>Add Player</strong> for each person (up to four), then
        <strong> Randomize Characters</strong>. Everyone gets a different racer from the eight: Mario, Luigi, Peach, Toad, Yoshi,
        Donkey Kong, Wario and Bowser. <strong>Randomize now</strong> at the top of the page does the same roll and scrolls you
        to the result.
      </p>
      <p>
        <strong>Refresh Character</strong> gives one player someone nobody else has. Type in <strong>Player name</strong> so
        everyone knows which card is theirs, and <strong>Remove Player</strong> takes a card away.
      </p>
      <p>
        <strong>Change options</strong> opens <strong>Character Weights</strong>: <strong>Light</strong> (Peach, Toad, Yoshi),
        <strong> Medium</strong> (Mario, Luigi) and <strong>Heavy</strong> (Donkey Kong, Wario, Bowser). Pick one or more to keep
        to those racers. If your pick has fewer racers than players (Medium only has two), some players will share.
      </p>
      <p>
        The <strong>Rolling animation</strong> switch turns the spinning reel on or off. This browser remembers your choice.
      </p>

      <h2>Roll the races</h2>
      <p>
        On the <strong>Race Randomizer</strong> tab, stay on <strong>Standard Races</strong>, choose 4, 8, 12 or 16 races and
        press <strong>Randomize Races</strong>. Tracks come from the Mushroom, Flower, Star and Special Cups and can come up more
        than once. To stop that, open <strong>Change options</strong> and turn on <strong>No Duplicates</strong>; with 16 races
        you then play every track once.
      </p>

      <h2>Pick battle courses</h2>
      <p>
        On the same tab, switch to <strong>Battle</strong>, choose 1 to 4 courses and press
        <strong> Randomize Battle Courses</strong>. You get Big Donut, Block Fort, Double Deck or Skyscraper, never the same one
        twice.
      </p>

      <h2>Choose an item set</h2>
      <p>
        The <strong>Item Randomizer</strong> tab shows the game&apos;s 14 items, from Banana and Fake Item to Spiny Shell and Boo.
        Tap an item to turn it on or off, or set a number next to <strong>Random</strong> and press
        <strong> Randomize Items</strong> to get that many. <strong>Select All</strong> and <strong>Clear All</strong> reset the
        set, and the category buttons (<strong>Offensive</strong>, <strong>Defensive</strong>, <strong>Boost</strong>,
        <strong> Special</strong>) filter what you see. <strong>Save Item Set</strong> keeps just the items.
      </p>

      <h2>Saving your setup</h2>
      <p>
        <strong>Save Complete Setup</strong> keeps your players, their characters, your race list and your item set together.
        Name it and press <strong>Save Setup</strong>. You need to be signed in. Saved setups are in <strong>Account</strong>{" "}
        &rsaquo; <strong>My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong>; open one to load it back here, and the
        button changes to <strong>Update:</strong> plus the setup&apos;s name so you can save over it. Battle courses aren&apos;t
        saved.
      </p>

      <h2>On stream</h2>
      <p>
        If you stream with GS Pro and your Twitch category is Mario Kart 64, viewers can type <code>!gs-shuffle</code> in chat to
        roll a racer of their own. The lobby holds four, like the game&apos;s online room. Your own rolls show on your{" "}
        <a href="/help/streaming/obs-overlay">OBS overlay</a>. See the <a href="/help/streaming/chat-commands">chat command
        reference</a> for the rest.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
