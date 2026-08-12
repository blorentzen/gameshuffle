import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Container } from "@empac/cascadeds";
import { DeckBody } from "@/components/decks/DeckBody";
import {
  getBattleBoxBySlug,
  getBattleBoxSlugs,
} from "@/lib/battle-boxes";
import { getDeckBySlug, type Deck } from "@/lib/decks";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { MARQUEE_BY_DECK } from "@/data/tcg-featured";
import type { TcgCard } from "@/lib/scrydex/types";
import { DeckCardFan } from "@/components/tcg/DeckCardFan";
import { TCG_HUB_LIVE } from "@/data/tcg-hub";

/**
 * Battle Box wrapper — `/pokemon-tcg/decks/battle-box/[slug]`. A thin
 * "buy the box / learn together" conversion surface that frames two beginner
 * decks as a matched pair. The two deck detail pages do the per-keyword SEO
 * work; this page owns the pair story and funnels to both + the shop.
 * See `specs/tcg-setup/gameshuffle-battle-box-claude-code-spec.md`.
 */

const SITE = "https://www.gameshuffle.co";

export function generateStaticParams() {
  return getBattleBoxSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const box = getBattleBoxBySlug(slug);
  if (!box) return {};
  const fm = box.frontmatter;
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
    // Shares the TCG surface's launch flag — noindex until the shop is live.
    robots: TCG_HUB_LIVE ? undefined : { index: false, follow: false },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const box = getBattleBoxBySlug(slug);
  if (!box) notFound();
  const fm = box.frontmatter;

  // Roles come from the wrapper frontmatter so each box labels its own pair
  // (Box #1: hit fast / build up; Box #2: tempo / status).
  const decks: { role: string; deck: Deck }[] = (
    [
      { slug: fm.deck_a, role: fm.deck_a_role },
      { slug: fm.deck_b, role: fm.deck_b_role },
    ] as const
  )
    .map(({ slug: s, role }) => {
      const deck = getDeckBySlug(s);
      return deck ? { role: role || "Deck", deck } : null;
    })
    .filter((x): x is { role: string; deck: Deck } => x !== null);

  // Fanned card art for each deck in the pair (top 4). Read-only, 0 credits.
  const fansBySlug: Record<string, TcgCard[]> = {};
  for (const { deck } of decks) {
    const ids = MARQUEE_BY_DECK[deck.frontmatter.slug];
    if (ids?.length) {
      fansBySlug[deck.frontmatter.slug] = await getCatalogCards(ids.slice(0, 4));
    }
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: fm.title,
        description: fm.meta_description,
        itemListElement: decks.map((d, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: d.deck.frontmatter.archetype,
          url: `${SITE}/pokemon-tcg/decks/${d.deck.frontmatter.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Decks", item: `${SITE}/pokemon-tcg/decks` },
          { "@type": "ListItem", position: 3, name: "Battle Box", item: fm.canonical },
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
        {/* Breadcrumb — backlinks are load-bearing for the cluster */}
        <nav className="deck-breadcrumb" aria-label="Breadcrumb">
          <Link href="/pokemon-tcg">Pokémon TCG</Link>
          <span aria-hidden="true"> › </span>
          <Link href="/pokemon-tcg/decks">Decks</Link>
          <span aria-hidden="true"> › </span>
          <span className="deck-breadcrumb__current">Battle Box</span>
        </nav>

        {/* Header */}
        <header className="deck-detail__header">
          <h1 className="deck-detail__title">{fm.title}</h1>
          <div className="deck-detail__stats">
            <Badge variant="info" size="small">
              Battle Box
            </Badge>
            {fm.cost_estimate ? (
              <Badge variant="success" size="small">
                {fm.cost_estimate}
              </Badge>
            ) : null}
          </div>
          <p className="deck-detail__winrate">
            Two decks: everything two players need to learn the game together.
          </p>
        </header>

        {/* The two decks, two-up */}
        <section className="battle-box-duo" aria-label="The two decks">
          {decks.map(({ role, deck }) => {
            const d = deck.frontmatter;
            return (
              <Link
                key={d.slug}
                href={`/pokemon-tcg/decks/${d.slug}`}
                className="deck-tile deck-tile--featured"
              >
                {fansBySlug[d.slug]?.length ? (
                  <DeckCardFan cards={fansBySlug[d.slug]} />
                ) : null}
                <div className="deck-tile__badges">
                  <Badge variant="info" size="small">
                    {role}
                  </Badge>
                  {d.difficulty ? (
                    <Badge variant="default" size="small">
                      {d.difficulty}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="deck-tile__name">{d.archetype}</h2>
                <p className="deck-tile__desc">{d.meta_description}</p>
                <div className="deck-tile__meta">
                  {d.cost_estimate} · Full guide →
                </div>
              </Link>
            );
          })}
        </section>

        {/* Teaching narrative + first-game walkthrough (MDX body) */}
        <DeckBody markdown={box.body} />

        {/* Shop CTA band → the shop page (internal-link funnel) */}
        <section className="deck-cta">
          <p className="deck-cta__text">
            Get the full Battle Box: both decks, built from GameShuffle
            singles.
          </p>
          <Link href="/pokemon-tcg" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="large">
              Build the Battle Box from GameShuffle singles →
            </Button>
          </Link>
        </section>

        {/* Related / cluster links */}
        <section className="deck-related">
          <h2 className="tcg-h2">Keep exploring</h2>
          <ul className="deck-related__list">
            {decks.map(({ deck }) => (
              <li key={deck.frontmatter.slug}>
                <Link href={`/pokemon-tcg/decks/${deck.frontmatter.slug}`}>
                  {deck.frontmatter.archetype}: full deck guide →
                </Link>
              </li>
            ))}
            <li>
              <Link href="/pokemon-tcg/decks">← All Standard 2026 decks</Link>
            </li>
            <li>
              <Link href="/pokemon-tcg">Shop Pokémon singles &amp; decks →</Link>
            </li>
          </ul>
        </section>

        {/* Verification footer (decay management) */}
        <footer className="deck-verify">
          <p>
            Battle Box verified <strong>{fm.last_verified}</strong>. The
            Standard format rotates, so decklists decay. This page is scheduled
            for review by <strong>{fm.review_by}</strong>. Some cards in the two
            decks are pending a final verification pass; see each deck page for
            details.
          </p>
        </footer>
      </Container>
    </main>
  );
}
