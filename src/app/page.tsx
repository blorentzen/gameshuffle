import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Container, Icon } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { IconBook2, IconCards, IconPokeball } from "@tabler/icons-react";
import { RowLink, RowPanel, type PanelRow } from "@/components/marketing/RowPanel";
import { ArrowLink } from "@/components/ui/ArrowLink";
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
import { paidPlansHere } from "@/lib/billing/availability";
import { homeViewer } from "@/lib/home/viewer";
import { DAILY_DEX_PUBLIC, FIRE_ROUND_PUBLIC } from "@/lib/games-visibility";
import { DUEL_SHOWN } from "@/lib/originals/dailies";
import { duelChallenger } from "@/lib/originals/duel/store";
import { gsDay } from "@/lib/time/gsClock";
import { FeaturedShopCards } from "@/components/tcg/FeaturedShopCards";
import { getPublicFeaturedShopCards } from "@/lib/shop/featuredCards";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { ShopBand } from "@/components/store/ShopEntry";

/** Free-tools wayfinder tiles. CDS (Tabler) icons, no emoji (they clash with
 *  the icon system and render per OS). CDS lacks dice/coin glyphs, so those use
 *  the nearest shapes (box = die, rosette = coin token); flagged for a CDS add.
 *  `family` colors the tile the way /tools does (pick, stream, board, party). */
