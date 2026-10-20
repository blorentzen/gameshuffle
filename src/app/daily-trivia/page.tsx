import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FireRound } from "@/components/fireRound/FireRound";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { CHOICE_POINTS, TYPED_POINTS } from "@/lib/originals/fireRound";
import { TRIVIA_PATH, topicUrl } from "@/data/trivia-seo";
import { NewHereLine } from "@/components/welcome/NewHereLine";
import "@/styles/fire-round.css";

/**
 * /daily-trivia: Fire Round, the daily trivia quiz (a GameShuffle Original).
 * Moved here from /trivia/fire-round on 2026-10-19 to sit beside /daily and
 * /daily-dex (Britton's picks, https://claude.ai/artifact/WhFgrMQv8oVHQ4e5cvfXRx):
 * the today bar on top, the copy aimed at "daily trivia", "daily trivia quiz",
 * "multiple choice trivia" and "rapid fire questions".
 */

export const metadata: Metadata = {
  title: "Fire Round: free daily trivia quiz",
  description: "Free daily trivia quiz: 60 seconds, the same questions for everyone and a new leaderboard every day. Type answers or pick from four, then keep playing by category.",
  alternates: { canonical: "https://www.gameshuffle.co/daily-trivia" },
};

const CATEGORIES_TEXT = "Today's round mixes everything. More rounds can be one category: general knowledge, geography, science and nature, history, video games, movies and TV, music, sports, food and drink, words and numbers, game characters and Overwatch heroes. Game categories like Mario Kart, Smash and Pokémon open as their question packs fill up.";

const FAQ = [
  { q: "Is there a new trivia quiz every day?", a: "Yes. A new Fire Round starts at midnight Pacific: 60 seconds of mixed questions, the same for everyone, in the same order." },
  { q: "Is it free?", a: "Yes, and you don't need an account. Play as a guest and add a name to go on the leaderboard. A free account keeps your streak and scores on every device and earns tokens on the leaderboard." },
  { q: "Can I answer multiple choice?", a: `Every question can open four choices when you're stuck. A right choice is worth ${CHOICE_POINTS} instead of ${TYPED_POINTS}, and a typed answer that's close opens them for you.` },
  { q: "How is today's round scored?", a: `${TYPED_POINTS} for a typed answer, ${CHOICE_POINTS} with choices, times your heat: three right in a row is ×1.5, six is ×2, and a miss cools you down. On the leaderboard, every 200 points is a point, up to 10.` },
  { q: "Can I play more than once a day?", a: "Only your first try counts for today. Play it again for practice, or pick a category and 1, 3 or 5 minutes any time." },
  { q: "What categories are there?", a: CATEGORIES_TEXT },
];

/** The FAQ as shown: the categories answer links to the question pages. */
const FAQ_SHOWN = FAQ.map((f) => (f.a === CATEGORIES_TEXT ? {
  q: f.q,
  a: (
    <>
      {CATEGORIES_TEXT} Want to read some first? See our trivia questions for <Link href={topicUrl("mario-kart")}>Mario Kart</Link>,{" "}
      <Link href={topicUrl("pokemon")}>Pokémon</Link>, <Link href={topicUrl("smash")}>Smash</Link> and{" "}
      <Link href={`${TRIVIA_PATH}/questions`}>more</Link>.
    </>
  ),
} : f));

export default function DailyTriviaPage() {
  return (
    <main>
      <MarketingJsonLd
        appName="Fire Round"
        appDescription="A free daily trivia quiz: 60 seconds, the same questions for everyone, then more rounds by category."
        appUrl="/daily-trivia"
        breadcrumb={{ label: "Fire Round", path: "/daily-trivia", parent: { label: "Trivia", path: TRIVIA_PATH } }}
        faq={FAQ}
      />
      <BrowseHero
        eyebrow="Daily trivia · A GameShuffle Original"
        title="Fire Round"
        sub="Today's free trivia quiz: 60 seconds, the same questions for everyone. Type the answer for full points, or pick from four choices when you're stuck."
        subShort="Daily trivia against the clock."
        accent="fire"
        field="fire"
        compact
      />
      <Container className="tool-page fire-page">
        <DailiesProvider current="fire">
          <DailiesBar current="fire" />
          <FireRound />
        </DailiesProvider>
        <NewHereLine from="daily-fire" />

        <section className="fire-flat fire-about" aria-labelledby="fire-how-title">
          <h2 id="fire-how-title" className="fire-flat__title">How the daily trivia quiz works</h2>
          <ol className="fire-steps">
            <li><strong>Pick a round.</strong> Today&apos;s round is 60 seconds of mixed questions. More rounds let you choose a category and 1, 3 or 5 minutes, or keep going until you miss three.</li>
            <li><strong>Type, or open the choices.</strong> A typed answer is worth {TYPED_POINTS}. Four choices are there when you need them, for {CHOICE_POINTS}.</li>
            <li><strong>Heat up.</strong> Three right in a row is ×1.5, six is ×2. A miss cools you down.</li>
          </ol>
          <p className="fire-small">Hosting a group? <Link href={TRIVIA_PATH}>Run a trivia night</Link> with phones and a TV.</p>
        </section>

        <section className="fire-flat fire-about" aria-labelledby="fire-faq-title">
          <h2 id="fire-faq-title" className="fire-flat__title">Questions</h2>
          <FaqList items={FAQ_SHOWN} />
        </section>
      </Container>
    </main>
  );
}
