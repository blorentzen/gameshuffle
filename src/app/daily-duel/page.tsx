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
  description: "A free daily card duel: today's trainer brings their team from the games, you get the same six Pokémon cards as everyone, and your score counts turns, time and going solo.",
  alternates: { canonical: "https://www.gameshuffle.co/daily-duel" },
  ...(DUEL_PUBLIC ? {} : { robots: { index: false, follow: false } }),
};

/** Details the Start card's three steps don't cover (writing rules: say each fact once). */
const FAQ = [
  { q: "Is there a new duel every day?", a: "Yes. A new trainer and a new six at midnight Pacific, the same for everyone. Gym Leaders early in the week, Elite Four and rivals in the middle, a villain team's boss on Saturday and a Champion on Sunday." },
  { q: "What's par?", a: "Every pack is checked before it goes out, and par is the fewest turns that win it, counting none of your conditions as landing. You see it once your duel is over." },
  { q: "How is a duel scored?", a: "Out of 1,000. Turns are worth up to 600: 50 less for each turn over par, and a win never drops below 200. Time is worth up to 250: you get 15 seconds for each turn of par, then lose 10 for every 15 seconds over. Going solo adds 150. A loss scores 20 for each of the trainer's cards you knocked out, up to 100. On the leaderboard every 100 is a point." },
  { q: "What do the events do?", a: "About every third turn something happens: rain or harsh sunlight changes Water and Fire damage, Team Rocket grabs a waiting card, a Potion heals 30, and each trainer has one event of their own. The bar at the top of the duel shows what's on and what's coming next turn." },
  { q: "How does a turn work?", a: "You hold three Energy. Each turn starts in a window: put one on any of your cards, where it stays, then keep your card on the field or swap one in. A swap uses the turn. Then attack, or end the turn. When one of your cards is knocked out, the next one comes in with an Energy for each card you've lost, up to 2. The trainer plays by the same rules." },
  { q: "What does the professor do?", a: "The professor knows two or three ways to win each day, each built around a different card, and can suggest a play for any turn. Asking for either ends your solo bonus for the day, so you're asked to confirm first. When the professor's advice comes up as an event, that tip is free." },
  { q: "What's Hard mode?", a: "The same duel without your comeback Energy: a card that comes in after a knockout brings nothing, while the trainer keeps theirs. You're on your own, so there are no plans or tips, though the advice event still comes up. Pick Normal or Hard before you tap Battle now. A Hard win adds 200 to your score and can earn up to 12 points on the leaderboard, and Hard has its own par. On a day with no winning line without the comeback, Hard is closed." },
  { q: "How many cards do I bring?", a: "As many as the trainer brings, and at least 3, picked from your six after you tap Battle now. A trainer with fewer than five cards starts each card with Energy: one for each card it's short of five, up to 3." },
  { q: "How do the cards work?", a: "The Daily Duel is its own game. It borrows Pokémon cards and plays them like a battle from the video games, so each card shows the Duel's version: its art, type, HP and Weakness, and each move's Energy, damage and any condition it can cause. A move whose damage is printed with a + or × counts what its card says, like 20 more for each of the trainer's waiting cards. The rest of a card's text isn't used. Tap a card to see its moves, or to see the real card." },
  { q: "What do the condition icons mean?", a: "A move can make the card it hits Burned (it loses 20 HP at the end of every turn), Poisoned (10, then 20, then 30, and so on), Paralyzed (a 25% chance each turn it can't move), Asleep (it can't move for 1 to 3 turns) or Confused (for 3 turns, each move has a 33% chance to hit itself for 20). The number beside the icon is the chance: 50% when the card always causes it, 25% when the card flips a coin. A card holds one condition at a time, plus Confused, and swapping it out cures it. The same moves get the same luck for everyone." },
  { q: "Can I play more than once?", a: "Your first duel each day counts. Once it's over you can practice the same duel as often as you like, in Normal or Hard." },
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
        sub="Pokémon cards, played like a battle from the games, against a new trainer every day."
        subShort="Pokémon cards, played like a battle from the games."
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
