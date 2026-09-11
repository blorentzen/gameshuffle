import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { STREAMER_TOOLKIT } from "@/data/streamer-toolkit";

export const metadata: Metadata = {
  title: "Stream with GameShuffle: turn your stream into a game night",
  description:
    "Give your viewers something to do. GameShuffle turns your stream into an interactive game night with chat-driven randomizers, channel-point rewards, live overlay tools, a token economy, and cross-platform sessions. Free tools to start, Pro to go all in.",
  openGraph: {
    title: "Stream with GameShuffle",
    url: "https://www.gameshuffle.co/for-streamers",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/for-streamers",
  },
};

export default function ForStreamersPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <MarketingJsonLd
        appName="GameShuffle for Streamers"
        appDescription="Interactive game-night tools for streamers: chat-driven randomizers, channel-point rewards, overlay tools, a token economy, live polls, and cross-platform sessions."
        appUrl="/for-streamers"
        breadcrumb={{ label: "For Streamers", path: "/for-streamers" }}
        faq={[
          {
            q: "Do I need to pay to use GameShuffle on stream?",
            a: "No. The randomizers and free stream tools work without an account. GameShuffle Pro adds the chat integration, channel-point rewards, overlay tools, and the token economy.",
          },
          {
            q: "What platforms does GameShuffle work with?",
            a: "Twitch and Discord today, with the same session, overlay, and commands staying in sync across both. More platforms are on the way.",
          },
          {
            q: "I'm just starting out. Is GameShuffle useful with a small audience?",
            a: "Yes. GameShuffle gives even a small chat something to do together, which is exactly what helps a new stream feel alive. Start with the free tools and grow into Pro.",
          },
        ]}
      />

      {/* Hero */}
      <section className="marketing-hero">
        <Container>
          <p className="marketing-eyebrow">For Streamers</p>
          <h1 className="marketing-hero__title">Turn your stream into a game night</h1>
          <p className="marketing-hero__sub">
            Give your viewers something to do, not just something to watch. GameShuffle
            hands your chat the controls: reroll your run, spin the wheel, call the
            outcome, and play along in real time. Wherever you are on your streaming
            journey, there&rsquo;s a way in.
          </p>
          <div className="strm-hero__cta">
            <Link href="/for-streamers/current" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">I already stream</Button>
            </Link>
            <Link href="/for-streamers/aspiring" className="strm-hero__ghost">
              I want to start streaming →
            </Link>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {/* Two audience tracks — each a door to its own page. */}
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">Where you&rsquo;re starting from</p>
            <h2 className="beta-section__title">However you stream, there&rsquo;s a way in</h2>
          </div>
          <div className="strm-tracks">
            <Link href="/for-streamers/current" className="strm-track strm-track--link">
              <span className="strm-track__tag strm-track__tag--pro">Already streaming</span>
              <h3 className="strm-track__title">Turn viewers into players</h3>
              <p className="strm-track__body">
                Already have a channel and a chat? Pro turns passive viewers into
                participants: chat commands, channel-point rewards, a token economy, live
                polls, and an overlay that reacts on screen, synced across Twitch and Discord.
              </p>
              <span className="strm-track__link">For current streamers →</span>
            </Link>
            <Link href="/for-streamers/aspiring" className="strm-track strm-track--link">
              <span className="strm-track__tag">New to streaming</span>
              <h3 className="strm-track__title">Start with something to play</h3>
              <p className="strm-track__body">
                Thinking about streaming? Start with free tools that give even a small
                audience a blast, grow into the full kit as your channel does, and reach
                out, because we love working with early streamers to grow together.
              </p>
              <span className="strm-track__link">For new streamers →</span>
            </Link>
          </div>
        </section>

        {/* Toolkit at a glance */}
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Everything you get on stream</h2>
            <p className="beta-section__sub">
              A whole game-night toolkit, built for streamers and the people watching.
            </p>
          </div>
          <div className="strm-grid">
            {STREAMER_TOOLKIT.map((t) => (
              <FeatureCard
                key={t.title}
                icon={t.icon}
                iconSrc={t.iconSrc}
                title={t.title}
                description={t.description}
                href={t.href}
                cta={t.cta}
                accent={t.accent}
              />
            ))}
          </div>
        </section>
      </Container>

      {/* Final CTA */}
      <DarkBand premium curved curveEdges="top">
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-16)" }}>
          Ready to run game night?
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
