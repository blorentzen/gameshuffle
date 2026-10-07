import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/pokemon-randomizers";
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
      <h1>The Pokémon randomizers</h1>
      <p>
        Two ways to play: rental teams for <Link href="/randomizers/pokemon-stadium">Pokémon Stadium</Link>, and a
        <Link href="/randomizers/pokemon-firered-leafgreen"> Fire Red &amp; Leaf Green run challenge</Link> that tells you
        what to catch and how to fight on the way through Kanto. Both are new, so some art is still on the way.
      </p>

      <h2>Pokémon Stadium rental teams</h2>
      <ol>
        <li>Pick a cup. Stadium has the Pika, Petit, Poké and Prime Cups; Stadium 2 has the Little, Poké and Prime Cups. <strong>Free Battle: Anything Goes</strong> skips the cup rules altogether.</li>
        <li>Add players (one to four) and press <strong>Randomize Teams</strong>. Each player gets six different rentals at the cup&apos;s level, so every team is legal for that cup.</li>
        <li><strong>Refresh Team</strong> re-rolls one player; <strong>Randomize again</strong> re-rolls everyone.</li>
      </ol>
      <p>In <strong>Change options</strong>:</p>
      <ul>
        <li><strong>No repeats across players:</strong> no Pokémon turns up on two players&apos; teams.</li>
        <li><strong>Pick my 3 too:</strong> also chooses the three each player brings into battle, marked <strong>Pick</strong>.</li>
        <li><strong>Round 2 rentals:</strong> adds the Pokémon you only get in Round 2 (Mew in Stadium; Celebi and Surfing Pikachu in Stadium 2).</li>
      </ul>

      <h2>Details, and choosing a Pokémon yourself</h2>
      <p>
        Tap <strong>Details</strong> on any card for its category, height, weight, what it evolves from, base stats and the
        rental&apos;s moves. Want a particular Pokémon in that slot? Choose it under <strong>Want a different Pokémon
        here?</strong>. It&apos;s marked <strong>Your choice</strong> and stays put when you re-roll; the randomizer fills the
        rest of the team around it. <strong>Let the randomizer pick this slot</strong> hands it back.
      </p>
      <p>
        You can also type it: &quot;two of us, Prime Cup, give me a rain team&quot; in <strong>Describe your night</strong> sets
        the cup and players and puts fitting rentals on that player&apos;s team as their choices. See{" "}
        <a href="/help/apps/ai-tools">AI tools</a>.
      </p>
      <p>
        Signed in, <strong>Save teams</strong> keeps the cup and everyone&apos;s six. <strong>Copy teams</strong> gives you a
        plain list for chat or Discord.
      </p>

      <h2>The Fire Red &amp; Leaf Green run challenge</h2>
      <p>A run gives you a starter you have to take, then for every gym and the Elite Four:</p>
      <ul>
        <li><strong>What to catch first:</strong> Pokémon you can actually reach before that fight in your version, with where to find them, how (grass, fishing, surfing) and at what levels.</li>
        <li><strong>A level cap:</strong> your team can&apos;t be higher than the leader&apos;s strongest Pokémon.</li>
        <li><strong>A team size</strong> limit, and with <strong>Gym twists</strong> on, a twist like &quot;your newest catch leads&quot; or &quot;no healing items during the battle&quot;.</li>
      </ul>
      <p>
        Pick <strong>Fire Red</strong> or <strong>Leaf Green</strong> and, in the options, one or two catches per badge,
        gym twists and <strong>No fishing</strong>. <strong>New run</strong> rolls a fresh one.
      </p>
      <p>
        The run is a deck of cards, one per part. Tick each catch and the fight as you go; once every box on a card is ticked,
        the deck moves to the next one, and it opens where you left off next time. Your ticks are saved in the browser you
        play on.
      </p>
      <p>
        <strong>Copy link</strong> shares the exact run: anyone who opens it gets the same starter, catches and caps, which
        makes it easy to race a friend or let your chat follow along. <strong>Copy run</strong> gives you the whole list as
        text.
      </p>

      <h2>About the artwork</h2>
      <p>
        The pictures on the cards are Pokémon trading card artwork, credited in each card&apos;s Details. GameShuffle is a fan
        tool and isn&apos;t affiliated with Nintendo, Creatures, GAME FREAK or The Pokémon Company.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
