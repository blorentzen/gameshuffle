import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
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
          {/* Randomizers */}
          <section style={{ margin: "2rem 0 1rem" }}>
            <h2 className="home-section-title">Randomizers</h2>
            <div className="app-card-grid">
              <AppCard
                title="MK8DX Kart and Track Randomizer"
                description="Randomize your kart picks in Mario Kart 8 Deluxe for up to 12 players, plus randomize the tracks your family and friends select."
                imageSrc="/images/fg/mk8dx-kart-selection-screen.jpg"
                imageAlt="Mario Kart 8 Deluxe selection screen"
                href="/randomizers/mario-kart-8-deluxe"
              />
              <AppCard
                title="MK8DX Themed Tournaments"
                description="Get inspired for your next karting night with a combination of characters, tracks, items, food and beverage ideas."
                imageSrc="/images/fg/yoshi-gang.jpg"
                imageAlt="Mario Kart 8 Deluxe group of Yoshi"
                comingSoon
              />
              <AppCard
                title="MK8DX Game Mode Ideas"
                description="Want to spice up how you play kart? Here are a collection of game mode ideas you can use for your next kart night."
                imageSrc="/images/fg/mario-holding-trophy.jpg"
                imageAlt="Mario Kart 8 Deluxe Mario holding trophy"
                comingSoon
              />
            </div>
          </section>

          {/* Competitive */}
          <section style={{ margin: "2rem 0 3rem" }}>
            <h2 className="home-section-title">Competitive</h2>
            <div className="app-card-grid">
              <AppCard
                title="MK8DX Competitive Hub"
                description="Live lounge scoring, community resources, and lobby management for the competitive Mario Kart 8 Deluxe scene."
                imageSrc="/images/bg/MK8DX_Background_Music.jpg"
                imageAlt="Mario Kart 8 Deluxe competitive"
                href="/competitive/mario-kart-8-deluxe"
              />
            </div>
          </section>
        </Container>
      </main>
    </>
  );
}
