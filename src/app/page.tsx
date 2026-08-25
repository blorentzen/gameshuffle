import type { Metadata } from "next";
import { Container, Button, Icon } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { AppCard } from "@/components/AppCard";
import { ProPitchBand } from "@/components/marketing/ProPitchBand";
import { FeaturedShopCards } from "@/components/tcg/FeaturedShopCards";
import { getPublicFeaturedShopCards } from "@/lib/shop/featuredCards";

/** Free-tools wayfinder tiles. CDS (Tabler) icons — no emoji (they clash with
 *  the icon system + render per-OS). CDS lacks dice/coin glyphs, so those use
 *  the nearest shapes (box=die, rosette=coin token); flagged for a CDS add. */
const FREE_TOOLS: { icon: IconName; label: string; href: string }[] = [
  { icon: "rotate", label: "Wheel Spinner", href: "/wheel-spinner" },
  { icon: "box", label: "Dice Roller", href: "/dice-roller" },
  { icon: "rosette", label: "Coin Flip", href: "/coin-flip" },
  { icon: "user-check", label: "Name Picker", href: "/name-picker" },
  { icon: "clock", label: "Stream Timer", href: "/stream-timer" },
  { icon: "layout-list", label: "Tier List Maker", href: "/tier-list-maker" },
  { icon: "border-all", label: "Bingo", href: "/bingo-card-generator" },
  { icon: "help-circle", label: "Magic 8-Ball", href: "/magic-8-ball" },
];

export const metadata: Metadata = {
  title: "GameShuffle: the game-night platform for players and streamers",
  description:
    "Free Mario Kart randomizers, live competitive scoring, tournaments, and stream tools to shuffle up any game night. GameShuffle Pro adds an Arcade Token economy your whole chat plays alongside you.",
  openGraph: {
    title: "Shuffle up your game night",
    url: "https://www.gameshuffle.co/",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/",
  },
};

