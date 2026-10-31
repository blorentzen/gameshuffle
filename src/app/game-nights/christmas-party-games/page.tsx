import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import {
  IconBolt, IconChartPie2, IconGift, IconLayoutGrid, IconMessageQuestion, IconMovie, IconUserQuestion, IconUsersGroup,
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
 * /game-nights/christmas-party-games: every free Christmas game on GameShuffle
 * in one place, for the "christmas party games" searches (Britton's picks,
 * 2026-10-19: Christmas pages live by mid-November so they're indexed before
 * December). Same shape as the Halloween page: one row panel of games (each
 * opens on its Christmas set), a plan for the night, who each game suits and
 * the questions people ask.
 */

export const revalidate = 3600;

const PATH = "/game-nights/christmas-party-games";
const TITLE = "Christmas Party Games: Free Games for Your Holiday Party";
const DESCRIPTION = "Free Christmas party games for kids and adults: Christmas trivia, holiday bingo, festive truth or dare and party games played on phones. No app needed.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `https://www.gameshuffle.co${PATH}` },
  openGraph: { title: "Christmas Party Games", description: DESCRIPTION, url: `https://www.gameshuffle.co${PATH}`, siteName: "GameShuffle", type: "website" },
};

const FAQ = [
  { q: "What are good Christmas party games for adults?", a: "Christmas trivia in teams, Most Likely To with the Christmas prompts and a Christmas movies tier list all get a room talking. The wheel of house rules adds a twist to any game." },
  { q: "What Christmas games work for kids?", a: "Christmas bingo, Odd One Out and the festive truth or dare set are easy for kids to follow and family friendly." },
  { q: "Are these Christmas games free?", a: "Yes. Every game on this page is free and runs in the browser. Guests don't need an account; a free account saves your wheels and setups for next time." },
  { q: "Do guests need to download an app?", a: "No. The games open in any phone or laptop browser. For Odd One Out, Most Likely To and trivia nights, each guest plays on their own phone and the TV shows the round." },
  { q: "How many people can play?", a: "Most of these games work from three players up. A trivia night takes up to 40 teams, each answering on their phone." },
];

