import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Container, Icon } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { IconCards, IconPokeball } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { HeroShowcase } from "@/components/home/HeroShowcase";
import Link from "next/link";
import { AppCard } from "@/components/AppCard";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { GAME_ART } from "@/data/game-art";
import { DiscordPlug } from "@/components/discord/DiscordPlug";
import { HomeToday } from "@/components/home/HomeToday";
import { HomeHost } from "@/components/home/HomeHost";
import { PlansBand } from "@/components/home/PlansBand";
import { SupportBand } from "@/components/home/SupportBand";
import { homeViewer } from "@/lib/home/viewer";
import { DAILY_DEX_PUBLIC } from "@/lib/games-visibility";
import { FeaturedShopCards } from "@/components/tcg/FeaturedShopCards";
import { getPublicFeaturedShopCards } from "@/lib/shop/featuredCards";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { ShopBand } from "@/components/store/ShopEntry";

/** Free-tools wayfinder tiles. CDS (Tabler) icons, no emoji (they clash with
 *  the icon system and render per OS). CDS lacks dice/coin glyphs, so those use
 *  the nearest shapes (box = die, rosette = coin token); flagged for a CDS add. */
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
    "Free Mario Kart and Mario Party randomizers, daily puzzles, tournaments and trivia nights for any game night. GameShuffle Pro turns your whole chat into players.",
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

/**
 * The homepage (reorganized 2026-10-16, Britton's picks:
 * https://claude.ai/artifact/PjULC3d4viTX3Tn4oYmLTe). Grouped by what people
 * came to do, with what brings them back near the top and the paid plans in
 * one place: the hero, Today on GameShuffle (the dailies and the Weekly),
 * the randomizers, Run the night (tournaments, trivia, game nights), the
 * GS Pro and GS Circuit band, free tools, Pokémon, then Support. Signed in,
 * Today shows your streaks, Run the night your next event, and the plans band
 * your way in.
 */
export default async function HomePage() {
  // Featured shop cards for the Pokémon section (read-only, 0 Scrydex credits;
  // FPO fallback inside the component if none configured).
  const [shopCards, shopVisible, viewer] = await Promise.all([getPublicFeaturedShopCards(), shopVisibleToVisitors(), homeViewer().catch(() => null)]);
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
        sub="Randomizers, daily puzzles, tournaments and trivia nights for any game night, from family on the couch to friends across Discord."
        accent="blue"
        field="mixed"
        primary={{ href: "/daily", label: "Play today's Daily" }}
        secondary={{ href: "#apps", label: "Find a randomizer" }}
        aside={<HeroShowcase />}
      />

      <main>
        <Container>
          {/* The daily habit first: the people who come back are the ones who host, stream and support. */}
          <section className="home-section" aria-labelledby="home-today-title">
            <div className="home-section__head">
              <h2 id="home-today-title" className="home-section__title">Today on GameShuffle</h2>
              <p className="home-section__aside">A new puzzle at midnight Pacific</p>
            </div>
            <HomeToday dexPublic={DAILY_DEX_PUBLIC} />
            <DiscordPlug from="home" text="Play the Daily, the Weekly and Chat Brain with your server, right in Discord." />
          </section>

          <section id="apps" className="home-section" aria-labelledby="home-apps-title" style={{ scrollMarginTop: "6rem" }}>
            <div className="home-section__head">
              <h2 id="home-apps-title" className="home-section__title">What are we playing?</h2>
              <Link href="/randomizers" className="home-section__link">All randomizers →</Link>
            </div>
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
          </section>

          <HomeHost next={viewer?.next ?? null} />
        </Container>

        <PlansBand pro={!!viewer?.pro} circuit={!!viewer?.circuit} />

        <Container>
          <section className="home-section" aria-labelledby="home-tools-title">
            <div className="home-section__head">
              <h2 id="home-tools-title" className="home-section__title">Free tools</h2>
              <Link href="/tools" className="home-section__link">All free tools →</Link>
            </div>
            <p className="home-section__lede">Spin a wheel, roll dice, run a bingo board or tier list, ask the 8-ball: free tools, no account needed. On GS Pro, they go live on your overlay.</p>
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
          </section>

          {/* Pokémon: the Companion and the Dex keep Pokémon players around; the store's cards sell. */}
          <section className="home-section" aria-labelledby="home-pokemon-title">
            <div className="home-section__head">
              <h2 id="home-pokemon-title" className="home-section__title">For Pokémon players</h2>
            </div>
            <ResponsiveCarousel className="app-card-grid" label="Pokémon apps">
              <AppCard
                title="TCG Companion"
                description="A digital game-night kit for Pokémon TCG: damage, conditions, prizes, coin flips, and dice without breaking up the table."
                imageSrc="https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png"
                imageAlt="Pokémon TCG cards spread on a table"
                href="/tcg-companion"
                ctaLabel="Open TCG Companion"
                learnMoreHref="/pokemon-tcg-companion"
                linkClassName={tagged(EVENTS.homeSectionClicked, { to: "tcg-companion" })}
              />
              {DAILY_DEX_PUBLIC ? (
                <AppCard
                  title="The Daily Dex"
                  description="Guess today's Pokémon from all 1,025, with a new hint after every miss and a streak to keep."
                  media={<span className="home-dex-media" aria-hidden><IconPokeball size={64} stroke={1.5} /></span>}
                  href="/daily-dex"
                  ctaLabel="Play today's Pokémon"
                  isNew
                  linkTitle
                  linkClassName={tagged(EVENTS.homeSectionClicked, { to: "daily-dex" })}
                />
              ) : (
                <AppCard
                  title="Pokémon TCG rules"
                  description="Damage counters, Special Conditions, Weakness and Resistance, and prize cards, explained with tools you can use at the table."
                  media={<span className="home-dex-media home-dex-media--rules" aria-hidden><IconCards size={64} stroke={1.5} /></span>}
                  href="/pokemon-tcg/rules"
                  ctaLabel="Read the rules"
                  linkTitle
                  linkClassName={tagged(EVENTS.homeSectionClicked, { to: "tcg-rules" })}
                />
              )}
            </ResponsiveCarousel>
          </section>

          {/* The holiday drop (shop build G): only while visitors can see the shop. */}
          {shopVisible && <ShopBand />}

          <FeaturedShopCards
            cards={shopCards}
            heading="Featured Pokémon cards"
            intro="Real Pokémon singles from the GameShuffle TCG store, shipped fast and protected. Tap a card to grab it on TCGplayer."
          />

          <SupportBand />

          <p className="home-ideas">Got an idea for GameShuffle? <Link href="/ideas">Share it on the Idea Board →</Link></p>
        </Container>
      </main>
    </>
  );
}
