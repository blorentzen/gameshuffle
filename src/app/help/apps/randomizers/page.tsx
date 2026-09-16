import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/randomizers";
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
      <h1>Using the Randomizers</h1>
      <p>
        The randomizers shuffle karts, characters, and tracks so every race is a surprise. They&apos;re
        free, need no account to play, and cover both Mario Kart games. Find them on the
        <Link href="/apps"> Apps</Link> hub.
      </p>

      <h2>The two games</h2>
      <ul>
        <li>
          <strong><Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe</Link></strong>:
          full <strong>4-part combos</strong> (character, vehicle, wheels, glider), with tour-only and
          drift filters, and up to 48 races.
        </li>
        <li>
          <strong><Link href="/randomizers/mario-kart-world">Mario Kart World</Link></strong>:
          <strong> 2-part combos</strong> (character and vehicle), a vehicle-type filter
          (Kart / Bike / ATV), <strong>knockout rallies</strong>, and overworld track icons.
        </li>
      </ul>

      <h2>How to use one</h2>
      <ol>
        <li>Open a randomizer and add your players.</li>
        <li>Use the <strong>Kart</strong>, <strong>Race</strong>, and <strong>Item</strong> tabs to choose what to randomize.</li>
        <li>Set any filters you want (weight, drift, vehicle type, tour-only) and how many races to pull.</li>
        <li>Shuffle. Re-roll any player or track you don&apos;t like.</li>
      </ol>

      <h2>Saving your setups</h2>
      <p>
        Sign in to save what you build. Setups are typed so they&apos;re easy to find later: a
        <strong> kart build</strong>, an <strong>item set</strong>, or a whole
        <strong> game-night setup</strong>. Saved setups appear in <strong>Account</strong> &rsaquo;
        <strong> My Stuff</strong> &rsaquo; <strong>Setups &amp; Games</strong> and on your
        <a href="/help/community/public-profile"> public profile</a>. Casual play doesn&apos;t require
        an account, saving is the reason to sign in.
      </p>

      <h2>From Discord</h2>
      <p>
        The <a href="/help/community/discord-bot">Discord bot</a>&apos;s <code>/gs-randomize</code>
        works for both games right in your server, with user tagging and per-player re-rolls. Each
        result includes an <strong>Open in GameShuffle</strong> link that loads the same combos on the
        web so you can keep going.
      </p>

      <h2>On stream</h2>
      <p>
        Running a <a href="/help/getting-started/your-first-session">session</a>? Viewers shuffle their
        own combos with <code>!gs shuffle</code>, and combos animate on your
        <a href="/help/streaming/obs-overlay"> OBS overlay</a>. See the
        <a href="/help/streaming/chat-commands"> chat command reference</a> for the full set.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any randomizer questions.</p>
    </HelpArticle>
  );
}
