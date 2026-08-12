"use client";

/**
 * GameShuffle Pro — `/gs-pro`.
 *
 * The canonical Pro page: a marketing pitch + a feature carousel on top,
 * a dark pricing module (cards + checkout, absorbed from the former
 * `/pricing` page, which now 301s here), a games showcase (what we
 * support + what's in development + suggest-a-game), trial/billing detail,
 * FAQ, and a dark final CTA.
 *
 * Feature framing is "shipped + roadmap": the carousel is all live today;
 * the roadmap is expressed as games-in-development, not unbuilt features.
 * Metadata lives in `layout.tsx` (this is a client file). Stripe checkout
 * is unchanged — same `ProUpgradeCtaButtons`.
 */

import Link from "next/link";
import {
  Accordion,
  Button,
  Card,
  CarouselItem,
  Container,
  Stack,
} from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { DarkBand } from "@/components/marketing/DarkBand";

/** The Pro platform layer — every one shipped. `detail` is the
 *  "why it matters" line that makes the value land. */
const PRO_FEATURES: {
  icon?: IconName;
  iconSrc?: string;
  title: string;
  description: string;
  detail: string;
  accent: string;
}[] = [
  {
    icon: "layout-grid",
    title: "Sessions across every platform",
    description:
      "A real game-night session as a first-class object: participants, lobby, phase, and state in one Hub, bound to as many platforms as you stream to.",
    detail:
      "One source of truth means Twitch and Discord show the same lobby, picks, and results. No manual syncing.",
    accent: "#2563eb",
  },
  {
    icon: "brand-twitch",
    title: "Twitch integration",
    description:
      "An OBS overlay, !gs chat commands for viewers, and a channel-point reward that lets a viewer reroll your combo. All wired to the live session.",
    detail:
      "Your chat shapes the run without leaving Twitch, and the overlay keeps the current combo on stream automatically.",
    accent: "#9146ff",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Discord unified sessions",
    description:
      "Bind a Discord server to the same session. The bot announces lobby openings and go-lives, and your community joins and plays from where they already hang out.",
    detail:
      "Variety communities live on Discord between streams. Unified sessions keep them connected instead of fragmenting the audience.",
    accent: "#5865f2",
  },
  {
    icon: "target",
    title: "Stream tools on your overlay",
    description:
      "Overlay wheels plus on-screen dice, 8-ball, bingo, and tier lists: the same free tools, now live on stream and driven by chat and channel points.",
    detail:
      "Every free tool becomes an on-air moment your community triggers. No scene switching, no separate apps.",
    accent: "#7c3aed",
  },
  {
    icon: "flag",
    title: "Live tournament control",
    description:
      "Advance the current race and it updates your OBS overlay, your /live page, and Twitch chat at once, or drive it from chat with !gs-tourney.",
    detail:
      "Run a bracket or a Heat → Mains night on stream without leaving your game. The board keeps everyone in sync.",
    accent: "#dc2626",
  },
  {
    icon: "checks",
    title: "Picks & Bans modules",
    description:
      "Participant-driven track and item drafts. Viewers vote picks and bans live during a session, with open/close rounds you control from the Hub.",
    detail:
      "Turns track selection into a chat event instead of a host decision. The audience owns the outcome.",
    accent: "#059669",
  },
  {
    icon: "currency-dollar",
    title: "Arcade Token economy",
    description:
      "A closed-loop currency viewers earn through participation and spend on the platform layer. Balances derive from a ledger. Never bought, never cashed out.",
    detail:
      "Tokens give every interaction a measurable value, and the compounding balance is why engaged viewers keep showing up.",
    accent: "#d97706",
  },
  {
    icon: "chart-bar",
    title: "Prediction markets",
    description:
      "Open a market on what happens next, let chat stake Arcade Tokens, then resolve it and pay out. Markets fan out across the session's platforms.",
    detail:
      "Even a viewer who can't pick or vote still has skin in the game. Predictions turn watching into stakes.",
    accent: "#0891b2",
  },
  {
    icon: "award",
    title: "Awards & bounties",
    description:
      "Hand out tokens for a great play with a discretionary award, or peg a bounty to an outcome that pays whoever hits it.",
    detail:
      "A lightweight way to reward moments as they happen, without breaking the flow of the stream.",
    accent: "#db2777",
  },
  {
    icon: "chart-line",
    title: "Leaderboards",
    description:
      "Three layers (viewer performance, streamer engagement, and a global board) so regulars have something to climb across your whole channel.",
    detail:
      "A visible ranking gives your community a reason to come back and a way to compete with each other.",
    accent: "#4f46e5",
  },
  {
    icon: "sparkles",
    title: "Anthems & brand theming",
    description:
      "Walk-up anthems for your regulars, plus brand theming that reskins your overlay, /live page, and public profile in your channel's colors.",
    detail:
      "The personal touches that make your channel feel like a place, not a preset. Regulars notice.",
    accent: "#16a34a",
  },
];

