import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { AppCard } from "@/components/AppCard";
import { GamesShowcase } from "@/components/marketing/GamesShowcase";

export const metadata: Metadata = {
  title: "Apps — GameShuffle randomizers, competitive scoring & tournaments",
  description:
    "Every GameShuffle tool in one place: the Mario Kart 8 Deluxe and Mario Kart World randomizers, the competitive lounge scoring hub, the tournament builder, and the Pokémon TCG companion. Free to use, no account required.",
  openGraph: {
    title: "GameShuffle Apps",
    url: "https://gameshuffle.co/apps",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://gameshuffle.co/apps",
  },
};

export default function AppsPage() {
  return (
    <main>
      <Container>
        <section style={{ margin: "var(--spacing-48) 0 var(--spacing-32)", textAlign: "center", maxWidth: "52rem", marginInline: "auto" }}>
          <h1
            style={{
              fontSize: "var(--font-size-fluid-h2)",
              fontWeight: "var(--font-weight-bold)",
              marginBottom: "var(--spacing-12)",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            All the GameShuffle apps
          </h1>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              color: "var(--text-secondary)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Randomizers, competitive scoring, tournaments, and a TCG companion — free to use,
            no account required. Pick a tool and start playing.
          </p>
        </section>

        <section style={{ margin: "0 0 var(--spacing-64)" }}>
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
              description="Find tournaments to join or create your own. Set up tracks, items, rules, and invite participants."
              imageSrc="/images/fg/mario-holding-trophy.jpg"
              imageAlt="Mario Kart 8 Deluxe tournament"
              href="/tournament"
              learnMoreHref="/mario-kart-tournaments"
              beta
            />
            <AppCard
              title="TCG Companion"
              description="A digital game-night kit for Pokémon TCG — damage, conditions, prizes, coin flips, and dice without breaking up the table."
              imageSrc="https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png"
              imageAlt="Pokémon TCG cards spread on a table"
              href="/tcg-companion"
              learnMoreHref="/pokemon-tcg-companion"
              beta
            />
          </div>
        </section>

        {/* Coming soon — in-development games (available ones are the
            app cards above, so only the development group renders here). */}
        <GamesShowcase
          heading="More games on the way"
          intro="We're actively building support for more game nights. Don't see yours? Tell us what you play."
          showAvailable={false}
        />
      </Container>
    </main>
  );
}
