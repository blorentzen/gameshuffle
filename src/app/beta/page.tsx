import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Icon, CarouselItem, type IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { BetaInterestForm } from "./BetaInterestForm";

export const metadata: Metadata = {
  title: "Streamer Beta: bring GameShuffle to your stream",
  description:
    "Join the GameShuffle Streamer Beta. Turn your stream into an interactive game night with chat-driven randomizers, live scoring, tournaments, overlay tools, and a token economy. Runs at least 30 days with Pro included.",
  openGraph: {
    title: "GameShuffle Streamer Beta",
    url: "https://www.gameshuffle.co/beta",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gameshuffle-beta-program-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/beta",
  },
};

const CAPABILITIES: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "bolt",
    title: "Chat-driven randomizers",
    description:
      "Your viewers reroll your kart with a chat command or channel points. Mario Kart 8 Deluxe and Mario Kart World, live on stream.",
  },
  {
    icon: "chart-bar",
    title: "Live competitive scoring",
    description:
      "Run lounge-style scoring with normalized placements, team modes, and a public viewer page that updates in real time.",
  },
  {
    icon: "award",
    title: "Tournaments and series",
    description:
      "Brackets, points, the Heat to Mains ladder, or a full championship season with standings, build rules, and picks and bans.",
  },
  {
    icon: "share",
    title: "Twitch integration",
    description:
      "A chat bot, channel-point rewards, an OBS overlay, and a public lobby viewer, all wired to your channel in a few clicks.",
  },
  {
    icon: "layout-grid",
    title: "Overlay tools",
    description:
      "Spin-the-wheel, timers, community bingo, tier lists, and a magic 8-ball your chat can trigger, laid out how you like.",
  },
  {
    icon: "currency-dollar",
    title: "Token economy",
    description:
      "A closed-loop currency with prediction markets, awards, and leaderboards that keeps your community playing along.",
  },
  {
    icon: "sparkles",
    title: "Your brand, everywhere",
    description:
      "Pick a theme once and it reskins your overlay, live page, and profile so everything on stream matches your channel.",
  },
  {
    icon: "users",
    title: "Viewers in the game",
    description:
      "Joins, rerolls, votes, and predictions turn passive viewers into participants without you leaving the game.",
  },
];

const PERKS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "rosette",
    title: "Pro access, on us",
    body: "Beta streamers get GameShuffle Pro free for the length of the beta. No card, no catch.",
  },
  {
    icon: "compass",
    title: "Shape the roadmap",
    body: "You get a direct line to the team. The features you ask for are the ones we build next.",
  },
  {
    icon: "bolt",
    title: "Early access to everything",
    body: "New modules, overlay tools, and game support land in your hands first.",
  },
  {
    icon: "flag",
    title: "Founding-streamer recognition",
    body: "Help us launch and we'll make sure your community knows you were here first.",
  },
];

const COMMITMENT: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "clock",
    title: "A 30-day run, at minimum",
    body: "The beta runs for at least 30 days, so you have real time to fold GameShuffle into your streams and see how your community takes to it.",
  },
  {
    icon: "checks",
    title: "Feedback as you go",
    body: "All we ask is that you actually use it on stream and tell us what works and what doesn't, so we can make it better with you.",
  },
];

const STEPS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "Create your account", body: "Sign up in a minute. This is what we tie your beta access to." },
  { n: 2, title: "Apply", body: "Tell us where you stream and what you play." },
  { n: 3, title: "We set you up", body: "If you're a fit, we reach out and switch on Pro for the beta." },
];

export default function BetaPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      {/* Hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <Container>
          <span className="marketing-hero__eyebrow">🎮 Streamer Beta</span>
          <h1 className="marketing-hero__title">Run game night with your community</h1>
          <p className="marketing-hero__sub">
            GameShuffle turns your stream into an interactive game night: chat-driven randomizers,
            live scoring, tournaments, overlay tools, and a token economy, all built for streamers
            and their viewers. We&rsquo;re opening the beta to a small group of streamers, with Pro
            included and a real 30-day run. Come help us shape it.
          </p>
          <div style={{ marginTop: "var(--spacing-28)" }}>
            <Link href="#apply" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">
                Apply for the beta
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      <Container>
        {/* Platform intro */}
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">What is GameShuffle</p>
            <h2 className="beta-section__title">A game night companion built for streamers</h2>
            <p className="beta-section__sub">
              GameShuffle is a platform for running game nights with your community, starting with
              Mario Kart. You get the randomizers, competitive scoring, and tournaments, plus the
              Twitch integration and overlay tools to put it all on stream. Your viewers do more than
              watch. They join, reroll, vote, and predict right from chat.
            </p>
          </div>
        </section>

        {/* Capabilities grid */}
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">What you get</h2>
          </div>
          <div className="beta-features-carousel">
            <AutoplayCarousel
              slidesToShow={{ mobile: 1, tablet: 2, desktop: 4 }}
              gap={20}
              showArrows
              showDots
              loop
              interval={5000}
            >
              {CAPABILITIES.map((c) => (
                <CarouselItem key={c.title}>
                  <FeatureCard icon={c.icon} title={c.title} description={c.description} />
                </CarouselItem>
              ))}
            </AutoplayCarousel>
          </div>
        </section>
      </Container>

      {/* Why join — premium dark band with icon cards */}
      <DarkBand premium>
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-32)" }}>
          Why join the beta
        </h2>
        <div className="beta-perks-grid">
          {PERKS.map((p) => (
            <div key={p.title} className="beta-perk-card">
              <span className="beta-perk-card__icon" aria-hidden="true">
                <Icon name={p.icon} size="24" />
              </span>
              <span>
                <h3 className="beta-perk-card__title">{p.title}</h3>
                <p className="beta-perk-card__body">{p.body}</p>
              </span>
            </div>
          ))}
        </div>
      </DarkBand>

      <Container>
        {/* The commitment */}
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">The commitment</p>
            <h2 className="beta-section__title">What we ask in return</h2>
            <p className="beta-section__sub">
              This is a partnership, not a free trial. Here&rsquo;s the deal.
            </p>
          </div>
          <div className="beta-commit-grid">
            {COMMITMENT.map((c) => (
              <div key={c.title} className="beta-commit-card">
                <span className="beta-commit-card__icon" aria-hidden="true">
                  <Icon name={c.icon} size="24" />
                </span>
                <span>
                  <h3 className="beta-commit-card__title">{c.title}</h3>
                  <p className="beta-commit-card__body">{c.body}</p>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Apply */}
        <section id="apply" className="beta-section" style={{ scrollMarginTop: "var(--spacing-32)" }}>
          <div className="beta-apply">
            <div className="beta-apply__intro">
              <p className="marketing-eyebrow">Apply</p>
              <h2 className="beta-apply__title">Request your beta invite</h2>
              <p className="beta-apply__intro-copy">
                Applying takes a minute, and it starts with a GameShuffle account so we can set you
                up the moment you&rsquo;re accepted.
              </p>
              <ol className="beta-steps">
                {STEPS.map((s) => (
                  <li key={s.n} className="beta-steps__item">
                    <span className="beta-steps__num">{s.n}</span>
                    <span>
                      <strong>{s.title}.</strong> {s.body}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="beta-apply__note">
                Questions first? <Link href="/contact-us">Contact us</Link>.
              </p>
            </div>

            <div className="beta-apply__form">
              <BetaInterestForm />
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
