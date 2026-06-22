import type { Metadata } from "next";
import Link from "next/link";
import { Button, CardGroup, Container, Stack } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { DarkBand } from "@/components/marketing/DarkBand";
import { GamesShowcase } from "@/components/marketing/GamesShowcase";

export const metadata: Metadata = {
  title: "Features — what's free and what GameShuffle Pro unlocks",
  description:
    "Everything GameShuffle does: free game randomizers, competitive lounge scoring, tournament builder, TCG companion, and Discord bot — plus the Pro platform layer that adds cross-platform sessions, a token economy, prediction markets, and more.",
  openGraph: {
    title: "GameShuffle Features — Free + Pro",
    url: "https://www.gameshuffle.co/features",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/features",
  },
};

/** What the primary platform provides for free, with every account. */
const FREE_FEATURES: { icon?: IconName; iconSrc?: string; title: string; description: string }[] = [
  {
    icon: "layout-grid",
    title: "Game randomizers",
    description:
      "Randomize karts, characters, tracks, and items for Mario Kart 8 Deluxe and Mario Kart World — for up to 24 players.",
  },
  {
    icon: "chart-bar",
    title: "Competitive lounge scoring",
    description:
      "Live MK8DX lounge scoring with normalized placements, team modes, and real-time results.",
  },
  {
    icon: "flag",
    title: "Tournament builder",
    description:
      "Create and run Mario Kart tournaments with custom tracks, rules, and build restrictions.",
  },
  {
    icon: "sparkles",
    title: "TCG Companion",
    description:
      "A digital game-night kit for the Pokémon TCG — damage, conditions, prizes, coin flips, and dice.",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Discord bot",
    description:
      "Standalone /gs-randomize commands that work in any server, with per-player re-rolls — no setup required.",
  },
  {
    icon: "bookmark",
    title: "Save & share setups",
    description:
      "Save kart builds, item sets, and full game-night setups — and share them with a link.",
  },
];

/** The headline Pro additions — a teaser; the rich breakdown lives on /gs-pro. */
const PRO_TEASER: { icon?: IconName; iconSrc?: string; title: string; description: string }[] = [
  {
    icon: "layout-grid",
    title: "Cross-platform sessions",
    description:
      "One game-night session across Twitch and Discord — OBS overlay, chat commands, and channel-point rewards.",
  },
  {
    icon: "currency-dollar",
    title: "Token economy + markets",
    description:
      "Arcade Tokens, prediction markets, awards, and bounties that turn watchers into players.",
  },
  {
    icon: "checks",
    title: "Picks, bans & leaderboards",
    description:
      "Participant-driven drafts and live engagement tools, with channel-wide leaderboards.",
  },
];

export default function FeaturesPage() {
  return (
    <main>
      <Container>
        {/* Intro */}
        <section style={{ textAlign: "center", margin: "var(--spacing-48) 0 var(--spacing-32)" }}>
          <p className="marketing-eyebrow">Features</p>
          <h1
            style={{
              fontSize: "var(--font-size-fluid-h2)",
              fontWeight: "var(--font-weight-bold)",
              margin: "var(--spacing-12) 0",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            Everything GameShuffle does — free, and with Pro.
          </h1>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              color: "var(--text-secondary)",
              maxWidth: "52rem",
              margin: "0 auto",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            The core tools are free with every account. GameShuffle Pro adds the platform
            layer that turns a stream into a multiplayer game your community plays with you.
          </p>
        </section>

        {/* Free with every account */}
        <section style={{ margin: "var(--spacing-32) 0 var(--spacing-48)" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: 0, lineHeight: "var(--line-height-tight)" }}>
            Free with every account
          </h2>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", margin: "var(--spacing-8) 0 var(--spacing-24)", maxWidth: "52rem", lineHeight: "var(--line-height-relaxed)" }}>
            The everyday tools — no subscription required.
          </p>
          <CardGroup columns={3} gap="md">
            {FREE_FEATURES.map((f) => (
              <FeatureCard
                key={f.title}
                variant="compact"
                icon={f.icon}
                iconSrc={f.iconSrc}
                title={f.title}
                description={f.description}
              />
            ))}
          </CardGroup>
        </section>

        {/* Unlocked with Pro — teaser into GS Pro */}
        <section style={{ margin: "var(--spacing-80) 0" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: 0, lineHeight: "var(--line-height-tight)" }}>
            Unlocked with GameShuffle Pro
          </h2>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", margin: "var(--spacing-8) 0 var(--spacing-24)", maxWidth: "52rem", lineHeight: "var(--line-height-relaxed)" }}>
            The platform layer for streamers who want their chat to play, not just watch.
          </p>
          <CardGroup columns={3} gap="md">
            {PRO_TEASER.map((f) => (
              <FeatureCard
                key={f.title}
                variant="compact"
                icon={f.icon}
                iconSrc={f.iconSrc}
                title={f.title}
                description={f.description}
              />
            ))}
          </CardGroup>
          <p style={{ marginTop: "var(--spacing-16)", color: "var(--text-secondary)" }}>
            See every Pro feature — and why it matters —{" "}
            <Link href="/gs-pro" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>
              on the GameShuffle Pro page →
            </Link>
          </p>
        </section>

        {/* Games & modes we support */}
        <GamesShowcase
          heading="Games & modes we support"
          intro="GameShuffle is built across the games below today, with more in active development. Want yours added? Let us know."
          showModes
        />
      </Container>

      {/* CTA — dark */}
      <DarkBand>
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "var(--font-size-fluid-h3)",
              fontWeight: "var(--font-weight-bold)",
              marginBottom: "var(--spacing-12)",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            See it on your next stream.
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              margin: "0 auto var(--spacing-24)",
              maxWidth: "44rem",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Start free, or jump straight into a 14-day Pro trial.
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
            <Link href="/gs-pro#pricing" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">See pricing</Button>
            </Link>
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
