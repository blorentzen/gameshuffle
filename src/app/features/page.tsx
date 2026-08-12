import type { Metadata } from "next";
import Link from "next/link";
import { Button, CardGroup, Container, Stack } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { DarkBand } from "@/components/marketing/DarkBand";
import { GamesShowcase } from "@/components/marketing/GamesShowcase";

export const metadata: Metadata = {
  title: "Features: what's free and what GameShuffle Pro unlocks",
  description:
    "Everything GameShuffle does. Free with every account: randomizers, 10 stream & party tools, competitive scoring, tournaments & championships, the TCG companion + collection, and profiles/social. GameShuffle Pro adds the platform layer: cross-platform sessions, an Arcade Token economy, stream tools on your overlay, live tournament control, and more.",
  openGraph: {
    title: "GameShuffle Features: Free + Pro",
    url: "https://www.gameshuffle.co/features",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gameshuffle-features-og.jpg"],
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/features",
  },
};

interface Feature {
  icon?: IconName;
  iconSrc?: string;
  title: string;
  description: string;
  accent: string;
  href?: string;
}

/** Free with every account — the canonical free tier (see the positioning doc). */
const FREE_FEATURES: Feature[] = [
  {
    icon: "layout-grid",
    title: "Game randomizers",
    description:
      "Randomize karts, characters, tracks, and items for Mario Kart 8 Deluxe and Mario Kart World, up to 24 players.",
    accent: "#2563eb",
    href: "/apps",
  },
  {
    icon: "target",
    title: "Free stream & party tools",
    description:
      "Ten free tools: wheel spinner, dice, coin flip, tier list, bingo, magic 8-ball, and more. No account needed.",
    accent: "#7c3aed",
    href: "/tools",
  },
  {
    icon: "chart-bar",
    title: "Competitive lounge scoring",
    description:
      "Live MK8DX lounge scoring with normalized placements, team modes, and real-time results.",
    accent: "#0891b2",
    href: "/competitive-mario-kart",
  },
  {
    icon: "flag",
    title: "Tournaments & championships",
    description:
      "Create and run tournaments (brackets, round-robin, Heat → Mains, or a season-long championship series) with a live public board.",
    accent: "#d97706",
    href: "/mario-kart-tournaments",
  },
  {
    icon: "sparkles",
    title: "TCG Companion + collection",
    description:
      "A digital kit for the Pokémon TCG (damage, conditions, prizes, dice) plus a searchable card collection.",
    accent: "#db2777",
    href: "/pokemon-tcg-companion",
  },
  {
    icon: "users",
    title: "Profiles & social",
    description:
      "A public profile, follows, presence, and messaging. The Comms Center keeps your community connected.",
    accent: "#059669",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Discord bot",
    description:
      "Standalone /gs-randomize commands that work in any server, with per-player re-rolls. No setup required.",
    accent: "#4f46e5",
  },
  {
    icon: "bookmark",
    title: "Save & share setups",
    description:
      "Save kart builds, item sets, and full game-night setups, and share them with a link.",
    accent: "#dc2626",
  },
];

/** The GS Pro platform layer — the deep "why it matters" breakdown lives on /gs-pro. */
const PRO_FEATURES: Feature[] = [
  {
    icon: "layout-grid",
    title: "Sessions across every platform",
    description:
      "One game night across Twitch and Discord: OBS overlay, chat commands, and channel-point rewards, run from the Hub.",
    accent: "#2563eb",
  },
  {
    icon: "currency-dollar",
    title: "Arcade Token economy",
    description:
      "A closed-loop currency with prediction markets, awards, bounties, and three-layer leaderboards your chat plays for.",
    accent: "#d97706",
  },
  {
    icon: "target",
    title: "Stream tools on your overlay",
    description:
      "Overlay wheels plus on-screen dice, 8-ball, bingo, and tier lists. Your chat drives them from chat and channel points.",
    accent: "#7c3aed",
  },
  {
    icon: "flag",
    title: "Live tournament control",
    description:
      "Advance the current race and it updates your overlay, your /live page, and chat. Drive it with !gs-tourney.",
    accent: "#0891b2",
  },
  {
    icon: "checks",
    title: "Picks, bans & modules",
    description:
      "Participant-driven drafts and live engagement modules your viewers vote and play through in real time.",
    accent: "#059669",
  },
  {
    icon: "sparkles",
    title: "Anthems & brand theming",
    description:
      "Walk-up anthems for your regulars, plus brand theming that reskins your overlay, /live page, and profile.",
    accent: "#db2777",
  },
];

export default function FeaturesPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      {/* Intro hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <Container>
          <span className="marketing-hero__eyebrow">✨ Free &amp; Pro</span>
          <h1 className="marketing-hero__title">Everything GameShuffle does</h1>
          <p className="marketing-hero__sub">
            The core tools are free with every account. GameShuffle Pro adds the platform
            layer that turns a stream into a multiplayer game your community plays with you.
          </p>
        </Container>
      </section>

      <Container>
        {/* Free with every account */}
        <section style={{ margin: "var(--spacing-32) 0 var(--spacing-48)" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: 0, lineHeight: "var(--line-height-tight)" }}>
            Free with every account
          </h2>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", margin: "var(--spacing-8) 0 var(--spacing-24)", maxWidth: "52rem", lineHeight: "var(--line-height-relaxed)" }}>
            The everyday tools. No subscription required.
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
                accent={f.accent}
                href={f.href}
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
            {PRO_FEATURES.map((f) => (
              <FeatureCard
                key={f.title}
                variant="compact"
                icon={f.icon}
                iconSrc={f.iconSrc}
                title={f.title}
                description={f.description}
                accent={f.accent}
              />
            ))}
          </CardGroup>
          <p style={{ marginTop: "var(--spacing-16)", color: "var(--text-secondary)" }}>
            See every Pro feature (and why it matters){" "}
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
