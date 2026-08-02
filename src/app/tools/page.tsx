import type { Metadata } from "next";
import { CardGroup, Container } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";

export const metadata: Metadata = {
  title: "Free Tools — wheel spinner & more random pickers",
  description:
    "A growing set of free GameShuffle tools — random pickers and game-night utilities you can use right in your browser, no account required. Starting with the wheel spinner.",
  openGraph: {
    title: "Free GameShuffle Tools",
    url: "https://www.gameshuffle.co/tools",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/tools" },
};

const TOOLS = [
  {
    icon: "target" as const,
    title: "Wheel Spinner",
    description:
      "Add options, spin the wheel, and pick a random winner. Great for decisions, raffles, and giveaways.",
    href: "/wheel-spinner",
  },
  {
    icon: "sparkles" as const,
    title: "Dice Roller",
    description: "Roll one or many dice in a tap — for tabletop, decisions, and game nights.",
    href: "/dice-roller",
  },
  {
    icon: "circle-check" as const,
    title: "Coin Flip",
    description: "Heads or tails, settled instantly, with a running tally.",
    href: "/coin-flip",
  },
  {
    icon: "users" as const,
    title: "Name Picker",
    description: "Draw one or more random winners from a list — giveaways & raffles.",
    href: "/name-picker",
  },
  {
    icon: "clock" as const,
    title: "Stream Timer",
    description: "Starting-soon / BRB countdown with a transparent OBS overlay.",
    href: "/stream-timer",
  },
  {
    icon: "layout-list" as const,
    title: "Tier List Maker",
    description: "Drag items into S–D tiers to rank anything. Saves in your browser.",
    href: "/tier-list-maker",
  },
  {
    icon: "layout-grid" as const,
    title: "Bingo Card Generator",
    description: "Build custom 5×5 bingo cards — Twitch, Mario Kart & more. Print or play along.",
    href: "/bingo-card-generator",
  },
  {
    icon: "help-circle" as const,
    title: "Magic 8-Ball",
    description: "Ask a yes-or-no question and shake for one of the 20 classic answers.",
    href: "/magic-8-ball",
  },
  {
    icon: "checks" as const,
    title: "Yes or No?",
    description: "Can't decide? Tap for a random Yes or No — with an optional Maybe and a tally.",
    href: "/yes-no",
  },
  {
    icon: "flame" as const,
    title: "Truth or Dare",
    description: "Endless truth-or-dare prompts — clean, party & couples sets. No account needed.",
    href: "/truth-or-dare",
  },
];

const COMING_SOON: { icon: "target"; title: string; description: string }[] = [];

export default function ToolsPage() {
  return (
    <main>
      <Container>
        <section style={{ textAlign: "center", margin: "var(--spacing-48) 0 var(--spacing-32)", maxWidth: "52rem", marginInline: "auto" }}>
          <h1 style={{ fontSize: "var(--font-size-fluid-h2)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)", lineHeight: "var(--line-height-tight)" }}>
            Free tools
          </h1>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)" }}>
            Random pickers and game-night utilities you can use right in your browser — free,
            no account required.
          </p>
        </section>

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
              />
            ))}
          </CardGroup>
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
    </main>
  );
}
