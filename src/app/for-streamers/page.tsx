import { ArrowLink } from "@/components/ui/ArrowLink";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import {
  IconAward, IconBolt, IconBrandDiscord, IconBroadcast, IconChartBar, IconChecks, IconLayoutGrid, IconLayoutList,
  IconPlayerPlay, IconRosette, IconSparkles, IconUsers, type Icon,
} from "@tabler/icons-react";
import { DarkBand } from "@/components/marketing/DarkBand";
import { RowLink, RowPanel, type RowTone } from "@/components/marketing/RowPanel";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { CHAT_GAMES_GUIDE } from "@/data/chat-games";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { STREAMER_TOOLKIT } from "@/data/streamer-toolkit";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";

export const metadata: Metadata = {
  title: "For streamers: turn your stream into a game night",
  description:
    "Turn your stream into a game night chat plays: chat rolls for every game, Stream Bingo, polls, drafts and an overlay, on Twitch and Discord.",
  openGraph: {
    siteName: "GameShuffle",
    title: "Stream with GameShuffle",
    url: "https://www.gameshuffle.co/for-streamers",
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/for-streamers",
  },
};

/** The toolkit's CDS icon names as Tabler glyphs for the rows (RowPanel draws Tabler). */
const TOOL_ICONS: Record<string, Icon> = {
  bolt: IconBolt, "layout-list": IconLayoutList, rosette: IconRosette, "chart-bar": IconChartBar,
  checks: IconChecks, users: IconUsers, sparkles: IconSparkles, "layout-grid": IconLayoutGrid, award: IconAward,
};
const TONES: RowTone[] = ["blue", "violet", "magenta", "orange", "teal", "green", "red"];
/** Overlay pieces shown above the toolkit, from the chat games guide's own screenshots. */
const SHOT_GAMES = ["Stream Bingo", "Live polls", "Trivia night", "Chat Brain"];

export default function ForStreamersPage() {
  const shots = SHOT_GAMES.map((name) => CHAT_GAMES_GUIDE.find((g) => g.name === name)).filter((g): g is NonNullable<typeof g> => !!g?.shot);
  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <MarketingJsonLd
        appName="GameShuffle for Streamers"
        appDescription="Interactive game-night tools for streamers: chat-driven randomizers, channel-point rewards, overlay tools, a token economy, live polls, and cross-platform sessions."
        appUrl="/for-streamers"
        breadcrumb={{ label: "For Streamers", path: "/for-streamers" }}
        faq={[
          {
            q: "Do I need to pay to use GameShuffle on stream?",
            a: "No. The randomizers and free stream tools work without an account. GameShuffle Pro adds the chat integration, channel-point rewards, overlay tools, and the token economy.",
          },
          {
            q: "What platforms does GameShuffle work with?",
            a: "Twitch and Discord today, with the same session, overlay, and commands staying in sync across both. More platforms are on the way.",
          },
          {
            q: "I'm just starting out. Is GameShuffle useful with a small audience?",
            a: "Yes. GameShuffle gives even a small chat something to do together, which is exactly what helps a new stream feel alive. Start with the free tools and grow into Pro.",
          },
        ]}
      />

      {/* Hero */}
      <section className="marketing-hero">
        <MarketingHeroField category="stream" />
        <Container>
          <p className="marketing-eyebrow">For Streamers</p>
          <h1 className="marketing-hero__title">Turn your stream into a game night</h1>
          <p className="marketing-hero__sub">
            Your chat rolls your pick, spins the wheel, votes in polls and plays bingo with you. It runs on Twitch and
            Discord at once and shows on your overlay.
          </p>
          <div className="strm-hero__cta">
            <Link href="/for-streamers/current" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">I already stream</Button>
            </Link>
            <ArrowLink href="/for-streamers/aspiring" className="strm-hero__ghost">I want to start streaming</ArrowLink>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {/* The two ways in, one panel (refinement round 2, Britton's pick 2026-10-20). */}
        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Already streaming, or just starting</h2>
          </div>
          <RowPanel className="row-panel--surface" rows={[
            {
              key: "current", Icon: IconBroadcast, tone: "violet", eyebrow: "Already streaming", title: "Turn viewers into players",
              text: "Chat commands, channel-point rewards, live polls, a token economy and an overlay that reacts, on Twitch and Discord at once.",
              action: <RowLink href="/for-streamers/current">For current streamers</RowLink>,
            },
            {
              key: "aspiring", Icon: IconPlayerPlay, tone: "teal", eyebrow: "New to streaming", title: "Start with something to play",
              text: "Free tools that give a small chat something to do, and the full kit when you're ready. We like helping new streamers get going, so get in touch.",
              action: <RowLink href="/for-streamers/aspiring">For new streamers</RowLink>,
            },
          ]} />
        </section>

        <section className="beta-section">
          <div className="beta-section__head">
            <h2 className="beta-section__title">Everything you get on stream</h2>
          </div>
          <ResponsiveCarousel className="strm-shots" label="Overlay pieces">
            {shots.map((g) => (
              <figure key={g.name} className="strm-shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- local webp screenshots with their sizes */}
                <img src={`/images/guides/chat-games/${g.shot}`} alt={g.shotAlt ?? ""} width={g.shotSize?.[0]} height={g.shotSize?.[1]} loading="lazy" />
                <figcaption>{g.name}</figcaption>
              </figure>
            ))}
          </ResponsiveCarousel>
          <p className="strm-shots__more">
            Overlay pieces as they look on stream. <Link href="/twitch-chat-games">See all 12 games chat can play</Link>
          </p>
          <RowPanel across={false} rows={STREAMER_TOOLKIT.map((t, i) => ({
            key: t.title,
            Icon: t.iconSrc ? IconBrandDiscord : TOOL_ICONS[t.icon ?? ""] ?? IconLayoutGrid,
            tone: TONES[i % TONES.length],
            title: t.title,
            text: t.description,
            // Rows that only said "See it on Pro" lose the link; the close below has the one GS Pro button.
            action: t.href !== "/gs-pro" ? <RowLink href={t.href}>{t.cta.replace(/\s*→$/, "")}</RowLink> : undefined,
          }))} />
        </section>
      </Container>

      {/* Final CTA */}
      <DarkBand premium curved curveEdges="top">
        <h2 className="pro-band__title beta-section__title" style={{ textAlign: "center", marginBottom: "var(--spacing-16)" }}>
          Try it on your stream
        </h2>
        <p style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto var(--spacing-32)" }}>
          Start a GS Pro trial, or apply for the streamer beta and we&rsquo;ll turn it on for you for 30 days.
        </p>
        <div className="strm-finalcta">
          <AuthAwareCTA variant="primary" size="large" trackFrom="for-streamers" overrides={{
            anon: { label: "Try GS Pro free", href: "/gs-pro" },
            free: { label: "Try GS Pro free", href: "/gs-pro" },
            pro: { label: "Open your stream hub", href: "/hub" },
          }} />
          <Link href="/beta" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="large">Apply for the beta</Button>
          </Link>
        </div>
      </DarkBand>
    </main>
  );
}
