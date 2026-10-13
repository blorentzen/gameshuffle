import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Button, Container, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { GamesShot, OverlayShot } from "@/components/marketing/ProFeatureShots";
import { BracketShot, StandingsShot } from "@/components/marketing/CircuitFeatureShots";
import { CircuitPricing } from "@/components/marketing/CircuitPricing";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";
import { circuitLaunch } from "@/lib/tournaments/circuit";
import { circuitLaunchState } from "@/lib/tournaments/circuit-resolve";

/** Re-render hourly (and on the billing switch, which revalidates this path) so the page follows the Circuit launch. */
export const revalidate = 3600;

const PRICES_LINE = "Circuit 64 is $12 a month or $120 a year, and Circuit 256 is $29 a month or $290 a year with GameShuffle Pro included.";

/** The launch wording: still in preview, free until an announced day, or paid once the billing switch is on. */
async function launchCopy() {
  const { launchedAt, graceEnd } = await circuitLaunchState();
  const { phase, dateLabel } = circuitLaunch(launchedAt);
  if (phase === "announced") {
    return {
      phase,
      launchedAt,
      short: `Free until ${dateLabel}.`,
      eyebrow: `GameShuffle Circuit · free until ${dateLabel}`,
      banner: <>GameShuffle Circuit is <strong>free until {dateLabel}</strong>, so run events as big as you like. Paid plans start then, and tournaments you create before then keep their Circuit features.</>,
      cost: `${PRICES_LINE} Everything is free until ${dateLabel}, and tournaments created before then keep their Circuit features.`,
      cta: `Everything's free until ${dateLabel}. Spin up a tournament and see how it runs.`,
    };
  }
  if (phase === "live") {
    return {
      phase,
      launchedAt,
      short: "",
      eyebrow: "GameShuffle Circuit",
      banner: null,
      cost: `${PRICES_LINE} Every format stays free for one full lobby of your game.${graceEnd && Date.now() < graceEnd.at ? ` Ran a tournament before ${dateLabel}? Every Circuit feature stays free for you until ${graceEnd.label}.` : ""}`,
      cta: "Every format is free for one full lobby. Spin up a tournament and see how it runs.",
    };
  }
  return {
    phase,
    launchedAt,
    short: "Free during preview.",
    eyebrow: "GameShuffle Circuit · free during preview",
    banner: <>GameShuffle Circuit is <strong>free during preview</strong>, so run events as big as you like right now. The prices below are planned for launch, and you&rsquo;ll get notice before anything changes.</>,
    cost: "It's free during preview, so nothing is charged today. The prices shown are planned for launch and may change. You'll get advance notice before paid tiers go live.",
    cta: "Everything's free during preview. Spin up a tournament and see how it runs.",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "GameShuffle Circuit: run bigger tournaments",
    description:
      `GameShuffle Circuit is the organizer plan for bigger events. Every format is free for one full lobby: brackets, points, Swiss with a top cut and deck lists, and Heat to Mains, for any game. Circuit 64 and Circuit 256 raise the field and add live randomized rounds, text reminders, championship series, co-organizers, custom branding and seeding. ${(await launchCopy()).short}`.trim(),
    openGraph: {
      title: "GameShuffle Circuit",
      url: "https://www.gameshuffle.co/gs-circuit",
    },
    alternates: { canonical: "https://www.gameshuffle.co/gs-circuit" },
  };
}

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/** Free vs Circuit at launch — every format is free; the meter is field size and
 *  four organizer features. Everything is free during preview. */
