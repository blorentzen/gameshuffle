import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/trivia-leagues";
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
      <h1>Trivia leagues and crews</h1>
      <p>
        A trivia league is a season of weekly trivia nights with standings that build up from week to week. Each week is a
        normal <Link href="/help/apps/trivia-nights">trivia night</Link>, and finishing it adds to the league. Crews can play
        any trivia night as one team, league or not.
      </p>

      <h2>Join a night as your crew</h2>
      <p>When a team joins a night on <Link href="/trivia">gameshuffle.co/trivia</Link>{" "}with the code:</p>
      <ul>
        <li><strong>Signed out</strong>, you type a team name. <strong>Sign in to play for your crew</strong>{" "}is below the Join button.</li>
        <li><strong>Signed in</strong>, you can play as one of your crews, as yourself (you show by your name), or as a new team with any name.</li>
        <li>Your crews are the <Link href="/help/community/communities-and-crews">communities</Link>{" "}where you&apos;re on a crew for any game, plus groups you own or moderate.</li>
        <li>A crew plays as one team a night. When a crewmate arrives after the team is in, they see &ldquo;Already playing tonight&rdquo; and join the same team with one tap. Anyone outside the crew still needs the team&apos;s link.</li>
      </ul>
      <p>
        A crew&apos;s trivia record shows on its community page, and nights you play as yourself count on your profile.
      </p>
      <p>
        If a team&apos;s phone leaves the page while a question is open, the host&apos;s console notes it beside the team
        (&ldquo;left the page 2×&rdquo;). It&apos;s a note for the host, never a penalty.
      </p>

      <h2>Start a league</h2>
      <p>
        Signed in, press <strong>Start a league</strong>{" "}in the Leagues section of the trivia page. Leagues are part of GS
        Circuit, which is free while it&apos;s in preview. Any single trivia night stays free to host.
      </p>
      <ul>
        <li><strong>League name</strong>, and <strong>Where</strong>: at a venue (with its name or address) or online.</li>
        <li><strong>First night:</strong> the league repeats every week on the same day and time, in your time zone. Each week gets its own game night page.</li>
        <li><strong>Season:</strong> 4, 6, 8, 10 or 12 weeks.</li>
        <li><strong>Team size:</strong> up to 2, 3, 4, 5, 6, 8 or 10 players, shown on the league page and the poster.</li>
        <li><strong>Each night:</strong> points by place or total score (see below).</li>
        <li><strong>Nights that count:</strong> every night, or only each team&apos;s best few, so a missed week doesn&apos;t sink a season.</li>
        <li><strong>Each night starts from:</strong> the trivia template each week&apos;s night is built from.</li>
        <li><strong>About the league</strong>{" "}(optional): prizes, house rules, parking.</li>
      </ul>

      <h2>Scoring</h2>
      <p>When a league night ends, its results turn into league points by themselves.</p>
      <ul>
        <li><strong>Points by place:</strong> 1st gets 10, 2nd 8, 3rd 6, 4th 5, then one fewer for each place after that. Every team that plays gets at least 1.</li>
        <li><strong>Total score:</strong> a team&apos;s score for the night is its league points.</li>
        <li>Teams tied on the night share the place and its points.</li>
        <li>Only league teams take a place. Teams playing just for the night don&apos;t push league teams down.</li>
      </ul>

      <h2>Standings</h2>
      <p>The standings rank teams by the points from their nights that count, then by:</p>
      <ol>
        <li>Nights won.</li>
        <li>Best finish.</li>
        <li>Nights played.</li>
      </ol>
      <p>
        Teams level on all of these share a rank. Arrows show how each team moved since the week before. After the last week,
        the team on top is the champion. If two teams finish level at the top, the season ends without one. When your Discord
        server routes the Trivia on stream category, the bot posts the result there.
      </p>

      <h2>Teams</h2>
      <h3>Enter before the night</h3>
      <p>
        On the league page, press <strong>Join the league</strong>{" "}and choose <strong>One of my crews</strong>{" "}or{" "}
        <strong>A new team</strong>:
      </p>
      <ul>
        <li>A crew can be entered by its captains, or by the community&apos;s owner and mods. Its roster and record carry over.</li>
        <li>A new team becomes a crew with you as captain, so it gets a page and a roster. If you already run five groups, it stays a league-only team.</li>
        <li>Teammates don&apos;t need accounts. They join your team at the door from your link, or with one tap if they&apos;re in the crew.</li>
      </ul>
      <p>
        Signed in, you see a card for each league team you captain or play on, with its roster and{" "}
        <strong>Copy tonight&apos;s team link</strong>{" "}once the team has a phone in that night&apos;s room. A captain can{" "}
        <strong>Leave the league</strong>{" "}until the team has played a night. After that, ask the host to remove it. A league
        holds up to 40 teams.
      </p>

      <h3>At the door</h3>
      <p>On a league night, a signed-in phone also offers:</p>
      <ul>
        <li>Your league teams, with their place and points.</li>
        <li>Your crews that aren&apos;t in yet, to enter them on the spot. They start at 0.</li>
        <li><strong>A new league team</strong>, with you as captain.</li>
        <li><strong>Just tonight</strong>, as yourself or with a team name. These play the night but earn no league points.</li>
      </ul>

      <h2>Run the league</h2>
      <p>
        Press <strong>Manage the league</strong>{" "}on the league page. On the Nights tab,{" "}
        <strong>Start tonight&apos;s night</strong>{" "}builds the week&apos;s trivia night from your template, named for the
        week, linked to that week&apos;s game night page and filled from the question pack. Edit it like any night, then open
        the room. When the night ends, the host console shows tonight&apos;s league points and how the table moved.
      </p>
      <p>
        <strong>Undo points</strong>{" "}on the Nights tab, or <strong>Undo league points</strong>{" "}on the console, takes a
        night&apos;s league points back out. The week
        counts as not played, the night&apos;s own scores stay, and a finished season opens again. The Nights tab also has{" "}
        <strong>Print answer sheets</strong>, <strong>Print the poster</strong>{" "}(with a QR code to the league page) and{" "}
        <strong>Copy standings for Discord</strong>.
      </p>
      <p>On the Teams tab, each team&apos;s menu has:</p>
      <ul>
        <li><strong>Rename</strong>.</li>
        <li><strong>Merge into another team</strong>, for a team entered twice. Its nights move over, and where both played the same night, the better result stays.</li>
        <li><strong>Change captain</strong>, to someone on the team&apos;s crew with an account.</li>
        <li><strong>Remove from the league</strong>. Its points come out of the standings too, and it can&apos;t be undone.</li>
      </ul>
      <p>
        On the Settings tab you can change the league&apos;s settings, except that the season can&apos;t be shorter than the
        weeks already played. The weekly day, time and place come from the league&apos;s game
        night series, so change a single week on its game night page. <strong>Archive the league</strong>{" "}takes it off lists
        and stops scheduling nights. Its page stays up by link, and you can bring it back.
      </p>

      <h2>The league page</h2>
      <p>
        Every league has a public page with the next night (day, time and place), the join code while that night&apos;s room
        is open, the standings with each team&apos;s place every week, and past nights. <strong>Copy link</strong>{" "}and{" "}
        <strong>Copy for Discord</strong>{" "}share it, and each week&apos;s game night page links back to it.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
