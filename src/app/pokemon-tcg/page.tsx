import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Button,
  CarouselItem,
  Container,
  Stack,
} from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import {
  COMPANION,
  FAQ,
  FEATURED_CARDS,
  HERO,
  META,
  REVIEWS,
  TCG_HUB_LIVE,
  TCG_HUB_PATH,
  TCG_MY_CARDS_HREF,
} from "@/data/tcg-hub";
import { TCG_SHOP_URL } from "@/data/shop";
import {
  DECK_TIERS,
  getDeckBySlug,
  getFeaturedByTier,
  orderedTierBadges,
  type Deck,
} from "@/lib/decks";
import {
  getPublicFeaturedShopCards,
  getRecentlySoldCards,
} from "@/lib/shop/featuredCards";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { MARQUEE_BY_DECK } from "@/data/tcg-featured";
import type { TcgCard } from "@/lib/scrydex/types";
import { CardImage } from "@/components/tcg/CardImage";
import { DeckCardFan } from "@/components/tcg/DeckCardFan";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";

/**
 * GameShuffle TCG hub (`/pokemon-tcg`) — dual-purpose brand page: sells
 * singles + decks AND funnels to the free companion app. Bespoke so it can
 * carry a card carousel, review carousel, a grand companion module (with
 * the Scrydex vision inside), and filterable deck ideas.
 *
 * The companion module is a genuinely dark-themed region: the wrapper gets
 * `class="dark"`, which flips the 29 CDS design tokens for its subtree AND
 * triggers CDS components' dark variants — so cards/badges inside render
 * dark natively rather than being hand-painted (marketing routes are
 * force-light, so this is a scoped exception, done the CDS way).
 *
 * ── GO-LIVE (only after `TCG_HUB_LIVE = true` with real content) ───────
 *   Navbar / footer link · sitemap · companion-page cross-link.
 * ────────────────────────────────────────────────────────────────────
 */

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
    url: `https://www.gameshuffle.co${TCG_HUB_PATH}`,
    images: [META.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: META.title,
    description: META.description,
    images: [META.ogImage],
  },
  alternates: { canonical: `https://www.gameshuffle.co${TCG_HUB_PATH}` },
  robots: TCG_HUB_LIVE ? undefined : { index: false, follow: false },
};

