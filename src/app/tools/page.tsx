import type { Metadata } from "next";
import Link from "next/link";
import { Button, CardGroup, Container, Stack, type IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

export const metadata: Metadata = {
  title: "Free Tools: wheel spinner, dice, tier lists, bingo, 8-ball & more",
  description:
    "Ten free GameShuffle tools you can use right in your browser, no account needed: a wheel spinner, dice roller, coin flip, name picker, stream timer, tier list maker, bingo generator, magic 8-ball, yes/no, and truth or dare. On GameShuffle Pro, they go live on your stream overlay.",
  openGraph: {
    title: "Free GameShuffle stream & party tools",
    url: "https://www.gameshuffle.co/tools",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gameshuffle-tools-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/tools" },
};

interface ToolCard {
  icon: IconName;
  title: string;
  description: string;
  href: string;
  /** Icon-chip accent — a rotating palette so the grid reads colorful, not flat. */
  accent: string;
  /** Optional card badge, e.g. "Beta" for tools still being refined. */
  availability?: string;
}

const TOOLS: ToolCard[] = [
  {
    icon: "target",
    title: "Wheel Spinner",
    description:
      "Add options, spin the wheel, and pick a random winner. Great for decisions, raffles, and giveaways.",
    href: "/wheel-spinner",
    accent: "#7c3aed",
  },
  {
    icon: "sparkles",
    title: "Dice Roller",
    description: "Roll one or many dice in a tap, for tabletop, decisions, and game nights.",
    href: "/dice-roller",
    accent: "#2563eb",
  },
  {
    icon: "circle-check",
    title: "Coin Flip",
    description: "Heads or tails, settled instantly, with a running tally.",
    href: "/coin-flip",
    accent: "#d97706",
  },
  {
    icon: "users",
    title: "Name Picker",
    description: "Draw one or more random winners from a list: giveaways & raffles.",
    href: "/name-picker",
    accent: "#059669",
  },
  {
    icon: "clock",
    title: "Stream Timer",
    description: "Starting-soon / BRB countdown with a transparent OBS overlay.",
    href: "/stream-timer",
    accent: "#dc2626",
  },
  {
    icon: "layout-list",
    title: "Tier List Maker",
    description: "Drag items into S-D tiers to rank anything. Saves in your browser.",
    href: "/tier-list-maker",
    accent: "#0891b2",
  },
  {
    icon: "layout-grid",
    title: "Bingo Card Generator",
    description: "Build custom 5×5 bingo cards: Twitch, Mario Kart & more. Print or play along.",
    href: "/bingo-card-generator",
    accent: "#db2777",
  },
  {
    icon: "help-circle",
    title: "Magic 8-Ball",
    description: "Ask a yes-or-no question and shake for one of the 20 classic answers.",
    href: "/magic-8-ball",
    accent: "#4f46e5",
  },
  {
    icon: "checks",
    title: "Yes or No?",
    description: "Can't decide? Tap for a random Yes or No, with an optional Maybe and a tally.",
    href: "/yes-no",
    accent: "#16a34a",
  },
  {
    icon: "flame",
    title: "Truth or Dare",
    description: "Endless truth-or-dare prompts: clean, party & couples sets. No account needed.",
    href: "/truth-or-dare",
    accent: "#ea580c",
  },
];

const COMING_SOON: { icon: "target"; title: string; description: string }[] = [];

export default function ToolsPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh" }}>
      {/* Hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <Container>
          <span className="marketing-hero__eyebrow">🎮 Free · no account needed</span>
          <h1 className="marketing-hero__title">Free stream &amp; party tools</h1>
          <p className="marketing-hero__sub">
            Ten free tools you can use right in your browser: spin a wheel, roll dice, run a
            bingo board or tier list, ask the 8-ball. Streaming? On GameShuffle Pro they go live
            on your overlay and your chat drives them.
          </p>
        </Container>
      </section>

      <Container>
        <section style={{ margin: "0 0 var(--spacing-48)" }}>
          <CardGroup columns={3} gap="md">
            {TOOLS.map((t) => (
              <FeatureCard
                key={t.title}
                variant="compact"
                icon={t.icon}
                title={t.title}
                description={t.description}
                href={t.href}
                accent={t.accent}
                availability={t.availability}
                cta="Try it →"
              />
            ))}
          </CardGroup>
          <p style={{ textAlign: "center", marginTop: "var(--spacing-24)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)" }}>
            Looking for the games? <a href="/apps" style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 600 }}>Browse the apps →</a>
          </p>
        </section>

        {COMING_SOON.length > 0 && (
          <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)" }}>
            <h2
              style={{
                fontSize: "var(--font-size-14)",
                fontWeight: "var(--font-weight-semibold)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-tertiary)",
                margin: "0 0 var(--spacing-16)",
              }}
            >
              More on the way
            </h2>
            <CardGroup columns={3} gap="md">
              {COMING_SOON.map((t) => (
                <FeatureCard
                  key={t.title}
                  variant="compact"
                  icon={t.icon}
                  title={t.title}
                  description={t.description}
                  availability="Coming soon"
                />
              ))}
            </CardGroup>
          </section>
        )}
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
            Ready to put these on your stream?
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              margin: "0 auto var(--spacing-24)",
              maxWidth: "44rem",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Every tool here is free to use solo. On GameShuffle Pro they go live on your OBS
            overlay. Your chat spins the wheel, rolls the dice, and drives the board.
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