const COMPARE: { label: string; free: string | boolean; c64: string | boolean; c256: string | boolean }[] = [
  { label: "Players per event", free: "One full lobby", c64: "Up to 64", c256: "Up to 256" },
  { label: "Every format (single/double elim, points, Swiss with a top cut, Heat → Mains)", free: true, c64: true, c256: true },
  { label: "Any game: ours with full rules, or any other by name", free: true, c64: true, c256: true },
  { label: "Pokémon TCG deck lists, checked as players send them", free: true, c64: true, c256: true },
  { label: "A waitlist when the field is full (offered spots in line order)", free: true, c64: true, c256: true },
  { label: "Team modes (2v2 … 6v6)", free: true, c64: true, c256: true },
  { label: "Multi-flight points + custom lobby rules", free: true, c64: true, c256: true },
  { label: "Live scoring, public join page, picks & bans", free: true, c64: true, c256: true },
  { label: "Random-character rounds (Smash, Mario Party, Splatoon, Kirby, Street Fighter 6, Tekken 8)", free: true, c64: true, c256: true },
  { label: "AI tournament helper (format, rules, announcement)", free: true, c64: true, c256: true },
  { label: "Live randomized rounds (revealed to everyone at once)", free: "Set up", c64: true, c256: true },
  { label: "Text reminders to entrants (US numbers)", free: false, c64: "500 a month", c256: "2,000 a month" },
  { label: "Championship series (seasons + standings)", free: false, c64: true, c256: true },
  { label: "Co-organizers (share edit access)", free: false, c64: true, c256: true },
  { label: "Custom branding (page header, theme, display board look)", free: false, c64: true, c256: true },
  { label: "Custom seeding + redraw", free: false, c64: true, c256: true },
  { label: "GameShuffle Pro included", free: false, c64: false, c256: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span>;
  if (v === false) return <span style={{ color: "var(--text-tertiary)" }}>No</span>;
  return <span style={{ fontWeight: 700 }}>{v}</span>;
}

export default async function GsCircuitPage() {
  const copy = await launchCopy();
  return (
    <main className="pricing-page-main" style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="GameShuffle Circuit"
        appDescription={`The organizer plan for bigger tournaments. Every format is free for one full lobby; Circuit 64 and Circuit 256 raise the field and unlock championship series, co-organizers, custom page branding, and custom seeding; Circuit Events covers in-person and commercial fields. ${copy.short}`.trim()}
        appUrl="/gs-circuit"
        breadcrumb={{ label: "GameShuffle Circuit", path: "/gs-circuit" }}
        faq={[
          { q: "How much does GameShuffle Circuit cost?", a: copy.cost },
          { q: "What's free?", a: "Every format (single/double elimination, points, Swiss with a top cut, Heat to Mains, team modes), Pokémon TCG deck lists, multi-flight points, live scoring, a public join page, picks & bans, random-character rounds for fighting and party games, a waitlist, and the AI tournament helper, for one full lobby of your game (12 on MK8DX, 24 on MK World, 8 on Mario Party)." },
          { q: "Which games can I run?", a: "Any game. Mario Kart 8 Deluxe, Mario Kart World and Mario Kart 64 come with track and build rules; Smash Ultimate, Mario Party, Splatoon 3, Kirby Air Riders, Street Fighter 6 and Tekken 8 get random-character rounds; Pokémon TCG gets Swiss with deck lists. Anything else runs by name with your rules." },
          { q: "What does GameShuffle Circuit add?", a: "A bigger field (Circuit 64 or Circuit 256), live randomized rounds, text reminders to entrants, and four organizer features: championship series, co-organizers, custom page branding, and custom seeding & redraw. Circuit Events is a per-tournament pass for in-person or commercial events." },
          { q: "What happens when a free tournament fills up?", a: "Nobody is turned away. Once one full lobby has a spot, anyone else who signs up joins the waitlist, and the organizer sees who's waiting. If the organizer upgrades to Circuit 64 or Circuit 256, the people waiting are offered spots in line order." },
          { q: "Is it the same as GameShuffle Pro?", a: "No. GameShuffle Pro is for streamers (Twitch/Discord integration, overlay, chat commands, token economy). GameShuffle Circuit is for organizers running bigger tournaments. They're separate plans." },
        ]}
      />

      {/* Hero — premium dark, matching the GS Pro hero scale */}
      <section className="pro-hero pro-hero--sales pro-hero--cyan">
        <MarketingHeroField category="compete" />
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">{copy.eyebrow}</p>
            <h1 className="pro-hero__title">Run bigger tournaments.</h1>
            <p className="pro-hero__sub">
              Every format is free for one full lobby of your game. GameShuffle Circuit raises the
              field to 64 or 256 players and unlocks the organizer features bigger events lean on.{" "}
              {copy.phase === "preview" ? "Free while it’s in preview." : copy.phase === "announced" ? copy.short : "Circuit 64 starts at $12 a month."}
            </p>
            <div className="pro-hero__ctas">
              <Link href="/tournament/create" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Create a tournament</Button>
              </Link>
              <Link href="#tiers" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">See the tiers</Button>
              </Link>
            </div>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {/* Free in preview (or free until launch day) banner */}
        {copy.banner && <section className="beta-section">
          <div style={{ border: "1px solid var(--primary-300, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 8%, var(--surface-default))", borderRadius: "1rem", padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "center", textAlign: "center" }}>
            <span style={{ fontSize: "var(--font-size-24)" }}>✨</span>
            <p style={{ margin: 0, fontSize: "var(--font-size-16)", fontWeight: 600 }}>
              {copy.banner}
            </p>
          </div>
        </section>}

        {/* Marquee feature spotlights */}
        <section className="beta-section">
          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="Any size"
                title="From a 12-player night to a 256-player open"
                body="Big fields run in flights: split the field each round, race, and re-seed from the standings to group the leaders together or spread them across flights. Points accumulate all the way to a champion, no spreadsheet required."
                media={<StandingsShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Your format"
                title="Brackets, points, Swiss or Heat → Mains: your call"
                body="Single or double elimination, free-for-all points, Swiss rounds with a top cut, or the sprint-car Heat-to-Mains ladder. Run eliminations with a tap to say who moves on, let Swiss pair every round with no rematches, and record points or placements just as fast."
                media={<BracketShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                eyebrow="Every game we roll"
                title="Not just Mario Kart"
                body="Run Mario Kart with track and build rules, random-character rounds for Smash, Mario Party, Splatoon, Kirby Air Riders, Street Fighter 6 and Tekken 8, or a Pokémon League Cup style Swiss with deck lists checked as players send them. Any other game works by name, with your rules."
                media={<GamesShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="On screen"
                title="Put the competition on the broadcast"
                body="Streaming the event? Live scoring, the current match, and picks and bans composite straight onto the OBS overlay through GameShuffle Pro, so viewers follow every result in real time. Circuit 256 bundles Pro, so it's already included at that tier."
                media={<OverlayShot />}
                cta={{ label: "Explore GameShuffle Pro", href: "/gs-pro" }}
              />
            </Reveal>
          </div>
        </section>

        {/* Comparison table */}
        <section className="beta-section" style={{ marginTop: "var(--spacing-64)" }}>
          <div className="beta-section__head">
            <p className="marketing-eyebrow">Free vs Circuit</p>
            <h2 className="pricing-page__section-title">Every format is free. Pay for scale.</h2>
            <p className="beta-section__sub">Player count is the meter that sets the tier. The paid value is a real multi-lobby event plus four organizer features.</p>
          </div>
          <div style={{ overflowX: "auto", maxWidth: 880, margin: "0 auto" }}>
            <Table variant="striped" hoverable>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead align="center">Free</TableHead>
                  <TableHead align="center">Circuit 64</TableHead>
                  <TableHead align="center">Circuit 256</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPARE.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell align="center"><Cell v={row.free} /></TableCell>
                    <TableCell align="center"><Cell v={row.c64} /></TableCell>
                    <TableCell align="center"><Cell v={row.c256} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* In the works: the business side, held back on purpose (specs/monetization-launch-plan.md) */}
        <section className="beta-section" style={{ marginTop: "var(--spacing-64)" }}>
          <div className="beta-section__head">
            <p className="marketing-eyebrow">In the works</p>
            <h2 className="pricing-page__section-title">What&rsquo;s coming for organizers and venues</h2>
            <p className="beta-section__sub">The tournament side is ready today. The money side is built but switched off while we get the tax and organizer details right, and we&rsquo;d rather shape it with organizers than guess.</p>
          </div>
          <div className="circuit-works">
            <FeatureCard variant="full" icon="currency-dollar" availability="In the works" title="Paid entry"
              description="Sell entries to your tournament or game night, with payouts straight to your bank through Stripe. For now, every event is free to enter." />
            <FeatureCard variant="full" icon="calendar" availability="In the works" title="Circuit Events"
              description="A pass for larger in-person or commercial events: custom branding, more capacity, and help with setup on the day." />
            <FeatureCard variant="full" icon="building" availability="In the works" title="Venue partners"
              description="Run game nights or tournaments at a bar, game store, LAN center or convention? We're looking for a few venues to build this with." />
          </div>
          <p className="circuit-works__cta">
            Interested in any of these? <Link href="/contact-us">Tell us about your events</Link>.
          </p>
        </section>

      </Container>

      {/* Pricing — dark module, matching the GS Pro pricing band */}
      <DarkBand premium id="tiers" curved curveEdges="both" curveColor={PAGE_BG}>
        <p className="marketing-eyebrow" style={{ color: "var(--primary-300)", textAlign: "center" }}>Pick your scale</p>
        <h2 className="pricing-page__section-title pro-band__title" style={{ marginBottom: "var(--spacing-8)" }}>Plans by field size</h2>
        <p style={{ textAlign: "center", color: "var(--gray-300, #c2c8d2)", maxWidth: "40rem", margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
          Player count sets the tier: pick the one that fits your largest event. {copy.short}
        </p>
        <CircuitPricing launchedAt={copy.launchedAt} />
      </DarkBand>

      <Container>
        {/* FAQ — matching the GS Pro treatment (bordered accordion) */}
        <section className="pricing-page__faq">
          <h2 className="pricing-page__section-title">Common questions</h2>
          {/* Open by default: CDS Accordion only mounts an item once it's opened,
              so collapsed answers would be missing from the HTML (and from search). */}
          <Accordion
            variant="bordered"
            allowMultiple
            defaultOpenIds={["cost", "free", "adds", "bundle", "vs-pro"]}
            items={[
              { id: "cost", title: "How much does GameShuffle Circuit cost?", content: copy.cost },
              { id: "free", title: "What's free?", content: "Every format (single/double elimination, points, Swiss with a top cut, Heat to Mains, team modes), Pokémon TCG deck lists, multi-flight points, live scoring, a public join page, picks & bans and a waitlist, for one full lobby of your game (12 on MK8DX, 24 on MK World, 8 on Mario Party)." },
              { id: "adds", title: "What does Circuit add?", content: "A bigger field (Circuit 64 or Circuit 256) plus four organizer features: championship series, co-organizers, custom page branding, and custom seeding & redraw. Circuit Events is a per-tournament pass for in-person or commercial events." },
              { id: "bundle", title: "Does Circuit 256 really include GameShuffle Pro?", content: "Yes. Circuit 256 bundles a GameShuffle Pro subscription, so if you also stream your events you get the OBS overlay, Twitch and Discord integration, chat commands, and the token economy at no extra cost." },
              { id: "vs-pro", title: "Is it the same as GameShuffle Pro?", content: "No. GameShuffle Pro is for streamers (Twitch/Discord integration, overlay, chat commands, token economy). GameShuffle Circuit is for organizers running bigger tournaments. They're separate plans, and Circuit 256 includes Pro." },
            ]}
          />
        </section>
      </Container>

      {/* Final CTA */}
      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <div style={{ maxWidth: "48rem", margin: "0 auto", textAlign: "center" }}>
          <h2 className="pro-band__title pricing-page__section-title" style={{ marginBottom: "var(--spacing-16)" }}>
            Run your next event, any size
          </h2>
          <p style={{ margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
            {copy.cta}
          </p>
          <div className="strm-finalcta">
            <Link href="/tournament/create" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Create a tournament</Button>
            </Link>
            <Link href="/contact-us" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Talk to us</Button>
            </Link>
          </div>
        </div>
      </DarkBand>
    </main>
  );
}
