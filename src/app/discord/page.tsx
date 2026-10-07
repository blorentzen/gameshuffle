import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Button, Container, Icon } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DiscordMock } from "@/components/discord/DiscordMock";
import { DarkBand } from "@/components/marketing/DarkBand";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { GameCover } from "@/components/games/GameCover";
import { boxArt, findGame } from "@/data/game-catalog";
import { CHAT_GAMES, getChatGame } from "@/lib/twitch/chatGames";
import { EVENTS, tagged } from "@/lib/analytics/events";

export const metadata: Metadata = {
  title: "Discord Bot for Game Nights and Daily Games",
  description:
    "Add GameShuffle to your Discord server: play the Daily, the Weekly and Chat Brain together in a Discord Activity, share Wordle-style results in the channel, and roll a setup for any game night with /gs-randomize. Free for one server.",
  openGraph: {
    title: "GameShuffle for Discord",
    url: "https://www.gameshuffle.co/discord",
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/discord",
  },
};

/** Every game /gs-randomize can roll right now (hidden games stay out, as they do in the command). */
const RANDOMIZE_GAMES = Object.values(CHAT_GAMES).filter((g) => getChatGame(g.slug));
const COVER_GAMES = RANDOMIZE_GAMES.filter((g) => boxArt(findGame(g.slug, g.title)));

const GAMES = [
  {
    icon: "calendar" as const,
    title: "The Daily",
    description: "Guess today's character in six. Every guess fills in checked facts: green is a match, yellow is close. A new puzzle at midnight Pacific, rotating through Mario Kart, Mario Party and more.",
    href: "/daily",
  },
  {
    icon: "award" as const,
    title: "The Weekly",
    description: "One question for everyone, all week. Give your answer, guess the crowd's top three, and see the board every Monday.",
    href: "/weekly",
  },
  {
    icon: "lightbulb" as const,
    title: "Chat Brain",
    description: "Quick survey questions with your server. Answers are grouped and counted, never shown one by one, and the most popular become boards you can play.",
    href: "/chat-brain",
  },
];

const PRO_TOOLS = [
  { icon: "chart-bar" as const, title: "Live polls", description: "One poll across Discord, Twitch chat, your live page and your stream overlay, with a single tally." },
  { icon: "send" as const, title: "Go-live posts, routed", description: "Announce your stream with the game's cover art, and send each kind of post to the channel it belongs in." },
  { icon: "user-check" as const, title: "Self-assign roles", description: "Button and emoji role menus so members pick their own games and pings." },
  { icon: "user-plus" as const, title: "Roles for new members", description: "Everyone who joins gets the starter role you choose, automatically." },
  { icon: "shield" as const, title: "AutoMod", description: "Catch spam and banned words before they land, with the action you pick." },
  { icon: "file-description" as const, title: "Server logging", description: "Deleted and edited messages, joins, leaves and role changes, logged to a channel you pick." },
  { icon: "message-circle" as const, title: "Question of the Day", description: "A fresh question every day to get the channel talking." },
  { icon: "tag" as const, title: "Reminders and tags", description: "/gs-remind pings you when it's time. /gs-tag saves answers to the questions your server asks most." },
];

const STEPS = [
  { title: "Create your free account", body: "One tap with Discord. Your Daily streak and Weekly scores follow you to the site and your profile." },
  { title: "Add the bot to your server", body: "Pick a server and approve. The free plan covers one server." },
  { title: "Type /gs-daily", body: "The Activity opens and everyone in the channel can play. Results land in the channel as squares." },
];

const FAQ = [
  {
    q: "Is the GameShuffle Discord bot free?",
    a: "Yes. Adding the bot to one server, the Daily, the Weekly, Chat Brain, the results card in your channel, /gs-randomize and the table tools are free. GS Pro adds server tools: live polls, channel routing, role menus, roles for new members, AutoMod, server logging, Question of the Day, reminders and tags.",
  },
  {
    q: "Do players need a GameShuffle account?",
    a: "No. Anyone in the channel can play the Daily and answer Chat Brain with just their Discord account. A free GameShuffle account saves your Daily streak to your profile and lets you play the Weekly.",
  },
  {
    q: "How do people start a game?",
    a: "Type /gs-daily, open GameShuffle from Discord's App Launcher, or tap the Play button on the bot's results card. The Activity opens in the channel, on desktop, web and mobile.",
  },
  {
    q: "Which games can /gs-randomize roll?",
    a: `Right now: ${RANDOMIZE_GAMES.map((g) => g.title).join(", ")}. Pick the game, how many are playing and how many rerolls each player gets.`,
  },
  {
    q: "What can the bot see?",
    a: "The Activity gets your Discord ID, name and avatar so it can save your results, and the bot posts the day's results card where you play. The Activity does not read your messages. Server logging only runs if a server owner turns it on with GS Pro, and only for the events they pick.",
  },
  {
    q: "Is this an official Nintendo app?",
    a: "No. GameShuffle is an independent fan project and isn't affiliated with Nintendo or any game publisher.",
  },
];

function AddButton({ from, variant = "primary" }: { from: string; variant?: "primary" | "secondary" }) {
  // A plain anchor: /discord/add redirects into sign-up or Discord's install
  // screen, which a Link prefetch must never start on its own.
  return (
    <a href="/discord/add" style={{ textDecoration: "none" }} className={tagged(EVENTS.discordAddClicked, { from })}>
      <Button variant={variant} size="large">Add to Discord, free</Button>
    </a>
  );
}

