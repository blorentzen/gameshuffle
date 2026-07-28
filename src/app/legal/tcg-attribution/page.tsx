import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "TCG Card Attribution & Rights",
  description:
    "Attribution and intellectual-property notice for Pokémon Trading Card Game data and imagery shown in the GameShuffle TCG Companion. Card data provided by Scrydex.",
  openGraph: {
    title: "TCG Card Attribution & Rights | GameShuffle",
    description:
      "Attribution and IP notice for Pokémon TCG data and imagery in the GameShuffle Companion.",
    url: "https://www.gameshuffle.co/legal/tcg-attribution",
  },
  alternates: { canonical: "https://www.gameshuffle.co/legal/tcg-attribution" },
  robots: { index: true, follow: true },
};

/**
 * Standalone attribution page (spec Phase 6, placement #2). Crawlable, linked
 * from the Companion footer attribution line and from the ToS. Substance is
 * fixed by the spec; the exact Scrydex attribution wording is pending
 * confirmation (open item A4) and is called out inline.
 */
export default function Page() {
  return (
    <main className="legal-page-v2">
      <Container>
        <header className="legal-page-v2__header">
          <p className="legal-page-v2__eyebrow">Legal</p>
          <h1 className="legal-page-v2__title">
            TCG Card Attribution &amp; Rights
          </h1>
          <p className="legal-page-v2__intro">
            This notice covers the trading-card data and imagery displayed in the
            GameShuffle TCG Companion. You pay GameShuffle for tooling — never for
            card art or card data.
          </p>
        </header>

        <section className="legal-page-v2__section-body">
          <h2>Pokémon Trading Card Game intellectual property</h2>
          <p>
            Card names, card images, and card game text are the property of The
            Pokémon Company International, Nintendo, Creatures Inc., and GAME
            FREAK inc. All related characters, names, and marks are trademarks of
            their respective owners.
          </p>

          <h2>No affiliation</h2>
          <p>
            GameShuffle is not affiliated with, endorsed by, sponsored by, or
            approved by The Pokémon Company International, Nintendo, Creatures
            Inc., GAME FREAK inc., or any of their subsidiaries or affiliates.
          </p>

          <h2>No ownership claim</h2>
          <p>
            GameShuffle claims no ownership of card imagery or card game text.
            These materials are displayed for identification and gameplay-tracking
            purposes only. GameShuffle&rsquo;s paid features cover software tooling
            (collection tracking, deck building, and companion utilities) — not
            the card art or card data themselves.
          </p>

          <h2>Card data source</h2>
          <p>
            Card data and imagery are provided by Scrydex.{" "}
            <em>
              (Final attribution wording is being confirmed with Scrydex and may
              be updated.)
            </em>
          </p>

          <h2>Rights-holder inquiries</h2>
          <p>
            If you are a rights holder with a question or concern about material
            shown here, contact us at{" "}
            <a href="mailto:legal@gameshuffle.co">legal@gameshuffle.co</a> and we
            will respond promptly.
          </p>

          <p>
            See also our <a href="/terms">Terms of Service</a> and{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </section>
      </Container>
    </main>
  );
}
