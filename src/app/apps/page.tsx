import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Stack } from "@empac/cascadeds";
import { AppCard } from "@/components/AppCard";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { EventHeaderArt } from "@/components/events/EventHeaderArt";
import { GamesShowcase } from "@/components/marketing/GamesShowcase";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";
import { N64_PARTY_PUBLIC, FRLG_PUBLIC, GOLDENEYE_PUBLIC, SMASH_PUBLIC, STADIUM_PUBLIC, MK64_PUBLIC, PERFECT_DARK_PUBLIC, OVERWATCH_PUBLIC, MARVEL_RIVALS_PUBLIC, KIRBY_PUBLIC, SPLATOON_PUBLIC } from "@/lib/games-visibility";
import { GAME_ART } from "@/data/game-art";
import { EVENTS, tagged } from "@/lib/analytics/events";

export const metadata: Metadata = {
  title: "Apps: GameShuffle randomizers, competitive scoring & tournaments",
  description:
    "Every GameShuffle tool in one place: the Mario Kart 8 Deluxe and Mario Kart World randomizers, the competitive lounge scoring hub, the tournament builder, the Pokémon TCG companion, and game nights with digital score sheets and tools. Free to use, no account required.",
  openGraph: {
    title: "GameShuffle Apps",
    url: "https://www.gameshuffle.co/apps",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gameshuffle-apps-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/apps",
  },
};

