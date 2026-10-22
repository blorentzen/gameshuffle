import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DailyDuel } from "@/components/originals/duel/DailyDuel";
import { DuelPictureCredit } from "@/components/originals/duel/DuelPictureCredit";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { NewHereLine } from "@/components/welcome/NewHereLine";
import { DUEL_PUBLIC } from "@/lib/games-visibility";
import "@/styles/daily-duel.css";

/**
 * /daily-duel: the Daily Duel, a card duel against the trainer of the day (picks 2026-10-21,
 * https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk). A GameShuffle Original beside the other
 * dailies. Hidden in production (404, noindex, out of the sitemap) until DUEL_PUBLIC, like its APIs.
 */

export const metadata: Metadata = {
  title: "The Daily Duel: a Pokémon card duel every day",
  description: "A free daily card duel: today's trainer brings their team from the games, you get the same six Pokémon cards as everyone, and the fewest turns wins the day.",
  alternates: { canonical: "https://www.gameshuffle.co/daily-duel" },
  ...(DUEL_PUBLIC ? {} : { robots: { index: false, follow: false } }),
};

/** Details the Start card's three steps don't cover (writing rules: say each fact once). */
const FAQ = [
  { q: "Is there a new duel every day?", a: "Yes. A new trainer and a new six at midnight Pacific, the same for everyone. Gym Leaders early in the week, Elite Four and rivals in the middle, a villain team's boss on Saturday and a Champion on Sunday." },
  { q: "What's par?", a: "Every pack is checked before it goes out, and par is the fewest turns that win it. You see it once your duel is over, and the leaderboard scores your turns against it." },
  { q: "What do the events do?", a: "About every third turn something happens: rain or harsh sunlight changes Water and Fire damage, Team Rocket grabs a waiting card, a Potion heals 30, and each trainer has one event of their own. The next one shows a turn ahead, and nothing is left to a coin flip." },
  { q: "Does the text on the cards matter?", a: "No. Only the numbers count: HP, Weakness, and each move's Energy and damage. Weakness is the only type rule." },
  { q: "Can I play more than once?", a: "Your first duel each day counts. Once it's over you can practice the same duel as often as you like." },
  { q: "Do I need an account?", a: "No. Play as a guest and add a name to go on the leaderboard. A free account keeps your streak on every device, earns tokens and adds the day's cards to My Cards." },
];

export default function DailyDuelPage() {
  if (!DUEL_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <main>
      <MarketingJsonLd
        appName="The Daily Duel"
        appDescription="A free daily Pokémon card duel against the trainer of the day, with the same six cards for everyone."
        appUrl="/daily-duel"
        breadcrumb={{ label: "The Daily Duel", path: "/daily-duel" }}
        faq={FAQ}
      />
      <BrowseHero
        eyebrow="A GameShuffle Original"
        title="The Daily Duel"
        sub="Knock out today's trainer with the same six Pokémon cards as everyone. A new trainer every day."
        subShort="Today's trainer, the same six cards for everyone."
        accent="duel"
        field="duel"
        compact
      />
      <Container className="tool-page daily-page duel-page">
        <DailiesProvider current="duel">
          <DailiesBar current="duel" />
          <DailyDuel />
        </DailiesProvider>
        <NewHereLine from="daily-duel" />
        <section className="duel-flat duel-about" aria-labelledby="duel-faq-title">
          <h2 id="duel-faq-title" className="duel-flat__title">About the Daily Duel</h2>
          <FaqList items={FAQ} />
        </section>
        <div className="duel-credits-foot">
          <DuelPictureCredit />
          <TcgAttribution className="duel-credits" />
        </div>
      </Container>
    </main>
  );
}
