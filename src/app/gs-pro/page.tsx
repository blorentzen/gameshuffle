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
}[] = [
  {
    icon: "layout-grid",
    title: "GameShuffle sessions",
    description:
      "A real game-night session as a first-class object: participants, lobby, phase, and state in one hub, bound to as many platforms as you stream to.",
    detail:
      "One source of truth means Twitch and Discord show the same lobby, picks, and results — no manual syncing.",
  },
  {
    icon: "brand-twitch",
    title: "Twitch integration",
    description:
      "An OBS overlay, !gs chat commands for viewers, and a channel-point reward that lets a viewer reroll your combo — all wired to the live session.",
    detail:
      "Your chat shapes the run without leaving Twitch, and the overlay keeps the current combo on stream automatically.",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Discord unified sessions",
    description:
      "Bind a Discord server to the same session. The bot announces lobby openings and go-lives, and your community joins and plays from where they already hang out.",
    detail:
      "Variety communities live on Discord between streams — unified sessions keep them connected instead of fragmenting the audience.",
  },
  {
    icon: "checks",
    title: "Picks & Bans modules",
    description:
      "Participant-driven track and item drafts. Viewers vote picks and bans live during a session, with open/close rounds you control from the hub.",
    detail:
      "Turns track selection into a chat event instead of a host decision — the audience owns the outcome.",
  },
  {
    icon: "currency-dollar",
    title: "Arcade Token economy",
    description:
      "A closed-loop currency viewers earn through participation and spend on the platform layer. Balances derive from a ledger — never bought, never cashed out.",
    detail:
      "Tokens give every interaction a measurable value, and the compounding balance is why engaged viewers keep showing up.",
  },
  {
    icon: "chart-bar",
    title: "Prediction markets",
    description:
      "Open a market on what happens next, let chat stake Arcade Tokens, then resolve it and pay out. Markets fan out across the session's platforms.",
    detail:
      "Even a viewer who can't pick or vote still has skin in the game — predictions turn watching into stakes.",
  },
  {
    icon: "award",
    title: "Awards & bounties",
    description:
      "Hand out tokens for a great play with a discretionary award, or peg a bounty to an outcome that pays whoever hits it.",
    detail:
      "A lightweight way to reward moments as they happen, without breaking the flow of the stream.",
  },
  {
    icon: "chart-line",
    title: "Leaderboards",
    description:
      "Three layers — viewer performance, streamer engagement, and a global board — so regulars have something to climb across your whole channel.",
    detail:
      "A visible ranking gives your community a reason to come back and a way to compete with each other.",
  },
];

const FAQ_ITEMS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "What happens after the trial ends?",
    a: <>You&apos;ll automatically convert to your selected plan — $9/month or $99/year — using the card you provided at signup. We&apos;ll email you 3 days before the trial ends as a reminder.</>,
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
    a: <>We&apos;ll automatically retry the charge over the next two weeks. If it still doesn&apos;t go through, your account drops to Free and we&apos;ll email you. Your account data and connections are preserved — you can resubscribe anytime to restore Pro access.</>,
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
    a: <>We never see or store your card number. Payment processing is handled entirely by Stripe, which is PCI-DSS Level 1 certified — the highest security standard for handling card data.</>,
  },
  {
    q: "Do you offer team or family plans?",
    a: <>Not yet. Right now Pro is a single-streamer / single-account subscription. If you&apos;d like team plans, <Link href="/contact-us">let us know</Link> — we&apos;re tracking demand.</>,
  },
];

export default function GsProPage() {
  const { user } = useAuth();

  return (
    <main className="pricing-page-main">
      <Container>
        {/* Hero / pitch */}
        <section className="pricing-page__hero">
          <p className="marketing-eyebrow">GameShuffle Pro</p>
          <h1 className="pricing-page__title">Run game nights your community plays alongside you.</h1>
          <p className="pricing-page__subhead">
            Pro adds the platform layer on top of the free tools: cross-platform sessions tying Twitch and Discord together, an OBS overlay, chat commands, Picks &amp; Bans, and a token economy with prediction markets. One session, every platform.
          </p>
          <div className="pricing-page__hero-ctas">
            <Link href={user ? "/account?tab=plans" : "/signup?intent=trial"}>
              <Button variant="primary">Try Pro free for 14 days</Button>
            </Link>
            <Link href="#pricing">
              <Button variant="secondary">See pricing</Button>
            </Link>
          </div>
        </section>

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
                />
              </CarouselItem>
            ))}
          </AutoplayCarousel>
        </section>
      </Container>

      {/* Pricing — dark module */}
      <DarkBand id="pricing">
        <h2 className="pricing-page__section-title" style={{ color: "#fff", textAlign: "center" }}>
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
              Everything you need to randomize on the fly.
            </p>
            <Link href={user ? "/account" : "/signup"}>
              <Button variant="secondary" fullWidth>Get started</Button>
            </Link>
            <ul className="pricing-card__list">
              <li>All web randomizers (kart combos, race configs, item rolls)</li>
              <li>Discord bot for standalone randomizer commands</li>
              <li>Game ideas and content</li>
              <li>Account profile and identity connections</li>
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
              <li>Live GameShuffle sessions for game nights and streams</li>
              <li>Twitch integration with overlay, chat commands, and channel point redemptions</li>
              <li>Discord bot tied directly to your active session</li>
              <li>Picks and Bans modules for participant-driven drafts</li>
              <li>Token economy with prediction markets, awards, and bounties</li>
              <li>Cross-platform coordination — Discord and Twitch in the same session</li>
              <li>Priority support</li>
            </ul>
          </Card>
        </div>
      </DarkBand>

      <Container>
        {/* FAQ */}
        <section className="pricing-page__faq">
          <h2 className="pricing-page__section-title">Common questions</h2>
          <Stack direction="vertical" gap={16}>
            {FAQ_ITEMS.map(({ q, a }) => (
              <details key={q} className="pricing-page__faq-item">
                <summary>{q}</summary>
                <div className="pricing-page__faq-body">{a}</div>
              </details>
            ))}
          </Stack>
        </section>
      </Container>

      {/* Final CTA — dark */}
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
