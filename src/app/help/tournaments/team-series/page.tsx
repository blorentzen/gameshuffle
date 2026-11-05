import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/team-series";
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
      <h1>Team series and the GS Summer Series</h1>
      <p>
        A team series is an official GameShuffle event: streamers race in teams of two over a set of
        nights, and every one of them streams it. The <Link href="/summer-series">GS Summer Series</Link>{" "}
        is the first: twelve Mario Kart 8 Deluxe streamers in six teams, a Kickoff night and a Final.
        This page covers what players do and how viewers join in.
      </p>

      <h2>The event page</h2>
      <p>Everything lives on the series page, in tabs:</p>
      <ul>
        <li><strong>Standings:</strong> the night in progress race by race, then the total once more than one night counts.</li>
        <li><strong>Teams:</strong> a card for each player with their kart build, best time trial, lounge MMR, links, and whether they&apos;re live.</li>
        <li><strong>Tracks:</strong> the track draft, live while it runs, then the tracks that made it.</li>
        <li><strong>Predict:</strong> every prediction for the night in one place.</li>
        <li><strong>Best play</strong>, <strong>Rules</strong> and <strong>FAQ</strong>.</li>
      </ul>
      <p>
        Each night is a GameShuffle tournament of its own, so its page shows the results too, with a
        link back to the series.
      </p>

      <h2>For players</h2>

      <h3>Your account</h3>
      <p>
        The organizers add you by your GameShuffle username or your Twitch name. Link Twitch in{" "}
        <strong>Account &rsaquo; Settings &rsaquo; Sign-in &amp; security</strong>{" "}so your live page and
        your overlay know it&apos;s you. You don&apos;t need to join each night&apos;s tournament: you&apos;re
        already in it, on your team.
      </p>

      <h3>Your card</h3>
      <p>
        Your card fills itself in from GameShuffle. Signed in, you&apos;ll see two settings above the
        teams on the Teams tab: <strong>Hours played</strong>{" "}(your own count, shown as yours) and{" "}
        <strong>Kart build to show</strong>, picked from the builds you&apos;ve saved in the{" "}
        <Link href="/randomizers/mario-kart-8-deluxe">Mario Kart 8 Deluxe randomizer</Link>. Your best time
        comes from <Link href="/time-trials">time trials</Link>{" "}and your MMR from your confirmed{" "}
        <Link href="/lounge">lounge</Link>{" "}name.
      </p>

      <h3>The track draft</h3>
      <p>
        Before a night, the teams cut the track bank down together. The default bank is the 48 base
        game tracks, cut to 24.
      </p>
      <ol>
        <li>The organizers set the order: rolled on stream, taken from the last night&apos;s results (last place picks first), or set by hand.</li>
        <li>The order snakes (1 to 6, then 6 to 1), so nobody picks first twice in a row.</li>
        <li>On your team&apos;s turn, open the <strong>Tracks</strong>{" "}tab on your phone. Tap a track to ban, then a track to protect, then lock it in. Either player on the team can do it.</li>
        <li>A protected track can&apos;t be banned. A team that doesn&apos;t lock in before the clock runs out (60 seconds by default) gets a random ban and protect.</li>
      </ol>
      <p>
        Your overlay shows who&apos;s on the clock during the draft, so viewers can follow along.
      </p>

      <h3>On your stream</h3>
      <p>
        While the series is live, your <Link href="/help/streaming/obs-overlay">GameShuffle overlay</Link>{" "}
        shows the six teams with yours lit up and each race&apos;s points. It sits top right by default
        to stay clear of the race map. Move or hide it in{" "}
        <strong>Account &rsaquo; Streaming &rsaquo; Overlay &rsaquo; Layout &rsaquo; Apps &rsaquo; Team series</strong>.
        Your live page on GameShuffle gets a card with your team and its predictions.
      </p>

      <h3>Your POV recording</h3>
      <p>
        After the series, players send a POV recording for the series video. You&apos;ll get a
        GameShuffle notification with the guide and the date it&apos;s due.
      </p>

      <h2>For viewers</h2>
      <p>
        Watch any player: every stream shows the same standings. On a player&apos;s live page or the
        Predict tab you can predict who wins the night, where a team finishes, and whether a player
        scores over or under a line.
      </p>
      <ul>
        <li>Predictions use <Link href="/help/streaming/token-economy">GameShuffle tokens</Link>, between 10 and 5,000 per question. Tokens can&apos;t be bought or cashed out.</li>
        <li>Pick one answer per question. You can add more tokens to it until predictions close.</li>
        <li>Predictions close when the first race starts and pay out by themselves after the last race.</li>
        <li>Each question has one pot across all twelve streams. Everyone who got it right shares the whole pot by how much they put in. If nobody got it right, everyone gets their tokens back.</li>
      </ul>

      <h2>After the series</h2>
      <p>
        The champions get a badge on their profiles, and every player gets one for taking part. The
        page stays up with the final standings, the awards and the best play vote.
      </p>

      <h2>Still need help?</h2>
      <p>
        Ask in the GameShuffle Discord, or use the <Link href="/contact-us">contact form</Link>{" "}and pick
        Summer Series.
      </p>
    </HelpArticle>
  );
}