function ShopButton({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      href={TCG_SHOP_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none" }}
    >
      <Button variant={variant} size="large">
        {label}
      </Button>
    </a>
  );
}

/** Relative "Sold …" label for FOMO recency. Server-side; exact date past a
 *  month. */
function soldLabel(iso: string | null): string {
  if (!iso) return "Sold";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Sold today";
  if (days === 1) return "Sold yesterday";
  if (days < 7) return `Sold ${days} days ago`;
  if (days < 28) {
    const w = Math.floor(days / 7);
    return `Sold ${w} week${w > 1 ? "s" : ""} ago`;
  }
  return `Sold ${new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default async function Page() {
  // Admin-managed featured shop cards — read-only from the DB (0 credits;
  // never resolves live so an anon page view can't drive credit spend).
  // Falls back to FPO cards if none are configured yet.
  const shopCards = await getPublicFeaturedShopCards();
  const recentlySold = await getRecentlySoldCards(12);

  // Top pick per tier, pulled from the real deck cluster (content/decks).
  // For a beginner featured deck that's half of a Battle Box, surface BOTH
  // halves so the matched pair shows together (and the section fills out a
  // clean three-up while the cluster is still small).
  const featuredByTier = getFeaturedByTier();
  const featuredDecks: Deck[] = [];
  const seenFeatured = new Set<string>();
  const pushFeatured = (d: Deck) => {
    if (seenFeatured.has(d.frontmatter.slug)) return;
    seenFeatured.add(d.frontmatter.slug);
    featuredDecks.push(d);
  };
  for (const tier of DECK_TIERS) {
    const d = featuredByTier[tier];
    if (!d) continue;
    pushFeatured(d);
    if (d.frontmatter.battle_box_partner) {
      const partner = getDeckBySlug(d.frontmatter.battle_box_partner);
      if (partner) pushFeatured(partner);
    }
  }

  // Fanned foreground card art for featured decks that have a curated marquee
  // set (top 4). Read-only from the catalog (0 credits).
  const deckFans: Record<string, TcgCard[]> = {};
  for (const d of featuredDecks) {
    const ids = MARQUEE_BY_DECK[d.frontmatter.slug];
    if (ids?.length) {
      deckFans[d.frontmatter.slug] = await getCatalogCards(ids.slice(0, 4));
    }
  }

  return (
    <main>
      <MarketingJsonLd
        breadcrumb={{ label: "GameShuffle TCG", path: TCG_HUB_PATH }}
        faq={FAQ}
      />

      <Container>
        {/* Hero */}
        <section className="tcg-hero">
          <div>
            <p className="marketing-eyebrow">{HERO.eyebrow}</p>
            <h1 className="tcg-hero__title">{HERO.h1}</h1>
            <p className="tcg-hero__subhead">{HERO.subhead}</p>
            <Stack direction="horizontal" gap={12} wrap>
              <ShopButton label={HERO.primary.label} />
              <Link href={HERO.secondary.href} style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">
                  {HERO.secondary.label}
                </Button>
              </Link>
            </Stack>
          </div>
          <div className="tcg-hero__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HERO.image} alt={HERO.imageAlt} />
          </div>
        </section>

        {/* Featured in the shop — admin-managed high-value cards (DB-backed,
            real Scrydex art). Each links to its TCGplayer product page; sold
            cards stay visible, marked sold. FPO fallback if none configured. */}
        <section className="tcg-section">
          <div className="tcg-section__head">
            <h2 className="tcg-h2">Featured cards in the shop</h2>
            <ShopButton label="Shop all cards" variant="secondary" />
          </div>
          {shopCards.length > 0 ? (
            <>
              <p className="tcg-prose" style={{ marginBottom: "var(--spacing-16)" }}>
                Our highest-value singles, straight from the GameShuffle TCG
                store — tap a card to grab it on TCGplayer.
              </p>
              <AutoplayCarousel
                slidesToShow={{ mobile: 2, tablet: 3, desktop: 5 }}
                gap={16}
                showArrows
                showDots
                loop
                arrowPosition="bottom"
              >
                {shopCards.map((row) => {
                  const name = row.label ?? row.card?.name ?? row.card_id;
                  return (
                    <CarouselItem key={row.id}>
                      <a
                        href={row.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`tcg-card${row.is_sold ? " tcg-card--sold" : ""}`}
                      >
                        <div className="tcg-card__art">
                          <CardImage
                            images={row.card?.images}
                            name={name}
                            size="medium"
                          />
                          {row.is_sold ? (
                            <span className="tcg-card__sold">Sold</span>
                          ) : null}
                        </div>
                        <div className="tcg-card__meta">
                          <span className="tcg-card__name">{name}</span>
                          {row.card?.rarity ? (
                            <span className="tcg-card__set">
                              {row.card.rarity}
                            </span>
                          ) : null}
                        </div>
                      </a>
                    </CarouselItem>
                  );
                })}
                {/* Trailing tile → full storefront (mirrors the "Browse all
                    decks" card treatment). */}
                <CarouselItem key="shop-all">
                  <a
                    href={TCG_SHOP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tcg-card-browse"
                  >
                    <span className="tcg-card-browse__arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="tcg-card-browse__name">Shop all cards</span>
                    <span className="tcg-card-browse__cta">
                      Browse the GameShuffle TCG store
                    </span>
                  </a>
                </CarouselItem>
              </AutoplayCarousel>
              <TcgAttribution className="tcg-featured__attr" />
            </>
          ) : (
            <AutoplayCarousel
              slidesToShow={{ mobile: 2, tablet: 3, desktop: 5 }}
              gap={16}
              showArrows
              showDots
              loop
              arrowPosition="bottom"
            >
              {FEATURED_CARDS.map((card) => (
                <CarouselItem key={card.name}>
                  <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tcg-card"
                  >
                    <div className="tcg-card__art">
                      {card.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.image} alt={card.name} loading="lazy" />
                      ) : (
                        <span className="tcg-card__fpo">{card.name}</span>
                      )}
                    </div>
                    <div className="tcg-card__meta">
                      <span className="tcg-card__name">{card.name}</span>
                      <span className="tcg-card__set">{card.set}</span>
                      <span className="tcg-card__price">{card.price}</span>
                    </div>
                  </a>
                </CarouselItem>
              ))}
            </AutoplayCarousel>
          )}
        </section>

        {/* Featured decks — right below the featured cards. Top pick per tier
            (both halves of a beginner Battle Box); final slide is a "Browse
            all decks" card mirroring the shop-all treatment. */}
        {featuredDecks.length > 0 && (
          <section className="tcg-section">
            <div className="tcg-section__head">
              <h2 className="tcg-h2">Featured decks</h2>
            </div>
            <p
              className="tcg-prose"
              style={{ marginBottom: "var(--spacing-32)" }}
            >
              Our top pick in each style — full lists, budget swaps, and
              matchups, every one buildable from GameShuffle singles.
            </p>
            <div className="deck-carousel">
            <AutoplayCarousel
              slidesToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
              gap={20}
              showArrows
              showDots
              loop
              arrowPosition="bottom"
            >
              {featuredDecks.map((d) => {
                const fm = d.frontmatter;
                return (
                  <CarouselItem key={fm.slug}>
                    <Link
                      href={`/pokemon-tcg/decks/${fm.slug}`}
                      className="deck-tile deck-tile--featured"
                    >
                      {deckFans[fm.slug]?.length ? (
                        <DeckCardFan cards={deckFans[fm.slug]} />
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
                  </CarouselItem>
                );
              })}
              {/* Final slide → the full cluster (replaces the floating btn) */}
              <CarouselItem key="browse-all">
                <Link
                  href="/pokemon-tcg/decks"
                  className="deck-tile deck-tile--browse"
                >
                  <span className="deck-tile__browse-arrow" aria-hidden="true">
                    →
                  </span>
                  <h3 className="deck-tile__name">Browse all decks</h3>
                  <p className="deck-tile__desc">
                    Every Standard 2026 deck guide — competitive, beginner
                    &amp; family, and meme.
                  </p>
                  <span className="deck-tile__browse-cta">
                    See the full deck index
                  </span>
                </Link>
              </CarouselItem>
            </AutoplayCarousel>
            </div>
          </section>
        )}

        {/* Recently sold — social proof + FOMO. Sold cards with recency. */}
        {recentlySold.length > 0 && (
          <section className="tcg-section">
            <div className="tcg-section__head">
              <h2 className="tcg-h2">Recently sold</h2>
              <ShopButton label="Shop the store" variant="secondary" />
            </div>
            <p
              className="tcg-prose"
              style={{ marginBottom: "var(--spacing-16)" }}
            >
              These have already found new homes — here&rsquo;s what&rsquo;s moved
              lately. Don&rsquo;t miss the next one.
            </p>
            <AutoplayCarousel
              slidesToShow={{ mobile: 2, tablet: 3, desktop: 5 }}
              gap={16}
              showArrows
              showDots
              loop
              arrowPosition="bottom"
            >
              {recentlySold.map((row) => {
                const name = row.label ?? row.card?.name ?? row.card_id;
                return (
                  <CarouselItem key={row.id}>
                    <a
                      href={TCG_SHOP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tcg-card tcg-card--recently-sold"
                    >
                      <div className="tcg-card__art">
                        <CardImage
                          images={row.card?.images}
                          name={name}
                          size="medium"
                        />
                        <span className="tcg-card__sold">Sold</span>
                      </div>
                      <div className="tcg-card__meta">
                        <span className="tcg-card__name">{name}</span>
                        <span className="tcg-card__set">
                          {soldLabel(row.sold_at)}
                        </span>
                      </div>
                    </a>
                  </CarouselItem>
                );
              })}
            </AutoplayCarousel>
            <TcgAttribution className="tcg-featured__attr" />
          </section>
        )}
      </Container>

      {/* Reviews — carousel, wide cards. Sits right below Recently sold. */}
      {REVIEWS.length > 0 && (
        <section className="tcg-reviews-band">
          <Container>
            <h2 className="tcg-h2" style={{ marginBottom: "var(--spacing-8)" }}>
              What buyers are saying
            </h2>
            <p className="tcg-reviews__source">
              Verified buyer reviews from our TCGplayer store.
            </p>
            <AutoplayCarousel
              slidesToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
              gap={20}
              showArrows
              showDots
              loop
              arrowPosition="bottom"
            >
              {REVIEWS.map((r) => (
                <CarouselItem key={r.quote.slice(0, 24)}>
                  <figure className="tcg-review">
                    <div className="tcg-review__top">
                      {r.rating ? (
                        <div
                          className="tcg-review__stars"
                          aria-label={`${r.rating} out of 5 stars`}
                        >
                          {"★".repeat(r.rating)}
                        </div>
                      ) : null}
                      <blockquote className="tcg-review__quote">
                        &ldquo;{r.quote}&rdquo;
                      </blockquote>
                    </div>
                    <figcaption className="tcg-review__by">
                      &mdash;&nbsp;{r.author}
                      {r.source ? (
                        <span className="tcg-review__src"> · {r.source}</span>
                      ) : null}
                    </figcaption>
                  </figure>
                </CarouselItem>
              ))}
            </AutoplayCarousel>
          </Container>
        </section>
      )}

      {/* Companion module — the centerpiece. Genuinely dark-themed via the
          `dark` class (flips CDS tokens + component variants for the subtree). */}
      <section className="tcg-companion-band dark">
        <Container>
          <div className="tcg-companion">
            <div className="tcg-companion__intro">
              <p className="tcg-companion__eyebrow">{COMPANION.eyebrow}</p>
              <h2 className="tcg-companion__title">{COMPANION.heading}</h2>
              <p className="tcg-companion__body">{COMPANION.body}</p>
            </div>

            <div className="tcg-rtb-grid">
              {COMPANION.rtbs.map((r) => (
                <FeatureCard
                  key={r.title}
                  variant="compact"
                  icon={r.icon as IconName}
                  title={r.title}
                  description={r.description}
                />
              ))}
            </div>

            {/* Scrydex vision — inside the same dark module */}
            <div className="tcg-scrydex">
              <Badge variant="info" size="small">
                {COMPANION.scrydex.eyebrow}
              </Badge>
              <h3 className="tcg-scrydex__title">{COMPANION.scrydex.heading}</h3>
              <p className="tcg-scrydex__body">{COMPANION.scrydex.body}</p>
            </div>

            <Stack direction="horizontal" gap={12} wrap justify="center">
              <Link href={COMPANION.cta.href} style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">
                  {COMPANION.cta.label}
                </Button>
              </Link>
              <Link href={TCG_MY_CARDS_HREF} style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">
                  My Cards
                </Button>
              </Link>
              <Link
                href={COMPANION.learnMore.href}
                style={{ textDecoration: "none" }}
              >
                <Button variant="secondary" size="large">
                  {COMPANION.learnMore.label}
                </Button>
              </Link>
            </Stack>
          </div>
        </Container>
      </section>

      <Container>
        {/* Final dual CTA */}
        <section className="marketing-cta">
          <h2 className="marketing-cta__title">Grab cards. Run the table.</h2>
          <p className="marketing-cta__text">
            Shop the collection, then keep score with the free companion.
          </p>
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <ShopButton label="Shop the cards" />
            <Link href={COMPANION.cta.href} style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">
                {COMPANION.cta.label}
              </Button>
            </Link>
          </Stack>
        </section>

        {/* FAQ */}
        <section className="pricing-page__faq">
          <h2 className="tcg-h2">Frequently asked questions</h2>
          <Stack direction="vertical" gap={16}>
            {FAQ.map((f) => (
              <details key={f.q} className="pricing-page__faq-item">
                <summary>{f.q}</summary>
                <div className="pricing-page__faq-body">{f.a}</div>
              </details>
            ))}
          </Stack>
        </section>
      </Container>
    </main>
  );
}
