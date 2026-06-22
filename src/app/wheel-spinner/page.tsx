import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container, Stack } from "@empac/cascadeds";
import { WheelSpinner } from "@/components/wheel/WheelSpinner";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { DarkBand } from "@/components/marketing/DarkBand";

export const metadata: Metadata = {
  title: "Free Wheel Spinner — Random Picker Wheel",
  description:
    "A free online wheel spinner. Add your options, spin the wheel, and let it pick a random winner — no account, no download. Remove winners for raffles and elimination. Put it on your stream with GameShuffle Pro.",
  openGraph: {
    title: "Free Wheel Spinner — GameShuffle",
    description:
      "Spin a random picker wheel for free. Add options, spin, pick a winner — no account needed.",
    url: "https://www.gameshuffle.co/wheel-spinner",
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/wheel-spin-og.jpg"],
  },
  alternates: { canonical: "https://www.gameshuffle.co/wheel-spinner" },
};

export default function WheelSpinnerPage() {
  return (
    <main>
      <MarketingJsonLd
        appName="GameShuffle Wheel Spinner"
        appDescription={metadata.description as string}
        appUrl="/wheel-spinner"
        appCategory="UtilitiesApplication"
        breadcrumb={{ label: "Wheel Spinner", path: "/wheel-spinner" }}
        howTo={{
          name: "How to use the wheel spinner",
          steps: [
            { name: "Add your options", text: "Type one option per line — names, foods, chores, anything. The wheel updates as you type." },
            { name: "Spin", text: "Click Spin (or the wheel) and watch it ease to a stop on a random winner." },
            { name: "Draw or eliminate", text: "Turn on “remove the winner” to run raffles, pick an order, or eliminate options one by one." },
          ],
        }}
      />

      <Container>
        {/* Header */}
        <section style={{ textAlign: "center", margin: "var(--spacing-48) 0 var(--spacing-32)", maxWidth: "52rem", marginInline: "auto" }}>
          <h1 style={{ fontSize: "var(--font-size-fluid-h2)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)", lineHeight: "var(--line-height-tight)" }}>
            Free Wheel Spinner
          </h1>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)" }}>
            Add your options, give it a spin, and let the wheel pick a random winner.
            Free, instant, and no account required.
          </p>
        </section>

        {/* The tool */}
        <section style={{ margin: "0 0 var(--spacing-64)" }}>
          <WheelSpinner />
        </section>

        {/* How it works */}
        <section style={{ margin: "var(--spacing-80) 0" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-16)", lineHeight: "var(--line-height-tight)" }}>
            How to use the wheel spinner
          </h2>
          <ol className="app-steps">
            <li className="app-steps__item">
              <span className="app-steps__num" aria-hidden="true">1</span>
              <div>
                <h3 className="app-steps__title">Add your options</h3>
                <p className="app-steps__body">Type one option per line — names, foods, chores, anything. The wheel updates as you type.</p>
              </div>
            </li>
            <li className="app-steps__item">
              <span className="app-steps__num" aria-hidden="true">2</span>
              <div>
                <h3 className="app-steps__title">Spin</h3>
                <p className="app-steps__body">Click Spin (or the wheel) and watch it ease to a stop on a random winner.</p>
              </div>
            </li>
            <li className="app-steps__item">
              <span className="app-steps__num" aria-hidden="true">3</span>
              <div>
                <h3 className="app-steps__title">Draw or eliminate</h3>
                <p className="app-steps__body">Turn on “remove the winner” to run raffles, pick an order, or eliminate options one by one.</p>
              </div>
            </li>
          </ol>
        </section>

      </Container>

      {/* Pro cross-sell */}
      <DarkBand>
        <div style={{ textAlign: "center", maxWidth: "60rem", marginInline: "auto" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)", lineHeight: "var(--line-height-tight)" }}>
            Spin it live on your stream
          </h2>
          <p style={{ fontSize: "var(--font-size-18)", lineHeight: "var(--line-height-relaxed)", margin: "0 auto var(--spacing-24)", maxWidth: "52rem" }}>
            With GameShuffle Pro, this wheel spins right on your OBS overlay — triggered from
            your dashboard or chat — and your viewers can add options live from chat. No
            separate browser source required.
          </p>
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <Link href="/gs-pro" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Explore GameShuffle Pro</Button>
            </Link>
            <Link href="/tools" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">More free tools</Button>
            </Link>
          </Stack>
        </div>
      </DarkBand>
    </main>
  );
}
