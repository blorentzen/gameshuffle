import type { Metadata } from "next";
import Link from "next/link";
import { Accordion, Button, Container, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@empac/cascadeds";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { Reveal } from "@/components/marketing/Reveal";
import { ProSpotlight } from "@/components/marketing/ProSpotlight";
import { OverlayShot } from "@/components/marketing/ProFeatureShots";
import { BracketShot, StandingsShot } from "@/components/marketing/CircuitFeatureShots";
import { CircuitPricing } from "@/components/marketing/CircuitPricing";

export const metadata: Metadata = {
  title: "GameShuffle Circuit: run bigger tournaments",
  description:
    "GameShuffle Circuit is the organizer plan for bigger events. Every format is free for one full lobby (12 on MK8DX, 24 on MK World). Circuit 64 and Circuit 256 raise the field and unlock championship series, co-organizers, custom page branding, and custom seeding. Circuit Events covers in-person and commercial fields. Free during preview.",
  openGraph: {
    title: "GameShuffle Circuit",
    url: "https://www.gameshuffle.co/gs-circuit",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/gs-circuit" },
};

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/** Free vs Circuit at launch — every format is free; the meter is field size and
 *  four organizer features. Everything is free during preview. */
const COMPARE: { label: string; free: string | boolean; c64: string | boolean; c256: string | boolean }[] = [
  { label: "Players per event", free: "One full lobby", c64: "Up to 64", c256: "Up to 256" },
  { label: "Every format (single/double elim, points, Heat → Mains)", free: true, c64: true, c256: true },
  { label: "Team modes (2v2 … 6v6)", free: true, c64: true, c256: true },
  { label: "Multi-flight points + custom lobby rules", free: true, c64: true, c256: true },
  { label: "Live scoring, public join page, picks & bans", free: true, c64: true, c256: true },
  { label: "Championship series (seasons + standings)", free: false, c64: true, c256: true },
  { label: "Co-organizers (share edit access)", free: false, c64: true, c256: true },
  { label: "Custom page branding (header + theme)", free: false, c64: true, c256: true },
  { label: "Custom seeding + redraw", free: false, c64: true, c256: true },
  { label: "GameShuffle Pro included", free: false, c64: false, c256: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span>;
  if (v === false) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  return <span style={{ fontWeight: 700 }}>{v}</span>;
}

export default function GsCircuitPage() {
  return (
    <main className="pricing-page-main" style={{ background: PAGE_BG }}>
      <MarketingJsonLd
        appName="GameShuffle Circuit"
        appDescription="The organizer plan for bigger tournaments. Every format is free for one full lobby; Circuit 64 and Circuit 256 raise the field and unlock championship series, co-organizers, custom page branding, and custom seeding; Circuit Events covers in-person and commercial fields. Free during preview."
        appUrl="/gs-circuit"
        breadcrumb={{ label: "GameShuffle Circuit", path: "/gs-circuit" }}
        faq={[
          { q: "How much does GameShuffle Circuit cost?", a: "It's free during preview — nothing is charged today. The prices shown are planned for launch and may change. When paid tiers go live, you'll get advance notice." },
          { q: "What's free?", a: "Every format (single/double elimination, points, Heat to Mains, team modes), multi-flight points, live scoring, a public join page, and picks & bans — for one full lobby of your game (12 on MK8DX, 24 on MK World)." },
          { q: "What does GameShuffle Circuit add?", a: "A bigger field (Circuit 64 or Circuit 256) plus four organizer features: championship series, co-organizers, custom page branding, and custom seeding & redraw. Circuit Events is a per-tournament pass for in-person or commercial events." },
          { q: "Is it the same as GameShuffle Pro?", a: "No. GameShuffle Pro is for streamers (Twitch/Discord integration, overlay, chat commands, token economy). GameShuffle Circuit is for organizers running bigger tournaments. They're separate plans." },
        ]}
      />

      {/* Hero — premium dark, matching the GS Pro hero scale */}
      <section className="pro-hero">
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">GameShuffle Circuit · free during preview</p>
            <h1 className="pro-hero__title">Run bigger tournaments.</h1>
            <p className="pro-hero__sub">
              Every format is free for one full lobby of your game. GameShuffle Circuit raises the
              field to 64 or 256 players and unlocks the organizer features bigger events lean on.
              Free while it&rsquo;s in preview.
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
        {/* Free in preview banner */}
        <section className="beta-section">
          <div style={{ border: "1px solid var(--primary-300, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 8%, var(--surface-default))", borderRadius: "1rem", padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "center", textAlign: "center" }}>
            <span style={{ fontSize: "var(--font-size-24)" }}>✨</span>
            <p style={{ margin: 0, fontSize: "var(--font-size-16)", fontWeight: 600 }}>
              GameShuffle Circuit is <strong>free during preview</strong> — run events as big as you like right now.
              The prices below are planned for launch, and you&rsquo;ll get notice before anything changes.
            </p>
          </div>
        </section>

        {/* Marquee feature spotlights */}
        <section className="beta-section">
          <div className="pro-spotlights">
            <Reveal>
              <ProSpotlight
                eyebrow="Any size"
                title="From a 12-player night to a 256-player open"
                body="Big fields run in flights: split the field each round, race, and re-seed from the standings — group the leaders together or spread them across flights. Points accumulate all the way to a champion, no spreadsheet required."
                media={<StandingsShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
                reverse
                eyebrow="Your format"
                title="Brackets, points, Heat → Mains — your call"
                body="Single or double elimination, free-for-all points, or the sprint-car Heat-to-Mains ladder. Run eliminations with a tap to say who moves on, and record points or placements just as fast."
                media={<BracketShot />}
              />
            </Reveal>
            <Reveal>
              <ProSpotlight
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
            <h2 className="pricing-page__section-title">Every format is free — pay for scale</h2>
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

      </Container>

      {/* Pricing — dark module, matching the GS Pro pricing band */}
      <DarkBand premium id="tiers" curved curveEdges="both" curveColor={PAGE_BG}>
        <p className="marketing-eyebrow" style={{ color: "var(--primary-300)", textAlign: "center" }}>Pick your scale</p>
        <h2 className="pricing-page__section-title pro-band__title" style={{ marginBottom: "var(--spacing-8)" }}>Plans by field size</h2>
        <p style={{ textAlign: "center", color: "var(--gray-300, #c2c8d2)", maxWidth: "40rem", margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
          Player count sets the tier — pick the one that fits your largest event. Free during preview.
        </p>
        <CircuitPricing />
      </DarkBand>

      <Container>
        {/* FAQ — matching the GS Pro treatment (bordered accordion) */}
        <section className="pricing-page__faq">
          <h2 className="pricing-page__section-title">Common questions</h2>
          <Accordion
            variant="bordered"
            items={[
              { id: "cost", title: "How much does GameShuffle Circuit cost?", content: "It's free during preview — nothing is charged today. The prices shown are planned for launch and may change. You'll get advance notice before paid tiers go live." },
              { id: "free", title: "What's free?", content: "Every format (single/double elimination, points, Heat to Mains, team modes), multi-flight points, live scoring, a public join page, and picks & bans — for one full lobby of your game (12 on MK8DX, 24 on MK World)." },
              { id: "adds", title: "What does Circuit add?", content: "A bigger field (Circuit 64 or Circuit 256) plus four organizer features: championship series, co-organizers, custom page branding, and custom seeding & redraw. Circuit Events is a per-tournament pass for in-person or commercial events." },
              { id: "bundle", title: "Does Circuit 256 really include GameShuffle Pro?", content: "Yes. Circuit 256 bundles a GameShuffle Pro subscription, so if you also stream your events you get the OBS overlay, Twitch and Discord integration, chat commands, and the token economy at no extra cost. On Circuit 64 you can add Pro for $5/mo (or $50/yr) alongside your plan." },
              { id: "vs-pro", title: "Is it the same as GameShuffle Pro?", content: "No. GameShuffle Pro is for streamers (Twitch/Discord integration, overlay, chat commands, token economy). GameShuffle Circuit is for organizers running bigger tournaments. They're separate plans — Circuit 256 bundles Pro." },
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
            Everything&rsquo;s free during preview. Spin up a tournament and see how it runs.
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