export default function AppsPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      {/* Hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <MarketingHeroField category="mixed" />
        <Container>
          <p className="marketing-eyebrow">Every app in one place</p>
          <h1 className="marketing-hero__title">All the GameShuffle apps</h1>
          <p className="marketing-hero__sub">
            The games you play on stream: randomizers, competitive scoring, tournaments, and a
            TCG companion. Free to use, no account required. Pick one and start playing.
          </p>
        </Container>
        <MarketingHeroCurve color="color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" />
      </section>

      <Container>
        <section style={{ margin: "0 0 var(--spacing-48)" }}>
          <h2 className="randomizer-index__heading">Randomizers</h2>
          <ResponsiveCarousel className="app-card-grid" label="Randomizers">
            <AppCard
              title="Mario Kart 8 Deluxe Randomizer"
              description="Randomize your kart picks in Mario Kart 8 Deluxe for up to 12 players, plus randomize the tracks your family and friends select."
              imageSrc="/images/fg/mk8dx-kart-selection-screen.jpg"
              imageAlt="Mario Kart 8 Deluxe selection screen"
              href="/randomizers/mario-kart-8-deluxe"
              ctaLabel="Open randomizer"
              linkTitle
            />
            <AppCard
              title="Mario Kart World Randomizer"
              description="Randomize characters, karts, tracks, knockout rallies, and items for Mario Kart World with up to 24 players."
              imageSrc="/images/bg/mkw-main-image.jpg"
              imageAlt="Mario Kart World"
              href="/randomizers/mario-kart-world"
              ctaLabel="Open randomizer"
              linkTitle
            />
            <AppCard
              title="Mario Party Jamboree Randomizer"
              description="Roll the board, rules and turns, give everyone a character, and spin minigames. Works with the Switch and Switch 2 Edition."
              imageSrc="https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif"
              imageAlt="Super Mario Party Jamboree board"
              href="/randomizers/super-mario-party-jamboree"
              ctaLabel="Open randomizer"
              linkTitle
            />
            <AppCard
              title="Mario Party Superstars Randomizer"
              description="Roll one of the five classic boards and the turns, give everyone a character, and spin from 100 classic minigames."
              imageSrc="https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg"
              imageAlt="Mario throwing a Dice Block on a Mario Party Superstars board"
              href="/randomizers/mario-party-superstars"
              ctaLabel="Open randomizer"
              linkTitle
            />
            {SMASH_PUBLIC && (
            <AppCard
              title="Smash Ultimate Randomizer"
              description="Fighters and costumes for up to eight players, stages, rules, Custom Smash, and Squad Strike squads."
              imageSrc="https://cdn.empac.co/gameshuffle/images/standard/smash-bros-ultimate-cast-artwork.jpg"
              imageAlt="Super Smash Bros. Ultimate cast artwork"
              href="/randomizers/super-smash-bros-ultimate"
              ctaLabel="Open randomizer"
              linkTitle
            />
            )}
            {N64_PARTY_PUBLIC && (
            <AppCard
              title="Mario Party 1, 2 & 3 Randomizers"
              description="The Nintendo 64 classics on Switch Online: roll the board and turns, characters for everyone, and every minigame."
              imageSrc={GAME_ART["mario-party"].hero.src}
              imageAlt={GAME_ART["mario-party"].hero.alt}
              href="/randomizers/mario-party"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {STADIUM_PUBLIC && (
            <AppCard
              title="Pokémon Stadium Randomizer"
              description="Random rental teams for Pokémon Stadium and Stadium 2: 6 rentals per player for any cup, with their moves."
              imageSrc={GAME_ART["pokemon-stadium"].hero.src}
              imageAlt={GAME_ART["pokemon-stadium"].hero.alt}
              href="/randomizers/pokemon-stadium"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {FRLG_PUBLIC && (
            <AppCard
              title="Fire Red & Leaf Green Run Challenge"
              description="A new way through Kanto: a random starter, Pokémon to catch before every gym, and a level cap and team size for each leader."
              imageSrc={GAME_ART["pokemon-firered-leafgreen"].hero.src}
              imageAlt={GAME_ART["pokemon-firered-leafgreen"].hero.alt}
              href="/randomizers/pokemon-firered-leafgreen"
              ctaLabel="Start a run"
              isNew
              linkTitle
            />
            )}
            {GOLDENEYE_PUBLIC && (
            <AppCard
              title="GoldenEye 007 Randomizer"
              description="Roll a whole multiplayer match: scenario, map, weapon set, game length and a character for 2 to 4 players."
              imageSrc={GAME_ART["goldeneye-007"].hero.src}
              imageAlt={GAME_ART["goldeneye-007"].hero.alt}
              href="/randomizers/goldeneye-007"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {MK64_PUBLIC && (
            <AppCard
              title="Mario Kart 64 Randomizer"
              description="A different character for up to four players, all 16 tracks, battle courses and items, the N64 way."
              imageSrc={GAME_ART["mario-kart-64"].hero.src}
              imageAlt={GAME_ART["mario-kart-64"].hero.alt}
              href="/randomizers/mario-kart-64"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {PERFECT_DARK_PUBLIC && (
            <AppCard
              title="Perfect Dark Randomizer"
              description="Roll a Combat Simulator match: scenario, arena, weapons, time limit and simulants, plus a character for everyone."
              imageSrc={GAME_ART["perfect-dark"].cover}
              imageAlt={GAME_ART["perfect-dark"].hero.alt}
              href="/randomizers/perfect-dark"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {OVERWATCH_PUBLIC && (
            <AppCard
              title="Overwatch Hero Randomizer"
              description="A random hero for you or your whole stack, with role queue, no repeats across the night and a random map."
              imageSrc={GAME_ART["overwatch"].hero.src}
              imageAlt={GAME_ART["overwatch"].hero.alt}
              href="/randomizers/overwatch"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {MARVEL_RIVALS_PUBLIC && (
            <AppCard
              title="Marvel Rivals Hero Randomizer"
              description="A random hero for your whole team, a team built around a Team-Up, and a random map."
              imageSrc={GAME_ART["marvel-rivals"].hero.src}
              imageAlt={GAME_ART["marvel-rivals"].hero.alt}
              href="/randomizers/marvel-rivals"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {KIRBY_PUBLIC && (
            <AppCard
              title="Kirby Air Riders Randomizer"
              description="A rider and machine for up to eight players, an Air Ride or Top Ride course, and the City Trial Stadium."
              imageSrc={GAME_ART["kirby-air-riders"].cover}
              imageAlt="Kirby Air Riders banner art"
              href="/randomizers/kirby-air-riders"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            {SPLATOON_PUBLIC && (
            <AppCard
              title="Splatoon 3 Randomizer"
              description="A weapon kit for up to eight players, a battle or a set of battles, a Salmon Run stage, and Alpha and Bravo teams."
              imageSrc={GAME_ART["splatoon-3"].cover}
              imageAlt={GAME_ART["splatoon-3"].hero.alt}
              href="/randomizers/splatoon-3"
              ctaLabel="Open randomizer"
              isNew
              linkTitle
            />
            )}
            </ResponsiveCarousel>
          <Link href="/randomizers" className="home-all-link"><Button variant="secondary">All randomizers →</Button></Link>
          <h2 className="randomizer-index__heading">More apps</h2>
          <ResponsiveCarousel className="app-card-grid" label="More apps">
            <AppCard
              title="GameShuffle for Discord"
              description="Play the Daily, the Weekly and Chat Brain together in Discord, share Wordle-style results in the channel, and roll a setup for any game night with /gs-randomize."
              media={<EventHeaderArt category="daily" seed="apps-discord" motion="hover" />}
              href="/discord"
              ctaLabel="See what it does"
              isNew
            />
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
              title="Game Nights"
              description="Find or host in-person game nights, then run the table with digital score sheets, timers, and companion tools for Yahtzee, Clue, cribbage, and more."
              media={<EventHeaderArt category="board" seed="apps-game-nights" motion="hover" />}
              href="/game-nights"
              ctaLabel="Find a night"
              secondaryHref="/game-nights/tools"
              secondaryLabel="Game night tools"
            />
          </ResponsiveCarousel>
          <p style={{ marginTop: "var(--spacing-24)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)" }}>
            Looking for wheel spinners, dice, tier lists &amp; more?{" "}
            <Link href="/tools" style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 600 }}>Browse the free tools →</Link>
          </p>
        </section>

        {/* Coming soon — in-development games (available ones are the
            app cards above, so only the development group renders here). */}
        <GamesShowcase
          heading="More games on the way"
          intro="We're actively building support for more game nights. Don't see yours? Tell us what you play."
          showAvailable={false}
        />
      </Container>

      {/* Bottom CTA — canonical full-bleed dark module. Curved TOP edge only so
          the light content flows into the band; its dark bottom meets the dark
          footer flush. */}
      <DarkBand
        premium
        curved
        curveEdges="top"
        curveColor="color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))"
      >
        <div style={{ textAlign: "center" }}>
          <h2
            className="pro-band__title"
            style={{
              fontSize: "var(--font-size-fluid-h3)",
              fontWeight: "var(--font-weight-bold)",
              marginBottom: "var(--spacing-12)",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            Ready to run your next game night?
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              margin: "0 auto var(--spacing-24)",
              maxWidth: "44rem",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Every app here is free to play. Create an account to save your setups, or go Pro to
            run it all live on your stream.
          </p>
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <AuthAwareCTA
              variant="primary"
              size="large"
              trackFrom="apps"
              overrides={{
                anon: { label: "Create your account", href: "/signup" },
                free: { label: "Upgrade to Pro", href: "/gs-pro" },
                pro: { label: "Open your hub", href: "/hub" },
              }}
            />
            <Link href="/gs-pro" style={{ textDecoration: "none" }} className={tagged(EVENTS.upgradeClicked, { from: "apps-explore" })}>
              <Button variant="secondary" size="large">Explore GS Pro</Button>
            </Link>
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
