import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Container, Button, Icon } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { HeroShowcase } from "@/components/home/HeroShowcase";
import Link from "next/link";
import { AppCard } from "@/components/AppCard";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { GAME_ART } from "@/data/game-art";
import { HomePlayToday } from "@/components/originals/HomePlayToday";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { PillarDoors } from "@/components/marketing/PillarDoors";
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
  // Absolute: the brand already leads, so skip the " | GameShuffle" suffix.
  title: { absolute: "GameShuffle: Mario Kart & Mario Party Randomizers" },
  description:
    "Free Mario Kart and Mario Party randomizers, live scoring, tournaments and stream tools for any game night. GameShuffle Pro turns your whole chat into players.",
  openGraph: {
    title: "Shuffle up your game night",
    url: "https://www.gameshuffle.co/",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/",
  },
};

/** Who publishes the site, and the site itself. Homepage only. */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "GameShuffle",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      email: "support@gameshuffle.co",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "GameShuffle",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

/** The homepage's six randomizers, the games people look for most; every other one is on /randomizers. */
const TOP_RANDOMIZERS = [
  { title: "Mario Kart 8 Deluxe Randomizer", description: "Randomize your kart picks in Mario Kart 8 Deluxe for up to 12 players, plus randomize the tracks your family and friends select.", image: "/images/fg/mk8dx-kart-selection-screen.jpg", imageAlt: "Mario Kart 8 Deluxe selection screen", href: "/randomizers/mario-kart-8-deluxe" },
  { title: "Mario Kart World Randomizer", description: "Randomize characters, karts, tracks, knockout rallies, and items for Mario Kart World with up to 24 players.", image: "/images/bg/mkw-main-image.jpg", imageAlt: "Mario Kart World", href: "/randomizers/mario-kart-world" },
  { title: "Mario Party Superstars Randomizer", description: "Roll one of the five classic boards and the turns, give everyone a character, and spin from 100 classic minigames.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg", imageAlt: "Mario throwing a Dice Block on a Mario Party Superstars board", href: "/randomizers/mario-party-superstars" },
  { title: "Mario Party Jamboree Randomizer", description: "Roll the board, rules and turns, give everyone a character, and spin minigames. Works with the Switch and Switch 2 Edition.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", imageAlt: "Super Mario Party Jamboree board", href: "/randomizers/super-mario-party-jamboree" },
  { title: "Super Smash Bros. Ultimate Randomizer", description: "Give up to 8 players a fighter and costume, then roll the stage, the rules, Custom Smash and Squad Strike squads.", image: GAME_ART["super-smash-bros-ultimate"].hero.src, imageAlt: GAME_ART["super-smash-bros-ultimate"].hero.alt, href: "/randomizers/super-smash-bros-ultimate" },
  { title: "Marvel Rivals Randomizer", description: "Hero roulette for your whole team, with role limits, no repeats, Team-Up teams and a random map.", image: GAME_ART["marvel-rivals"].hero.src, imageAlt: GAME_ART["marvel-rivals"].hero.alt, href: "/randomizers/marvel-rivals", isNew: true },
];