export default async function ChristmasPartyGamesPage() {
  const counts = await topicCounts().catch(() => ({} as Record<string, number>));
  const triviaReady = (counts.christmas ?? 0) >= MIN_TOPIC_QUESTIONS;
  const go = (to: string) => tagged(EVENTS.homeSectionClicked, { to: `christmas-${to}` });

  const rows: PanelRow[] = [
    {
      key: "trivia", Icon: IconBolt, tone: "red", title: "Christmas trivia",
      text: triviaReady
        ? "Questions about traditions, Santa and his reindeer, carols, holiday movies and food around the world, with the answers. Play them in teams on your phones."
        : "Run a trivia night with teams on their phones and the questions on the TV. Free to host.",
      action: triviaReady
        ? <RowLink href={topicUrl("christmas")} className={go("trivia")}>See the questions</RowLink>
        : <RowLink href="/trivia" className={go("trivia")}>Host a trivia night</RowLink>,
    },
    {
      key: "bingo", Icon: IconLayoutGrid, tone: "green", title: "Christmas party bingo",
      text: "Print or share bingo cards full of holiday party moments: ugly sweaters, carols, the gift exchange steal.",
      action: <RowLink href="/bingo-card-generator/christmas-party-bingo" className={go("bingo")}>Make the cards</RowLink>,
    },
    {
      key: "tod", Icon: IconMessageQuestion, tone: "orange", title: "Festive truth or dare",
      text: "Presents, carols and holiday movies: truths and dares for a Christmas party, family friendly.",
      action: <RowLink href="/truth-or-dare/christmas" className={go("truth-or-dare")}>Deal a round</RowLink>,
    },
    {
      key: "wheel", Icon: IconChartPie2, tone: "magenta", title: "A wheel of house rules",
      text: "Spin for the next twist: sing a carol, swap a gift, elf voices. Edit the slices to make it yours.",
      action: <RowLink href="/wheel-spinner?preset=christmas-party" className={go("wheel")}>Spin the wheel</RowLink>,
    },
    {
      key: "odd", Icon: IconUserQuestion, tone: "teal", title: "Odd One Out",
      text: "Everyone gets the same Christmas word except one player. Talk it over, then vote for who's bluffing.",
      action: <RowLink href="/game-nights/tools/odd-one-out?pack=christmas" className={go("odd-one-out")}>Play Odd One Out</RowLink>,
    },
    {
      key: "likely", Icon: IconUsersGroup, tone: "violet", title: "Most Likely To",
      text: "Who's most likely to peek at their presents early? Everyone votes, then the room's pick is revealed.",
      action: <RowLink href="/game-nights/tools/most-likely-to?pack=christmas" className={go("most-likely-to")}>Play Most Likely To</RowLink>,
    },
    {
      key: "movies", Icon: IconMovie, tone: "blue", title: "Rank the Christmas movies",
      text: "Home Alone in S tier? Rank the holiday classics together and settle it once and for all.",
      action: <RowLink href="/tier-list-maker/christmas-movies" className={go("tier-list")}>Make the tier list</RowLink>,
    },
    {
      key: "gifts", Icon: IconGift, tone: "red", title: "Draw names for the gift exchange",
      text: "Put everyone's name in and draw who buys for who, or who picks a present first.",
      action: <RowLink href="/name-picker" className={go("name-picker")}>Draw names</RowLink>,
    },
  ];

  return (
    <main className="seasonal">
      <BrowseHero
        eyebrow="Game nights"
        title="Christmas party games"
        sub="Free games for your holiday party: Christmas trivia, bingo, festive truth or dare, a wheel of house rules and party games everyone plays on their phones. Nothing to download."
        subShort="Free games for your holiday party, nothing to download."
        accent="red"
        field="mixed"
        compact
      />
      <Container className="seasonal__body">
        <section aria-labelledby="games-title">
          <h2 id="games-title">Free Christmas party games</h2>
          <p className="seasonal__lede">Each one opens on its Christmas set and works on any phone or laptop.</p>
          <RowPanel rows={rows} className="row-panel--surface" />
        </section>

        <section aria-labelledby="plan-title">
          <h2 id="plan-title">Plan a Christmas game night</h2>
          <ol className="seasonal__steps">
            <li><strong>As people arrive:</strong> hand out <Link href="/bingo-card-generator/christmas-party-bingo">bingo cards</Link> and mark off ugly sweaters as they walk in.</li>
            <li><strong>Set the house rules:</strong> spin <Link href="/wheel-spinner?preset=christmas-party">the wheel</Link> before each game for a festive twist.</li>
            <li><strong>Get everyone playing:</strong> Odd One Out or Most Likely To on everyone&apos;s phones, with the round on the TV.</li>
            <li><strong>Finish strong:</strong> Christmas trivia in teams, then rank the Christmas movies together.</li>
          </ol>
        </section>

        <section aria-labelledby="crowd-title">
          <h2 id="crowd-title">Games for every crowd</h2>
          <div className="seasonal__two">
            <div>
              <h3>Kids and families</h3>
              <p>Bingo, Odd One Out and the festive truth or dare set are quick to explain and family friendly. The easy trivia questions are a good start for younger players.</p>
            </div>
            <div>
              <h3>Adults and coworkers</h3>
              <p>Team trivia with the hard questions, Most Likely To and the Christmas movies tier list. The wheel keeps a long party moving.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title">
          <h2 id="faq-title">Questions</h2>
          <FaqList items={FAQ} />
        </section>
      </Container>
      <MarketingJsonLd breadcrumb={{ label: "Christmas party games", path: PATH, parent: { label: "Game nights", path: "/game-nights" } }} faq={FAQ} />
    </main>
  );
}
