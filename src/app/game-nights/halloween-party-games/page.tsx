import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import {
  IconBolt, IconCandy, IconChartPie2, IconLayoutGrid, IconListNumbers, IconMessageQuestion, IconSteeringWheel, IconUserQuestion, IconUsersGroup,
} from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { RowLink, RowPanel, type PanelRow } from "@/components/marketing/RowPanel";
import { MIN_TOPIC_QUESTIONS, topicUrl } from "@/data/trivia-seo";
import { topicCounts } from "@/lib/trivia/topics";
import { EVENTS, tagged } from "@/lib/analytics/events";
import "@/styles/seasonal.css";

/**
 * /game-nights/halloween-party-games: every free Halloween game on GameShuffle
 * in one place, for the "halloween party games" searches (Britton's picks,
 * 2026-10-19: built and shipped before Oct 23). One row panel of games (each
 * opens on its Halloween set), a short plan for the night, who each game suits
 * and the questions people ask. The trivia row points at the Halloween question
 * page once enough Halloween questions are approved, else at trivia nights.
 */

export const revalidate = 3600;

const PATH = "/game-nights/halloween-party-games";
const TITLE = "Halloween Party Games: Free Games for Your Halloween Party";
const DESCRIPTION = "Free Halloween party games for kids and adults: spooky truth or dare, Halloween bingo, a wheel of house rules, Halloween trivia and party games everyone plays on their phones. No app to download.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `https://www.gameshuffle.co${PATH}` },
  openGraph: { title: "Halloween Party Games", description: DESCRIPTION, url: `https://www.gameshuffle.co${PATH}`, siteName: "GameShuffle", type: "website" },
};

const FAQ = [
  { q: "What are good Halloween party games for adults?", a: "Halloween trivia in teams, Most Likely To with the Halloween prompts and spooky truth or dare all work well for adults. For a gaming crowd, let the Spooky Mario Kart wheel pick everyone's racer." },
  { q: "What Halloween games work for kids?", a: "Halloween bingo, the wheel of house rules and Odd One Out are easy for kids to follow, and the Halloween truth or dare set is family friendly." },
  { q: "Are these Halloween games free?", a: "Yes. Every game on this page is free and runs in the browser. Guests don't need an account; a free account saves your wheels and setups for next time." },
  { q: "Do guests need to download an app?", a: "No. The games open in any phone or laptop browser. For Odd One Out, Most Likely To and trivia nights, each guest plays on their own phone and the TV shows the round." },
  { q: "How many people can play?", a: "Most of these games work from three players up. A trivia night takes up to 40 teams, each answering on their phone." },
];

