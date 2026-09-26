import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Icon, Stack, type IconName } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";

export const metadata: Metadata = {
  title: "Free Tools: wheel spinner, dice, tier lists, bingo, 8-ball & more",
  description:
    "Free GameShuffle tools you can use right in your browser, no account needed: a wheel spinner, dice roller, coin flip, name picker, stream timer, tier list maker, bingo generator, magic 8-ball, yes/no, truth or dare, and a game night kit. On GameShuffle Pro, they go live on your stream overlay.",
  openGraph: {
    title: "Free GameShuffle stream & party tools",
    url: "https://www.gameshuffle.co/tools",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/gameshuffle-tools-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/tools" },
};

/**
 * Free-tool wayfinder tiles. Coin Flip uses `rosette` (a round token), not a
 * dollar sign, to read as a heads-or-tails toss.
 *
 * `family` colours the icon. Eleven tiles in one grid with one blue glyph each
 * gave the eye nothing to sort by, so every tool looked like every other tool.
 * The colour encodes something true — what KIND of tool it is — rather than
 * being decoration or a hash: pick something at random, run your stream, build
 * a board, play a party game, or run a whole night.
 */
type ToolFamily = "pick" | "stream" | "board" | "party" | "kit";

const TOOL_TILES: { icon: IconName; label: string; desc: string; href: string; family: ToolFamily }[] = [
  { icon: "rotate", label: "Wheel Spinner", desc: "Spin to pick a random winner", href: "/wheel-spinner", family: "pick" },
  { icon: "box", label: "Dice Roller", desc: "Roll one or many dice in a tap", href: "/dice-roller", family: "pick" },
  { icon: "rosette", label: "Coin Flip", desc: "Heads or tails, with a tally", href: "/coin-flip", family: "pick" },
  { icon: "user-check", label: "Name Picker", desc: "Draw random winners from a list", href: "/name-picker", family: "pick" },
  { icon: "clock", label: "Stream Timer", desc: "Starting-soon / BRB countdown", href: "/stream-timer", family: "stream" },
  { icon: "layout-list", label: "Tier List Maker", desc: "Rank anything from S to D", href: "/tier-list-maker", family: "board" },
  { icon: "border-all", label: "Bingo Card Generator", desc: "Custom 5×5 bingo cards", href: "/bingo-card-generator", family: "board" },
  { icon: "help-circle", label: "Magic 8-Ball", desc: "Ask a yes-or-no question", href: "/magic-8-ball", family: "party" },
  { icon: "checks", label: "Yes or No?", desc: "Tap for a quick decision", href: "/yes-no", family: "party" },
  { icon: "flame", label: "Truth or Dare", desc: "Endless party prompts", href: "/truth-or-dare", family: "party" },
  { icon: "users", label: "Game Night Tools", desc: "Score sheets, timers, pickers & more", href: "/game-nights/tools", family: "kit" },
];

export default function ToolsPage() {
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh" }}>
      {/* Hero — full-bleed aurora band */}
      <section className="marketing-hero">
        <MarketingHeroField category="tools" />
        <Container>
          <p className="marketing-eyebrow">Free · no account needed</p>
          <h1 className="marketing-hero__title">Free stream &amp; party tools</h1>
          <p className="marketing-hero__sub">
            Free tools you can use right in your browser: spin a wheel, roll dice, run a
            bingo board or tier list, ask the 8-ball, or grab a full game night kit.
            Streaming? On GameShuffle Pro they go live on your overlay and your chat drives them.
          </p>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <section style={{ margin: "0 0 var(--spacing-48)" }}>
          <div className="home-tiles">
            {TOOL_TILES.map((t) => (
              <a key={t.href} href={t.href} className="home-tile gs-hover-gradient">
                <span className={`home-tile__icon home-tile__icon--${t.family}`} aria-hidden="true">
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
