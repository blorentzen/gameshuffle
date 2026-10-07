/**
 * /mario-kart-tournaments — the Mario Kart tournament pitch.
 *
 * Was the generic AppMarketingPage template: hero, a paragraph, a flat grid of
 * nine features, FAQ. That shape sold the software as dependable, which is not
 * why anyone turns up to a game night. Rebuilt in the /gs-pro and /gs-circuit
 * language (alternating ProSpotlight rows over hand-built dark panels) and
 * re-argued around the thing that makes a GameShuffle night different: nobody
 * knows what they are racing until the round opens.
 *
 * Mario Kart is where the draw goes deepest today, not the limit of it, so the
 * page says so rather than implying this is a Mario Kart product.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Button, CarouselItem, Container, type IconName } from "@empac/cascadeds";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import {
  DrawShot, PoolShot, LadderShot, SeasonShot, RevealShot,
} from "@/components/marketing/MkTournamentShots";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";

export const metadata: Metadata = {
  title: "Mario Kart Tournaments: brackets, seasons and a random draw",
  description:
    "Run Mario Kart 8 Deluxe and Mario Kart World tournaments where the draw picks the karts, the tracks and the items. Set what goes in the pool, reveal it live to the lobby and your chat, and run brackets, points, or the Heat to Mains ladder. Free to start with an account.",
  openGraph: {
    title: "Mario Kart Tournaments | GameShuffle",
    description:
      "Brackets and seasons where nobody knows what they are racing until the round opens. MK8DX and Mario Kart World, free to start.",
    url: "https://www.gameshuffle.co/mario-kart-tournaments",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/mk-tournaments-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/mario-kart-tournaments" },
};

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/** The two games, side by side in the dark band. Concrete numbers, because the
 *  claim is depth and depth is only believable when it is specific. */
const GAMES: { name: string; line: string; bullets: string[] }[] = [
  {
    name: "Mario Kart 8 Deluxe",
    line: "96 tracks, four-part builds, 150cc through 200cc.",
    bullets: [
      "Character, vehicle, wheels and glider all drawn",
      "Weight class and drift-type limits",
      "Tour-track filter and cup-based pools",
      "Up to 12 racers in a lobby",
    ],
  },
  {
    name: "Mario Kart World",
    line: "Two-part builds, knockout rallies, bigger lobbies.",
    bullets: [
      "Character and vehicle drawn",
      "Kart, bike and ATV restrictions",
      "Rally routes and overworld tracks",
      "Up to 24 racers in a lobby",
    ],
  },
];

/** Everything around the racing. Short, concrete, no feature-speak. */
/** Shown on the page and fed to the FAQPage JSON-LD, so the two always match. */
const FAQ: { q: string; a: string }[] = [
          { q: "What makes a GameShuffle tournament different?", a: "The draw. Everyone races the same tracks, the same kart build and the same items, and none of it is theirs. You decide what goes in the pool and GameShuffle pulls from it live, so the same roster gives you a different night every time." },
          { q: "Can I control what gets drawn?", a: "That is the point. Cap the weight class, restrict the drift type, ban specific characters or karts, and limit the track pool to a theme. The draw only ever pulls from what you allow, so the restriction is enforced rather than requested." },
          { q: "What formats can I run?", a: "Single and double-elimination brackets, round-robin, free-for-all points, and the Heat to Mains ladder, plus championship seasons where points carry across events into a standings table." },
          { q: "What is the Heat to Mains format?", a: "A sprint-car ladder. The field splits into heats, winning your heat locks you into the A Main, and the top finishers of each lower main transfer up. Nobody is eliminated after one bad race." },
          { q: "Which Mario Kart games are supported?", a: "Mario Kart 8 Deluxe and Mario Kart World, each with its own tracks, vehicles and build rules. You can also name any other game and write its own rules, though the draw is deepest on these two." },
          { q: "Do players need an account?", a: "No. Organizers can add guests by name, so people can race without signing up. Championship seasons are the exception and are accounts-only, so points stay tied to real players all season." },
          { q: "Is it free?", a: "Yes, creating and running is free with an account, and joining is open to everyone. Larger fields fall under GameShuffle Circuit, which is free while it is in preview." },
];

