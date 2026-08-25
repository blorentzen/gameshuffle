import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Icon, Stack, type IconName } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
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

/** Free-tool wayfinder tiles — the same compact style as the homepage grid
 *  (CDS Tabler icons + gradient hover), with a short descriptor line so each
 *  tile says what the tool does. Coin Flip uses `rosette` (a round
 *  token/medallion), not a dollar sign, to read as a heads-or-tails toss. */
const TOOL_TILES: { icon: IconName; label: string; desc: string; href: string }[] = [
  { icon: "rotate", label: "Wheel Spinner", desc: "Spin to pick a random winner", href: "/wheel-spinner" },
  { icon: "box", label: "Dice Roller", desc: "Roll one or many dice in a tap", href: "/dice-roller" },
  { icon: "rosette", label: "Coin Flip", desc: "Heads or tails, with a tally", href: "/coin-flip" },
  { icon: "user-check", label: "Name Picker", desc: "Draw random winners from a list", href: "/name-picker" },
  { icon: "clock", label: "Stream Timer", desc: "Starting-soon / BRB countdown", href: "/stream-timer" },
  { icon: "layout-list", label: "Tier List Maker", desc: "Rank anything from S to D", href: "/tier-list-maker" },
  { icon: "border-all", label: "Bingo Card Generator", desc: "Custom 5×5 bingo cards", href: "/bingo-card-generator" },
  { icon: "help-circle", label: "Magic 8-Ball", desc: "Ask a yes-or-no question", href: "/magic-8-ball" },
  { icon: "checks", label: "Yes or No?", desc: "Tap for a quick decision", href: "/yes-no" },
  { icon: "flame", label: "Truth or Dare", desc: "Endless party prompts", href: "/truth-or-dare" },
];

export default function ToolsPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh" }}>
      {/* Hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <Container>
          <p className="marketing-eyebrow">Free · no account needed</p>
          <h1 className="marketing-hero__title">Free stream &amp; party tools</h1>
          <p className="marketing-hero__sub">
            Ten free tools you can use right in your browser: spin a wheel, roll dice, run a
            bingo board or tier list, ask the 8-ball. Streaming? On GameShuffle Pro they go live
            on your overlay and your chat drives them.
          </p>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <section style={{ margin: "0 0 var(--spacing-48)" }}>
          <div className="home-tiles">
            {TOOL_TILES.map((t) => (
              <a key={t.href} href={t.href} className="home-tile gs-hover-gradient">
                <span className="home-tile__icon" aria-hidden="true">
                  <Icon name={t.icon} size="32" />
                </span>
                <span className="home-tile__label">{t.label}</span>
                <span className="home-tile__desc">{t.desc}</span>
              </a>
            ))}
          </div>
          <p style={{ marginTop: "var(--spacing-24)", color: "var(--text-secondary)", fontSize: "var(--font-size-16)" }}>
            Looking for the games? <a href="/apps" style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 600 }}>Browse the apps →</a>
          </p>
        </section>

      </Container>

      {/* Bottom CTA — canonical full-bleed dark module. Curved TOP edge so the
          light content flows into the band; dark bottom meets the footer flush. */}
      <DarkBand
        premium
        curved
        curveEdges="top"
        curveColor="color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))"
      >
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
