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

const CATEGORIES_TEXT = "Today's round mixes everything. More rounds can be one category, from general knowledge and geography to Mario Kart, Pokémon, Zelda and Smash, plus seasonal ones like Halloween in their month.";

const FAQ = [
  { q: "Is there a new trivia quiz every day?", a: "Yes. A new Fire Round starts at midnight Pacific: 60 seconds of mixed questions, the same for everyone, in the same order." },
  { q: "Is it free?", a: "Yes, and you don't need an account. Play as a guest and add a name to go on the leaderboard. A free account keeps your streak and scores on every device and earns tokens on the leaderboard." },
  { q: "Can I answer multiple choice?", a: `Every question can open four choices when you're stuck. A right choice is worth ${CHOICE_POINTS} instead of ${TYPED_POINTS}, and a typed answer that's close opens them for you.` },
  { q: "How is today's round scored?", a: `${TYPED_POINTS} for a typed answer, ${CHOICE_POINTS} with choices, times your heat: ×1.5 from three right in a row, ×2 from six, and a miss resets it. On the leaderboard, every 200 points is one point, up to 10.` },
  { q: "Can I play more than once a day?", a: "Only your first try counts for today. Play it again for practice, or pick a category and 1, 3 or 5 minutes any time." },
  { q: "What categories are there?", a: CATEGORIES_TEXT },
];

/** The FAQ as shown: the categories answer links to the question pages. */
const FAQ_SHOWN = FAQ.map((f) => (f.a === CATEGORIES_TEXT ? {
  q: f.q,
  a: (
    <>
      {CATEGORIES_TEXT} Sample questions with answers: <Link href={topicUrl("mario-kart")}>Mario Kart</Link>,{" "}
      <Link href={topicUrl("pokemon")}>Pokémon</Link>, <Link href={topicUrl("smash")}>Smash</Link> and{" "}
      <Link href={`${TRIVIA_PATH}/questions`}>every topic</Link>.
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
        eyebrow="Daily trivia"
        title="Fire Round"
        sub="Today's free trivia quiz: 60 seconds, the same questions for everyone."
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

        {/* How to play is the Start card's three steps; the FAQ holds the details (writing pass, 2026-10-20). */}
        <section className="fire-flat fire-about" aria-labelledby="fire-faq-title">
          <h2 id="fire-faq-title" className="fire-flat__title">About the daily trivia quiz</h2>
          <FaqList items={FAQ_SHOWN} />
          <p className="fire-small">For a group, <Link href={TRIVIA_PATH}>run a trivia night</Link> with phones and a TV.</p>
        </section>
      </Container>
    </main>
  );
}