const FAQ_ITEMS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "Do my viewers need a GameShuffle account?",
    a: <>No. Viewers play from Twitch chat and channel points, or from Discord. No account needed to predict, vote, or earn Arcade Tokens. You (the streamer) are the only one who needs GS Pro.</>,
  },
  {
    q: "How do Arcade Tokens work, and is it real money?",
    a: <>No. Arcade Tokens are a closed-loop engagement currency: viewers earn them by participating and spend them on the platform layer (predictions, markets). They&apos;re never bought with money and never cashed out. They exist purely to make your stream more fun to play along with.</>,
  },
  {
    q: "Which platforms does Pro work with?",
    a: <>Twitch and Discord today, tied into one session: an OBS overlay for your stream, chat commands + channel points on Twitch, and the bot on Discord. More platforms can plug into the same session model over time.</>,
  },
  {
    q: "What happens after the trial ends?",
    a: <>You&apos;ll automatically convert to your selected plan ($9/month or $99/year) using the card you provided at signup. We&apos;ll email you 3 days before the trial ends as a reminder.</>,
  },
  {
    q: "Can I cancel anytime?",
    a: <>Yes. Cancel from your account in two clicks. You&apos;ll keep Pro access through the end of your current billing period, then drop to Free. No cancellation fees, no friction.</>,
  },
  {
    q: "Do you offer refunds?",
    a: <>New monthly subscribers can request a prorated refund within 7 days of payment. Annual subscribers within 30 days. After that, your subscription continues until the end of the current billing period when you cancel.</>,
  },
  {
    q: "What happens if my payment fails?",
    a: <>We&apos;ll automatically retry the charge over the next two weeks. If it still doesn&apos;t go through, your account drops to Free and we&apos;ll email you. Your account data and connections are preserved. You can resubscribe anytime to restore Pro access.</>,
  },
  {
    q: "Can I switch between monthly and annual?",
    a: <>Yes, anytime, from your account settings. Stripe handles the proration automatically.</>,
  },
  {
    q: "What payment methods do you accept?",
    a: <>All major credit and debit cards (Visa, Mastercard, American Express, Discover). Apple Pay and Google Pay are supported at checkout.</>,
  },
  {
    q: "Is my payment information secure?",
    a: <>We never see or store your card number. Payment processing is handled entirely by Stripe, which is PCI-DSS Level 1 certified, the highest security standard for handling card data.</>,
  },
  {
    q: "Do you offer team or family plans?",
    a: <>Not yet. Right now Pro is a single-streamer / single-account subscription. If you&apos;d like team plans, <Link href="/contact-us">let us know</Link>. We&apos;re tracking demand.</>,
  },
];

