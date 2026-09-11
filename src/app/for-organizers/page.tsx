import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, type IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { PlatformShot, OverlayShot } from "@/components/marketing/ProFeatureShots";
import { CarouselItem } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "For organizers: run your events on GameShuffle",
  description:
    "Running tournaments, leagues, or community game nights? GameShuffle gives organizers brackets, points, and Heat-to-Mains ladders, championship seasons, live scoring, build rules and picks/bans, automatic player profiles, and public pages to join, all announced across Discord and Twitch. Free to run.",
  openGraph: {
    title: "GameShuffle for organizers",
    url: "https://www.gameshuffle.co/for-organizers",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/for-organizers" },
};

/** Page ground — the curved dark band fills its wave mask with this so there's
 *  no white seam above it. */
const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/** The organizer toolkit. Links land on the real surfaces where they matter. */
const TOOLKIT: {
  icon?: IconName;
  iconSrc?: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  accent: string;
}[] = [
  {
    icon: "award",
    title: "Tournaments, your format",
    description:
      "Run a bracket, a points night, or the sprint-car Heat-to-Mains ladder. Set the tracks, seeding, and rules, then invite players.",
    href: "/tournament/create",
    cta: "Create a tournament →",
    accent: "#16a34a",
  },
  {
    icon: "flag",
    title: "Championship series",
    description:
      "Run a whole season of events with season standings, a roster, and a public series page that updates as results come in.",
    href: "/tournament",
    cta: "Browse tournaments →",
    accent: "#2563eb",
  },
  {
    icon: "chart-bar",
    title: "Live scoring in real time",
    description:
      "Normalized placements, team modes, and a public viewer page that updates live as each race is scored. No spreadsheets.",
    href: "/competitive/mario-kart-8-deluxe",
    cta: "See the competitive hub →",
    accent: "#7c3aed",
  },
  {
    icon: "checks",
    title: "Build rules and picks/bans",
    description:
      "Lock the format with weight class, drift, and character restrictions, and run track picks and bans right in the flow.",
    href: "/tournament/create",
    cta: "Set your rules →",
    accent: "#db2777",
  },
  {
    icon: "user-check",
    title: "Player profiles on join",
    description:
      "When a player joins, their display name, friend code, and Discord come with them, so your roster fills itself in.",
    href: "/tournament",
    cta: "How joining works →",
    accent: "#0ea5e9",
  },
  {
    icon: "layout-grid",
    title: "Public pages to join and follow",
    description:
      "Every event has a shareable page where players browse, join, and follow along live from any device. No installs.",
    href: "/tournament",
    cta: "Browse events →",
    accent: "#2563eb",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Announce it everywhere",
    description:
      "One event, announced and kept in sync across Discord and Twitch, so your whole community sees it and shows up.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#5865f2",
  },
  {
    icon: "rosette",
    title: "Free to run",
    description:
      "The core tournament and scoring tools are free. Turn on email-verified-only entry when a bracket needs to stay clean.",
    href: "/tournament/create",
    cta: "Start free →",
    accent: "#e0a106",
  },
];

