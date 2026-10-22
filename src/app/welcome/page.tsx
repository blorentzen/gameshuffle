import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { Button, Container } from "@empac/cascadeds";
import {
  IconBrandDiscord, IconBroadcast, IconCalendar, IconCards, IconCheck, IconDeviceGamepad2, IconDeviceTv,
  IconBolt, IconPokeball, IconPuzzle, IconStar, IconSteeringWheel, IconTrophy, IconUser, IconUsersGroup, IconBook2,
} from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { BackingPair } from "@/components/support/BackingPair";
import { CounterTool } from "@/components/tcg/rules/CounterTool";
import { WelcomeDemo, type WelcomeDemoId } from "@/components/welcome/WelcomeDemo";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { welcomeNumbers } from "@/lib/welcome/numbers";
import { welcomeViewer } from "@/lib/welcome/viewer";
import "@/styles/welcome.css";

/**
 * /welcome: what GameShuffle is, for someone brand new (Britton's picks, 2026-10-19, all 12 as
 * recommended: 2ch3gzGozTx2TZuZSQ8zj4). One sentence, then six doors by what brought you here, each
 * jumping to a section with a live demo, three things it does and one button; real numbers; for
 * new accounts three first steps; then a free account, GS Pro beside Support, and four questions.
 * New accounts land here after signing up (?new=1); randomizer, daily and deck guide pages show a
 * once-only "New to GameShuffle?" line that points here.
 */

export const dynamic = "force-dynamic";

const TITLE = "What is GameShuffle? Free game night tools, daily puzzles and more";
const DESCRIPTION = "GameShuffle is a free site for game nights: randomizers for 17 games, three daily puzzles, tournaments, trivia nights and party games, plus tools for streamers. Start here.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/welcome" },
  openGraph: { title: "Welcome to GameShuffle", description: DESCRIPTION, url: "https://www.gameshuffle.co/welcome", siteName: "GameShuffle", type: "website" },
};

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number; "aria-hidden"?: boolean | "true" }>;

interface Path {
  id: string;
  door: string;
  icon: TablerIcon;
  tone: string;
  eyebrow: string;
  title: string;
  line: string;
  demo: WelcomeDemoId | "counters";
  demoLabel: string;
  things: { icon: TablerIcon; text: string }[];
  cta: { label: string; href: string };
}

const PATHS: Path[] = [
  {
    id: "today", door: "A quick game today", icon: IconCalendar, tone: "daily",
    eyebrow: "A quick game today", title: "Three free daily puzzles",
    line: "A new puzzle every day at midnight Pacific, the same for everyone. A couple of minutes each, with streaks and a daily leaderboard.",
    demo: "daily", demoLabel: "Daily Shuffle",
    things: [
      { icon: IconDeviceGamepad2, text: "The Daily Shuffle: guess today's Nintendo character" },
      { icon: IconPokeball, text: "The Daily Dex: guess today's Pokémon" },
      { icon: IconBolt, text: "Fire Round: 60 seconds of trivia" },
    ],
    cta: { label: "Play today's Daily", href: "/daily" },
  },
  {
    id: "home", door: "Game night at home", icon: IconDeviceTv, tone: "home",
    eyebrow: "Game night at home", title: "Let the shuffle decide",
    line: "Who drives what, which board, which fighter: randomizers for 17 games, plus party games that run on everyone's phones and the TV.",
    demo: "kart", demoLabel: "Mario Kart randomizer",
    things: [
      { icon: IconSteeringWheel, text: "Mario Kart, Mario Party, Smash and 14 more randomizers" },
      { icon: IconDeviceTv, text: "Live party nights on phones and the TV" },
      { icon: IconPuzzle, text: "Trivia nights, bingo, the wheel and more free tools" },
    ],
    cta: { label: "Pick a randomizer", href: "/randomizers" },
  },
  {
    id: "online", door: "Playing online with friends", icon: IconBrandDiscord, tone: "online",
    eyebrow: "Online with friends", title: "Play together over Discord",
    line: "Play the dailies and quick party games together in a Discord call, roll picks for the whole server, and run live nights for friends far away.",
    demo: "smash", demoLabel: "Smash fighter roll",
    things: [
      { icon: IconUsersGroup, text: "The GameShuffle Activity: dailies and party games inside a call" },
      { icon: IconBrandDiscord, text: "The Discord bot: rolls for the server and daily game posts" },
      { icon: IconDeviceGamepad2, text: "Room codes and live nights for friends anywhere" },
    ],
    cta: { label: "Add GameShuffle to Discord", href: "/discord" },
  },
  {
    id: "stream", door: "I stream", icon: IconBroadcast, tone: "stream",
    eyebrow: "I stream", title: "Your chat plays along",
    line: "Viewers roll their own picks from chat, vote in polls, play bingo and trivia, and it all shows on your overlay, on Twitch and Discord together.",
    demo: "poll", demoLabel: "cross-platform poll",
    things: [
      { icon: IconSteeringWheel, text: "Chat rolls and match rolls for every game you stream" },
      { icon: IconStar, text: "Polls, Stream Bingo, trivia and Chat Brain on stream" },
      { icon: IconBolt, text: "Break mode: games that run while you're away" },
    ],
    cta: { label: "See what GS Pro adds", href: "/gs-pro?from=welcome" },
  },
  {
    id: "tournaments", door: "I run tournaments", icon: IconTrophy, tone: "tour",
    eyebrow: "I run tournaments", title: "Brackets that run themselves",
    line: "Single and double elimination, Swiss with deck lists, heats and mains, round robin and leagues, with live standings everyone sees on their phone.",
    demo: "bracket", demoLabel: "bracket",
    things: [
      { icon: IconTrophy, text: "Every format, with randomized rounds if you like" },
      { icon: IconUsersGroup, text: "Sign-ups, check-in, waitlists and reminders" },
      { icon: IconDeviceTv, text: "A TV display board and live results" },
    ],
    cta: { label: "Run a tournament", href: "/host-a-tournament" },
  },
  {
    id: "pokemon", door: "Pokémon TCG", icon: IconPokeball, tone: "poke",
    eyebrow: "Pokémon TCG", title: "A table companion for the Pokémon TCG",
    line: "Damage counters, conditions and prizes on your phone, deck lists checked for Standard, the rules explained, and checklists for collectors.",
    demo: "counters", demoLabel: "damage counters",
    things: [
      { icon: IconDeviceGamepad2, text: "The table companion, on one phone or two" },
      { icon: IconCards, text: "Deck lists with legality checks" },
      { icon: IconBook2, text: "Rules pages and card checklists" },
    ],
    cta: { label: "Open the companion", href: "/pokemon-tcg-companion" },
  },
];

