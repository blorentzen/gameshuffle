import type { Metadata } from "next";
import { Container, Button } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { AppCard } from "@/components/AppCard";

export const metadata: Metadata = {
  title: "Welcome to GameShuffle",
  description:
    "Whether it's randomizing the way you play video games or creating wacky combos from numerous board and card games, we got you covered to bring the fun back to game nights.",
  openGraph: {
    title: "Welcome to GameShuffle",
    url: "https://gameshuffle.co/",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://gameshuffle.co/",
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
              Whether it&apos;s randomizing the way you play video games or
              creating wacky combos from several board and card games, we got you
              covered to bring the fun back to game&nbsp;night.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main>
        <Container>
          <section style={{ margin: "2rem 0 3rem" }}>
            <div className="app-card-grid">
              <AppCard
                title="MK8DX Kart and Track Randomizer"
                description="Randomize your kart picks in Mario Kart 8 Deluxe for up to 12 players, plus randomize the tracks your family and friends select."
                imageSrc="/images/fg/mk8dx-kart-selection-screen.jpg"
                imageAlt="Mario Kart 8 Deluxe selection screen"
                href="/randomizers/mario-kart-8-deluxe"
              />
              <AppCard
                title="Mario Kart World Randomizer"
                description="Randomize characters, karts, tracks, knockout rallies, and items for Mario Kart World with up to 24 players."
                imageSrc="/images/bg/mkw-main-image.jpg"
                imageAlt="Mario Kart World"
                href="/randomizers/mario-kart-world"
              />
              <AppCard
                title="MK8DX Competitive Hub"
                description="Live lounge scoring, community resources, and lobby management for the competitive Mario Kart 8 Deluxe scene."
                imageSrc="/images/bg/MK8DX_Background_Music.jpg"
                imageAlt="Mario Kart 8 Deluxe competitive"
                href="/competitive/mario-kart-8-deluxe"
                beta
              />
              <AppCard
                title="Browse & Create Tournaments"
                description="Find tournaments to join or create your own. Set up tracks, items, rules, and invite participants."
                imageSrc="/images/fg/mario-holding-trophy.jpg"
                imageAlt="Mario Kart 8 Deluxe tournament"
                href="/tournament"
                beta
              />
            </div>
          </section>

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
