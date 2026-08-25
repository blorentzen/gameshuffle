import { Button, CarouselItem } from "@empac/cascadeds";
import { AutoplayCarousel } from "@/components/marketing/AutoplayCarousel";
import { CardImage } from "@/components/tcg/CardImage";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { FEATURED_CARDS } from "@/data/tcg-hub";
import { TCG_SHOP_URL } from "@/data/shop";
import type { FeaturedShopCard } from "@/lib/shop/featuredCards";

/**
 * Featured cards module — the DB-backed "highest-value singles" carousel with a
 * "Shop all cards" CTA + a trailing storefront tile. Shared by the GameShuffle
 * TCG hub (`/pokemon-tcg`) and the homepage so both read as one shop surface.
 *
 * `cards` come from `getPublicFeaturedShopCards()` (read-only, 0 Scrydex
 * credits). When none are configured it falls back to the FPO placeholder set
 * (`FEATURED_CARDS`) so the layout never renders empty.
 */
export function FeaturedShopCards({
  cards,
  heading = "Featured cards in the shop",
  intro,
}: {
  cards: FeaturedShopCard[];
  heading?: string;
  /** Optional lead paragraph, shown only when real cards are configured. */
  intro?: string;
}) {
  const hasCards = cards.length > 0;
  return (
    <section className="tcg-section">
      <div className="tcg-section__head">
        <h2 className="tcg-h2">{heading}</h2>
        <a
          href={TCG_SHOP_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          <Button variant="secondary" size="large">
            Shop all cards
          </Button>
        </a>
      </div>

      {hasCards ? (
        <>
          {intro ? (
            <p className="tcg-prose" style={{ marginBottom: "var(--spacing-16)" }}>
              {intro}
            </p>
          ) : null}
          <AutoplayCarousel
            slidesToShow={{ mobile: 2, tablet: 3, desktop: 5 }}
            gap={16}
            showArrows
            showDots
            loop
            arrowPosition="bottom"
          >
            {cards.map((row) => {
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
                        <span className="tcg-card__set">{row.card.rarity}</span>
                      ) : null}
                    </div>
                  </a>
                </CarouselItem>
              );
            })}
            {/* Trailing tile → full storefront (mirrors the "Browse all decks"
                card treatment). */}
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
  );
}
