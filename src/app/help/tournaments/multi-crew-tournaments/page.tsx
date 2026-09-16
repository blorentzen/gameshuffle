import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/tournaments/multi-crew-tournaments";
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
      <h1>Running a Multi-Crew Tournament</h1>
      <p>
        A multi-crew tournament lets communities battle as <strong>crews</strong>. Each player
        represents a community, and on top of the normal individual results, points roll up into
        live <strong>crew standings</strong> that show on your manage dashboard, your OBS overlay,
        and in chat. It works with any
        <a href="/help/tournaments/tournament-formats"> tournament format</a>.
      </p>

      <h2>What&apos;s a crew?</h2>
      <p>
        A crew is a community&apos;s roster for a game. Communities build crews on their community
        page, and members can climb from prospect to representative to captain. For a tournament, all
        you need to know is that a player can <strong>represent</strong> one community, and their
        results count toward that community&apos;s crew standings.
      </p>

      <h2>Two ways players get on a crew</h2>
      <p>You can mix both in the same event:</p>
      <ul>
        <li>
          <strong>Players self-represent.</strong> Anyone who&apos;s on a community&apos;s crew sees a
          <strong> Representing</strong> picker on the tournament page after they join, and chooses
          which of their crews to play for.
        </li>
        <li>
          <strong>You assign them.</strong> On the manage page, open the <strong>Crews</strong> card,
          search the communities battling in your event to add them, then pick a crew for each player
          right in the participant list. As the organizer you can put any player on any crew.
        </li>
      </ul>

      <h2>Set it up</h2>
      <ol>
        <li>
          <a href="/help/tournaments/creating-a-tournament">Create a tournament</a> in any format and
          open it for sign-ups.
        </li>
        <li>
          On the manage page, open the <strong>Crews</strong> card and add the communities that are
          competing. Each shows a live count of how many players it has.
        </li>
        <li>
          Assign players to crews (or let them self-represent from the tournament page). You need at
          least two crews represented for standings to appear.
        </li>
        <li>Run the tournament and enter results as normal. Crew standings tally themselves.</li>
      </ol>

      <h2>Where crew standings show up</h2>
      <ul>
        <li>
          <strong>Manage dashboard:</strong> a Crew Standings card, live as you enter results.
        </li>
        <li>
          <strong>Public tournament page:</strong> a Crew Standings section once two or more crews
          are represented.
        </li>
        <li>
          <strong>Your OBS overlay:</strong> a Crew Standings scoreboard that updates on stream as
          results come in. Position or hide it in
          <strong> Account &rsaquo; Overlay Layout &rsaquo; Apps &rsaquo; Crew Standings</strong>,
          separately for 16:9 and 9:16.
        </li>
        <li>
          <strong>In chat:</strong> anyone can type <code>!crews</code> to have the bot post the
          current crew standings for your in-progress tournament.
        </li>
      </ul>

      <h2>How points roll up</h2>
      <p>
        Crew standings use the same results as the individual board (live per-race scoring, or your
        finalized placements once you hit Finalize). Each crew&apos;s points are the sum of its
        players&apos; points, and crews are ranked by points, then best individual finish, then
        roster size. A player set to <strong>Solo (no crew)</strong> still competes individually but
        doesn&apos;t count toward any crew.
      </p>

      <h2>Tips</h2>
      <ul>
        <li><strong>Add the crews before the field fills up</strong> so players can self-represent as they join.</li>
        <li><strong>Balance rosters</strong> if you want a fair fight; uneven crew sizes are allowed but favor bigger crews on total points.</li>
        <li><strong>Drop the Crew Standings overlay somewhere clear of your race card</strong> so both read well on stream.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you run your crew battle.</p>
    </HelpArticle>
  );
}
