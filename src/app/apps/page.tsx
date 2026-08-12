import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Stack } from "@empac/cascadeds";
import { AppCard } from "@/components/AppCard";
import { GamesShowcase } from "@/components/marketing/GamesShowcase";
import { DarkBand } from "@/components/marketing/DarkBand";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

export const metadata: Metadata = {
  title: "Apps: GameShuffle randomizers, competitive scoring & tournaments",
  description:
    "Every GameShuffle tool in one place: the Mario Kart 8 Deluxe and Mario Kart World randomizers, the competitive lounge scoring hub, the tournament builder, and the Pokémon TCG companion. Free to use, no account required.",
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
        <Container>
          <span className="marketing-hero__eyebrow">🕹️ Every app in one place</span>
          <h1 className="marketing-hero__title">All the GameShuffle apps</h1>
          <p className="marketing-hero__sub">
            The games you play on stream: randomizers, competitive scoring, tournaments, and a
            TCG companion. Free to use, no account required. Pick one and start playing.
          </p>
        </Container>
      </section>

      <Container>
        <section style={{ margin: "0 0 var(--spacing-48)" }}>
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
          </div>
          <p style={{ textAlign: "center", marginTop: "var(--spacing-24)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)" }}>
            Looking for wheel spinners, dice, tier lists &amp; more?{" "}
            <a href="/tools" style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 600 }}>Browse the free tools →</a>
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

      {/* Bottom CTA — canonical full-bleed dark module (shared across marketing pages) */}
      <DarkBand premium>
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
              overrides={{
                anon: { label: "Create your account", href: "/signup" },
                free: { label: "Upgrade to Pro", href: "/gs-pro" },
                pro: { label: "Open your hub", href: "/hub" },
              }}
            />
            <Link href="/gs-pro" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Explore GS Pro</Button>
            </Link>
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
