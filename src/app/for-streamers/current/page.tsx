import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, CarouselItem } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { PlatformShot, OverlayShot, TokenShot, MarketShot } from "@/components/marketing/ProFeatureShots";
import { STREAMER_TOOLKIT } from "@/data/streamer-toolkit";

/** The page ground — an off-white so the sections read as one surface. The
 *  curved dark bands must fill their curve mask with THIS color (not the default
 *  white) or a white seam shows above the band. */
const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

export const metadata: Metadata = {
  title: "For current streamers: turn your viewers into players",
  description:
    "Already streaming? GameShuffle Pro turns passive viewers into participants: chat commands, channel-point rewards, a token economy, live polls, and an overlay that reacts on screen, synced across Twitch and Discord.",
  openGraph: {
    title: "GameShuffle for current streamers",
    url: "https://www.gameshuffle.co/for-streamers/current",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/for-streamers/current" },
};

export default function CurrentStreamersPage() {
  return (
    <main style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="GameShuffle for current streamers"
        appDescription="Pro tools that turn an established stream's viewers into players: chat commands, channel points, token economy, live polls, and a reactive overlay across Twitch and Discord."
        appUrl="/for-streamers/current"
        breadcrumb={{ label: "For Current Streamers", path: "/for-streamers/current" }}
      />

      <section className="marketing-hero">
        <Container>
          <p className="marketing-eyebrow">For current streamers</p>
          <h1 className="marketing-hero__title">Turn your viewers into players</h1>
          <p className="marketing-hero__sub">
            You already have a channel and a chat. GameShuffle Pro turns them into
            participants: chat commands, channel-point rewards, a token economy, live
            polls, and an overlay that reacts on screen, all synced across Twitch and Discord.
          </p>
          <div className="strm-hero__cta">
            <Link href="/gs-pro" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Explore GameShuffle Pro</Button>
            </Link>
            <Link href="/beta" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Apply for the beta</Button>
            </Link>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">See what your stream becomes</h2>
            <p className="beta-section__sub">
              The moment your chat can play, watching turns into doing. Here&rsquo;s what
              that looks like on screen.
            </p>
          </div>
          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="Cross-platform"
                title="One session, every platform"
                body="Run a single game night everywhere at once. Twitch and Discord show the same lobby, picks, and results, kept in sync from one overlay and one set of chat commands."
                media={<PlatformShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="On-stream tools"
                title="Every tool, live on your overlay"
                body="Overlay wheels, an on-screen 8-ball, community bingo, tier lists, and a chat timeline composite straight into OBS. Your chat spins, rolls, and votes from chat and channel points, and it all plays out live on stream."
                media={<OverlayShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                eyebrow="Token economy"
                title="An economy your whole chat plays"
                body="Arcade Tokens are a closed-loop currency your regulars earn just by showing up and spend across markets, bounties, and awards. No real money, just a reason for regulars to keep coming back and playing along."
                media={<TokenShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Prediction markets"
                title="Your chat calls the outcome"
                body="Open a market on what happens next: who wins the race, whether they nail the shortcut. Chat buys in with tokens, the odds move live, and the pot pays out when it resolves."
                media={<MarketShot />}
              />
            </Reveal>
          </div>
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Your full toolkit on stream</h2>
            <p className="beta-section__sub">
              Every piece is live today. Turn on what fits your show.
            </p>
          </div>
          <AutoplayCarousel
            slidesToShow={{ mobile: 1, tablet: 2, desktop: 4 }}
            gap={20}
            showArrows
            showDots
            loop
            interval={5000}
          >
            {STREAMER_TOOLKIT.map((t) => (
              <CarouselItem key={t.title}>
                <FeatureCard
                  icon={t.icon}
                  iconSrc={t.iconSrc}
                  title={t.title}
                  description={t.description}
                  accent={t.accent}
                />
              </CarouselItem>
            ))}
          </AutoplayCarousel>
          <div style={{ textAlign: "center", marginTop: "var(--spacing-32)" }}>
            <Link href="/gs-pro" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">See it all on Pro</Button>
            </Link>
          </div>
        </section>
      </Container>

      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-16)" }}>
          Ready to level up your channel?
        </h2>
        <p style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto var(--spacing-32)" }}>
          Explore what Pro unlocks, or apply for the streamer beta and we&rsquo;ll switch it
          on for you with a real 30-day run.
        </p>
        <div className="strm-finalcta">
          <Link href="/gs-pro" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="large">Explore GameShuffle Pro</Button>
          </Link>
          <Link href="/beta" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="large">Apply for the beta</Button>
          </Link>
        </div>
      </DarkBand>
    </main>
  );
}
