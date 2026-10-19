import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FireRound } from "@/components/fireRound/FireRound";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { CHOICE_POINTS, TYPED_POINTS } from "@/lib/originals/fireRound";
import "@/styles/fire-round.css";

export const metadata: Metadata = {
  title: "Fire Round: speed trivia against the clock",
  description: "Free solo trivia: answer as many questions as you can in 1, 3 or 5 minutes, or until you miss three. Type the answer or pick from four choices, build a streak, and take on today's round with everyone else.",
  alternates: { canonical: "https://www.gameshuffle.co/trivia/fire-round" },
};

const FAQ = [
  {
    q: "How does scoring work?",
    a: `A typed answer scores ${TYPED_POINTS}. If you're stuck, open four choices and a right pick scores ${CHOICE_POINTS}. Three right in a row heats your score up to ×1.5, and six in a row to ×2. A wrong answer or a skip scores nothing and cools you back to ×1.`,
  },
  {
    q: "What is today's Fire Round?",
    a: "One 60-second round of mixed questions, the same for everyone that day. Your first try goes on the daily leaderboard (up to 10 points, one for every 200 you score) and earns tokens like the daily puzzles. A new round starts at midnight Pacific.",
  },
  {
    q: "Do I need an account?",
    a: "No. Play as a guest, and add a name to go on the leaderboard. Tokens you earn as a guest wait 30 days for a free account, and your bests come with you when you sign up.",
  },
  {
    q: "Where do the questions come from?",
    a: "From GameShuffle's own trivia pack: every question has a checked answer and a source, and staff approve each one before it reaches a round. Free play doesn't repeat a question within 30 days while there are fresh ones left in the category.",
  },
  {
    q: "Can I play with friends?",
    a: "Fire Round is solo, but today's leaderboard puts you up against everyone. For a group, host a trivia night: everyone answers on their phones with the questions on a TV.",
  },
];

/** /trivia/fire-round — Fire Round, solo trivia against the clock (a GameShuffle Original). */
export default function FireRoundPage() {
  return (
    <main>
      <MarketingJsonLd
        appName="Fire Round"
        appDescription="Solo speed trivia: answer as many questions as you can before the clock runs out."
        appUrl="/trivia/fire-round"
        breadcrumb={{ label: "Fire Round", path: "/trivia/fire-round" }}
        faq={FAQ}
      />
      <BrowseHero
        eyebrow="A GameShuffle Original · trivia"
        title="Fire Round"
        sub="Answer as many trivia questions as you can before the clock runs out. Type the answer for full points, or open four choices when you're stuck. Today's round is the same for everyone."
        subShort="Speed trivia against the clock."
        accent="fire"
        field="fire"
        compact
      />
      <Container className="tool-page fire-page">
        <FireRound />

        <section className="fire-flat fire-about" aria-labelledby="fire-how-title">
          <h2 id="fire-how-title" className="fire-flat__title">How Fire Round works</h2>
          <ol className="fire-steps">
            <li><strong>Pick a round.</strong> Today&apos;s round is 60 seconds of mixed questions. Free play lets you choose a category and 1, 3 or 5 minutes, or keep going until you miss three.</li>
            <li><strong>Type, or open the choices.</strong> A typed answer is worth {TYPED_POINTS}. Four choices are there when you need them, for {CHOICE_POINTS}.</li>
            <li><strong>Heat up.</strong> Three right in a row is ×1.5, six is ×2. A miss cools you down.</li>
          </ol>
          <p className="fire-small">Hosting a group? <Link href="/trivia">Run a trivia night</Link> with phones and a TV.</p>
        </section>

        <section className="fire-flat fire-about" aria-labelledby="fire-faq-title">
          <h2 id="fire-faq-title" className="fire-flat__title">Questions</h2>
          <FaqList items={FAQ} />
        </section>
      </Container>
    </main>
  );
}