export default async function HalloweenPartyGamesPage() {
  const counts = await topicCounts().catch(() => ({} as Record<string, number>));
  const triviaReady = (counts.halloween ?? 0) >= MIN_TOPIC_QUESTIONS;
  const go = (to: string) => tagged(EVENTS.homeSectionClicked, { to: `halloween-${to}` });

  const rows: PanelRow[] = [
    {
      key: "tod", Icon: IconMessageQuestion, tone: "orange", title: "Spooky truth or dare",
      text: "Costumes, candy and scary movies: truths and dares for a Halloween party, family friendly.",
      action: <RowLink href="/truth-or-dare/halloween" className={go("truth-or-dare")}>Deal a round</RowLink>,
    },
    {
      key: "bingo", Icon: IconLayoutGrid, tone: "violet", title: "Halloween party bingo",
      text: "Print or share bingo cards full of Halloween party moments, then mark them off as the night goes.",
      action: <RowLink href="/bingo-card-generator/halloween-party-bingo" className={go("bingo")}>Make the cards</RowLink>,
    },
    {
      key: "wheel", Icon: IconChartPie2, tone: "magenta", title: "A wheel of house rules",
      text: "Spin for the next twist: costume rule, lights off, candy wager. Edit the slices to make it yours.",
      action: <RowLink href="/wheel-spinner?preset=halloween-game-night" className={go("wheel")}>Spin the wheel</RowLink>,
    },
    {
      key: "trivia", Icon: IconBolt, tone: "red", title: "Halloween trivia",
      text: triviaReady
        ? "Questions about where Halloween comes from, candy, monsters, movies and spooky games, with the answers. Play them in teams on your phones."
        : "Run a trivia night with teams on their phones and the questions on the TV. Free to host.",
      action: triviaReady
        ? <RowLink href={topicUrl("halloween")} className={go("trivia")}>See the questions</RowLink>
        : <RowLink href="/trivia" className={go("trivia")}>Host a trivia night</RowLink>,
    },
    {
      key: "odd", Icon: IconUserQuestion, tone: "teal", title: "Odd One Out",
      text: "Everyone gets the same Halloween word except one player. Talk it over, then vote for who's bluffing.",
      action: <RowLink href="/game-nights/tools/odd-one-out?pack=halloween" className={go("odd-one-out")}>Play Odd One Out</RowLink>,
    },
    {
      key: "likely", Icon: IconUsersGroup, tone: "green", title: "Most Likely To",
      text: "Who's most likely to scream at a haunted house? Everyone votes, then the room's pick is revealed.",
      action: <RowLink href="/game-nights/tools/most-likely-to?pack=halloween" className={go("most-likely-to")}>Play Most Likely To</RowLink>,
    },
    {
      key: "treats", Icon: IconCandy, tone: "orange", title: "Rank the Halloween treats",
      text: "Candy corn in S tier or D tier? Rank the treats together and settle it.",
      action: <RowLink href="/tier-list-maker/halloween-treats" className={go("tier-list")}>Make the tier list</RowLink>,
    },
    {
      key: "kart", Icon: IconSteeringWheel, tone: "blue", title: "Spooky Mario Kart",
      text: "For a gaming party: the wheel picks everyone's spooky racer, from King Boo to Dry Bowser.",
      action: <RowLink href="/wheel-spinner?preset=spooky-mario-kart" className={go("spooky-mario-kart")}>Spin for a racer</RowLink>,
    },
  ];

  return (
    <main className="seasonal">
      <BrowseHero
        eyebrow="Game nights · Halloween"
        title="Halloween party games"
        sub="Free spooky games for your Halloween party: truth or dare, bingo, a wheel of house rules, trivia and party games everyone plays on their phones. Nothing to download."
        subShort="Free spooky games for your party, nothing to download."
        accent="orange"
        field="spooky"
        compact
      />
      <Container className="seasonal__body">
        <section aria-labelledby="games-title">
          <h2 id="games-title">Free Halloween party games</h2>
          <p className="seasonal__lede">Each one opens on its Halloween set and works on any phone or laptop.</p>
          <RowPanel rows={rows} className="row-panel--surface" />
        </section>

        <section aria-labelledby="plan-title">
          <h2 id="plan-title">Plan a Halloween game night</h2>
          <ol className="seasonal__steps">
            <li><strong>As people arrive:</strong> hand out <Link href="/bingo-card-generator/halloween-party-bingo">bingo cards</Link> and mark off costume moments as they walk in.</li>
            <li><strong>Set the house rules:</strong> spin <Link href="/wheel-spinner?preset=halloween-game-night">the wheel</Link> once an hour for a new twist.</li>
            <li><strong>Get everyone playing:</strong> Odd One Out or Most Likely To on everyone&apos;s phones, with the round on the TV.</li>
            <li><strong>Finish strong:</strong> Halloween trivia in teams, or truth or dare for the brave.</li>
          </ol>
        </section>

        <section aria-labelledby="crowd-title">
          <h2 id="crowd-title">Games for every crowd</h2>
          <div className="seasonal__two">
            <div>
              <h3>Kids and families</h3>
              <p>Bingo, the wheel and Odd One Out are quick to explain, and the Halloween truth or dare set keeps it family friendly.</p>
            </div>
            <div>
              <h3>Adults and gamers</h3>
              <p>Team trivia with the hard questions, Most Likely To, and the Spooky Mario Kart wheel for anyone with a controller in hand.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title">
          <h2 id="faq-title">Questions</h2>
          <FaqList items={FAQ} />
        </section>
      </Container>
      <MarketingJsonLd breadcrumb={{ label: "Halloween party games", path: PATH, parent: { label: "Game nights", path: "/game-nights" } }} faq={FAQ} />
    </main>
  );
}
