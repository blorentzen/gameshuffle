"use client";

/**
 * Public pricing page — `/pricing`.
 *
 * Per gs-pricing-page-copy.md. Two CTAs:
 *   - Logged-out users → /signup (with optional `?intent=trial` flag)
 *   - Logged-in Free users → ProUpgradeCtaButtons fires Stripe Checkout directly
 *
 * The signed-in Plans tab at /account?tab=plans is the destination after
 * checkout return; this page is purely the prospect-facing funnel.
 */

import Link from "next/link";
import {
  Button,
  Card,
  Container,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";

const COMPARISON_ROWS: Array<[string, boolean | string, boolean | string]> = [
  ["Web randomizers", true, true],
  ["Discord bot — standalone commands", true, true],
  ["Game ideas + blog", true, true],
  ["GameShuffle sessions", false, true],
  ["Twitch streamer integration", false, true],
  ["OBS overlay", false, true],
  ["Twitch chat commands (!gs-*)", false, true],
  ["Channel point redemptions", false, true],
  ["Discord bot — session integration", false, true],
  ["Discord + Twitch unified sessions", false, true],
  ["Picks module", false, true],
  ["Bans module", false, true],
  ["Priority support", false, true],
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
    q: "What if I want to cancel during my trial?",
    a: <>Cancel from your account anytime during the trial and you won&apos;t be charged. You&apos;ll keep Pro access through the end of the trial period.</>,
  },
  {
    q: "Do you offer team or family plans?",
    a: <>Not yet. Right now Pro is a single-streamer / single-account subscription. If you&apos;d like team plans, <Link href="/contact-us">let us know</Link> — we&apos;re tracking demand.</>,
  },
];

function CheckMark({ on }: { on: boolean | string }) {
  if (typeof on === "string") return <span>{on}</span>;
  if (on) {
    return <span aria-label="Included" style={{ color: "var(--primary-600)", fontWeight: 600 }}>✓</span>;
  }
  return <span aria-label="Not included" style={{ color: "var(--text-tertiary)" }}>—</span>;
}

export default function PricingPage() {
  const { user } = useAuth();

  return (
    <main className="pricing-page-main">
      <Container>
        {/* Hero */}
        <section className="pricing-page__hero">
          <p className="pricing-page__eyebrow">Pricing</p>
          <h1 className="pricing-page__title">Game nights, but actually coordinated.</h1>
          <p className="pricing-page__subhead">
            GameShuffle handles the chaos so you can focus on the game. Randomize matchups, run live picks and bans, and tie your stream to your Discord — all in one place.
          </p>
          <div className="pricing-page__hero-ctas">
            <Link href={user ? "/account?tab=plans" : "/signup"}>
              <Button variant="primary">Start free</Button>
            </Link>
            <Link href={user ? "/account?tab=plans" : "/signup?intent=trial"}>
              <Button variant="secondary">Try Pro free for 14 days</Button>
            </Link>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="pricing-page__cards">
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
              <li>Cross-platform coordination — Discord and Twitch in the same session</li>
              <li>Priority support</li>
            </ul>
          </Card>
        </section>

        {/* Comparison table */}
        <section className="pricing-page__comparison">
          <h2 className="pricing-page__section-title">Compare plans</h2>
          <Table variant="bordered">
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead align="center">Free</TableHead>
                <TableHead align="center">Pro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARISON_ROWS.map(([feature, free, pro]) => (
                <TableRow key={feature}>
                  <TableCell>{feature}</TableCell>
                  <TableCell align="center"><CheckMark on={free} /></TableCell>
                  <TableCell align="center"><CheckMark on={pro} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* Game support */}
        <section className="pricing-page__split">
          <div>
            <h2 className="pricing-page__section-title">What games does GameShuffle support?</h2>
            <p className="pricing-page__body">
              GameShuffle supports Mario Kart 8 Deluxe and Mario Kart World today, with active development on Super Smash Bros, Mario Party, and more. New game support is added regularly — if your game isn&apos;t here yet, <Link href="/contact-us">submit an idea</Link> or sign up to be notified when it lands.
            </p>
          </div>
          <div>
            <h2 className="pricing-page__section-title">About the 14-day trial</h2>
            <p className="pricing-page__body">
              Pro is built around real sessions, real streams, and real coordination — so we want you to actually try it before you commit. The 14-day trial gives you full Pro access. Credit card is required at signup, and you&apos;ll be charged $9/month (or $99/year, whichever you pick) at the end of the trial unless you cancel. You can cancel anytime from your account.
            </p>
          </div>
        </section>

        {/* Billing transparency */}
        <section className="pricing-page__billing">
          <Card variant="flat" padding="large" className="pricing-page__billing-card">
            <h2 className="pricing-page__section-title">A note on billing</h2>
            <p className="pricing-page__body">
              GameShuffle is built by Empac, our product studio. Charges appear on your statement as <strong>EMPAC* GS PRO</strong>. If you ever have a billing question, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll handle it directly.
            </p>
          </Card>
        </section>

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

        {/* Final CTA */}
        <section className="pricing-page__final-cta">
          <h2 className="pricing-page__final-cta-title">Ready to run a real game night?</h2>
          <p className="pricing-page__body">Start your 14-day Pro trial. Cancel anytime.</p>
          <Link href={user ? "/account?tab=plans" : "/signup?intent=trial"}>
            <Button variant="primary">Start free trial</Button>
          </Link>
          <p className="pricing-page__final-cta-secondary">
            Or <Link href="/signup">start with the free plan</Link> and explore at your own pace.
          </p>
        </section>
      </Container>
    </main>
  );
}