export default function ForOrganizersPage() {
  return (
    <main style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="GameShuffle for organizers"
        appDescription="Event tooling for organizers: tournaments (brackets, points, Heat-to-Mains), championship seasons, live scoring, build rules and picks/bans, automatic player profiles, public join pages, and cross-platform announcements."
        appUrl="/for-organizers"
        breadcrumb={{ label: "For Organizers", path: "/for-organizers" }}
        faq={[
          {
            q: "Does it cost anything to run a tournament?",
            a: "No. The core tournament and live-scoring tools are free to run. GameShuffle Pro adds cross-platform announcements and the overlay/engagement layer for streamed events.",
          },
          {
            q: "What kinds of events can I run?",
            a: "One-off tournaments (brackets, points, or the Heat-to-Mains ladder), full championship seasons with standings, live competitive scoring, and in-person board-game nights with RSVPs.",
          },
          {
            q: "Do players need an account to join?",
            a: "Joining pulls a player's display name, friend code, and Discord automatically. You can require email-verified entry when a bracket needs to stay clean.",
          },
        ]}
      />

      {/* Hero */}
      <section className="marketing-hero">
        <Container>
          <p className="marketing-eyebrow">For Organizers</p>
          <h1 className="marketing-hero__title">Run your events on GameShuffle</h1>
          <p className="marketing-hero__sub">
            Tournaments, leagues, and community game nights, without the spreadsheets. Set
            your format and rules, invite players, and let live scoring, public pages, and
            cross-platform announcements do the busywork, so you can run the event instead
            of wrangling it.
          </p>
          <div className="strm-hero__cta">
            <Link href="/tournament/create" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Create a tournament</Button>
            </Link>
            <Link href="/contact-us" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Talk to us about your org</Button>
            </Link>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {/* Who it's for */}
        <section className="beta-section">
          <div className="beta-section__head">
            <p className="marketing-eyebrow">Built for the people running it</p>
            <h2 className="beta-section__title">However you organize, it fits</h2>
            <p className="beta-section__sub">
              Tournament organizers, community leagues, clubs and schools, convention rooms,
              and esports orgs all run on the same tooling. Bring a one-off bracket or a full
              season.
            </p>
          </div>
        </section>

        {/* Spotlights */}
        <section className="beta-section">
          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="Cross-platform"
                title="Announce it everywhere at once"
                body="Post your event once and keep it in sync across Discord and Twitch. Your community sees the same schedule, roster, and results wherever they hang out, so more of them actually show up."
                media={<PlatformShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="On screen"
                title="Put the competition on the stream"
                body="Running a streamed event? Live scoring, the current match, and picks and bans composite straight onto the OBS overlay, so viewers follow the action in real time without you cutting to a spreadsheet."
                media={<OverlayShot />}
              />
            </Reveal>
          </div>
        </section>

        {/* Organizer toolkit */}
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Everything you need to run it</h2>
            <p className="beta-section__sub">
              From a casual community night to a season-long championship.
            </p>
          </div>
          <AutoplayCarousel
            slidesToShow={{ mobile: 1, tablet: 2, desktop: 4 }}
            gap={20}
            showArrows
            showDots
            loop
            interval={5000}
          >
            {TOOLKIT.map((t) => (
              <CarouselItem key={t.title}>
                <FeatureCard
                  icon={t.icon}
                  iconSrc={t.iconSrc}
                  title={t.title}
                  description={t.description}
                  href={t.href}
                  cta={t.cta}
                  accent={t.accent}
                />
              </CarouselItem>
            ))}
          </AutoplayCarousel>
          <div style={{ textAlign: "center", marginTop: "var(--spacing-32)" }}>
            <Link href="/tournament/create" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Create a tournament</Button>
            </Link>
          </div>
        </section>

        {/* GS Circuit scale band */}
        <section className="beta-section">
          <div style={{ maxWidth: 780, margin: "0 auto", border: "1px solid var(--primary-300, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 6%, var(--surface-default))", borderRadius: "1.1rem", padding: "2rem 1.75rem", textAlign: "center" }}>
            <p className="marketing-eyebrow" style={{ marginBottom: "var(--spacing-8)" }}>GS Circuit</p>
            <h2 className="beta-section__title" style={{ marginBottom: "var(--spacing-12)" }}>Bigger fields, when you need them</h2>
            <p style={{ margin: "0 auto var(--spacing-20)", maxWidth: "44rem", lineHeight: "var(--line-height-relaxed)" }}>
              Every format is free for <strong>one full lobby</strong> of your game.{" "}
              <strong>GameShuffle Circuit</strong> raises the field to 64 or 256 players and adds championship
              series, co-organizers, custom page branding, and custom seeding. Circuit 256 even includes
              GameShuffle Pro. Free while it&rsquo;s in preview.
            </p>
            <Link href="/gs-circuit" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">See GS Circuit &amp; pricing</Button>
            </Link>
          </div>
        </section>
      </Container>

      {/* Collaboration / onboarding CTA — the org partnership pitch. */}
      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", textAlign: "center" }}>
          <p className="marketing-eyebrow" style={{ color: "var(--primary-300)" }}>Bring your org aboard</p>
          <h2 className="pro-band__title beta-section__title" style={{ marginBottom: "var(--spacing-16)" }}>
            Let&rsquo;s run your next event together
          </h2>
          <p style={{ margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
            Bringing a league, a series, or a whole organization to GameShuffle? We&rsquo;d
            love to help you set it up and make sure your first event runs clean. Tell us what
            you&rsquo;re running and what you need, and we&rsquo;ll build the rest around it.
          </p>
          <div className="strm-finalcta">
            <Link href="/contact-us" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Get in touch</Button>
            </Link>
            <Link href="/tournament/create" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Create a tournament</Button>
            </Link>
          </div>
        </div>
      </DarkBand>
    </main>
  );
}