const FAQ: { q: string; a: string }[] = [
  { q: "What is GameShuffle?", a: "GameShuffle is a free website for game nights: randomizers that pick who plays what, daily puzzles, tournaments, trivia nights and party games, plus tools that let a streamer's chat join in. It works on any phone or computer, in the same room or over Discord." },
  { q: "Is it really free?", a: "Yes. Everything on this page is free, with no ads. GS Pro adds tools for streamers and hosts, and anyone who enjoys GameShuffle can chip in to support it." },
  { q: "Is GameShuffle made by Nintendo or The Pokémon Company?", a: "No. GameShuffle is independent and isn't affiliated with or endorsed by Nintendo, The Pokémon Company or any game publisher." },
  { q: "Do I need an account?", a: "No. You can play the dailies, roll randomizers and use the free tools without one. A free account keeps your streaks, puts you on the leaderboards, saves your setups and gives you a profile." },
];

function Demo({ path }: { path: Path }): ReactNode {
  if (path.demo === "counters") return <div className="welcome-demo"><div className="hero-show__demo welcome-demo__stage welcome-demo__stage--tool"><CounterTool /></div></div>;
  return <WelcomeDemo id={path.demo} label={path.demoLabel} />;
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ new?: string; preview?: string }> }) {
  const sp = await searchParams;
  const [found, numbers] = await Promise.all([welcomeViewer().catch(() => null), welcomeNumbers().catch(() => null)]);
  // Dev only: ?preview=new shows any signed-in account the first steps.
  const viewer = found && process.env.NODE_ENV === "development" && sp.preview === "new" ? { ...found, isNew: true } : found;
  // Sign-up sends everyone here; an older account that signed in from the sign-up page goes on as before.
  if (sp.new === "1" && viewer && !viewer.isNew) redirect("/account");
  const stats = [
    numbers?.playedToday ? `${numbers.playedToday.toLocaleString("en-US")} people played today's dailies` : null,
    numbers?.tournamentsRunning ? `${numbers.tournamentsRunning} ${numbers.tournamentsRunning === 1 ? "tournament" : "tournaments"} running now` : null,
    numbers?.nightsThisWeek ? `${numbers.nightsThisWeek} game nights this week` : null,
  ].filter((s): s is string => !!s);
  const steps = viewer?.isNew ? [
    { done: viewer.steps.games, label: "Pick the games you play", href: "/account?tab=games" },
    { done: viewer.steps.profile, label: "Add a picture and your gamertags", href: "/account?tab=profile" },
    { done: viewer.steps.daily, label: "Play today's Daily to start a streak", href: "/daily" },
  ] : null;

  return (
    <main className="welcome">
      <BrowseHero
        eyebrow={viewer?.isNew ? `Welcome, ${viewer.name}` : "New here? Start here"}
        title="Welcome to GameShuffle"
        sub="Free tools that make game night better: roll who plays what, play today's puzzles, run a tournament or a trivia night, and bring your stream's chat into the game."
        accent="blue"
        field="mixed"
        actions={<p className="welcome-hero__free"><IconCheck size={18} stroke={2.25} aria-hidden="true" /> {viewer ? "Free, with no ads." : "Free, no ads, no account needed to start."}</p>}
        aside={
          <nav className="welcome-doors" aria-labelledby="welcome-doors-title">
            <h2 id="welcome-doors-title" className="welcome-doors__title">What brings you here?</h2>
            <ul className="welcome-doors__grid">
              {PATHS.map((p) => (
                <li key={p.id}>
                  <a href={`#${p.id}`} className={`welcome-door ${tagged(EVENTS.welcomeDoorClicked, { door: p.id })}`}>
                    <span className={`welcome-tile welcome-tile--${p.tone}`} aria-hidden="true"><p.icon size={20} stroke={2} /></span>
                    <span>{p.door}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      />
      <Container className="welcome__body">
        {steps && (
          <section className="welcome-steps" aria-labelledby="welcome-steps-title">
            <h2 id="welcome-steps-title">Three first steps</h2>
            <ol className="welcome-steps__list">
              {steps.map((s, i) => (
                <li key={s.label} className={s.done ? "is-done" : undefined}>
                  <span className="welcome-steps__num" aria-hidden="true">{s.done ? <IconCheck size={14} stroke={3} /> : i + 1}</span>
                  <Link href={s.href}>{s.label}</Link>
                  {s.done && <span className="sr-only"> (done)</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {stats.length > 0 && (
          <section className="welcome-stats" aria-label="GameShuffle right now">
            <ul>{stats.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}

        {PATHS.map((p, i) => (
          <section key={p.id} id={p.id} className={`welcome-path${i % 2 ? " welcome-path--flip" : ""}`} aria-labelledby={`${p.id}-title`}>
            <div className="welcome-path__copy">
              <p className="welcome-path__eyebrow"><span className={`welcome-tile welcome-tile--small welcome-tile--${p.tone}`} aria-hidden="true"><p.icon size={16} stroke={2} /></span>{p.eyebrow}</p>
              <h2 id={`${p.id}-title`}>{p.title}</h2>
              <p className="welcome-path__line">{p.line}</p>
              <ul className="welcome-path__things">
                {p.things.map((t) => <li key={t.text}><t.icon size={18} stroke={2} aria-hidden="true" />{t.text}</li>)}
              </ul>
              <Link href={p.cta.href} className={tagged(EVENTS.welcomePathStarted, { door: p.id })}>
                <Button variant="primary">{p.cta.label}</Button>
              </Link>
            </div>
            <Demo path={p} />
          </section>
        ))}

        {!viewer && (
          <section className="welcome-account" aria-labelledby="welcome-account-title">
            <h2 id="welcome-account-title">A free account adds</h2>
            <ul className="welcome-path__things">
              <li><IconStar size={18} stroke={2} aria-hidden="true" />Streaks and your place on the daily leaderboards</li>
              <li><IconUser size={18} stroke={2} aria-hidden="true" />A profile with your games and gamertags</li>
              <li><IconCards size={18} stroke={2} aria-hidden="true" />Saved setups, decks and your card collection</li>
            </ul>
            <Link href="/signup" className={tagged(EVENTS.welcomePathStarted, { door: "account" })}>
              <Button variant="primary">Make a free account</Button>
            </Link>
          </section>
        )}

        <section className="welcome-backing" aria-labelledby="welcome-backing-title">
          <h2 id="welcome-backing-title">Two ways to back GameShuffle</h2>
          <p className="welcome-path__line">Support is for anyone who enjoys GameShuffle and wants to keep it going (GS Pro comes with it from $9 a month). GS Pro is the toolkit for streamers. <Link href="/credits">See who makes it possible</Link>.</p>
          <BackingPair from="welcome" />
        </section>

        <section className="welcome-faq" aria-labelledby="welcome-faq-title">
          <h2 id="welcome-faq-title">Questions</h2>
          <FaqList items={FAQ} />
        </section>
      </Container>
      <MarketingJsonLd breadcrumb={{ label: "Welcome", path: "/welcome" }} faq={FAQ} />
    </main>
  );
}