const REST: { title: string; body: string; icon: IconName }[] = [
  { icon: "layout-grid", title: "Track pools", body: "Hand-pick them, let players choose, draw them at random, or limit the hat to a theme." },
  { icon: "checks", title: "Picks and bans", body: "Let the field, or your chat, vote tracks and items out before the draw runs." },
  { icon: "users", title: "Guests welcome", body: "The friend who will not sign up for anything can still race." },
  { icon: "chart-bar", title: "Seeding", body: "By check-in, by standings, or at random. Byes handled for you." },
  { icon: "user-check", title: "Co-organizers", body: "Hand a trusted regular the controls without handing over your account." },
  { icon: "bell", title: "Reminders", body: "A day before and an hour before, in each player's own timezone." },
  { icon: "currency-dollar", title: "Paid entry", body: "Sell tickets through Stripe when you want to. Free events need no setup." },
  { icon: "rosette", title: "Bragging rights", body: "Every event keeps a public page with the bracket and the final table." },
];

export default function MarioKartTournamentsPage() {
  return (
    <main className="pricing-page-main" style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="Mario Kart Tournaments"
        appDescription="Run Mario Kart 8 Deluxe and Mario Kart World tournaments where the draw picks the karts, tracks and items from a pool you set. Brackets, points, Heat to Mains, and championship seasons, revealed live to the lobby, your overlay and your chat."
        appUrl="/mario-kart-tournaments"
        breadcrumb={{ label: "Mario Kart Tournaments", path: "/mario-kart-tournaments" }}
        faq={FAQ}
      />

      {/* Hero */}
      <section className="pro-hero pro-hero--cyan">
        <MarketingHeroField category="compete" />
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">Mario Kart · tournaments</p>
            <h1 className="pro-hero__title">Nobody knows what they&rsquo;re racing until it starts.</h1>
            <p className="pro-hero__sub">
              Brackets and seasons where the draw picks the karts, the tracks and the items. You
              set what&rsquo;s in the pool, GameShuffle pulls from it live, and the same roster gives
              you a different night every time. MK8DX and Mario Kart World today, your game next.
            </p>
            <div className="pro-hero__ctas">
              <Link href="/tournament/create" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Start a tournament</Button>
              </Link>
              <Link href="/tournament/sandbox" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">Roll a sample round</Button>
              </Link>
            </div>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <section className="beta-section">
          <p className="marketing-eyebrow">Where the fun comes from</p>
          <h2 className="pricing-page__section-title mkt-section-title" style={{ marginBottom: "var(--spacing-8)" }}>
            You shape the chaos, the draw does the rest
          </h2>
          <p style={{ maxWidth: "60ch", color: "var(--text-secondary)", marginBottom: "var(--spacing-32)" }}>
            Anyone can host a bracket. The reason a GameShuffle night is worth turning up to is that
            you never know what you&rsquo;re getting until the round opens, and neither does the person
            who has mained the same kart for six years.
          </p>

          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="The draw"
                title="Everyone races something they didn't pick"
                body="The round opens and everyone finds out together: the same three tracks, the same kart, the same items, none of it theirs. The specialist loses their crutch, the newcomer loses the disadvantage, and the whole lobby is reacting to the same surprise. Roll it once a round or fresh every race."
                media={<DrawShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Your pool, your flavour"
                title="Make a night that could only be yours"
                body="Bikes only. Heavyweights only. Every track except Rainbow Road. Ban the three karts that win every week and watch what the draw finds instead. You decide what goes in the hat, and a themed pool turns one roster into a dozen different nights."
                media={<PoolShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                eyebrow="Heat to Mains"
                title="The comeback is built into the format"
                body="Borrowed from sprint car racing. Win your heat and you're locked into the A Main. Blow it and you're not out, you're in the B, racing to transfer up. Nobody goes home after one bad start, and the last race has people in it who had a terrible first one."
                media={<LadderShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Seasons"
                title="Give your group a title race"
                body="String the nights together and the standings start to mean something. A rival two points back, a drop-worst that keeps a bad Tuesday from ending someone's run, and a final week where four people can still win it."
                media={<SeasonShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                eyebrow="The reveal"
                title="Everyone finds out at the same moment"
                body="Open the round and the draw lands on the public page, your overlay and your chat at once. Chat sees the karts before the racers have stopped groaning about them, which is most of the entertainment."
                media={<RevealShot />}
                cta={{ label: "See what GameShuffle Pro adds", href: "/gs-pro" }}
              />
            </Reveal>
          </div>
        </section>
      </Container>

      {/* Both games, in the dark band */}
      <DarkBand curved curveEdges="both" curveColor={PAGE_BG}>
        <h2 className="pricing-page__section-title mkt-section-title" style={{ color: "#fff", marginBottom: "var(--spacing-8)" }}>
          Two games in deep, more coming
        </h2>
        <p style={{ maxWidth: "60ch", color: "rgba(255,255,255,0.72)", marginBottom: "var(--spacing-24)" }}>
          Every track, kart and rule for both games is in here, which is what lets the draw be
          specific enough to be interesting. Running something else? You can already{" "}
          <Link href="/host-a-tournament" style={{ color: "#fff" }}>name your own game and write its rules</Link>.
        </p>
        <div className="mkt-games">
          {GAMES.map((g) => (
            <div key={g.name} className="mkt-game">
              <h3>{g.name}</h3>
              <p>{g.line}</p>
              <ul>{g.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </div>
      </DarkBand>

      <Container>
        <section className="beta-section">
          <h2 className="pricing-page__section-title mkt-section-title" style={{ marginBottom: "var(--spacing-8)" }}>
            The rest of the night
          </h2>
          <p style={{ maxWidth: "60ch", color: "var(--text-secondary)", marginBottom: "var(--spacing-24)" }}>
            Everything around the racing, handled.
          </p>
          <AutoplayCarousel
            label="The rest of the night"
            slidesToShow={{ mobile: 1, tablet: 2, desktop: 4 }}
            gap={20}
            showArrows
            showDots
            loop
            interval={5000}
          >
            {REST.map((r) => (
              <CarouselItem key={r.title}>
                <FeatureCard icon={r.icon} title={r.title} description={r.body} />
              </CarouselItem>
            ))}
          </AutoplayCarousel>
        </section>

        <section className="beta-section rand-landing__faq">
          <h2 className="pricing-page__section-title mkt-section-title" style={{ marginBottom: "var(--spacing-24)" }}>
            Frequently asked questions
          </h2>
          {/* Open by default: CDS Accordion only mounts an item once it's opened,
              so collapsed answers would be missing from the HTML (and from search). */}
          <Accordion
            variant="bordered"
            allowMultiple
            defaultOpenIds={FAQ.map((_, i) => String(i))}
            items={FAQ.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
          />
        </section>
      </Container>

      {/* Closing CTA — full-bleed, curve above, butted against the footer, the
          same shape every other marketing page closes on. */}
      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", textAlign: "center" }}>
          <h2 className="pro-band__title beta-section__title" style={{ marginBottom: "var(--spacing-16)" }}>
            Find out what you&rsquo;re racing
          </h2>
          <p style={{ margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
            Free to start with an account. Rolling a sample round needs nothing at all.
          </p>
          <div className="strm-finalcta">
            <Link href="/tournament/create" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Start a tournament</Button>
            </Link>
            <Link href="/tournament/sandbox" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Roll a sample round</Button>
            </Link>
          </div>
        </div>
      </DarkBand>
    </main>
  );
}
