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

import { useEffect, useState } from "react";
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
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { BackingPair } from "@/components/support/BackingPair";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { Reveal } from "@/components/marketing/Reveal";
import { FaqList } from "@/components/marketing/FaqList";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";
import { proContextFor, type ProContext } from "@/lib/marketing/pro-context";
import {
  PlatformShot,
  OverlayShot,
  TokenShot,
  MarketShot,
  GamesShot,
} from "@/components/marketing/ProFeatureShots";
import { RowPanel, RowLink } from "@/components/marketing/RowPanel";
import { LOUNGE_PRO_ROWS } from "@/components/lounge/LoungeProBand";

/** The cards under the spotlights, every one shipped. `detail` is one concrete
 *  fact the first line doesn't say (writing pass, 2026-10-20). */
const PRO_FEATURES: {
  icon?: IconName;
  iconSrc?: string;
  title: string;
  description: string;
  detail: string;
  accent: string;
  href?: string;
  cta?: string;
}[] = [
  {
    icon: "flag",
    title: "Live tournament control",
    description:
      "Advance the current race and it updates your OBS overlay, your /live page, and Twitch chat at once, or drive it from chat with !gs-tourney.",
    detail:
      "You or your mods can step through races from chat.",
    accent: "#dc2626",
  },
  {
    icon: "checks",
    title: "Picks & Bans modules",
    description:
      "Participant-driven track and item drafts. Viewers vote picks and bans live during a session, with open/close rounds you control from the Hub.",
    detail:
      "For Mario Kart 8 Deluxe and Mario Kart World.",
    accent: "#059669",
  },
  {
    icon: "award",
    title: "Awards & bounties",
    description:
      "Hand out tokens for a great play with a discretionary award, or peg a bounty to an outcome that pays whoever hits it.",
    detail:
      "Type !gs award @name 50, or !gs bounty 100 and what has to happen.",
    accent: "#db2777",
  },
  {
    icon: "chart-line",
    title: "Leaderboards",
    description:
      "Boards for your channel's viewers and for everyone on GameShuffle.",
    detail:
      "Streamers aren't on the viewer board, so it's only your regulars.",
    accent: "#4f46e5",
  },
  {
    icon: "palette",
    title: "Brand theming",
    description:
      "Reskin your overlay, /live page, and public profile in your channel's colors.",
    detail:
      "Pick a brand theme, a profile skin, or write your own CSS.",
    accent: "#16a34a",
  },
  {
    icon: "chart-pie",
    title: "Live polls",
    description:
      "One poll across Twitch chat, Discord, your /live page and the overlay, with a single live tally.",
    detail:
      "Start one from the dashboard, from chat with !poll, or in Discord.",
    accent: "#0d9488",
  },
  {
    icon: "border-all",
    title: "Stream Bingo",
    description:
      "Viewers grab a bingo card on your /live page, you call numbers from chat or the dashboard, and claims are checked for you.",
    detail:
      "Pay winners in Arcade Tokens or your own prize. The card shows on your overlay too.",
    accent: "#ea580c",
  },
  {
    icon: "users",
    title: "Chat Draft",
    description:
      "Chat drafts your team one pick at a time, or captains pick players into teams for a community night.",
    detail:
      "Drafts for Pokémon teams, Mario Kart builds and tracks, and Smash stages and fighters.",
    accent: "#7c3aed",
  },
  {
    icon: "message-circle",
    title: "Who Said It? and Chat Brain",
    description:
      "Turn your !quote pool into a guessing game, and ask chat your own survey questions to see what the crowd really thinks.",
    detail:
      "Add quotes with !quote add, and ask chat a question with !cb ask.",
    accent: "#db2777",
  },
  {
    icon: "sparkles",
    title: "AI tools",
    description:
      "Make wheel slices, bingo squares, tier lists and party game packs from a theme, and get recap posts written from what happened on stream.",
    detail:
      "AI drafts, you approve. Every AI tool draws from one monthly allowance.",
    accent: "#4f46e5",
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
    q: "Which games work with chat rolls?",
    a: <>Every game GameShuffle has a randomizer for: Mario Kart 8 Deluxe, Mario Kart World and Mario Kart 64, Smash Ultimate, every Mario Party, Splatoon 3, Kirby Air Riders, Overwatch, Marvel Rivals, GoldenEye 007, Perfect Dark and Pokémon Stadium. The bot follows your Twitch category, so it rolls for whatever you&apos;re playing.</>,
  },
  {
    q: "What do the AI tools do?",
    a: <>They draft things for you to edit and approve: wheel slices, bingo squares, tier lists and party game packs from a theme, plus recap posts of your stream. AI never decides a random result (the randomizers still roll), and everything AI writes is labeled. Pro includes a monthly allowance across every AI tool.</>,
  },
  {
    q: "What happens after the trial ends?",
    a: <>You&apos;ll automatically convert to your selected plan (monthly or annual, at the price shown above) using the card you provided at signup. We&apos;ll email you 3 days before the trial ends as a reminder.</>,
  },
  {
    q: "Can I cancel anytime?",
    a: <>Yes, from Plans &amp; billing in your account. GS Pro stays on until the end of the period you paid for, then the account moves to Free. There&apos;s no fee.</>,
  },
  {
    q: "Do you offer refunds?",
    a: <>New monthly subscribers can request a prorated refund within 7 days of payment. Annual subscribers within 30 days. After that, your subscription continues until the end of the current billing period when you cancel.</>,
  },
  {
    q: "What happens if my payment fails?",
    a: <>We&apos;ll automatically retry the charge over the next two weeks. If it still doesn&apos;t go through, your account drops to Free and we&apos;ll email you. Your account data is kept; Twitch disconnects while you&apos;re on Free, and you can reconnect it when you resubscribe.</>,
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
    a: <>Not yet. GS Pro is for one account. If your team would use a shared plan, <Link href="/contact-us">tell us</Link>.</>,
  },
];

