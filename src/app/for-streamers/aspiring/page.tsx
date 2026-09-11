import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, type IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { OverlayShot, PlatformShot, TokenShot } from "@/components/marketing/ProFeatureShots";

export const metadata: Metadata = {
  title: "For new streamers: start with something to play",
  description:
    "Thinking about streaming? GameShuffle gives even a small audience something to do together from day one, with free tools and no account needed, and grows with your channel. We love working with early streamers to grow together.",
  openGraph: {
    title: "GameShuffle for new streamers",
    url: "https://www.gameshuffle.co/for-streamers/aspiring",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/for-streamers/aspiring" },
};

/** Page ground — the curved dark band fills its wave mask with this so there's
 *  no white seam above it (see the current-streamers page). */
const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

const BEATS: { icon: IconName; title: string; description: string; detail: string; accent: string }[] = [
  {
    icon: "bolt",
    title: "Start free, no account needed",
    description:
      "Spin a wheel, roll dice, run a bingo board or a tier list, ask the 8-ball. Real tools you can put on stream today, before you commit to anything.",
    detail: "The lowest possible barrier to going live with something interactive.",
    accent: "#2563eb",
  },
  {
    icon: "user-check",
    title: "A small chat still has a blast",
    description:
      "The hardest part of starting out is giving a handful of viewers a reason to stay. GameShuffle turns whoever shows up into players, not just watchers.",
    detail: "Interaction is what makes a new stream feel alive, and what makes people come back.",
    accent: "#7c3aed",
  },
  {
    icon: "chart-bar",
    title: "Grows with your channel",
    description:
      "When you're ready, Pro layers on chat commands, channel points, a token economy, and cross-platform sessions. Same platform, more as you grow.",
    detail: "Nothing to migrate later. The tools you start with are the ones that scale.",
    accent: "#db2777",
  },
];

export default function AspiringStreamersPage() {
  return (
    <main style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="GameShuffle for new streamers"
        appDescription="Free, low-barrier stream tools for new streamers, with an open invitation to collaborate and grow with GameShuffle."
        appUrl="/for-streamers/aspiring"
        breadcrumb={{ label: "For New Streamers", path: "/for-streamers/aspiring" }}
      />

      <section className="marketing-hero">
        <Container>
          <p className="marketing-eyebrow">For new streamers</p>
          <h1 className="marketing-hero__title">Start with something to play</h1>
          <p className="marketing-hero__sub">
            Thinking about streaming? Don&rsquo;t go live to silence. GameShuffle gives even
            a handful of viewers something to do together from day one, with free tools and
            no account needed, and grows with your channel as it takes off.
          </p>
          <div className="strm-hero__cta">
            <Link href="/tools" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Start with the free tools</Button>
            </Link>
            <Link href="/beta" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Join the beta</Button>
            </Link>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">A great place to begin</h2>
          </div>
          <div className="strm-beats">
            {BEATS.map((b) => (
              <FeatureCard
                key={b.title}
                variant="full"
                icon={b.icon}
                title={b.title}
                description={b.description}
                detail={b.detail}
                accent={b.accent}
              />
            ))}
          </div>
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Picture your stream with it on</h2>
            <p className="beta-section__sub">
              This is what your viewers get to play with, from your very first stream.
            </p>
          </div>
          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="On-stream tools"
                title="Your tools, live on your overlay"
                body="Spin a wheel, ask the 8-ball, run a bingo board or a tier list, right on your overlay and reacting to chat. Interactive from your very first stream, no big audience required."
                media={<OverlayShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Grows with you"
                title="One setup, every platform"
                body="As your community spreads to Twitch and Discord, one game night stays in sync across both. You set it up once and it keeps up as you grow."
                media={<PlatformShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                eyebrow="When you're ready"
                title="An economy your chat plays"
                body="Down the line, Arcade Tokens give your regulars a reason to keep coming back: a closed-loop currency they earn by showing up and spend on markets, bounties, and awards. No real money, ever."
                media={<TokenShot />}
              />
            </Reveal>
          </div>
        </section>
      </Container>

      {/* Collaboration invite — the heart of the aspiring pitch. Doubles as the
          closing CTA, so it wears the same curved wave pattern as every other
          master CTA band. */}
      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", textAlign: "center" }}>
          <p className="marketing-eyebrow" style={{ color: "var(--primary-300)" }}>Let&rsquo;s grow together</p>
          <h2 className="pro-band__title beta-section__title" style={{ marginBottom: "var(--spacing-16)" }}>
            We build with early streamers
          </h2>
          <p style={{ margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
            GameShuffle is growing, and the best way we grow is alongside the people using it.
            If you&rsquo;re just starting out and want a partner in it, we want to hear from you.
            Tell us what you&rsquo;re building, what you play, and what would make your stream
            better. Early streamers help shape what we build next, and we&rsquo;ll help you
            put your best foot forward.
          </p>
          <div className="strm-finalcta">
            <Link href="/contact-us" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Get in touch</Button>
            </Link>
            <Link href="/beta" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Join the beta</Button>
            </Link>
          </div>
        </div>
      </DarkBand>
    </main>
  );
}
