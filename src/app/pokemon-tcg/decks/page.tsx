import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Container } from "@empac/cascadeds";
import { DeckGrid, type DeckCardData } from "@/components/decks/DeckGrid";
import {
  DECK_TIERS,
  getAllDecks,
  getFeaturedByTier,
  orderedTierBadges,
} from "@/lib/decks";
import { getAllBattleBoxes } from "@/lib/battle-boxes";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { MARQUEE_BY_DECK } from "@/data/tcg-featured";
import type { TcgCard } from "@/lib/scrydex/types";
import { DeckCardFan } from "@/components/tcg/DeckCardFan";
import { TCG_HUB_LIVE } from "@/data/tcg-hub";
import { TCG_SHOP_URL } from "@/data/shop";

/**
 * Deck hub — `/pokemon-tcg/decks`. Topic-cluster authority node: reads all
 * deck frontmatter at build time, features one deck per tier, lists them
 * all with a tier filter, and links up to the `/pokemon-tcg` shop page.
 */

const SITE = "https://www.gameshuffle.co";
const HUB_URL = `${SITE}/pokemon-tcg/decks`;

export const metadata: Metadata = {
  title: "Pokémon TCG Decks — Standard 2026 Deck Lists & Guides",
  description:
    "Browse Standard 2026 Pokémon TCG deck lists — competitive, beginner, and meme builds with full lists, budget swaps, and matchups. Build any of them from GameShuffle singles.",
  openGraph: {
    title: "Pokémon TCG Decks — Standard 2026 Deck Lists & Guides",
    description:
      "Standard 2026 Pokémon TCG deck lists and guides — competitive, beginner, and meme builds, buildable from GameShuffle singles.",
    url: HUB_URL,
    type: "website",
  },
  alternates: { canonical: HUB_URL },
  robots: TCG_HUB_LIVE ? undefined : { index: false, follow: false },
};

export default async function Page() {
  const decks = getAllDecks();
  const featured = getFeaturedByTier();
  const battleBoxes = getAllBattleBoxes();

  // Fanned card art (top 4) for EVERY deck with a curated marquee set — used
  // on both the Featured tiles and the All-decks grid tiles. Read-only, 0
  // credits.
  const fansBySlug: Record<string, TcgCard[]> = {};
  for (const d of decks) {
    const ids = MARQUEE_BY_DECK[d.frontmatter.slug];
    if (ids?.length) {
      fansBySlug[d.frontmatter.slug] = await getCatalogCards(ids.slice(0, 4));
    }
  }

  const cardData: DeckCardData[] = decks.map((d) => ({
    slug: d.frontmatter.slug,
    archetype: d.frontmatter.archetype,
    tiers: d.frontmatter.tiers,
    deck_type: d.frontmatter.deck_type,
    win_rate: d.frontmatter.win_rate,
    win_rate_source: d.frontmatter.win_rate_source,
    cost_estimate: d.frontmatter.cost_estimate,
    difficulty: d.frontmatter.difficulty,
    meta_description: d.frontmatter.meta_description,
    fan: fansBySlug[d.frontmatter.slug],
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Pokémon TCG Standard 2026 deck lists",
        itemListElement: decks.map((d, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: d.frontmatter.archetype,
          url: `${SITE}/pokemon-tcg/decks/${d.frontmatter.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Decks", item: HUB_URL },
        ],
      },
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Container>
        {/* Breadcrumb */}
        <nav className="deck-breadcrumb" aria-label="Breadcrumb">
          <Link href="/pokemon-tcg">Pokémon TCG</Link>
          <span aria-hidden="true"> › </span>
          <span className="deck-breadcrumb__current">Decks</span>
        </nav>

        <h1 className="deck-detail__title">Pokémon TCG Decks — Standard 2026</h1>
        <p className="deck-hub__intro">
          Full deck lists and guides for the current Standard format —
          competitive tournament builds, beginner-friendly starters, and meme
          decks for the bit. Every list is buildable from{" "}
          <Link href="/pokemon-tcg">GameShuffle singles</Link>, with budget
          swaps called out on each page.
        </p>

        {/* Featured — one per tier */}
        {DECK_TIERS.some((t) => featured[t]) && (
          <section>
            <h2 className="deck-hub__section-title">Featured decks</h2>
            <div className="deck-featured-grid">
              {DECK_TIERS.map((tier) => {
                const d = featured[tier];
                if (!d) return null;
                const fm = d.frontmatter;
                return (
                  <Link
                    key={tier}
                    href={`/pokemon-tcg/decks/${fm.slug}`}
                    className="deck-tile deck-tile--featured"
                  >
                    {fansBySlug[fm.slug]?.length ? (
                      <DeckCardFan cards={fansBySlug[fm.slug]} />
                    ) : null}
                    <div className="deck-tile__badges">
                      {orderedTierBadges(fm.tiers).map((b) => (
                        <Badge key={b.tier} variant={b.variant} size="small">
                          {b.label}
                        </Badge>
                      ))}
                      {fm.win_rate && fm.win_rate_source ? (
                        <Badge variant="success" size="small">
                          {(fm.win_rate.match(/[0-9.]+%/) || ["Meta"])[0]}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="deck-tile__name">{fm.archetype}</h3>
                    <p className="deck-tile__desc">{fm.meta_description}</p>
                    <div className="deck-tile__meta">
                      {fm.cost_estimate} · {fm.difficulty}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Battle Boxes — beginner matched pairs, framed for two players */}
        {battleBoxes.length > 0 && (
          <section>
            <h2 className="deck-hub__section-title">Battle Boxes</h2>
            <p
              className="tcg-prose"
              style={{ marginBottom: "var(--spacing-24)" }}
            >
              New to the game, or teaching someone? A Battle Box is two decks
              built to be played against each other — everything two players need
              to learn Pokémon TCG together.
            </p>
            <div className="deck-featured-grid">
              {battleBoxes.map((box) => {
                const bf = box.frontmatter;
                return (
                  <Link
                    key={bf.slug}
                    href={`/pokemon-tcg/decks/battle-box/${bf.slug}`}
                    className="deck-tile deck-tile--featured"
                  >
                    <div className="deck-tile__badges">
                      <Badge variant="info" size="small">
                        Battle Box
                      </Badge>
                      {bf.cost_estimate ? (
                        <Badge variant="success" size="small">
                          {bf.cost_estimate}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="deck-tile__name">
                      {bf.title.split("—")[0].trim()}
                    </h3>
                    <p className="deck-tile__desc">{bf.meta_description}</p>
                    <div className="deck-tile__meta">Two decks · Full guide →</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Full filterable grid */}
        <section>
          <h2 className="deck-hub__section-title">All decks</h2>
          <DeckGrid decks={cardData} />
        </section>

        {/* Shop CTA band — primary → the TCGplayer store; secondary → the
            all-up GameShuffle TCG page. */}
        <section className="deck-cta">
          <p className="deck-cta__text">
            Found your deck? Build it from GameShuffle singles.
          </p>
          <div className="deck-cta__actions">
            <a
              href={TCG_SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <Button variant="primary" size="large">
                Shop the cards →
              </Button>
            </a>
            <Link href="/pokemon-tcg" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">
                GameShuffle TCG
              </Button>
            </Link>
          </div>
        </section>
      </Container>
    </main>
  );
}