export default async function HomePage() {
  // Featured shop cards for the homepage TCG module (read-only, 0 Scrydex
  // credits; FPO fallback inside the component if none configured).
  const shopCards = await getPublicFeaturedShopCards();
  return (
    <>
      <VideoHero
        videoSrc="/video/gameshuffle-homepage-vid.mp4"
        videoWebm="/video/gameshuffle-homepage-vid.webm"
        videoPoster="/video/gameshuffle-homepage-thumb.jpg"
        overlayOpacity={0.5}
        height="medium"
        blend
      >
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <h1
              style={{
                fontSize: "clamp(2.7rem, 5vw, 6.4rem)",
                fontWeight: 700,
                marginBottom: "1rem",
                lineHeight: 1.1,
              }}
            >
              Shuffle up your game&nbsp;night.
            </h1>
            <p style={{ fontSize: "clamp(1.6rem, 2vw, 2rem)", lineHeight: 1.6 }}>
              Free randomizers, live competition, and tournaments for any game night,
              from family on the couch to friends across Discord. Streaming? A Pro layer
              turns your whole chat into players.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main>
        <Container>
          {/* Tier-1 heading: the primary "what can I do here" section. */}
          <section id="apps" style={{ margin: "var(--spacing-56) 0 3rem", scrollMarginTop: "6rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h2)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-32)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              What are we playing today?
            </h2>
            <div className="app-card-grid">
              <AppCard
                title="MK8DX Kart and Track Randomizer"
                description="Randomize your kart picks in Mario Kart 8 Deluxe for up to 12 players, plus randomize the tracks your family and friends select."
                imageSrc="/images/fg/mk8dx-kart-selection-screen.jpg"
                imageAlt="Mario Kart 8 Deluxe selection screen"
                href="/randomizers/mario-kart-8-deluxe"
                ctaLabel="Open randomizer"
                learnMoreHref="/mario-kart-8-deluxe-randomizer"
              />
              <AppCard
                title="Mario Kart World Randomizer"
                description="Randomize characters, karts, tracks, knockout rallies, and items for Mario Kart World with up to 24 players."
                imageSrc="/images/bg/mkw-main-image.jpg"
                imageAlt="Mario Kart World"
                href="/randomizers/mario-kart-world"
                ctaLabel="Open randomizer"
                learnMoreHref="/mario-kart-world-randomizer"
              />
              <AppCard
                title="TCG Companion"
                description="A digital game-night kit for Pokémon TCG: damage, conditions, prizes, coin flips, and dice without breaking up the table."
                imageSrc="https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png"
                imageAlt="Pokémon TCG cards spread on a table"
                href="/tcg-companion"
                ctaLabel="Open TCG Companion"
                learnMoreHref="/pokemon-tcg-companion"
              />
            </div>
          </section>

          {/* Free tools — moved up (Phase 3): three consecutive blocks of free
              value build momentum before Pro. Tier-1 heading. */}
          <section style={{ margin: "0 0 3rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h2)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-12)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              Free stream &amp; party tools
            </h2>
            <p style={{ maxWidth: 620, margin: "0 0 var(--spacing-24)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)", lineHeight: 1.6 }}>
              Spin a wheel, roll dice, run a bingo board or tier list, ask the
              8-ball: 10 free tools, no account needed. On Pro, they go live on
              your overlay.
            </p>
            <div className="home-tiles">
              {FREE_TOOLS.map((t) => (
                <a key={t.href} href={t.href} className="home-tile gs-hover-gradient">
                  <span className="home-tile__icon" aria-hidden="true">
                    <Icon name={t.icon} size="32" />
                  </span>
                  <span className="home-tile__label">{t.label}</span>
                </a>
              ))}
            </div>
            <a href="/tools">
              <Button variant="primary">Browse all free tools →</Button>
            </a>
          </section>

          {/* More from GameShuffle — the competitive + tournament surfaces.
              Tier-2 heading. */}
          <section style={{ margin: "var(--spacing-56) 0 3rem", scrollMarginTop: "6rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h3)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-32)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              More from GameShuffle
            </h2>
            <div className="app-card-grid">
              <AppCard
                title="MK8DX Competitive Hub"
                description="Live lounge scoring, community resources, and lobby management for the competitive Mario Kart 8 Deluxe scene."
                imageSrc="/images/bg/MK8DX_Background_Music.jpg"
                imageAlt="Mario Kart 8 Deluxe competitive"
                href="/competitive/mario-kart-8-deluxe"
                ctaLabel="Open the hub"
                learnMoreHref="/competitive-mario-kart"
                beta
              />
              <AppCard
                title="Browse & Create Tournaments"
                description="Run a one-off tournament (brackets, points, or the Heat → Mains ladder) or a championship series with season standings. Set tracks, rules, and invite players."
                imageSrc="/images/fg/mario-holding-trophy.jpg"
                imageAlt="Mario Kart 8 Deluxe tournament"
                href="/tournament"
                ctaLabel="Start a tournament"
                learnMoreHref="/mario-kart-tournaments"
                beta
              />
            </div>
          </section>
        </Container>

        {/* GS Pro — moved down (Phase 3): lands as the payoff after the free
            value. Full-bleed band with curved edges (DarkBand `curved`). */}
        <ProPitchBand />

        <Container>
          {/* Featured Pokémon cards — moved down (Phase 3): the two-hop TCG
              funnel shouldn't carry the heaviest treatment up top. */}
          <FeaturedShopCards
            cards={shopCards}
            heading="Featured Pokémon cards"
            intro="Real Pokémon singles from the GameShuffle TCG store, shipped fast and protected. Tap a card to grab it on TCGplayer."
          />

          {/* Feedback CTA */}
          <section className="feedback-cta">
            <h2 className="feedback-cta__title">Help us build GameShuffle</h2>
            <p className="feedback-cta__text">
              We&apos;re actively building new features and would love your input. Have a game you want supported?
              A feature idea? Something that could be better? Let us know.
            </p>
            <a href="/contact-us">
              <Button variant="primary">Share Your Feedback</Button>
            </a>
          </section>
        </Container>
      </main>
    </>
  );
}