const FREE_TOOLS: { icon: IconName; label: string; href: string; family: "pick" | "stream" | "board" | "party" }[] = [
  { icon: "rotate", label: "Wheel Spinner", href: "/wheel-spinner", family: "pick" },
  { icon: "box", label: "Dice Roller", href: "/dice-roller", family: "pick" },
  { icon: "rosette", label: "Coin Flip", href: "/coin-flip", family: "pick" },
  { icon: "user-check", label: "Name Picker", href: "/name-picker", family: "pick" },
  { icon: "clock", label: "Stream Timer", href: "/stream-timer", family: "stream" },
  { icon: "layout-list", label: "Tier List Maker", href: "/tier-list-maker", family: "board" },
  { icon: "border-all", label: "Bingo", href: "/bingo-card-generator", family: "board" },
  { icon: "help-circle", label: "Magic 8-Ball", href: "/magic-8-ball", family: "party" },
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
 * Pages people search for, linked from the homepage so search engines find
 * them (Britton's pick, 2026-10-19). Short plain names; the line under says
 * what's there.
 */
const POPULAR_PAGES: { label: string; sub: string; href: string }[] = [
  { label: "Mario Kart tournaments", sub: "Run one with random rounds", href: "/mario-kart-tournaments" },
  { label: "Competitive Mario Kart", sub: "Live lounge scoring", href: "/competitive-mario-kart" },
  { label: "How to host a trivia night", sub: "Rounds, rules and scoring", href: "/trivia/how-to-host" },
  { label: "Trivia team names", sub: "127 names in five themes", href: "/trivia/team-names" },
  { label: "Pokémon TCG rules", sub: "Damage, conditions, prizes", href: "/pokemon-tcg/rules" },
  { label: "Pokémon card checklists", sub: "Tick off the cards you have", href: "/pokemon-tcg/checklists" },
  { label: "Jackbox game picker", sub: "A game that fits your group", href: "/game-nights/tools/jackbox-picker" },
  { label: "Tier list maker", sub: "Rank anything, then share it", href: "/tier-list-maker" },
];

/**
 * The homepage (reorganized 2026-10-16, Britton's picks:
 * https://claude.ai/artifact/PjULC3d4viTX3Tn4oYmLTe). Grouped by what people
 * came to do, with what brings them back near the top and the paid plans in
 * one place: the hero, Today on GameShuffle (the dailies and the Weekly),
 * the randomizers, Host your own (tournaments, trivia, game nights), the
 * GS Pro and GS Circuit band, free tools, Pokémon, then Support. Signed in,
 * Today shows your streaks, Host your own your next event, and the plans band
 * your way in. Each section heading has one short colored eyebrow that never
 * repeats the heading's words (design round 3, 2026-10-20).
 */
export default async function HomePage() {
  // Pokémon: one panel (Britton's pick, 2026-10-19), then the store's cards.
  const pokemonRows: PanelRow[] = [
    {
      key: "companion", Icon: IconCards, tone: "red", title: "TCG Companion", titleHref: "/pokemon-tcg-companion",
      text: "Damage, conditions, prizes, coin flips and dice for real cards at the table.",
      action: <RowLink href="/tcg-companion" className={tagged(EVENTS.homeSectionClicked, { to: "tcg-companion" })}>Open the companion</RowLink>,
    },
    ...(DAILY_DEX_PUBLIC ? [{
      key: "dex", Icon: IconPokeball, tone: "orange" as const, title: "The Daily Dex",
      text: "Guess today's Pokémon from all 1,025, with a new hint after every miss.",
      action: <RowLink href="/daily-dex" className={tagged(EVENTS.homeSectionClicked, { to: "daily-dex" })}>Play today&apos;s Pokémon</RowLink>,
    }] : []),
    {
      key: "rules", Icon: IconBook2, tone: "blue", title: "Rules and checklists",
      text: "Damage counters, Special Conditions and prize cards in plain words, plus set checklists to tick off.",
      action: <RowLink href="/pokemon-tcg/rules" className={tagged(EVENTS.homeSectionClicked, { to: "tcg-rules" })}>Read the rules</RowLink>,
    },
  ];
  // Featured shop cards for the Pokémon section (read-only, 0 Scrydex credits;
  // FPO fallback inside the component if none configured).
  // The Daily Duel's challenger ("Larry challenged you to a duel"): today's trainer, from a built day (never builds one).
  const [shopCards, shopVisible, viewer, paidHere, duelToday] = await Promise.all([
    getPublicFeaturedShopCards(), shopVisibleToVisitors(), homeViewer().catch(() => null), paidPlansHere().catch(() => true),
    DUEL_SHOWN ? duelChallenger(gsDay()).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        // Static, server-rendered, not user-generated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
      />
      <BrowseHero
        eyebrow="Free for everyone"
        title={"Shuffle up your game\u00a0night."}
        sub="Randomizers, daily puzzles, tournaments and trivia nights for any game night, from family on the couch to friends across Discord."
        accent="blue"
        field="mixed"
        primary={{ href: "/daily", label: "Play today's Daily" }}
        secondary={{ href: "#apps", label: "Find a randomizer" }}
        aside={<HeroShowcase />}
        note={!viewer ? <>New here? <Link href="/welcome" className={tagged(EVENTS.welcomeLineClicked, { from: "home" })}>See what GameShuffle does</Link></> : undefined}
      />

      <main>
        <Container>
          {/* The daily habit first: the people who come back are the ones who host, stream and support. */}
          <section className="home-section" aria-labelledby="home-today-title">
            <div className="home-section__head">
              <div className="home-section__titles">
                <p className="home-section__eyebrow home-section__eyebrow--violet">Daily games</p>
                <h2 id="home-today-title" className="home-section__title">Today on GameShuffle</h2>
              </div>
              <p className="home-section__aside">A new puzzle at midnight Pacific</p>
            </div>
            <HomeToday
              dexPublic={DAILY_DEX_PUBLIC}
              firePublic={FIRE_ROUND_PUBLIC}
              duel={DUEL_SHOWN ? duelToday : null}
            />
            <DiscordPlug from="home" text="Play the Daily, the Weekly and Chat Brain with your server, right in Discord." />
          </section>

          <section id="apps" className="home-section" aria-labelledby="home-apps-title" style={{ scrollMarginTop: "6rem" }}>
            <div className="home-section__head">
              <div className="home-section__titles">
                <p className="home-section__eyebrow home-section__eyebrow--blue">Randomizers</p>
                <h2 id="home-apps-title" className="home-section__title">What are we playing?</h2>
              </div>
              <ArrowLink href="/randomizers" className="home-section__link">All randomizers</ArrowLink>
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

        <PlansBand pro={!!viewer?.pro} circuit={!!viewer?.circuit} trialUsed={!!viewer?.trialUsed} supporter={!!viewer?.supporter} paidHere={paidHere} />

        <Container>
          <section className="home-section" aria-labelledby="home-tools-title">
            <div className="home-section__head">
              <div className="home-section__titles">
                <p className="home-section__eyebrow home-section__eyebrow--teal">No account needed</p>
                <h2 id="home-tools-title" className="home-section__title">Free tools</h2>
              </div>
              <ArrowLink href="/tools" className="home-section__link">All free tools</ArrowLink>
            </div>
            <p className="home-section__lede">Spin a wheel, roll dice, run a bingo board or tier list, ask the 8-ball: free tools, no account needed. On GS Pro, they go live on your overlay.</p>
            <ResponsiveCarousel className="home-tiles" perSlide={2} label="Free tools">
              {FREE_TOOLS.map((t) => (
                <a key={t.href} href={t.href} className="home-tile gs-hover-gradient">
                  <span className={`home-tile__icon home-tile__icon--${t.family}`} aria-hidden="true">
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
              <div className="home-section__titles">
                <p className="home-section__eyebrow home-section__eyebrow--orange">Trading cards</p>
                <h2 id="home-pokemon-title" className="home-section__title">For Pokémon players</h2>
              </div>
              <ArrowLink href="/pokemon-tcg" className="home-section__link">Pokémon TCG</ArrowLink>
            </div>
            <RowPanel className="row-panel--surface" rows={pokemonRows} />
          </section>

          <FeaturedShopCards
            cards={shopCards}
            heading="From our card store"
            intro="Real Pokémon singles from the GameShuffle TCG store, shipped fast and protected. Tap a card to grab it on TCGplayer."
          />

          {/* The holiday drop (shop build G): only while visitors can see the shop. */}
          {shopVisible && <ShopBand />}

          <nav className="home-popular" aria-labelledby="home-popular-title">
            <h2 id="home-popular-title" className="home-popular__title">Popular on GameShuffle</h2>
            <ul className="home-popular__list">
              {POPULAR_PAGES.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className={`home-popular__link ${tagged(EVENTS.homeSectionClicked, { to: p.href.split("/").pop() ?? p.href })}`}>
                    {p.label}
                    <span className="home-popular__sub">{p.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>


          <p className="home-ideas">Got an idea for GameShuffle? <ArrowLink href="/ideas">Share it on the Idea Board</ArrowLink></p>
        </Container>
      </main>
    </>
  );
}