export default async function HomePage() {
  // Featured shop cards for the homepage TCG module (read-only, 0 Scrydex
  // credits; FPO fallback inside the component if none configured).
  const shopCards = await getPublicFeaturedShopCards();
  return (
    <>
      <script
        type="application/ld+json"
        // Static, server-rendered, not user-generated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
      />
      <BrowseHero
        eyebrow="Free for everyone · no account needed"
        title={"Shuffle up your game\u00a0night."}
        sub="Free randomizers, live competition, and tournaments for any game night, from family on the couch to friends across Discord. Streaming? A Pro layer turns your whole chat into players."
        accent="blue"
        field="mixed"
        primary={{ href: "#apps", label: "Find something to play" }}
        secondary={{ href: "/daily", label: "Play today's Daily" }}
        aside={<HeroShowcase />}
      />

      <main>
        <Container>
          {/* Tier-1 heading: the primary "what can I do here" section. */}
          {/* Wayfinding before inventory: the four doors come first, then the
              apps for people who already know what they want. */}
          <PillarDoors />

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
            <ResponsiveCarousel className="app-card-grid" label="Top randomizers">
              {TOP_RANDOMIZERS.map((r) => (
                <AppCard
                  key={r.href}
                  title={r.title}
                  description={r.description}
                  imageSrc={r.image}
                  imageAlt={r.imageAlt}
                  href={r.href}
                  ctaLabel="Open randomizer"
                  isNew={r.isNew}
                  linkTitle
                  linkClassName={tagged(EVENTS.randomizerCardClicked, { to: r.href.split("/").pop() ?? r.href, from: "home" })}
                />
              ))}
            </ResponsiveCarousel>
            <Link href="/randomizers" className="home-all-link">
              <Button variant="secondary">Check out all randomizers →</Button>
            </Link>
          </section>

          {/* Daily + weekly games: reasons to come back between game nights. */}
          <section style={{ margin: "0 0 3rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h2)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-24)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              Come back tomorrow
            </h2>
            <HomePlayToday />
            <DiscordPlug from="home" text="Play the Daily, the Weekly and Chat Brain with your server, right in Discord." />
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
            <ResponsiveCarousel className="home-tiles" perSlide={2} label="Free tools">
              {FREE_TOOLS.map((t) => (
                <a key={t.href} href={t.href} className="home-tile gs-hover-gradient">
                  <span className="home-tile__icon" aria-hidden="true">
                    <Icon name={t.icon} size="32" />
                  </span>
                  <span className="home-tile__label">{t.label}</span>
                </a>
              ))}
            </ResponsiveCarousel>
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
            <ResponsiveCarousel className="app-card-grid" label="More from GameShuffle">
              <AppCard
                title="MK8DX Competitive Hub"
                description="Live lounge scoring, community resources, and lobby management for the competitive Mario Kart 8 Deluxe scene."
                imageSrc="/images/bg/MK8DX_Background_Music.jpg"
                imageAlt="Mario Kart 8 Deluxe competitive"
                href="/competitive/mario-kart-8-deluxe"
                ctaLabel="Open the hub"
                learnMoreHref="/competitive-mario-kart"
              />
              <AppCard
                title="Browse & Create Tournaments"
                description="Run a one-off tournament (brackets, points, or the Heat → Mains ladder) or a championship series with season standings. Any game: pick one of ours or name your own and write the rules."
                imageSrc="/images/lifestyle/hero-tournaments.b274d0e2.jpg"
                imageAlt="Players celebrating a tournament win"
                href="/tournament"
                ctaLabel="Start a tournament"
                learnMoreHref="/mario-kart-tournaments"
              />
            </ResponsiveCarousel>
          </section>

          {/* Game nights — off-screen game nights, hosted like sessions.
              Designed gradient band (no photo asset) with a sample night peek. */}
          <section style={{ margin: "var(--spacing-56) 0 3rem" }}>
            <div className="bgn-home">
              <div className="bgn-home__copy">
                <p className="marketing-eyebrow">New: game nights, in real life</p>
                <h2 className="bgn-home__title">Take game night off the screen</h2>
                <p className="bgn-home__text">
                  Host a game night the same way you&apos;d run a session: set the
                  games, the vibe, and who it&apos;s for, then find players near you who
                  like what you like.
                </p>
                <Link href="/game-nights" style={{ textDecoration: "none" }}>
                  <Button variant="primary">Find or host a night →</Button>
                </Link>
              </div>
              <div className="bgn-home__peek" aria-hidden>
                <span className="bgn-home__peek-when">Fri, Mar 14 · 7:00 PM</span>
                <span className="bgn-home__peek-title">Catan &amp; Chill</span>
                <span className="bgn-home__peek-tags">
                  <span className="bgn-home__peek-tag">Intermediate</span>
                  <span className="bgn-home__peek-tag">Strategy</span>
                  <span className="bgn-home__peek-tag">Euro</span>
                </span>
                <span className="bgn-home__peek-foot">4 games on the table</span>
              </div>
            </div>
          </section>
        </Container>

        {/* GS Pro — moved down (Phase 3): lands as the payoff after the free
            value. Full-bleed band with curved edges (DarkBand `curved`). */}
        <ProPitchBand />

        <Container>
          {/* Pokémon: the TCG Companion and the run challenge sit with the
              featured cards rather than in the randomizer row up top. */}
          <section style={{ margin: "var(--spacing-56) 0 var(--spacing-24)" }}>
            <h2
              style={{
                fontSize: "var(--font-size-fluid-h3)",
                fontWeight: "var(--font-weight-bold)",
                margin: "0 0 var(--spacing-32)",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              For Pokémon trainers
            </h2>
            <ResponsiveCarousel className="app-card-grid" label="For Pokémon trainers">
              <AppCard
                title="TCG Companion"
                description="A digital game-night kit for Pokémon TCG: damage, conditions, prizes, coin flips, and dice without breaking up the table."
                imageSrc="https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png"
                imageAlt="Pokémon TCG cards spread on a table"
                href="/tcg-companion"
                ctaLabel="Open TCG Companion"
                learnMoreHref="/pokemon-tcg-companion"
              />
              <AppCard
                title="Fire Red & Leaf Green Run Challenge"
                description="A new way through Kanto: a random starter, Pokémon to catch before every gym, and a level cap and team size for each leader."
                imageSrc={GAME_ART["pokemon-firered-leafgreen"].hero.src}
                imageAlt={GAME_ART["pokemon-firered-leafgreen"].hero.alt}
                href="/randomizers/pokemon-firered-leafgreen"
                ctaLabel="Start a run"
                isNew
                linkTitle
                linkClassName={tagged(EVENTS.randomizerCardClicked, { to: "pokemon-firered-leafgreen", from: "home" })}
              />
            </ResponsiveCarousel>
          </section>

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
