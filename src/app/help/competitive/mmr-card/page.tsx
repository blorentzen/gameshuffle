import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/mmr-card";
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
      <h1>The MMR card</h1>
      <p>
        The <Link href="/mmr-card">MMR card</Link>{" "}puts your Mario Kart lounge MMR on stream and keeps
        it up to date: your number, your division, how far to the next one and tonight&apos;s run. It
        reads MKCentral&apos;s lounge for Mario Kart 8 Deluxe and Mario Kart World (12 and 24 players),
        and it&apos;s free with a GameShuffle account.
      </p>

      <h2>Set it up</h2>
      <ol>
        <li>Open the <Link href="/mmr-card">MMR card</Link>{" "}studio. Type your lounge name exactly as it shows on MKCentral, pick the game and press <strong>Find me</strong>.</li>
        <li>Pick a card under <strong>Start from a ready-made card</strong>, or build your own in the three tabs beside the preview: Look, What&apos;s on the card and Moments.</li>
        <li>Make a free account to get your OBS link. You can build the whole card first: it waits in your browser and comes with you.</li>
      </ol>
      <p>
        Changes save themselves. If you change your lounge name on MKCentral, the card keeps following
        you.
      </p>

      <h2>Live card or picture</h2>
      <p>
        At the top of the studio, pick <strong>Live card</strong>{" "}for your stream or{" "}
        <strong>Picture</strong>{" "}for a still card to post. A picture comes in three sizes (Square,
        Wide and Story), with <strong>Share</strong>, <strong>Save picture</strong>{" "}and{" "}
        <strong>Copy link</strong>. The link always shows your latest card. Pictures need a free account.
      </p>

      <h2>Layouts</h2>
      <p>Pick a layout at the top of the Look tab:</p>
      <ul>
        <li><strong>Deck card:</strong> the full card, with room for three details.</li>
        <li><strong>Overlay panel:</strong> your number beside up to four tiles. It can add &ldquo;Type !mmr in chat&rdquo; at the bottom while GameShuffle&apos;s bot is in your Twitch chat.</li>
        <li><strong>Squares strip:</strong> a thin bar with your last 10 events as squares, and room for one detail.</li>
        <li><strong>Sticker:</strong> a small card with room for one detail.</li>
        <li><strong>Rolling:</strong> one piece at a time, so everything you turn on fits.</li>
      </ul>
      <p>
        On the Deck card and Overlay panel, <strong>Line up</strong>{" "}puts the number on the left or in
        the center.
      </p>
      <p>Rolling has its own settings:</p>
      <ul>
        <li><strong>Shape:</strong> Bar, Box or Tall (for vertical streams).</li>
        <li><strong>Name and emblem:</strong> stay on the card, or roll with the rest.</li>
        <li><strong>Motion:</strong> Slide up, Slide across, Flip, Fade, Deal or Ticker.</li>
        <li><strong>Each slide:</strong> 4, 6, 8 or 12 seconds.</li>
        <li><strong>Progress:</strong> Dots, Line or None.</li>
      </ul>
      <p>
        When your number changes on Rolling, the card jumps to the MMR slide, plays the change, then
        carries on from where it was.
      </p>

      <h2>What&apos;s on the card</h2>
      <p>Every piece has its own switch, in four groups:</p>
      <ul>
        <li><strong>Who:</strong> lounge name, country (as a flag, a code or both), game and division name.</li>
        <li><strong>Numbers:</strong> MMR, world rank, country rank, top %, season peak, and progress to the next division.</li>
        <li><strong>Tonight:</strong> last change, tonight&apos;s run, win streak (from two wins in a row) and tonight&apos;s goal (GS Pro, below).</li>
        <li><strong>Season:</strong> last 10, recent events (the latest 3 or 5), events and win %, average score and partner average.</li>
      </ul>
      <p>
        Each layout has a set number of spots for details, and a meter shows how many are used. Your
        name and the big number have spots of their own. When it&apos;s full, turn a piece off or pick
        Rolling.
      </p>
      <p>
        Under <strong>The big number</strong>, pick MMR, World rank or Division. With World rank or
        Division as the big number, or on Rolling, <strong>Keep MMR off the card</strong>{" "}hides your
        MMR, season peak and goal. On the Squares strip, Sticker and Rolling,{" "}
        <strong>Under the number</strong>{" "}can show tonight&apos;s run, your last 10, or both.
      </p>

      <h2>Moments</h2>
      <p>
        Moments play when a new event is verified. Each one has a switch on the Moments tab:
      </p>
      <ul>
        <li><strong>The change pops:</strong> the change shows big while the card steps back.</li>
        <li><strong>The number moves:</strong> it rolls like a reel or counts up to the new number.</li>
        <li><strong>Three wins in a row:</strong> a flame tag while the streak lasts.</li>
        <li><strong>A new season peak:</strong> a gold New peak tag until your next event.</li>
        <li><strong>A new division:</strong> a banner, sparks and the layout&apos;s own move.</li>
        <li><strong>A rank milestone:</strong> a laurel banner the first time you reach the world top 1,000, 250, 100 or 10.</li>
        <li><strong>Reaching tonight&apos;s goal</strong>{" "}(GS Pro): a gold Goal reached banner.</li>
      </ul>
      <p>
        Press the buttons under the preview (A win, A loss, A new division) to watch them, and{" "}
        <strong>Reset</strong>{" "}to go back.
      </p>

      <h2>Looks</h2>
      <p>
        The Look tab sets the <strong>Surface</strong>{" "}(Dark, Light or See-through), then{" "}
        <strong>Colors</strong>, <strong>Background</strong>, <strong>Emblem</strong>{" "}and{" "}
        <strong>Font</strong>. <strong>More</strong>{" "}holds the border, the finish and the GameShuffle
        branding. These are free:
      </p>
      <ul>
        <li>Colors: division colors, GameShuffle blue, or any color of your own.</li>
        <li>Backgrounds: Solid, Glow, Glyphs, Checkered, Speed lines, Stage lights and Night drive.</li>
        <li>Emblem: Medal, Name only or Off.</li>
        <li>Fonts: Rubik Italic and GameShuffle&apos;s own.</li>
        <li>A border in one color, and the Built by GameShuffle line, a tab under the card, or the GameShuffle mark only.</li>
        <li>One saved look.</li>
      </ul>
      <p>
        Paid looks come with GS Pro, or with Supporter looks from the Supporter level of{" "}
        <Link href="/support">monthly support</Link>. In the menus they sit under the name that unlocks
        them:
      </p>
      <ul>
        <li>Brand themes and two colors of your own.</li>
        <li>Stripes, dots, or your own picture or GIF behind the card.</li>
        <li>About a dozen more fonts, or any Google Font.</li>
        <li>A two-color border, foil, your picture as the emblem, and hiding the GameShuffle line.</li>
        <li>Your own order of the pieces, a time per slide on Rolling, and a line of your own on the card (up to 40 characters, like Road to Master).</li>
        <li>Up to ten saved looks, one per game or mode.</li>
      </ul>
      <p>
        You can try any paid look in the preview. Saved without them, your card keeps the free version
        of each choice, and <strong>Keep these looks</strong>{" "}under the preview shows how to unlock
        them.
      </p>

      <h2>Add it to OBS</h2>
      <ol>
        <li>Under <strong>Add it to OBS</strong>, press <strong>Copy link</strong>.</li>
        <li>In OBS or Streamlabs, add a Browser source and paste the link.</li>
        <li>Set its size to what the studio shows under the preview, like &ldquo;In OBS: 700 wide, 450 tall&rdquo;. The size changes as you change the card, and the page behind the card is see-through.</li>
      </ol>
      <p>
        The widths are 700 for the Deck card and Overlay panel, 760 for the Squares strip and 320 for the
        Sticker. Rolling is 700 as a bar, 380 as a box and 320 tall. The height depends on what&apos;s on
        the card.
      </p>
      <p>
        The card checks the lounge every 30 seconds. MMR moves once an event&apos;s table is verified,
        usually a minute or two after the last race, and that&apos;s when the moment plays.
      </p>
      <p>
        Keep the link private: anyone with it can show your card. If it gets out, press{" "}
        <strong>Make a new link</strong>. The old link stops working, so paste the new one into OBS.
      </p>
      <p>
        With GS Pro, you can also show the card on your{" "}
        <Link href="/help/streaming/obs-overlay">GameShuffle overlay</Link>: in{" "}
        <strong>Account &rsaquo; Streaming &rsaquo; Overlay &rsaquo; Layout</strong>, pick MMR card under
        Apps and turn on <strong>Show on this format</strong>.
      </p>

      <h2>Tonight&apos;s run and tonight&apos;s goal</h2>
      <p>
        Tonight&apos;s run counts from when you went live on Twitch if it&apos;s connected, else from
        midnight Pacific.
      </p>
      <p>
        With GS Pro, set a goal under <strong>What&apos;s on the card &rsaquo; Tonight &rsaquo;
        Tonight&apos;s goal</strong>: type a number in <strong>Goal MMR</strong>{" "}and press{" "}
        <strong>Set goal</strong>. The card shows how far you have to go, and{" "}
        <code>!mmr</code>{" "}adds it in chat. A goal lasts for the lounge night you set it on (6am to 6am
        Pacific) or the Twitch stream you set it during. Turn on{" "}
        <strong>Keep my goal after tonight</strong>{" "}to keep it until you clear it.
      </p>

      <h2>After the stream</h2>
      <ul>
        <li><strong>Night recap</strong>{" "}(GS Pro): a second link for your ending scene, with tonight&apos;s change, record, best event, any new division and tonight&apos;s squares, in your card&apos;s look. Size it 700 wide.</li>
        <li><strong>Weekly report</strong>{" "}(GS Pro): turn on <strong>Send me a lounge report every Monday</strong>. At 9am Pacific each Monday you get an email and a notification with last week&apos;s change, record, best night, division changes and the rivals you met most. It needs your lounge name confirmed through Discord, and a week with no events sends nothing.</li>
        <li><strong>Share the night</strong>{" "}(free): once you&apos;ve <Link href="/help/competitive/lounge-stats">confirmed your lounge name</Link>, share a picture of your latest lounge night with a link to your lounge page.</li>
        <li><strong>Show my card on my GameShuffle profile:</strong> your profile shows a Lounge MMR sticker in your look, with your name, division, last change and tonight&apos;s goal. Move it with the rest of your profile in <strong>Account &rsaquo; Profile &rsaquo; Profile page</strong>.</li>
      </ul>

      <h2>Saved looks</h2>
      <p>
        Under <strong>Saved looks</strong>, name each look and press <strong>Use this look</strong>{" "}to
        switch. With GS Pro and Twitch connected, turn on{" "}
        <strong>Switch looks with my Twitch game</strong>{" "}and the card changes looks when your game
        changes.
      </p>

      <h2>In chat and in Discord</h2>
      <p>
        Your card answers <code>!mmr</code>{" "}in Twitch chat while GameShuffle&apos;s bot is there, which
        comes with GS Pro&apos;s Twitch setup. In Discord, <code>/mmr</code>{" "}on the{" "}
        <Link href="/help/competitive/competitive-discord-app">GameShuffle Competitive app</Link>{" "}shows
        it. The other lounge commands are in <Link href="/help/competitive/lounge-stats">Lounge stats</Link>.
      </p>

      <h2>Still need help?</h2>
      <p>
        Use the <Link href="/contact-us">contact form</Link>.
      </p>
    </HelpArticle>
  );
}