export default function GsProPage() {
  const { user } = useAuth();

  return (
    <main className="pricing-page-main" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      {/* Hero / pitch — premium dark, animated, full-bleed */}
      <section className="pro-hero">
        <Container>
          <div className="pro-hero__content">
            <span className="pro-hero__eyebrow">🚀 GameShuffle Pro · 14-day free trial</span>
            <h1 className="pro-hero__title">Run game nights your community plays with you.</h1>
            <p className="pro-hero__sub">
              Pro adds the platform layer on top of the free tools: cross-platform sessions, an
              OBS overlay, stream tools on screen, live tournament control, and an Arcade Token
              economy your chat plays for. One session, every platform.
            </p>
            <div className="pro-hero__ctas">
              <Link href={user ? "/account?tab=plans" : "/signup?intent=trial"}>
                <Button variant="primary" size="large">Try Pro free for 14 days</Button>
              </Link>
              <Link href="#pricing">
                <Button variant="secondary" size="large">See pricing</Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        {/* What Pro unlocks — the rich platform-layer breakdown */}
        <section style={{ margin: "var(--spacing-80) 0" }}>
          <h2 className="pricing-page__section-title" style={{ marginBottom: "var(--spacing-24)" }}>
            What Pro unlocks
          </h2>
          <AutoplayCarousel
            slidesToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
            gap={20}
            showArrows
            showDots
            loop
            arrowPosition="bottom"
          >
            {PRO_FEATURES.map((f) => (
              <CarouselItem key={f.title}>
                <FeatureCard
                  variant="full"
                  icon={f.icon}
                  iconSrc={f.iconSrc}
                  title={f.title}
                  description={f.description}
                  detail={f.detail}
                  accent={f.accent}
                />
              </CarouselItem>
            ))}
          </AutoplayCarousel>
        </section>
      </Container>

      {/* Pricing — dark module */}
      <DarkBand id="pricing" premium>
        <h2 className="pricing-page__section-title pro-band__title" style={{ textAlign: "center" }}>
          Simple pricing
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-18)",
            textAlign: "center",
            margin: "0 auto var(--spacing-32)",
            maxWidth: "44rem",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          Start free. Upgrade when you want your community to play alongside you.
        </p>
        <div className="pricing-page__cards">
          <Card variant="outlined" padding="large" className="pricing-card">
            <p className="pricing-card__label">Free</p>
            <p className="pricing-card__price">$0</p>
            <p className="pricing-card__price-subtext">Forever free</p>
            <p className="pricing-card__description">
              A genuinely useful free tier. Not a demo.
            </p>
            <Link href={user ? "/account" : "/signup"}>
              <Button variant="secondary" fullWidth>Get started</Button>
            </Link>
            <ul className="pricing-card__list">
              <li>All game randomizers (MK8DX + Mario Kart World)</li>
              <li>10 free stream &amp; party tools (wheel, dice, tier lists, bingo, 8-ball…)</li>
              <li>Competitive lounge scoring + tournaments &amp; championships</li>
              <li>TCG Companion + card collection</li>
              <li>Public profile, follows &amp; messaging (Comms Center)</li>
              <li>Discord bot + save &amp; share setups</li>
            </ul>
          </Card>

          <Card variant="elevated" padding="large" className="pricing-card pricing-card--featured">
            <span className="pricing-card__tag">Most popular</span>
            <p className="pricing-card__label">Pro</p>
            <p className="pricing-card__price">
              $9
              <span className="pricing-card__price-suffix"> /mo</span>
            </p>
            <p className="pricing-card__price-subtext">or $99/year (save ~8%)</p>
            <p className="pricing-card__description">
              Run real sessions. Stream with confidence. Coordinate everything.
            </p>
            {user ? (
              <ProUpgradeCtaButtons hasUsedTrial={false} />
            ) : (
              <Link href="/signup?intent=trial">
                <Button variant="primary" fullWidth>Start 14-day trial</Button>
              </Link>
            )}
            <ul className="pricing-card__list">
              <li><strong>Everything in Free, plus:</strong></li>
              <li>Sessions across Twitch + Discord with an OBS overlay, run from the Hub</li>
              <li>Stream tools live on your overlay (wheels, 8-ball, bingo, tier lists)</li>
              <li>Live tournament control: advance races to your overlay + chat</li>
              <li>Picks &amp; Bans modules + channel-point rewards</li>
              <li>Arcade Token economy: prediction markets, awards, bounties, leaderboards</li>
              <li>Walk-up anthems + brand theming for your channel</li>
              <li>Priority support</li>
            </ul>
          </Card>
        </div>
      </DarkBand>

      <Container>
        {/* FAQ */}
        <section className="pricing-page__faq">
          <h2 className="pricing-page__section-title">Common questions</h2>
          <Accordion
            variant="bordered"
            items={FAQ_ITEMS.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
          />
        </section>
      </Container>

      {/* Final CTA — dark */}
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
            Ready to run a real game night?
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-18)",
              margin: "0 auto var(--spacing-24)",
              maxWidth: "44rem",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Start your 14-day Pro trial. Cancel anytime.
          </p>
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <Link href={user ? "/account?tab=plans" : "/signup?intent=trial"} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Start free trial</Button>
            </Link>
            <Link href="/signup" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Start with free</Button>
            </Link>
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
