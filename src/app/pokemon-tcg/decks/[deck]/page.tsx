import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Container } from "@empac/cascadeds";
import { DeckBody } from "@/components/decks/DeckBody";
import {
  DECK_TIERS,
  getAllDecks,
  getDeckBySlug,
  getDeckSlugs,
  orderedTierBadges,
  type Deck,
} from "@/lib/decks";
import { getBattleBoxForDeck } from "@/lib/battle-boxes";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { MARQUEE_BY_DECK } from "@/data/tcg-featured";
import { DeckCardFan } from "@/components/tcg/DeckCardFan";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import type { TcgCard } from "@/lib/scrydex/types";
import { TCG_HUB_LIVE } from "@/data/tcg-hub";
import { TCG_SHOP_URL } from "@/data/shop";

/**
 * Deck detail page — `/pokemon-tcg/decks/[deck]`. Renders one deck guide.
 * Load-bearing for the SEO cluster: every detail page links UP to the hub
 * and to the `/pokemon-tcg` shop page (internal-link authority funnel).
 */

const SITE = "https://www.gameshuffle.co";

export function generateStaticParams() {
  return getDeckSlugs().map((deck) => ({ deck }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deck: string }>;
}): Promise<Metadata> {
  const { deck } = await params;
  const d = getDeckBySlug(deck);
  if (!d) return {};
  const fm = d.frontmatter;
  return {
    title: fm.title,
    description: fm.meta_description,
    openGraph: {
      title: fm.title,
      description: fm.meta_description,
      url: fm.canonical,
      type: "article",
      images: fm.og_image ? [fm.og_image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: fm.title,
      description: fm.meta_description,
    },
    alternates: { canonical: fm.canonical },
    // The deck cluster funnels to /pokemon-tcg — hold indexing until the
    // whole TCG surface is live (shares the shop page's launch flag).
    robots: TCG_HUB_LIVE ? undefined : { index: false, follow: false },
  };
}

/** One deck from each tier the current deck is NOT in, to reinforce the
 *  cluster. Deduped by slug (multi-tier decks could match twice). */
function relatedAcrossTiers(current: Deck): Deck[] {
  const all = getAllDecks();
  const out: Deck[] = [];
  const seen = new Set<string>([current.frontmatter.slug]);
  for (const tier of DECK_TIERS) {
    if (current.frontmatter.tiers.includes(tier)) continue;
    const pick = all.find(
      (d) => d.frontmatter.tiers.includes(tier) && !seen.has(d.frontmatter.slug),
    );
    if (pick) {
      out.push(pick);
      seen.add(pick.frontmatter.slug);
    }
  }
  return out;
}

export default async function Page({
  params,
}: {
  params: Promise<{ deck: string }>;
}) {
  const { deck } = await params;
  const d = getDeckBySlug(deck);
  if (!d) notFound();
  const fm = d.frontmatter;
  const related = relatedAcrossTiers(d);

  // Beginner "matched pair" cross-links (Battle Box). Absent for solo decks.
  const battleBox = fm.battle_box_partner ? getBattleBoxForDeck(fm.slug) : null;
  const partner = fm.battle_box_partner
    ? getDeckBySlug(fm.battle_box_partner)
    : null;

  // Real card art for decks with a curated marquee set (read-only, 0 credits).
  const marqueeCards = await getCatalogCards(MARQUEE_BY_DECK[fm.slug] ?? []);
  // Name → card map so the decklist table rows can show a thumbnail inline.
  const cardsByName = new Map<string, TcgCard>();
  for (const c of marqueeCards) {
    cardsByName.set(c.name.toLowerCase().replace(/\s+/g, " ").trim(), c);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: fm.title,
        description: fm.meta_description,
        dateModified: fm.last_verified,
        author: { "@type": "Organization", name: "GameShuffle" },
        publisher: { "@type": "Organization", name: "GameShuffle" },
        mainEntityOfPage: fm.canonical,
        ...(fm.og_image ? { image: `${SITE}${fm.og_image}` } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Decks", item: `${SITE}/pokemon-tcg/decks` },
          { "@type": "ListItem", position: 3, name: fm.archetype, item: fm.canonical },
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
        <div className="deck-detail">
        {/* Breadcrumb — backlinks are load-bearing for the cluster */}
        <nav className="deck-breadcrumb" aria-label="Breadcrumb">
          <Link href="/pokemon-tcg">Pokémon TCG</Link>
          <span aria-hidden="true"> › </span>
          <Link href="/pokemon-tcg/decks">Decks</Link>
          <span aria-hidden="true"> › </span>
          <span className="deck-breadcrumb__current">{fm.archetype}</span>
        </nav>

        {/* Header */}
        <header className="deck-detail__header">
          <h1 className="deck-detail__title">{fm.title}</h1>
          {/* Tier badges (one per tier the deck belongs to) */}
          <div className="deck-detail__stats">
            {orderedTierBadges(fm.tiers).map((b) => (
              <Badge key={b.tier} variant={b.variant} size="small">
                {b.label}
              </Badge>
            ))}
          </div>
          {/* Neutral stats row (kept gray so tier colors stay legible) */}
          <div className="deck-detail__stats">
            <Badge variant="default" size="small">
              {fm.format}
            </Badge>
            {fm.cost_estimate ? (
              <Badge variant="default" size="small">
                {fm.cost_estimate}
              </Badge>
            ) : null}
            {fm.difficulty ? (
              <Badge variant="default" size="small">
                {fm.difficulty}
              </Badge>
            ) : null}
          </div>
          {/* Win rate renders ONLY with a citation (provable-only rule) */}
          {fm.win_rate && fm.win_rate_source ? (
            <p className="deck-detail__winrate">
              <strong>Win rate:</strong> {fm.win_rate}{" "}
              {/^https?:\/\//.test(fm.win_rate_source) ? (
                <a
                  href={fm.win_rate_source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="deck-detail__winrate-src"
                >
                  (source)
                </a>
              ) : (
                <span className="deck-detail__winrate-src">
                  ({fm.win_rate_source})
                </span>
              )}
            </p>
          ) : null}
        </header>

        {/* Fanned card-art hero (decks with a curated marquee set) */}
        {marqueeCards.length > 0 ? (
          <DeckCardFan cards={marqueeCards} variant="header" />
        ) : null}

        {/* Battle Box cross-link — beginner matched pairs (spec §3) */}
        {battleBox && partner ? (
          <aside className="deck-battlebox-note">
            <p className="deck-battlebox-note__lead">
              🥊 Part of the{" "}
              <strong>
                {battleBox.frontmatter.title.split("—")[0].trim()}
              </strong>
              , a matched pair built to learn the game together.
            </p>
            <div className="deck-battlebox-note__links">
              <Link
                href={`/pokemon-tcg/decks/battle-box/${battleBox.frontmatter.slug}`}
              >
                See the Battle Box →
              </Link>
              <Link href={`/pokemon-tcg/decks/${partner.frontmatter.slug}`}>
                Play against {partner.frontmatter.archetype} →
              </Link>
            </div>
          </aside>
        ) : null}

        {/* Guide body — decklist tables show inline card thumbnails when a
            marquee set is available (cardsByName). */}
        <DeckBody markdown={d.body} cardsByName={cardsByName} />
        {marqueeCards.length > 0 ? (
          <TcgAttribution className="tcg-featured__attr" />
        ) : null}

        {/* End CTA — primary "shop the cards" goes to the actual TCGplayer
            store; secondary keeps the internal funnel to the deck index. */}
        <section className="deck-cta">
          <p className="deck-cta__text">
            Build this deck from GameShuffle singles.
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
            <Link href="/pokemon-tcg/decks" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">
                Browse all decks
              </Button>
            </Link>
          </div>
        </section>

        {/* Related / cluster links */}
        <section className="deck-related">
          <h2 className="tcg-h2">Keep exploring</h2>
          <ul className="deck-related__list">
            <li>
              <Link href="/pokemon-tcg/decks">← All Standard 2026 decks</Link>
            </li>
            {related.map((r) => {
              const primary = orderedTierBadges(r.frontmatter.tiers)[0];
              return (
                <li key={r.frontmatter.slug}>
                  <Link href={`/pokemon-tcg/decks/${r.frontmatter.slug}`}>
                    {primary ? `${primary.label}: ` : ""}
                    {r.frontmatter.archetype} →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Verification footer (decay management) */}
        <footer className="deck-verify">
          <p>
            List verified <strong>{fm.last_verified}</strong>. The Standard
            format rotates, so decklists decay. This page is scheduled for
            review by <strong>{fm.review_by}</strong>. Always check the
            regulation mark reads H, I, or J before sleeving cards for a
            sanctioned event.
          </p>
        </footer>
        </div>
      </Container>
    </main>
  );
}
