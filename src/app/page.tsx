import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Button, Container } from "@empac/cascadeds";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { BrowseHero } from "@/components/events/BrowseHero";
import { HeroShowcase } from "@/components/home/HeroShowcase";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { PlansBand } from "@/components/home/PlansBand";
import { paidPlansHere, supportHere } from "@/lib/billing/availability";
import { homeViewer } from "@/lib/home/viewer";
import { HappeningBand } from "@/components/home/HappeningBand";
import { FRONT_ORDER, frontWorldRows } from "@/components/home/FrontWorlds";
import { bandFor } from "@/lib/home/happening";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { MerchRow } from "@/components/store/ShopEntry";

export const metadata: Metadata = {
  // Absolute: the brand already leads, so skip the " | GameShuffle" suffix.
  title: { absolute: "GameShuffle: Mario Kart & Mario Party Randomizers" },
  description:
    "Free Mario Kart and Mario Party randomizers, daily puzzles, tournaments and trivia nights for any game night. GameShuffle Pro turns your whole chat into players.",
  openGraph: {
    siteName: "GameShuffle",
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

/**
 * Pages people search for, linked from the homepage so search engines find
 * them (Britton's pick, 2026-10-19). Short plain names; the line under says
 * what's there.
 */
const POPULAR_PAGES: { label: string; sub: string; href: string }[] = [
  { label: "Mario Kart 8 Deluxe randomizer", sub: "Karts, tracks and items for 12", href: "/randomizers/mario-kart-8-deluxe" },
  { label: "Mario Kart World randomizer", sub: "Racers, tracks and rallies for 24", href: "/randomizers/mario-kart-world" },
  { label: "Mario Party Jamboree randomizer", sub: "Board, characters and minigames", href: "/randomizers/super-mario-party-jamboree" },
  { label: "Smash Ultimate randomizer", sub: "Fighters, stages and rules", href: "/randomizers/super-smash-bros-ultimate" },
  { label: "Mario Kart tournaments", sub: "Run one with random rounds", href: "/mario-kart-tournaments" },
  { label: "Competitive Mario Kart", sub: "Lounge stats, time trials, MMR card", href: "/competitive-mario-kart" },
  { label: "How to host a trivia night", sub: "Rounds, rules and scoring", href: "/trivia/how-to-host" },
  { label: "Trivia team names", sub: "127 names in five themes", href: "/trivia/team-names" },
  { label: "Pokémon TCG rules", sub: "Damage, conditions, prizes", href: "/pokemon-tcg/rules" },
  { label: "Pokémon card checklists", sub: "Tick off the cards you have", href: "/pokemon-tcg/checklists" },
  { label: "Jackbox game picker", sub: "A game that fits your group", href: "/game-nights/tools/jackbox-picker" },
  { label: "Tier list maker", sub: "Rank anything, then share it", href: "/tier-list-maker" },
];

/**
 * The front page, for visitors (members reach it with ?front=1). Front page picks 2026-11-07 (all A; it said most
 * things twice): a short header, then one chooser of the five worlds with Play open, each world showing its live cards
 * and four tool rows; a free account in one line; Go further (Support, GS Pro, GS Circuit) as three rows; the popular
 * pages as links for search.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ front?: string }> }) {
  // Pokémon: one panel (Britton's pick, 2026-10-19), then the store's cards.
  // Featured shop cards for the Pokémon section (read-only, 0 Scrydex credits;
  // FPO fallback inside the component if none configured).
  // The Daily Duel's challenger ("Larry challenged you to a duel"): today's trainer, from a built day (never builds one).
  const [shopVisible, viewer, paidHere, supportOpen] = await Promise.all([
    shopVisibleToVisitors(), homeViewer().catch(() => null), paidPlansHere().catch(() => true), supportHere().catch(() => true),
  ]);
  // Signed in, your room lives at /home (journeys picks 2026-11-06, 6A); members see this front page with ?front=1.
  if (viewer && !(await searchParams).front) redirect("/home");
  const visitorBand = await bandFor(null).catch(() => []);
  return (
    <>
      <script
        type="application/ld+json"
        // Static, server-rendered, not user-generated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
      />
      <BrowseHero
        title={"Play, host, compete and stream. Free."}
        sub="Free games and tools for game night, Mario Kart, Pokémon and your stream."
        accent="blue"
        field="mixed"
        primary={{ href: "/daily", label: "Play today's games" }}
        secondary={{ href: "/signup", label: "Make a free account" }}
        aside={<HeroShowcase />}
        note={!viewer ? <>New here? <Link href="/welcome" className={tagged(EVENTS.welcomeLineClicked, { from: "home" })}>See what GameShuffle does</Link></> : undefined}
      />

      <main className="front">
        <Container>
          <div className="front__stack">
            {/* One chooser (front page picks 2026-11-07, all A): the five worlds, Play open, the pick remembered in this
                browser; each world shows its live cards and four tool rows. Nothing is repeated further down. */}
            {visitorBand.length > 0 && (
              <HappeningBand
                worlds={visitorBand}
                tone="light"
                signedIn={false}
                heading="What are you here for?"
                sub="Pick one. It stays picked in this browser."
                order={FRONT_ORDER}
                remember="gs-front-world"
                extra={frontWorldRows()}
              />
            )}
            {!viewer && (
              <div className="front-account">
                <p>A free account keeps your streaks and makes this page follow what you play.</p>
                <Link href="/signup" className={tagged(EVENTS.homeSectionClicked, { to: "front-signup" })}><Button variant="primary">Make a free account</Button></Link>
              </div>
            )}
            <PlansBand pro={!!viewer?.pro} circuit={!!viewer?.circuit} trialUsed={!!viewer?.trialUsed} supporter={!!viewer?.supporter} paidHere={paidHere} supportHere={supportOpen} />
            {shopVisible && <MerchRow />}
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
          </div>
        </Container>
      </main>
    </>
  );
}
