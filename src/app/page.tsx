import type { Metadata } from "next";
import { Container, Button } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { AppCard } from "@/components/AppCard";
import { ProPitchBand } from "@/components/marketing/ProPitchBand";
import { TCG_HUB_PATH } from "@/data/tcg-hub";
import { TCG_SHOP_URL } from "@/data/shop";

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

export default function HomePage() {
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
                fontSize: "clamp(3.2rem, 5vw, 6.4rem)",
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
          <section id="apps" style={{ margin: "var(--spacing-56) 0 3rem", scrollMarginTop: "6rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h3)",
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
                learnMoreHref="/mario-kart-8-deluxe-randomizer"
                live
              />
              <AppCard
                title="Mario Kart World Randomizer"
                description="Randomize characters, karts, tracks, knockout rallies, and items for Mario Kart World with up to 24 players."
                imageSrc="/images/bg/mkw-main-image.jpg"
                imageAlt="Mario Kart World"
                href="/randomizers/mario-kart-world"
                learnMoreHref="/mario-kart-world-randomizer"
                live
              />
              <AppCard
                title="MK8DX Competitive Hub"
                description="Live lounge scoring, community resources, and lobby management for the competitive Mario Kart 8 Deluxe scene."
                imageSrc="/images/bg/MK8DX_Background_Music.jpg"
                imageAlt="Mario Kart 8 Deluxe competitive"
                href="/competitive/mario-kart-8-deluxe"
                learnMoreHref="/competitive-mario-kart"
                beta
              />
              <AppCard
                title="Browse & Create Tournaments"
                description="Run a one-off tournament (brackets, points, or the Heat → Mains ladder) or a championship series with season standings. Set tracks, rules, and invite players."
                imageSrc="/images/fg/mario-holding-trophy.jpg"
                imageAlt="Mario Kart 8 Deluxe tournament"
                href="/tournament"
                learnMoreHref="/mario-kart-tournaments"
                beta
              />
              <AppCard
                title="TCG Companion"
                description="A digital game-night kit for Pokémon TCG: damage, conditions, prizes, coin flips, and dice without breaking up the table."
                imageSrc="https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png"
                imageAlt="Pokémon TCG cards spread on a table"
                href="/tcg-companion"
                learnMoreHref="/pokemon-tcg-companion"
              />
              <AppCard
                title="GameShuffle TCG"
                description="Pokémon singles and ready-to-run decks (competitive, beginner & family, and meme) plus deck guides and the free companion app to run your games."
                imageSrc="https://cdn.empac.co/gameshuffle/images/standard/gameshuffle-tcg-shop-hero.jpg"
                imageAlt="GameShuffle TCG shop"
                href={TCG_HUB_PATH}
                ctaLabel="Explore GameShuffle TCG"
                secondaryHref={TCG_SHOP_URL}
                secondaryLabel="Buy cards now"
                secondaryExternal
                live
              />
            </div>
          </section>
          {/* Free tools — the wide top-of-funnel + cross-link to /tools + Pro tease */}
          <section style={{ margin: "0 0 3rem", textAlign: "center" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h3)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-12)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              Free stream &amp; party tools
            </h2>
            <p style={{ maxWidth: 620, margin: "0 auto var(--spacing-20)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)", lineHeight: 1.6 }}>
              Spin a wheel, roll dice, run a bingo board or tier list, ask the
              8-ball: 10 free tools, no account needed. On Pro, they go live on
              your overlay.
            </p>
            <div className="home-tiles">
              {[
                { icon: "🎡", label: "Wheel Spinner", href: "/wheel-spinner" },
                { icon: "🎲", label: "Dice Roller", href: "/dice-roller" },
                { icon: "🪙", label: "Coin Flip", href: "/coin-flip" },
                { icon: "🎯", label: "Name Picker", href: "/name-picker" },
                { icon: "⏱️", label: "Stream Timer", href: "/stream-timer" },
                { icon: "🥇", label: "Tier List Maker", href: "/tier-list-maker" },
                { icon: "🅱️", label: "Bingo", href: "/bingo-card-generator" },
                { icon: "🎱", label: "Magic 8-Ball", href: "/magic-8-ball" },
              ].map((t) => (
                <a key={t.href} href={t.href} className="home-tile">
                  <span className="home-tile__icon" aria-hidden="true">{t.icon}</span>
                  <span className="home-tile__label">{t.label}</span>
                </a>
              ))}
            </div>
            <a href="/tools">
              <Button variant="secondary">Browse all free tools →</Button>
            </a>
          </section>
        </Container>

        {/* What GS Pro unlocks — full-bleed band below the app grid */}
        <ProPitchBand />

        <Container>
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
