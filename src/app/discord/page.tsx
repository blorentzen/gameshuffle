import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Badge, Button, Card, Container, Icon, Tabs } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DiscordMock } from "@/components/discord/DiscordMock";
import { CoverMarquee, type MarqueeGame } from "@/components/marketing/CoverMarquee";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { GAME_CATALOG, boxArt, findGame } from "@/data/game-catalog";
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

function withArt(list: { slug: string; name: string }[]): MarqueeGame[] {
  return list.flatMap((g) => {
    const art = boxArt(findGame(g.slug, g.name));
    return art ? [{ slug: g.slug, name: g.name, art }] : [];
  });
}
const LIVE_NOW = withArt(RANDOMIZE_GAMES.map((g) => ({ slug: g.slug, name: g.title })));
/** Candidates in the game catalog: the randomizers we'd build next. */
const COMING_SOON = withArt(GAME_CATALOG.filter((g) => g.status === "candidate").map((g) => ({ slug: g.slug, name: g.name })));

const GAMES: { icon: IconName; title: string; line: string; href: string }[] = [
  { icon: "calendar", title: "The Daily", line: "Guess today's character in six. A new puzzle every midnight Pacific.", href: "/daily" },
  { icon: "award", title: "The Weekly", line: "Answer one question and guess the crowd's top three.", href: "/weekly" },
  { icon: "lightbulb", title: "Chat Brain", line: "Quick survey questions that become boards you can play.", href: "/chat-brain" },
];

const FREE = [
  "Add the bot to one server",
  "The Daily, the Weekly and Chat Brain in the Activity",
  "Results cards and the morning recap",
  "/gs-randomize, /gs-flip, /gs-roll and /gs-8ball",
  "Go-live posts to one channel",
];
const PRO = [
  "Live polls across Discord, Twitch and your overlay",
  "Posts routed to the channel each one belongs in",
  "Role menus and roles for new members",
  "AutoMod and server logging",
  "Question of the Day",
  "/gs-remind and /gs-tag",
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

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="dpage-checks">
      {items.map((t) => <li key={t}><Icon name="check" size="18" aria-hidden /> {t}</li>)}
    </ul>
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
        {/* The Activity's three games and what lands in the channel, in one section. */}
        <section className="beta-section dpage-split">
          <div className="dpage-split__copy">
            <p className="marketing-eyebrow">Inside the Activity</p>
            <h2 className="beta-section__title">Three games your server plays together</h2>
            <p className="dpage-lede">
              Open GameShuffle from the App Launcher or type <code className="dpage-cmd">/gs-daily</code>. Everyone in
              the channel plays, and the bot keeps score right in the chat.
            </p>
            <ul className="dpage-games">
              {GAMES.map((g) => (
                <li key={g.title}>
                  <span className="dpage-games__icon"><Icon name={g.icon} size="20" aria-hidden /></span>
                  <span className="dpage-games__text">
                    <Link href={g.href}>{g.title}</Link>
                    <span>{g.line}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Checks items={["Results in the channel as squares, never the answer", "A morning recap with medals and the channel's streak"]} />
          </div>
          <DiscordMock variant="summary" />
        </section>
      </Container>

      {/* Decorative, so it moves instead of scrolling the page: one band, two rows. */}
      <section className="dpage-band" aria-labelledby="dpage-roll">
        <Container>
          <div className="beta-section__head">
            <p className="marketing-eyebrow">For game night</p>
            <h2 id="dpage-roll" className="beta-section__title">One command rolls the whole table</h2>
            <p className="beta-section__sub">
              <code className="dpage-cmd">/gs-randomize</code> rolls karts, fighters, characters, kits or heroes for
              everyone playing, with rerolls for each player.
            </p>
          </div>
        </Container>
        <CoverMarquee rows={[
          { label: "Live now", tone: "live", games: LIVE_NOW },
          { label: "Coming soon", tone: "soon", games: COMING_SOON },
        ]} />
      </section>

      <Container>
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">Free and GS Pro</p>
            <h2 className="beta-section__title">Free for every server. GS Pro runs the whole thing.</h2>
            <p className="beta-section__sub">
              The games are free for everyone. GS Pro is for streamers and community owners who want one place to run
              their server.
            </p>
          </div>
          <div className="dpage-plans">
            <Card variant="outlined" padding="large" className="dpage-plan">
              <h3 className="dpage-plan__name">Free</h3>
              <p className="dpage-plan__tag">Everything your server needs to play.</p>
              <Checks items={FREE} />
              <div className="dpage-plan__cta"><AddButton from="plans" variant="secondary" /></div>
            </Card>
            <Card variant="elevated" padding="large" className="dpage-plan dpage-plan--pro">
              <h3 className="dpage-plan__name">GS Pro <Badge variant="info" size="small">For streamers</Badge></h3>
              <p className="dpage-plan__tag">Everything in Free, plus the tools that run your server.</p>
              <Checks items={PRO} />
              <div className="dpage-plan__cta">
                <Link href="/gs-pro?from=discord-page" style={{ textDecoration: "none" }} className={tagged(EVENTS.upgradeClicked, { from: "discord-page" })}>
                  <Button variant="primary" size="large">See GS Pro</Button>
                </Link>
              </div>
            </Card>
          </div>

          <div className="dpage-spotlight">
            <h3 className="dpage-spotlight__title">Only in GS Pro</h3>
            <Tabs
              variant="underline"
              tabs={[
                {
                  id: "polls",
                  label: "Live polls",
                  content: (
                    <ProSpotlight
                      eyebrow="GS Pro"
                      title="One poll, everywhere your community is"
                      body="Open a poll from Discord, your dashboard or Twitch chat. Discord buttons, !vote in chat and taps on your live page all count toward one tally, and your stream overlay shows it as it moves."
                      media={<DiscordMock variant="poll" />}
                    />
                  ),
                },
                {
                  id: "golive",
                  label: "Go-live posts",
                  content: (
                    <ProSpotlight
                      eyebrow="GS Pro"
                      title="Your server knows the moment you go live"
                      body="GameShuffle posts when your stream starts, with the game's cover art and your live page, and sends every kind of post, from go-live to Question of the Day, to the channel you choose."
                      media={<DiscordMock variant="golive" />}
                    />
                  ),
                },
                {
                  id: "roles",
                  label: "Roles and AutoMod",
                  content: (
                    <ProSpotlight
                      eyebrow="GS Pro"
                      title="Roles, AutoMod and logs, without another bot"
                      body="Members pick their games and pings from button menus, new members get a starter role, AutoMod catches spam before it lands, and server logging records deletes, edits, joins and role changes."
                      media={<DiscordMock variant="roles" />}
                    />
                  ),
                },
              ]}
            />
          </div>
        </section>

        <section className="pricing-page__faq">
          <h2 className="beta-section__title">Questions</h2>
          <Accordion
            variant="bordered"
            allowMultiple
            items={FAQ.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
          />
        </section>
      </Container>

      {/* The close: the three steps and both ways in, in one band. */}
      <DarkBand premium curved curveEdges="top">
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-24)" }}>
          Up and running in a minute
        </h2>
        <ol className="dpage-steps">
          <li><b>Create your free account</b><span>One tap with Discord.</span></li>
          <li><b>Add the bot to your server</b><span>Pick a server and approve.</span></li>
          <li><b>Type /gs-daily</b><span>Everyone in the channel can play.</span></li>
        </ol>
        <div className="strm-finalcta">
          <AddButton from="band" />
          <PlayButton href={playHref} from="band" />
        </div>
      </DarkBand>
    </main>
  );
}