export default function GsProPage() {
  /**
   * Read after mount rather than with useSearchParams, to avoid forcing a
   * Suspense boundary around the whole pitch page for one line of copy. The
   * generic headline renders on the server and is correct for most arrivals.
   */
  const [proCtx, setProCtx] = useState<ProContext | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProCtx(proContextFor(new URLSearchParams(window.location.search).get("from")));
  }, []);

  const pricing = usePublicPricing();
  const pro = pricing.plans.pro ?? { monthly: 9, annual: 99 };
  const { user } = useAuth();
  const availability = usePaidAvailability();
  // Who's looking decides the offer (audit, 2026-10-19): members manage their plan, visitors
  // outside the US get the waitlist, and a used trial is never offered again. Until we know, the
  // general trial pitch renders (it's what most arrivals see).
  const who = useTrialEligibility();
  const isPro = !!who?.isPro;
  const outside = !!availability && !availability.paidPlans.available;
  const trialUsed = !!who?.hasUsedTrial;
  const plansHref = user ? "/account?tab=plans" : "/signup?redirect=/account?tab=plans";
  const offer = isPro
    ? { eyebrow: "GameShuffle Pro", cta: "Manage your plan", href: "/account?tab=plans", bandTitle: "You have GS Pro", band: "Thanks for running game nights with us.", bandCta: "Open your plan" }
    : outside
      ? { eyebrow: "US only for now", cta: "Join the waitlist", href: "#pricing", bandTitle: "GS Pro is US only for now", band: "Join the waitlist and we'll tell you when it opens where you are.", bandCta: "Join the waitlist" }
      : trialUsed
        ? { eyebrow: "GameShuffle Pro", cta: "Get GS Pro", href: plansHref, bandTitle: "Get GS Pro", band: "", bandCta: "Get GS Pro" }
        : { eyebrow: "14-day free trial", cta: "Try Pro free for 14 days", href: plansHref, bandTitle: "Try GS Pro free for 14 days", band: "", bandCta: "Start free trial" };
  const priceLine = isPro
    ? "You have GS Pro. Manage it any time from your account."
    : outside
      ? "GS Pro is available in the US for now. Everything free on GameShuffle works wherever you are."
      : `${trialUsed ? "" : "14 days free, then "}${usd(pro.monthly)} a month or ${usd(pro.annual)} a year. Cancel any time from your account.`;
  // GS Circuit's row says "free during preview" until its billing switch launches it.
  const [circuitLive, setCircuitLive] = useState(false);
  useEffect(() => {
    fetch("/api/tournaments/billing-status").then((r) => r.json()).then((j: { billingEnabled?: boolean }) => setCircuitLive(!!j.billingEnabled)).catch(() => {});
  }, []);

  return (
    <main className="pricing-page-main" style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      {/* Hero / pitch — premium dark, animated, full-bleed */}
      <section className="pro-hero pro-hero--sales">
        <MarketingHeroField category="stream" />
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">{offer.eyebrow}</p>
            {/* When someone arrives from a Pro wall inside the app we know what
                they were trying to do, so lead with that instead of the general
                pitch. Every marketing link in stays generic. */}
            <h1 className="pro-hero__title">
              {proCtx ? proCtx.headline : "Run game nights your community plays with you."}
            </h1>
            <p className="pro-hero__sub">
              {proCtx
                ? proCtx.lede
                : "GS Pro puts GameShuffle on your stream. Chat rolls, votes and plays along from Twitch and Discord, and it all shows on your OBS overlay."}
            </p>
            <div className="pro-hero__ctas">
              <Link href={offer.href}>
                <Button variant="primary" size="large">{offer.cta}</Button>
              </Link>
              <Link href="#pricing">
                <Button variant="secondary" size="large">See pricing</Button>
              </Link>
            </div>
            {/* The price up front (Britton's pick, 2026-10-19): the header never said what Pro costs. */}
            <p className="pro-hero__price">{priceLine}</p>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {/* What GS Pro adds: the five spotlights. */}
        <section style={{ margin: "var(--spacing-80) 0" }}>
          <h2 className="pricing-page__section-title" style={{ marginBottom: "var(--spacing-24)" }}>
            What GS Pro adds
          </h2>

          {/* Marquee features — hand-built representations, alternating sides.
              Wrapped so the between-module gap is a flex gap (they're animated
              and need room to breathe), independent of the top gap. */}
          {/* Phones swipe through them one at a time; wider screens keep them alternating down the page. */}
          <ResponsiveCarousel className="pro-spotlights" label="What GS Pro adds">
          <Reveal>
            <ProSpotlight
              eyebrow="Cross-platform"
              title="One session on Twitch and Discord"
              body="Run one game night in both places at once. The overlay, the chat commands and the tokens follow the same session, so Twitch and Discord show the same lobby, picks and results."
              media={<PlatformShot />}
            />
          </Reveal>
          <Reveal>
            <ProSpotlight
              reverse
              eyebrow="Every game you stream"
              title="Your chat rolls along with you"
              body="Viewers type !gs-shuffle and get a pick from the game you're playing: Mario Kart, Smash, Mario Party, Splatoon, Kirby Air Riders, Overwatch, Marvel Rivals and more, with official art on your overlay. !gs setup rolls the tracks, stage, board or map, and !gs battle rolls everyone in the lobby at once."
              media={<GamesShot />}
            />
          </Reveal>
          <Reveal>
            <ProSpotlight
              eyebrow="On-stream tools"
              title="Every tool, live on your overlay"
              body="Wheels, polls, Stream Bingo, chat drafts, timers, an 8-ball and tier lists show on your OBS overlay. Viewers spin, roll and vote with chat commands and channel points."
              media={<OverlayShot />}
            />
          </Reveal>
          <Reveal>
            <ProSpotlight
              reverse
              eyebrow="Token economy"
              title="Tokens your chat earns"
              body="Viewers earn Arcade Tokens by playing along and spend them on predictions and !chaos events. Their balance carries from stream to stream."
              media={<TokenShot />}
            />
          </Reveal>
          <Reveal>
            <ProSpotlight
              eyebrow="Prediction markets"
              title="Your chat calls the outcome"
              body="Open a market on anything: who wins the race, whether they nail the shortcut. Chat buys in with tokens, the odds move live, and the pot pays out when it resolves."
              media={<MarketShot />}
            />
          </Reveal>
          </ResponsiveCarousel>
        </section>

        {/* More in GS Pro: the features the spotlights don't cover, as a compact row. */}
        <section id="everything-in-pro" style={{ margin: "var(--spacing-80) 0", scrollMarginTop: "8rem" }}>
          <h2 className="pricing-page__section-title" style={{ marginBottom: "var(--spacing-24)" }}>
            More in GS Pro
          </h2>
          <Reveal>
            <AutoplayCarousel
            label="More in GS Pro"
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
                    href={f.href}
                    cta={f.cta}
                  />
                </CarouselItem>
              ))}
            </AutoplayCarousel>
          </Reveal>
        </section>

        {/* For Mario Kart lounge players (lounge page picks, 2026-10-20): the same three rows as the lounge pages' GS Pro band. */}
        <section id="lounge" aria-labelledby="pro-lounge-title" style={{ margin: "var(--spacing-80) 0", scrollMarginTop: "8rem" }}>
          <h2 id="pro-lounge-title" className="pricing-page__section-title" style={{ marginBottom: "var(--spacing-24)" }}>
            For Mario Kart lounge players
          </h2>
          <RowPanel
            className="row-panel--surface"
            rows={LOUNGE_PRO_ROWS.map((r, i) => ({
              ...r,
              action: i === 0 ? <RowLink href="/lounge">Look up any lounge player</RowLink> : i === 2 ? <RowLink href="/mmr-card">See the MMR card</RowLink> : undefined,
            }))}
          />
        </section>
      </Container>

      {/* Pricing — dark module */}
      <DarkBand
        id="pricing"
        premium
        curved
        curveColor="color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))"
      >
        <h2 className="pricing-page__section-title pro-band__title" style={{ textAlign: "center", marginBottom: "var(--spacing-32)" }}>
          Free or GS Pro
        </h2>
        <div className="pricing-page__cards">
          <Card variant="outlined" padding="large" className="pricing-card">
            <div className="pricing-card__head">
              <p className="pricing-card__label">Free</p>
              <p className="pricing-card__price">$0</p>
              <p className="pricing-card__price-subtext">Forever free</p>
              <p className="pricing-card__description">
                No card needed.
              </p>
              <Link href={user ? "/account" : "/signup"}>
                <Button variant="secondary" fullWidth>Get started</Button>
              </Link>
            </div>
            <p className="pricing-card__free-line">
              Every randomizer, the dailies, game night tools, tournaments and the TCG Companion.{" "}
              <Link href="/features">See everything that&apos;s free</Link>
            </p>
          </Card>

          <Card variant="elevated" padding="large" className="pricing-card pricing-card--featured">
            <span className="pricing-card__tag">For streamers</span>
            <div className="pricing-card__head">
              <p className="pricing-card__label">GS Pro</p>
              <p className="pricing-card__price">
                {usd(pro.monthly)}
                <span className="pricing-card__price-suffix"> /mo</span>
              </p>
              <p className="pricing-card__price-subtext">or {usd(pro.annual)}/year{pro.monthly && pro.annual ? ` (save ~${Math.round((1 - pro.annual / (pro.monthly * 12)) * 100)}%)` : ""}</p>
              <p className="pricing-card__description">
                For running game nights on stream.
              </p>
              {user ? (
                <ProUpgradeCtaButtons from="gs-pro" />
              ) : availability && !availability.paidPlans.available ? (
                <PaidPlansWaitlist product="pro" />
              ) : (
                <Link href="/signup?redirect=/account?tab=plans">
                  <Button variant="primary" fullWidth>Start 14-day trial</Button>
                </Link>
              )}
            </div>
            <div className="pricing-card__included">
              <p className="pricing-card__included-title">What&rsquo;s included</p>
              <ul className="pricing-card__list">
                <li><strong>Everything in Free, plus:</strong></li>
                <li>Sessions across Twitch + Discord with an OBS overlay, run from the Hub</li>
                <li>Chat rolls, match rolls and viewer battles for every game you stream</li>
                <li>Live polls, Stream Bingo, Chat Draft and Who Said It?</li>
                <li>Stream tools on your overlay (wheels, timers, 8-ball, tier lists) + channel point rewards</li>
                <li>Live tournament control and picks &amp; bans</li>
              </ul>
              <Link href="#everything-in-pro" className="pricing-card__more">See everything in GS Pro</Link>
            </div>
          </Card>
        </div>
        {/* GS Circuit right under the plans (Britton's pick, 2026-10-19), worded by its launch state. */}
        <div className="pro-circuit-row">
          <p className="pro-circuit-row__eyebrow">For organizers</p>
          <h3 className="pro-circuit-row__title">GS Circuit</h3>
          <p className="pro-circuit-row__body">GS Circuit raises your field to 64 or 256 players, with championship seasons, co-organizers and your branding. Circuit 256 includes GS Pro.{circuitLive ? "" : " Free during the preview."}</p>
          <Link href="/gs-circuit" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="small">Compare GS Circuit plans</Button>
          </Link>
        </div>
      </DarkBand>

      <Container>
        {/* GS Pro and Support, the two ways to back GameShuffle, side by side (Britton's picks, 2026-10-19). */}
        <section className="pricing-page__backing" aria-labelledby="backing-title">
          <h2 id="backing-title" className="pricing-page__section-title">Two ways to back GameShuffle</h2>
          <BackingPair from="gs-pro" proHref="#pricing" />
        </section>

        {/* FAQ */}
        <section className="pricing-page__faq">
          <h2 className="pricing-page__section-title">Common questions</h2>
          <FaqList items={FAQ_ITEMS} />
        </section>
      </Container>

      {/* Final CTA — curved dark closer */}
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
              marginBottom: offer.band ? "var(--spacing-12)" : "var(--spacing-24)",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            {offer.bandTitle}
          </h2>
          {offer.band && (
            <p
              style={{
                fontSize: "var(--font-size-18)",
                margin: "0 auto var(--spacing-24)",
                maxWidth: "44rem",
                lineHeight: "var(--line-height-relaxed)",
              }}
            >
              {offer.band}
            </p>
          )}
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <Link href={offer.href} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">{offer.bandCta}</Button>
            </Link>
            {!user && (
              <Link href="/signup" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">Start with free</Button>
              </Link>
            )}
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