function PlayButton({ href, from }: { href: string; from: string }) {
  const external = href.startsWith("https://");
  return (
    <a href={href} style={{ textDecoration: "none" }} className={tagged(EVENTS.discordPlayClicked, { from })}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <Button variant="secondary" size="large">Play the Daily in Discord</Button>
    </a>
  );
}

export default function DiscordPage() {
  // The Activity's share link opens Discord on the Daily; without an app id
  // (a local build with no Discord settings) the web Daily stands in.
  const appId = process.env.DISCORD_APPLICATION_ID;
  const playHref = appId ? `https://discord.com/activities/${appId}?custom_id=daily` : "/daily";

  return (
    <main className="dpage">
      <MarketingJsonLd
        appName="GameShuffle for Discord"
        appDescription="A Discord bot and Activity for game nights: the Daily, the Weekly and Chat Brain played together in Discord, Wordle-style results in the channel, randomizers for every game night, and GS Pro server tools."
        appUrl="/discord"
        breadcrumb={{ label: "Discord", path: "/discord" }}
        faq={FAQ}
      />

      <BrowseHero
        eyebrow="GameShuffle for Discord · New"
        title="Game night lives in your Discord now"
        sub="Play the Daily, the Weekly and Chat Brain together without leaving Discord, share your squares in the channel, and roll a setup for any game night with one command."
        accent="blue"
        field="daily"
        actions={(
          <>
            <AddButton from="hero" />
            <PlayButton href={playHref} from="hero" />
            <p className="dpage-hero-note">Free for one server. Players only need their Discord account.</p>
          </>
        )}
        aside={<DiscordMock variant="card" />}
      />

      <Container>
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">Inside the Activity</p>
            <h2 className="beta-section__title">Three games your server will play every day</h2>
            <p className="beta-section__sub">
              Open GameShuffle from the App Launcher or type <code className="dpage-cmd">/gs-daily</code>, and
              everyone in the channel plays together.
            </p>
          </div>
          <div className="strm-beats">
            {GAMES.map((g) => (
              <FeatureCard key={g.title} icon={g.icon} title={g.title} description={g.description} href={g.href} cta="Try it on the web →" />
            ))}
          </div>
        </section>

        <section className="beta-section dpage-split">
          <div className="dpage-split__copy">
            <p className="marketing-eyebrow">In your channel</p>
            <h2 className="beta-section__title">Share your squares, never the answer</h2>
            <p className="dpage-lede">
              Play from a server channel and the bot keeps one card up to date for the day: everyone&apos;s rows as
              colored squares, their score, and a button so anyone can jump in. The next morning it posts who solved
              it fastest and how long your channel&apos;s streak has run.
            </p>
            <ul className="dpage-checks">
              <li><Icon name="check" size="18" aria-hidden /> One card per channel, updated as people play</li>
              <li><Icon name="check" size="18" aria-hidden /> No spoilers, ever</li>
              <li><Icon name="check" size="18" aria-hidden /> A morning recap with medals and your streak</li>
            </ul>
          </div>
          <DiscordMock variant="summary" />
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">For game night</p>
            <h2 className="beta-section__title">One command rolls the whole table</h2>
            <p className="beta-section__sub">
              <code className="dpage-cmd">/gs-randomize</code> rolls karts, fighters, characters, kits or heroes for
              everyone playing, with rerolls for each player. <code className="dpage-cmd">/gs-flip</code>,{" "}
              <code className="dpage-cmd">/gs-roll</code> and <code className="dpage-cmd">/gs-8ball</code> settle
              everything else.
            </p>
          </div>
          <ul className="dpage-covers" aria-label="Games /gs-randomize can roll">
            {COVER_GAMES.map((g) => (
              <li key={g.slug}>
                <GameCover slug={g.slug} name={g.title} blank={false} className="dpage-covers__img" />
                <span>{g.title}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">GS Pro</p>
            <h2 className="beta-section__title">Run your whole server from GameShuffle</h2>
            <p className="beta-section__sub">
              For streamers and community owners: the tools you&apos;d otherwise juggle three bots for, managed from your
              GameShuffle account.
            </p>
          </div>
          <div className="strm-grid">
            {PRO_TOOLS.map((t) => (
              <FeatureCard key={t.title} icon={t.icon} title={t.title} description={t.description} availability="Pro" />
            ))}
          </div>
          <div className="dpage-center">
            <Link href="/gs-pro?from=discord-page" style={{ textDecoration: "none" }} className={tagged(EVENTS.upgradeClicked, { from: "discord-page" })}>
              <Button variant="secondary" size="large">See everything in GS Pro</Button>
            </Link>
          </div>
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Up and running in a minute</h2>
          </div>
          <ol className="dpage-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="dpage-center">
            <AddButton from="steps" />
          </div>
        </section>

        <section className="pricing-page__faq">
          <h2 className="beta-section__title">Questions</h2>
          {/* Open by default: CDS Accordion only mounts an item once it's opened,
              so collapsed answers would be missing from the HTML (and from search). */}
          <Accordion
            variant="bordered"
            allowMultiple
            defaultOpenIds={FAQ.map((_, i) => String(i))}
            items={FAQ.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
          />
        </section>
      </Container>

      <DarkBand premium curved curveEdges="top">
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-16)" }}>
          Bring game night to your server
        </h2>
        <p style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto var(--spacing-32)" }}>
          Free to add, free to play, and ready the moment someone types /gs-daily.
        </p>
        <div className="strm-finalcta">
          <AddButton from="band" />
          <PlayButton href={playHref} from="band" />
        </div>
      </DarkBand>
    </main>
  );
}
