import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/daily-dex";
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
      <h1>The Daily Dex</h1>
      <p>
        <Link href="/daily-dex">The Daily Dex</Link>{" "}is a daily puzzle: guess today&apos;s Pokémon from all 1,025. Everyone gets the same
        Pokémon each day, and a new one arrives at midnight Pacific time. It has its own streak, separate from the Daily Shuffle&apos;s.
      </p>

      <h2>Start and hints</h2>
      <p>
        Tap <strong>Start today&apos;s puzzle</strong>{" "}to see your first hint and the guess box. Your solve time runs from that tap to
        your last guess.
      </p>
      <p>
        The first hint is a nod to today&apos;s Pokémon, in our own words. Each miss brings a new one: two more nods, then the Pokémon&apos;s
        category and the region it was first found in, then the game it first appeared in.
      </p>

      <h2>The columns</h2>
      <p>Each guess fills a row comparing your guess with today&apos;s answer. Green is a match and yellow is close.</p>
      <ul>
        <li><strong>Generation:</strong> close when one generation apart, with an arrow pointing newer or older.</li>
        <li><strong>Types:</strong> a match when both types are the same, close when one type is shared.</li>
        <li><strong>Evolution stage:</strong> First, Middle or Final in its family, or Doesn&apos;t evolve.</li>
        <li><strong>Pokédex color:</strong> the color the Pokédex lists it under.</li>
        <li><strong>Height</strong>{" "}and <strong>Weight:</strong> close within 25%, with arrows pointing taller or shorter, heavier or lighter.</li>
      </ul>

      <h2>The list narrows</h2>
      <p>
        After your first guess, the guess box only offers Pokémon that still fit your clues, A to Z, with a count above it. It goes by
        generation, types, stage and color. Height and weight are left for you to work out. Turn on <strong>Show all</strong>{" "}to search
        all 1,025 again.
      </p>

      <h2>Five guesses and a last chance</h2>
      <p>
        You have five guesses. Miss them all and you get a last chance: the first letter of the name and a square for every letter, with
        spaces and punctuation shown. The list then only offers names of that length with that first letter. Solve it on the last chance
        and your streak keeps going, but it doesn&apos;t count as a win: your stats show it as a save.
      </p>

      <h2>Buying help with tokens</h2>
      <p>
        On the last chance, the <strong>Need a hand?</strong>{" "}panel lets signed-in players spend GameShuffle tokens. Players in the
        Discord Activity can use it too.
      </p>
      <ul>
        <li><strong>The next letter,</strong> 100 tokens: up to three more letters, shown in gold. Two letters always stay hidden.</li>
        <li><strong>One more guess,</strong> 250 tokens: up to two, bought before you use your last guess.</li>
      </ul>
      <p>
        Tokens only leave your wallet when the purchase goes through. A solve with help counts as a save, and your shared result shows the
        help you bought. Guests are offered a free account instead, which starts with 10,000 tokens.
      </p>

      <h2>Your time, streak and stats</h2>
      <p>
        When you solve it, the end screen shows your time and whether it&apos;s your fastest. Your streak counts every day in a row you
        solve the Dex, last-chance saves included. Signed in, your results save to your account, so your streak follows you to any device
        and shows on your profile. Signed out, they stay in the browser you play on, and if you sign in the same day, the game you finished
        is saved to your account.
      </p>
      <p>
        Your result also scores on the Daily Dex leaderboard. Points, prizes and sharing are on{" "}
        <Link href="/help/apps/daily-leaderboards">Daily leaderboards and sharing</Link>.
      </p>

      <h2>Card of the day</h2>
      <p>
        After the game, the page shows a Pokémon TCG card of today&apos;s answer when there&apos;s one ready. Signed in,{" "}
        <strong>Add to My Cards</strong>{" "}puts it in your collection. A free account holds 250 different cards there, and GS Pro has no
        limit. The card of the day shows on the website only.
      </p>

      <h2>Play in Discord</h2>
      <p>
        The Dex is also in the GameShuffle Activity in Discord, on the Daily tab beside the Daily Shuffle. How the Activity works is on{" "}
        <Link href="/help/apps/daily-shuffle">The Daily Shuffle</Link>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
